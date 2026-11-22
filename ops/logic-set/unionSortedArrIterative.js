/**
 * Default comparator for primitive elements (`number`, `string`, or `bigint`).
 *
 * @param {number | string | bigint} x - First value to compare.
 * @param {number | string | bigint} y - Second value to compare.
 * @returns {number} `-1` if `x < y`, `1` if `x > y`, or `0` if equal.
 * @throws {TypeError} If values are not comparable primitives or have mismatched types.
 * @throws {RangeError} If either value is `NaN`.
 */
function defaultCompare(x, y) {
	validateDefaultElement(x)
	validateDefaultElement(y)
	if (typeof x !== typeof y) {
		throw new TypeError(
			'All elements must have the same type when using the default comparator'
		)
	}
	return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Validates that a value is a supported primitive for the default comparator.
 *
 * @param {unknown} value - Value to validate.
 * @throws {TypeError} If `value` is not a `number`, `string`, or `bigint`.
 * @throws {RangeError} If `value` is `NaN`.
 */
function validateDefaultElement(value) {
	const type = typeof value
	if (type !== 'number' && type !== 'string' && type !== 'bigint') {
		throw new TypeError(
			'Elements must be numbers, strings, or bigints when using the default comparator'
		)
	}
	if (type === 'number' && Number.isNaN(value)) {
		throw new RangeError('Input arrays must not contain NaN')
	}
}

/**
 * Invokes a comparator and ensures it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare - Comparator function.
 * @param {T} x - First element.
 * @param {T} y - Second element.
 * @returns {number} Comparison result.
 * @throws {TypeError} If the comparator does not return a non-NaN number.
 */
function invokeCompare(compare, x, y) {
	const result = compare(x, y)
	if (typeof result !== 'number' || Number.isNaN(result)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return result
}

/**
 * Validates that an input is a dense, sorted array.
 *
 * @template T
 * @param {unknown} arr - Candidate array.
 * @param {string} name - Parameter name for error messages.
 * @param {(x: T, y: T) => number} compare - Comparator function.
 * @param {boolean} isDefault - Whether the default comparator is active.
 * @throws {TypeError} If `arr` is not a dense array or contains invalid elements.
 * @throws {RangeError} If `arr` is not sorted in ascending order or contains `NaN`.
 */
function validateSortedArray(arr, name, compare, isDefault) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array`)
	}
	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array`)
		}
		if (isDefault) {
			validateDefaultElement(arr[i])
			if (i > 0 && typeof arr[i - 1] !== typeof arr[i]) {
				throw new TypeError(
					`${name} must contain elements of the same type when using the default comparator`
				)
			}
		}
		if (i > 0 && invokeCompare(compare, arr[i - 1], arr[i]) > 0) {
			throw new RangeError(`${name} must be sorted in ascending order`)
		}
	}
}

/**
 * Computes the set union of two sorted arrays using a straightforward iterative
 * two-pointer merge algorithm.
 *
 * Both inputs must be sorted in ascending (non-decreasing) order according to
 * `compare`. The returned array is a new sorted, de-duplicated array containing
 * every distinct element present in either `a` or `b`. When an element appears
 * in both arrays (i.e. `compare(x, y) === 0`), the element from `a` is kept.
 *
 * @template T
 * @param {readonly T[]} a - First sorted array.
 * @param {readonly T[]} b - Second sorted array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning a
 *   negative number if `x < y`, `0` if `x` and `y` are equivalent, or a
 *   positive number if `x > y`. Defaults to ascending order for `number`,
 *   `string`, or `bigint` values.
 * @returns {T[]} New sorted, de-duplicated array representing `a ∪ b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, if `compare` is not a
 *   function (or returns a non-number / `NaN`), or if default-compared elements
 *   are not comparable primitives of the same type.
 * @throws {RangeError} If `a` or `b` is not sorted in ascending order or
 *   contains `NaN` when using the default comparator.
 */
export function unionSortedArrIterative(a, b, compare = defaultCompare) {
	if (typeof compare !== 'function') {
		throw new TypeError('compare must be a function')
	}

	const isDefault = compare === defaultCompare
	validateSortedArray(a, 'a', compare, isDefault)
	validateSortedArray(b, 'b', compare, isDefault)

	if (isDefault && a.length > 0 && b.length > 0 && typeof a[0] !== typeof b[0]) {
		throw new TypeError(
			'Input arrays must contain elements of the same type when using the default comparator'
		)
	}

	const result = []
	let i = 0
	let j = 0

	const pushUnique = (value) => {
		if (
			result.length === 0 ||
			invokeCompare(compare, result[result.length - 1], value) < 0
		) {
			result.push(value)
		}
	}

	while (i < a.length && j < b.length) {
		const cmp = invokeCompare(compare, a[i], b[j])
		if (cmp < 0) {
			pushUnique(a[i])
			i += 1
		} else if (cmp > 0) {
			pushUnique(b[j])
			j += 1
		} else {
			pushUnique(a[i])
			i += 1
			j += 1
		}
	}

	while (i < a.length) {
		pushUnique(a[i])
		i += 1
	}

	while (j < b.length) {
		pushUnique(b[j])
		j += 1
	}

	return result
}
