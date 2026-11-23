/**
 * Default total-order comparator for primitive values (numbers, strings, bigints).
 *
 * @template T
 * @param {T} x
 * @param {T} y
 * @returns {number} Negative if x < y, positive if x > y, 0 if equal.
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Validates that an input is a dense, strictly ascending (sorted and de-duplicated) array.
 *
 * @template T
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @param {(x: T, y: T) => number} cmpFn - Comparator defining the strict ascending order.
 * @param {boolean} usingDefaultCompare - Whether the default comparator is active.
 */
function assertSortedUniqueArray(arr, name, cmpFn, usingDefaultCompare) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array`)
	}

	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array (hole at index ${i})`)
		}
		if (usingDefaultCompare && typeof arr[i] === 'number' && Number.isNaN(arr[i])) {
			throw new RangeError(`${name} must not contain NaN (at index ${i})`)
		}
		if (i > 0) {
			const cmp = cmpFn(arr[i - 1], arr[i])
			if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
				throw new RangeError(`compare must return a valid number`)
			}
			if (cmp === 0) {
				throw new RangeError(`${name} must be de-duplicated (duplicate at index ${i})`)
			}
			if (cmp > 0) {
				throw new RangeError(`${name} must be sorted in strictly ascending order (out of order at index ${i})`)
			}
		}
	}
}

/**
 * Computes the set intersection of two sorted, de-duplicated arrays using a
 * straightforward iterative two-pointer merge algorithm.
 *
 * Both input arrays must be dense and sorted in strictly ascending order according
 * to `compare` (no duplicates). Neither input array is mutated.
 *
 * Time complexity: O(a.length + b.length).
 * Auxiliary space complexity: O(1) excluding the returned array.
 *
 * @template T
 * @param {readonly T[]} a - First strictly sorted, de-duplicated array.
 * @param {readonly T[]} b - Second strictly sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning < 0 if x < y,
 *   0 if x equals y, and > 0 if x > y. Defaults to relational `<` / `>` ordering.
 * @returns {T[]} A new strictly sorted, de-duplicated array containing elements present in both `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, or if `compare` is provided and not a function.
 * @throws {RangeError} If `a` or `b` is not strictly ascending/de-duplicated, contains `NaN` with the
 *   default comparator, or if `compare` returns a non-numeric / `NaN` value.
 */
export function intersectionSortedArrIterative(a, b, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	const usingDefaultCompare = compare === undefined
	const cmpFn = usingDefaultCompare ? defaultCompare : compare

	assertSortedUniqueArray(a, 'a', cmpFn, usingDefaultCompare)
	assertSortedUniqueArray(b, 'b', cmpFn, usingDefaultCompare)

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const cmp = cmpFn(a[i], b[j])
		if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
			throw new RangeError('compare must return a valid number')
		}
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
