/**
 * Default strict total-order comparator for homogeneous comparable primitives
 * (`number`, `string`, or `bigint`).
 *
 * @template {number | string | bigint} T
 * @param {T} x - First value.
 * @param {T} y - Second value.
 * @returns {-1 | 0 | 1} Negative if `x < y`, positive if `x > y`, or `0` if equal.
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Invokes a comparator and ensures it returns a valid non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare - Comparator function.
 * @param {T} x - First value.
 * @param {T} y - Second value.
 * @returns {number} Comparison result.
 */
function safeCompare(compare, x, y) {
	const result = compare(x, y)
	if (typeof result !== 'number' || Number.isNaN(result)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return result
}

/**
 * Validates that an input is a dense, strictly sorted (ascending, de-duplicated)
 * array under the active comparator.
 *
 * @template T
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @param {(x: T, y: T) => number} compare - Comparator function.
 * @param {boolean} usingDefault - Whether the built-in default comparator is in use.
 * @param {string | null} expectedType - Expected primitive `typeof` across inputs when using default comparator.
 * @returns {string | null} Updated expected primitive type.
 */
function validateSortedSetArray(arr, name, compare, usingDefault, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Expected "${name}" to be an Array`)
	}

	let elementType = expectedType

	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`Expected "${name}" not to be a sparse array (hole at index ${i})`)
		}

		const value = arr[i]

		if (usingDefault) {
			const valueType = typeof value
			if (valueType !== 'number' && valueType !== 'string' && valueType !== 'bigint') {
				throw new TypeError(
					`Unsupported element type "${value === null ? 'null' : valueType}" in "${name}" at index ${i}; provide a custom comparator for non-primitive values`,
				)
			}
			if (valueType === 'number' && Number.isNaN(value)) {
				throw new RangeError(`Element in "${name}" at index ${i} must not be NaN`)
			}
			if (elementType === null) {
				elementType = valueType
			} else if (valueType !== elementType) {
				throw new TypeError(
					`Inconsistent element types ("${elementType}" vs "${valueType}") in "${name}" at index ${i}; provide a custom comparator for mixed types`,
				)
			}
		}

		if (i > 0) {
			const cmp = safeCompare(compare, arr[i - 1], value)
			if (cmp === 0) {
				throw new RangeError(`Expected "${name}" to be de-duplicated (duplicate at index ${i})`)
			}
			if (cmp > 0) {
				throw new RangeError(`Expected "${name}" to be strictly sorted ascending (out of order at index ${i})`)
			}
		}
	}

	return elementType
}

/**
 * Computes the logical OR (set union) of two strictly sorted, de-duplicated arrays
 * using a straightforward iterative two-pointer merge algorithm.
 *
 * Neither input array is mutated. When an element appears in both arrays
 * (`compare(a[i], b[j]) === 0`), the element from `a` is included once in the output.
 *
 * Time complexity: O(|a| + |b|).
 * Space complexity: O(|a| + |b|).
 *
 * @template T
 * @param {readonly T[]} a - First strictly sorted, de-duplicated array.
 * @param {readonly T[]} b - Second strictly sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional strict weak-order comparator returning
 *   `< 0` if `x < y`, `0` if `x === y`, and `> 0` if `x > y`. Defaults to ascending `<` / `>`
 *   comparison over homogeneous `number` (non-NaN), `string`, or `bigint` arrays.
 * @returns {T[]} New strictly sorted, de-duplicated array containing every element in `a` or `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, `compare` is provided and not a function,
 *   the comparator returns a non-number/NaN, or elements have unsupported/mixed types under the default comparator.
 * @throws {RangeError} If `a` or `b` is not strictly sorted ascending, contains duplicates, or contains `NaN`
 *   under the default comparator.
 */
export function orSortedArrIterative(a, b, compare) {
	const usingDefault = compare === undefined
	if (!usingDefault && typeof compare !== 'function') {
		throw new TypeError('Expected "compare" to be a function when provided')
	}

	const cmpFn = usingDefault ? defaultCompare : compare

	let expectedType = validateSortedSetArray(a, 'a', cmpFn, usingDefault, null)
	expectedType = validateSortedSetArray(b, 'b', cmpFn, usingDefault, expectedType)
	void expectedType

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const cmp = safeCompare(cmpFn, a[i], b[j])
		if (cmp < 0) {
			result.push(a[i])
			i += 1
		} else if (cmp > 0) {
			result.push(b[j])
			j += 1
		} else {
			result.push(a[i])
			i += 1
			j += 1
		}
	}

	while (i < a.length) {
		result.push(a[i])
		i += 1
	}

	while (j < b.length) {
		result.push(b[j])
		j += 1
	}

	return result
}
