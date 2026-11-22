/**
 * Normalizes `-0` to `0` while preserving all other finite numbers.
 *
 * @param {number} value - A finite number.
 * @returns {number} The normalized number (`0` if `value` is `-0`, otherwise `value`).
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that an input is a dense array of finite numbers in strictly
 * ascending order (sorted and de-duplicated).
 *
 * @param {unknown} arr - Value to validate.
 * @param {string} paramName - Parameter name used in error messages.
 * @throws {TypeError} If `arr` is not an array, is sparse, or contains non-number elements.
 * @throws {RangeError} If `arr` contains non-finite numbers (`NaN`, `±Infinity`),
 *   duplicates, or elements not in strictly ascending order.
 */
function validateSortedUniqueArray(arr, paramName) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${paramName} must be an array`)
	}

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(
				`${paramName} must not be a sparse array (missing element at index ${i})`
			)
		}

		const value = arr[i]
		if (typeof value !== 'number') {
			throw new TypeError(
				`${paramName}[${i}] must be a finite number, got ${typeof value}`
			)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`${paramName}[${i}] must be a finite number, got ${value}`
			)
		}

		if (i > 0) {
			const prev = arr[i - 1]
			if (value === prev) {
				throw new RangeError(
					`${paramName} must be de-duplicated (duplicate value ${value} at index ${i})`
				)
			}
			if (value < prev) {
				throw new RangeError(
					`${paramName} must be strictly ascending (${prev} at index ${i - 1} > ${value} at index ${i})`
				)
			}
		}
	}
}

/**
 * Recursively finds the smallest index in `[low, high)` whose value is `>= target`.
 * Returns `high` if all elements in `[low, high)` are strictly less than `target`.
 *
 * @param {readonly number[]} arr - Strictly ascending array of finite numbers.
 * @param {number} low - Inclusive lower bound index.
 * @param {number} high - Exclusive upper bound index.
 * @param {number} target - Pivot value to locate.
 * @returns {number} Insertion index in `[low, high]`.
 */
function lowerBoundRecursive(arr, low, high, target) {
	if (low >= high) {
		return low
	}

	const mid = low + ((high - low) >>> 1)
	if (arr[mid] < target) {
		return lowerBoundRecursive(arr, mid + 1, high, target)
	}
	return lowerBoundRecursive(arr, low, mid, target)
}

/**
 * Divide-and-conquer recursive merge computing the de-duplicated set union of
 * `a[aStart..aEnd)` and `b[bStart..bEnd)`, appending elements in ascending order to `out`.
 *
 * By always bisecting the larger slice around its midpoint `pivot` and partitioning
 * the other slice via recursive binary search (`lowerBoundRecursive`), the combined
 * subproblem size shrinks by at least 25% at every recursion level, guaranteeing
 * `O(log(|a| + |b|))` stack depth and `O(|a| + |b|)` total work.
 *
 * @param {readonly number[]} a - First strictly ascending array.
 * @param {number} aStart - Inclusive start index in `a`.
 * @param {number} aEnd - Exclusive end index in `a`.
 * @param {readonly number[]} b - Second strictly ascending array.
 * @param {number} bStart - Inclusive start index in `b`.
 * @param {number} bEnd - Exclusive end index in `b`.
 * @param {number[]} out - Output buffer accumulating the union in ascending order.
 */
function unionRanges(a, aStart, aEnd, b, bStart, bEnd, out) {
	const aLen = aEnd - aStart
	const bLen = bEnd - bStart

	if (aLen === 0) {
		for (let i = bStart; i < bEnd; i++) {
			out.push(normalizeZero(b[i]))
		}
		return
	}

	if (bLen === 0) {
		for (let i = aStart; i < aEnd; i++) {
			out.push(normalizeZero(a[i]))
		}
		return
	}

	if (aLen < bLen) {
		unionRanges(b, bStart, bEnd, a, aStart, aEnd, out)
		return
	}

	const aMid = aStart + (aLen >>> 1)
	const pivot = a[aMid]
	const bSplit = lowerBoundRecursive(b, bStart, bEnd, pivot)

	// Merge left sub-ranges (all elements strictly < pivot)
	unionRanges(a, aStart, aMid, b, bStart, bSplit, out)

	// Emit pivot once; skip matching element in `b` if present
	out.push(normalizeZero(pivot))
	const bRightStart =
		bSplit < bEnd && b[bSplit] === pivot ? bSplit + 1 : bSplit

	// Merge right sub-ranges (all elements strictly > pivot)
	unionRanges(a, aMid + 1, aEnd, b, bRightStart, bEnd, out)
}

/**
 * Computes the logic-set OR (set union, `A ∪ B`) of two strictly ascending
 * (sorted and de-duplicated) arrays of finite numbers using a recursive
 * divide-and-conquer merge algorithm.
 *
 * Algorithm:
 * 1. Validates that both `a` and `b` are dense, strictly ascending arrays of finite numbers.
 * 2. Recursively bisects the larger sub-range at its midpoint `pivot`, partitions the
 *    smaller sub-range with a recursive binary search (`lowerBoundRecursive`), merges the
 *    left partitions, emits `pivot` once (skipping any equal element in the other array),
 *    and merges the right partitions.
 * 3. Runs in `O(|a| + |b|)` time with `O(log(|a| + |b|))` recursion stack depth and
 *    returns a new strictly ascending, de-duplicated array without mutating inputs.
 *
 * @param {readonly number[]} a - First sorted, de-duplicated array of finite numbers.
 * @param {readonly number[]} b - Second sorted, de-duplicated array of finite numbers.
 * @returns {number[]} A new strictly ascending, de-duplicated array containing every
 *   element present in `a` or `b` (with `-0` normalized to `0`).
 * @throws {TypeError} If `a` or `b` is not an array, is sparse, or contains non-number values.
 * @throws {RangeError} If `a` or `b` contains `NaN`/`±Infinity`, duplicates, or unsorted elements.
 */
export function orSortedArrRecursive(a, b) {
	validateSortedUniqueArray(a, 'a')
	validateSortedUniqueArray(b, 'b')

	const result = []
	unionRanges(a, 0, a.length, b, 0, b.length, result)
	return result
}
