/**
 * Default strict total-order comparator for supported primitive values
 * (`number`, `string`, or `bigint`).
 *
 * @template T
 * @param {T} x - First value to compare.
 * @param {T} y - Second value to compare.
 * @returns {number} `-1` if `x < y`, `1` if `x > y`, or `0` if equal.
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Validates that a value is a supported comparable primitive when using
 * the default comparator, and matches the expected primitive type.
 *
 * @param {unknown} value - Element to validate.
 * @param {string | null} expectedType - Expected `typeof` string, or `null` if not yet established.
 * @param {string} label - Parameter name for error messages.
 * @param {number} index - Element index for error messages.
 * @returns {string} The validated primitive type (`'number'`, `'string'`, or `'bigint'`).
 */
function validateDefaultElement(value, expectedType, label, index) {
	const t = typeof value
	if (t !== 'number' && t !== 'string' && t !== 'bigint') {
		throw new TypeError(
			`${label}[${index}] must be a number, string, or bigint when no custom comparator is provided`
		)
	}
	if (t === 'number' && Number.isNaN(value)) {
		throw new TypeError(`${label}[${index}] must not be NaN`)
	}
	if (expectedType !== null && t !== expectedType) {
		throw new TypeError(
			`All elements must share the same primitive type when no custom comparator is provided (expected ${expectedType}, got ${t} at ${label}[${index}])`
		)
	}
	return t
}

/**
 * Invokes a comparator and ensures it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compareFn - Comparator function.
 * @param {T} x - First element.
 * @param {T} y - Second element.
 * @returns {number} Comparison result.
 */
function safeCompare(compareFn, x, y) {
	const cmp = compareFn(x, y)
	if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return cmp
}

/**
 * Validates that an input is a dense, strictly sorted (de-duplicated) array
 * with respect to `compareFn`.
 *
 * @template T
 * @param {readonly T[]} arr - Candidate array to validate.
 * @param {string} label - Parameter name for error messages.
 * @param {(x: T, y: T) => number} compareFn - Comparator defining the strict ascending order.
 * @param {boolean} useDefault - Whether the default primitive comparator is active.
 * @param {string | null} expectedType - Shared primitive type across arrays when `useDefault` is true.
 * @returns {string | null} Updated shared primitive type.
 */
function validateSortedUniqueArray(arr, label, compareFn, useDefault, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${label} must be an array`)
	}

	let elementType = expectedType
	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${label} must not be a sparse array (hole at index ${i})`)
		}
		if (useDefault) {
			elementType = validateDefaultElement(arr[i], elementType, label, i)
		}
		if (i > 0) {
			const cmp = safeCompare(compareFn, arr[i - 1], arr[i])
			if (cmp === 0) {
				throw new RangeError(
					`${label} must be de-duplicated (duplicate element at index ${i})`
				)
			}
			if (cmp > 0) {
				throw new RangeError(
					`${label} must be strictly sorted in ascending order (out of order at index ${i})`
				)
			}
		}
	}

	return elementType
}

/**
 * Computes the logical-set intersection (`AND`) of two sorted, de-duplicated
 * arrays using a straightforward iterative two-pointer merge algorithm.
 *
 * Both input arrays must be dense, strictly sorted according to `compare`,
 * and free of duplicate elements. Neither input array is mutated; a new
 * sorted, de-duplicated array containing elements present in both `a` and `b`
 * is returned.
 *
 * Time complexity: O(|a| + |b|).
 * Auxiliary space complexity: O(1) beyond the returned array.
 *
 * @template T
 * @param {readonly T[]} a - First strictly sorted, de-duplicated array.
 * @param {readonly T[]} b - Second strictly sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning `< 0` if `x < y`, `0` if equal, and `> 0` if `x > y`. Defaults to natural ordering for homogeneous `number` (non-NaN), `string`, or `bigint` arrays.
 * @returns {T[]} New strictly sorted, de-duplicated array containing the intersection of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, `compare` is not a function (when provided), elements are invalid/incompatible for default comparison, or `compare` returns a non-number or `NaN`.
 * @throws {RangeError} If `a` or `b` is unsorted or contains duplicate elements.
 */
export function andSortedArrIterative(a, b, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	const useDefault = compare === undefined
	const compareFn = useDefault ? defaultCompare : compare

	let elementType = validateSortedUniqueArray(a, 'a', compareFn, useDefault, null)
	validateSortedUniqueArray(b, 'b', compareFn, useDefault, elementType)

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const cmp = safeCompare(compareFn, a[i], b[j])
		if (cmp < 0) {
			i += 1
		} else if (cmp > 0) {
			j += 1
		} else {
			result.push(a[i])
			i += 1
			j += 1
		}
	}

	return result
}
