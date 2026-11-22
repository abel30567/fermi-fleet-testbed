/**
 * Recursively validates that every element in `arr[lo..hi)` is a finite number
 * and that the slice is strictly ascending (sorted and de-duplicated).
 *
 * Uses divide-and-conquer splitting so recursion depth is O(log n).
 *
 * @param {unknown[]} arr - Array to validate.
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Exclusive upper index.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If any element is not a number.
 * @throws {RangeError} If any element is non-finite, out of order, or duplicated.
 */
function validateRangeRecursive(arr, lo, hi, name) {
	const len = hi - lo
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const val = arr[lo]
		if (typeof val !== 'number') {
			throw new TypeError(
				`${name}[${lo}] must be a finite number, received ${val === null ? 'null' : typeof val}`
			)
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(
				`${name}[${lo}] must be a finite number, received ${val}`
			)
		}
		return
	}

	const mid = lo + (len >>> 1)
	validateRangeRecursive(arr, lo, mid, name)
	validateRangeRecursive(arr, mid, hi, name)

	const leftMax = arr[mid - 1]
	const rightMin = arr[mid]
	if (leftMax === rightMin) {
		throw new RangeError(
			`${name} must be de-duplicated (strictly ascending); duplicate value ${rightMin} at index ${mid}`
		)
	}
	if (leftMax > rightMin) {
		throw new RangeError(
			`${name} must be sorted in strictly ascending order; ${leftMax} at index ${mid - 1} is greater than ${rightMin} at index ${mid}`
		)
	}
}

/**
 * Validates that an input is a sorted, de-duplicated array of finite numbers.
 *
 * @param {unknown} arr - Candidate input array.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `arr` is not an Array or contains non-number elements.
 * @throws {RangeError} If `arr` contains non-finite numbers, duplicates, or unsorted elements.
 */
function validateSortedUniqueArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(
			`${name} must be an array, received ${arr === null ? 'null' : typeof arr}`
		)
	}
	validateRangeRecursive(arr, 0, arr.length, name)
}

/**
 * Recursive binary search returning the lower bound of `target` in `arr[lo..hi)`:
 * the smallest index `idx` in `[lo, hi]` such that `arr[idx] >= target` (or `hi`
 * if all elements in the slice are strictly less than `target`).
 *
 * @param {number[]} arr - Strictly ascending array of finite numbers.
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Exclusive upper index.
 * @param {number} target - Value to locate.
 * @returns {number} Lower-bound index in `[lo, hi]`.
 */
function lowerBoundRecursive(arr, lo, hi, target) {
	if (lo >= hi) {
		return lo
	}
	const mid = lo + ((hi - lo) >>> 1)
	if (arr[mid] < target) {
		return lowerBoundRecursive(arr, mid + 1, hi, target)
	}
	return lowerBoundRecursive(arr, lo, mid, target)
}

/**
 * Baeza-Yates divide-and-conquer recursive set intersection over two strictly
 * ascending slices `a[aLo..aHi)` and `b[bLo..bHi)`.
 *
 * Always bisects the smaller slice around its median pivot, partitions the larger
 * slice via recursive binary search, and recurses on the left and right subproblems
 * in order so matching elements are appended to `out` in strictly ascending order.
 *
 * @param {number[]} a - First sorted, de-duplicated array.
 * @param {number} aLo - Inclusive start index in `a`.
 * @param {number} aHi - Exclusive end index in `a`.
 * @param {number[]} b - Second sorted, de-duplicated array.
 * @param {number} bLo - Inclusive start index in `b`.
 * @param {number} bHi - Exclusive end index in `b`.
 * @param {number[]} out - Output accumulator array (strictly ascending).
 */
function intersectDivideAndConquer(a, aLo, aHi, b, bLo, bHi, out) {
	const lenA = aHi - aLo
	const lenB = bHi - bLo
	if (lenA <= 0 || lenB <= 0) {
		return
	}

	// Range-disjointness pruning: no overlap possible if max(a) < min(b) or max(b) < min(a)
	if (a[aHi - 1] < b[bLo] || b[bHi - 1] < a[aLo]) {
		return
	}

	// Ensure we always bisect the smaller slice for O(m log(n/m + 1)) time and O(log m) stack depth
	if (lenA > lenB) {
		intersectDivideAndConquer(b, bLo, bHi, a, aLo, aHi, out)
		return
	}

	const mid = aLo + (lenA >>> 1)
	const pivot = a[mid]
	const pos = lowerBoundRecursive(b, bLo, bHi, pivot)

	// Left subproblem: all common elements strictly less than pivot
	intersectDivideAndConquer(a, aLo, mid, b, bLo, pos, out)

	// Middle match: check if pivot exists in b
	let rightBLo = pos
	if (pos < bHi && b[pos] === pivot) {
		out.push(pivot === 0 ? 0 : pivot)
		rightBLo = pos + 1
	}

	// Right subproblem: all common elements strictly greater than pivot
	intersectDivideAndConquer(a, mid + 1, aHi, b, rightBLo, bHi, out)
}

/**
 * Computes the logic-set AND (set intersection, A ∩ B) of two sorted,
 * de-duplicated arrays of finite numbers using a recursive divide-and-conquer
 * merge-style algorithm (Baeza-Yates intersection).
 *
 * Algorithm:
 * 1. Validates both inputs recursively in O(n) time and O(log n) stack depth,
 *    ensuring each array contains only finite numbers in strictly ascending order.
 * 2. Recursively bisects the smaller subarray at its median element, partitions
 *    the larger subarray via recursive binary search (`lowerBoundRecursive`),
 *    and solves the left and right subproblems in order, pruning disjoint ranges
 *    in O(1).
 * 3. Runs in O(m log(n / m + 1)) time where m = min(|a|, |b|) and n = max(|a|, |b|),
 *    with O(log(min(|a|, |b|) + 1)) auxiliary call-stack space.
 *
 * @param {number[]} a - First sorted, de-duplicated array of finite numbers.
 * @param {number[]} b - Second sorted, de-duplicated array of finite numbers.
 * @returns {number[]} A new sorted, de-duplicated array containing elements present in both `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array, or if any element is not a number.
 * @throws {RangeError} If any element is non-finite (`NaN`, `±Infinity`), or if either array is not strictly ascending (unsorted or contains duplicates).
 */
export function andSortedArrRecursive(a, b) {
	validateSortedUniqueArray(a, 'a')
	validateSortedUniqueArray(b, 'b')

	const out = []
	intersectDivideAndConquer(a, 0, a.length, b, 0, b.length, out)
	return out
}
