/**
 * Validates that an input is a dense array of finite numbers sorted in
 * strictly ascending order (de-duplicated).
 *
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `arr` is not an array or contains non-number / sparse elements.
 * @throws {RangeError} If `arr` contains non-finite numbers, is unsorted, or has duplicates.
 */
function validateSortedUniqueArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Expected "${name}" to be an array.`)
	}

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr) || typeof arr[i] !== 'number') {
			throw new TypeError(
				`Expected "${name}" to contain only finite numbers; invalid element at index ${i}.`
			)
		}
		const value = arr[i]
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected "${name}" to contain only finite numbers; non-finite value at index ${i}.`
			)
		}
		if (i > 0) {
			const prev = arr[i - 1]
			if (value < prev) {
				throw new RangeError(
					`Expected "${name}" to be sorted in strictly ascending order; out-of-order values at indices ${i - 1} and ${i}.`
				)
			}
			if (value === prev) {
				throw new RangeError(
					`Expected "${name}" to be de-duplicated (strictly ascending); duplicate value ${value} at index ${i}.`
				)
			}
		}
	}
}

/**
 * Recursively finds the first index in `arr[low..high)` whose value is `>= target`
 * (lower bound) using divide-and-conquer binary search.
 *
 * @param {readonly number[]} arr - Strictly ascending array of finite numbers.
 * @param {number} target - Value to locate.
 * @param {number} low - Inclusive lower bound index.
 * @param {number} high - Exclusive upper bound index.
 * @returns {number} First index `idx` in `[low, high]` with `arr[idx] >= target`, or `high`.
 */
function lowerBoundRecursive(arr, target, low, high) {
	if (low >= high) {
		return low
	}
	const mid = low + Math.floor((high - low) / 2)
	if (arr[mid] < target) {
		return lowerBoundRecursive(arr, target, mid + 1, high)
	}
	return lowerBoundRecursive(arr, target, low, mid)
}

/**
 * Recursively computes the set difference `a[aStart..aEnd) \ b[bStart..bEnd)`
 * using a divide-and-conquer merge-style partition, appending surviving elements
 * into `result` in strictly ascending order.
 *
 * @param {readonly number[]} a - Minuend sorted, de-duplicated array.
 * @param {number} aStart - Inclusive start index in `a`.
 * @param {number} aEnd - Exclusive end index in `a`.
 * @param {readonly number[]} b - Subtrahend sorted, de-duplicated array.
 * @param {number} bStart - Inclusive start index in `b`.
 * @param {number} bEnd - Exclusive end index in `b`.
 * @param {number[]} result - Accumulator receiving output elements in ascending order.
 */
function diffDivideAndConquer(a, aStart, aEnd, b, bStart, bEnd, result) {
	if (aStart >= aEnd) {
		return
	}

	// Base case: `b` slice is empty or completely disjoint from `a` slice.
	if (
		bStart >= bEnd ||
		a[aEnd - 1] < b[bStart] ||
		b[bEnd - 1] < a[aStart]
	) {
		for (let i = aStart; i < aEnd; i++) {
			result.push(a[i])
		}
		return
	}

	// Divide: split `a` at its midpoint and partition `b` around the pivot via binary search.
	const aMid = aStart + Math.floor((aEnd - aStart) / 2)
	const pivot = a[aMid]
	const bSplit = lowerBoundRecursive(b, pivot, bStart, bEnd)
	const pivotInB = bSplit < bEnd && b[bSplit] === pivot

	// Conquer left subproblem: elements strictly less than `pivot`.
	if (aStart < aMid) {
		diffDivideAndConquer(a, aStart, aMid, b, bStart, bSplit, result)
	}

	// Combine midpoint: include `pivot` iff it is absent from `b`.
	if (!pivotInB) {
		result.push(pivot)
	}

	// Conquer right subproblem: elements strictly greater than `pivot`.
	const nextBStart = pivotInB ? bSplit + 1 : bSplit
	if (aMid + 1 < aEnd) {
		diffDivideAndConquer(a, aMid + 1, aEnd, b, nextBStart, bEnd, result)
	}
}

/**
 * Computes the set difference `a \ b` (elements in `a` that are not in `b`)
 * over two sorted, de-duplicated arrays of finite numbers.
 *
 * Algorithm:
 * Uses a recursive divide-and-conquer merge-style algorithm (dual-slice partitioning).
 * At each recursive step, the midpoint `pivot` of the active slice of `a` is located
 * in the active slice of `b` via a recursive lower-bound binary search, partitioning
 * both arrays into independent left (`< pivot`) and right (`> pivot`) subproblems.
 * Disjoint or empty `b` slices terminate immediately by copying the remaining `a` slice.
 *
 * Complexity:
 * - Time: O(|a| + min(|a|, |b|) * log(max(|a|, |b|) / min(|a|, |b|) + 1)) <= O(|a| + |b|)
 * - Auxiliary stack depth: O(log(|a| + 1) + log(|b| + 1))
 *
 * @param {readonly number[]} a - First sorted, de-duplicated array of finite numbers (minuend).
 * @param {readonly number[]} b - Second sorted, de-duplicated array of finite numbers (subtrahend).
 * @returns {number[]} A new sorted, de-duplicated array containing all elements in `a` not in `b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains non-number / sparse elements.
 * @throws {RangeError} If `a` or `b` contains non-finite numbers, is not strictly ascending, or has duplicates.
 */
export function setDifferenceSortedArrRecursive(a, b) {
	validateSortedUniqueArray(a, 'a')
	validateSortedUniqueArray(b, 'b')

	const result = []
	diffDivideAndConquer(a, 0, a.length, b, 0, b.length, result)
	return result
}
