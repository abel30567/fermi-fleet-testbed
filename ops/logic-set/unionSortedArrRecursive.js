/**
 * Default comparator for finite numbers in ascending order.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number} Negative if x < y, 0 if x === y, positive if x > y.
 */
function defaultNumberCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Validates that an input is a strictly ascending, de-duplicated array.
 * When `useDefaultNumbers` is true, also validates that all elements are finite numbers.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {string} name
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} useDefaultNumbers
 */
function validateSortedUniqueArray(arr, name, compare, useDefaultNumbers) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Argument "${name}" must be an array`)
	}

	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`Array "${name}" must not be sparse (hole at index ${i})`)
		}

		const current = arr[i]

		if (useDefaultNumbers) {
			if (typeof current !== 'number') {
				throw new TypeError(
					`Array "${name}" must contain only finite numbers (found ${typeof current} at index ${i})`,
				)
			}
			if (!Number.isFinite(current)) {
				throw new RangeError(
					`Array "${name}" must contain only finite numbers (found ${current} at index ${i})`,
				)
			}
		}

		if (i > 0) {
			const order = compare(arr[i - 1], current)
			if (order === 0) {
				throw new RangeError(
					`Array "${name}" must be de-duplicated (duplicate element at index ${i})`,
				)
			}
			if (order > 0) {
				throw new RangeError(
					`Array "${name}" must be sorted in strictly ascending order (violation at index ${i})`,
				)
			}
		}
	}
}

/**
 * Recursively computes the lower bound of `target` in `arr[low..high)`.
 * Returns the first index `idx` in `[low, high]` such that `compare(arr[idx], target) >= 0`,
 * or `high` if all elements in `arr[low..high)` are strictly less than `target`.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {number} low
 * @param {number} high
 * @param {T} target
 * @param {(x: T, y: T) => number} compare
 * @returns {number}
 */
function lowerBoundRecursive(arr, low, high, target, compare) {
	if (low >= high) {
		return low
	}
	const mid = low + ((high - low) >>> 1)
	if (compare(arr[mid], target) < 0) {
		return lowerBoundRecursive(arr, mid + 1, high, target, compare)
	}
	return lowerBoundRecursive(arr, low, mid, target, compare)
}

/**
 * Appends `arr[start..end)` into `out`, normalizing `-0` to `0` when in default numeric mode.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {number} start
 * @param {number} end
 * @param {boolean} normalizeZero
 * @param {T[]} out
 */
function pushRange(arr, start, end, normalizeZero, out) {
	for (let i = start; i < end; i += 1) {
		const value = arr[i]
		out.push(normalizeZero && value === 0 ? /** @type {T} */ (0) : value)
	}
}

/**
 * Divide-and-conquer recursive merge-union of `arr1[s1..e1)` and `arr2[s2..e2)`.
 *
 * Always splits the larger slice at its midpoint `pivot`, partitions the smaller slice
 * via recursive binary search (`lowerBoundRecursive`), and recurses on the strictly-less
 * and strictly-greater subproblems while emitting `pivot` once (deduplicating matches).
 *
 * Because the larger range is halved on every split, recursion depth is O(log(n + m))
 * and total work is O(n + m).
 *
 * @template T
 * @param {readonly T[]} arr1
 * @param {number} s1
 * @param {number} e1
 * @param {readonly T[]} arr2
 * @param {number} s2
 * @param {number} e2
 * @param {boolean} arr1IsOriginalA
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} normalizeZero
 * @param {T[]} out
 */
function mergeUnionDivideAndConquer(
	arr1,
	s1,
	e1,
	arr2,
	s2,
	e2,
	arr1IsOriginalA,
	compare,
	normalizeZero,
	out,
) {
	const len1 = e1 - s1
	const len2 = e2 - s2

	if (len1 === 0 && len2 === 0) {
		return
	}
	if (len1 === 0) {
		pushRange(arr2, s2, e2, normalizeZero, out)
		return
	}
	if (len2 === 0) {
		pushRange(arr1, s1, e1, normalizeZero, out)
		return
	}

	// Ensure arr1 is the larger (or equal) slice so stack depth stays O(log(n + m)).
	if (len1 < len2) {
		mergeUnionDivideAndConquer(
			arr2,
			s2,
			e2,
			arr1,
			s1,
			e1,
			!arr1IsOriginalA,
			compare,
			normalizeZero,
			out,
		)
		return
	}

	const mid1 = s1 + (len1 >>> 1)
	const pivot = arr1[mid1]
	const split2 = lowerBoundRecursive(arr2, s2, e2, pivot, compare)
	const isDuplicate = split2 < e2 && compare(arr2[split2], pivot) === 0

	// 1. Left subproblem: all elements strictly less than pivot.
	mergeUnionDivideAndConquer(
		arr1,
		s1,
		mid1,
		arr2,
		s2,
		split2,
		arr1IsOriginalA,
		compare,
		normalizeZero,
		out,
	)

	// 2. Emit pivot once (preserving original `a`'s representative on ties).
	const chosen = isDuplicate && !arr1IsOriginalA ? arr2[split2] : pivot
	out.push(normalizeZero && chosen === 0 ? /** @type {T} */ (0) : chosen)

	// 3. Right subproblem: all elements strictly greater than pivot.
	const rightStart2 = isDuplicate ? split2 + 1 : split2
	mergeUnionDivideAndConquer(
		arr1,
		mid1 + 1,
		e1,
		arr2,
		rightStart2,
		e2,
		arr1IsOriginalA,
		compare,
		normalizeZero,
		out,
	)
}

/**
 * Computes the set union of two sorted, de-duplicated arrays using a recursive
 * divide-and-conquer merge algorithm.
 *
 * Algorithm:
 * Splits the larger remaining subarray around its median element `pivot`, locates
 * the partition point in the other subarray via recursive binary search (lower bound),
 * recursively computes the union of all elements `< pivot`, emits `pivot` once
 * (deduplicating if present in both arrays), and recursively computes the union of all
 * elements `> pivot`. Runs in O(n + m) time with O(log(n + m)) recursion depth and
 * returns a new strictly ascending, de-duplicated array without mutating inputs.
 *
 * @template T
 * @param {readonly T[]} a - First strictly ascending, de-duplicated array (finite numbers by default).
 * @param {readonly T[]} b - Second strictly ascending, de-duplicated array (finite numbers by default).
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning < 0, 0, or > 0.
 *   When omitted, elements must be finite numbers compared in standard numeric order.
 * @returns {T[]} A new strictly ascending, de-duplicated array representing `a ∪ b`.
 * @throws {TypeError} If `a` or `b` is not an array, is sparse, contains non-number elements
 *   under the default comparator, or if `compare` is provided and is not a function (or returns
 *   a non-finite / non-numeric value).
 * @throws {RangeError} If any element is non-finite (`NaN`, `Infinity`, `-Infinity`) under the
 *   default comparator, or if either array is not strictly ascending and de-duplicated.
 */
export function unionSortedArrRecursive(a, b, compare) {
	const useDefaultNumbers = compare === undefined
	if (!useDefaultNumbers && typeof compare !== 'function') {
		throw new TypeError('Optional third argument "compare" must be a function')
	}

	const compareFn = useDefaultNumbers
		? defaultNumberCompare
		: (x, y) => {
				const order = compare(x, y)
				if (typeof order !== 'number' || !Number.isFinite(order)) {
					throw new TypeError('Comparator must return a finite number')
				}
				return order
			}

	validateSortedUniqueArray(a, 'a', compareFn, useDefaultNumbers)
	validateSortedUniqueArray(b, 'b', compareFn, useDefaultNumbers)

	/** @type {T[]} */
	const result = []
	mergeUnionDivideAndConquer(
		a,
		0,
		a.length,
		b,
		0,
		b.length,
		true,
		compareFn,
		useDefaultNumbers,
		result,
	)
	return result
}
