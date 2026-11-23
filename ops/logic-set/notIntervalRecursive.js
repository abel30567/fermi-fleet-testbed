/**
 * @module ops/logic-set/notIntervalRecursive
 *
 * Logical complement (`not`) over sets of closed real intervals `[lo, hi]`,
 * normalized and merged using a recursive divide-and-conquer implementation.
 */

/**
 * Normalize `-0` to `0` so output intervals never contain signed negative zero.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validate a single `[lo, hi]` interval tuple and return its normalized bounds.
 *
 * @param {unknown} interval
 * @param {string} label
 * @returns {[number, number]}
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If either bound is `NaN` or `lo > hi`.
 */
function validateInterval(interval, label) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(`${label} must be a [lo, hi] tuple of length 2`)
	}
	const [lo, hi] = interval
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`${label} bounds must be numbers`)
	}
	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError(`${label} bounds must not be NaN`)
	}
	if (lo > hi) {
		throw new RangeError(`${label} lower bound (${lo}) must be <= upper bound (${hi})`)
	}
	return [normalizeZero(lo), normalizeZero(hi)]
}

/**
 * Append an interval to a sorted, disjoint, non-touching interval list,
 * merging with the last interval if they overlap or touch.
 *
 * @param {Array<[number, number]>} out
 * @param {[number, number]} interval
 */
function pushMerged(out, interval) {
	if (out.length === 0) {
		out.push([interval[0], interval[1]])
		return
	}
	const last = out[out.length - 1]
	if (interval[0] <= last[1]) {
		if (interval[1] > last[1]) {
			last[1] = interval[1]
		}
	} else {
		out.push([interval[0], interval[1]])
	}
}

/**
 * Merge two sorted, disjoint, non-touching interval lists into one normalized list.
 *
 * @param {Array<[number, number]>} left
 * @param {Array<[number, number]>} right
 * @returns {Array<[number, number]>}
 */
function mergeNormalized(left, right) {
	const out = []
	let i = 0
	let j = 0
	while (i < left.length && j < right.length) {
		if (left[i][0] <= right[j][0]) {
			pushMerged(out, left[i++])
		} else {
			pushMerged(out, right[j++])
		}
	}
	while (i < left.length) {
		pushMerged(out, left[i++])
	}
	while (j < right.length) {
		pushMerged(out, right[j++])
	}
	return out
}

/**
 * Divide-and-conquer normalization: recursively splits `list[start..end)` in half,
 * normalizes each half, and merges overlapping or touching intervals.
 *
 * @param {Array<[number, number]>} list
 * @param {number} start
 * @param {number} end
 * @returns {Array<[number, number]>}
 */
function normalizeDivideAndConquer(list, start, end) {
	const len = end - start
	if (len <= 0) {
		return []
	}
	if (len === 1) {
		const [lo, hi] = list[start]
		return [[lo, hi]]
	}
	const mid = (start + end) >>> 1
	const left = normalizeDivideAndConquer(list, start, mid)
	const right = normalizeDivideAndConquer(list, mid, end)
	return mergeNormalized(left, right)
}

/**
 * Divide-and-conquer complement over a normalized, sorted, disjoint, non-touching
 * array of intervals `merged[start..end)` contained within `[lo, hi]`.
 *
 * Splits around the median interval `merged[mid] = [midLo, midHi]` and recurses
 * on the left subrange within `[lo, midLo]` and the right subrange within `[midHi, hi]`.
 *
 * @param {Array<[number, number]>} merged
 * @param {number} start
 * @param {number} end
 * @param {number} lo
 * @param {number} hi
 * @param {Array<[number, number]>} out
 */
function complementDivideAndConquer(merged, start, end, lo, hi, out) {
	if (start >= end) {
		if (lo < hi) {
			out.push([lo, hi])
		}
		return
	}

	if (end - start === 1) {
		const [a, b] = merged[start]
		if (lo < a) {
			out.push([lo, a])
		}
		if (b < hi) {
			out.push([b, hi])
		}
		return
	}

	const mid = (start + end) >>> 1
	const [midLo, midHi] = merged[mid]
	complementDivideAndConquer(merged, start, mid, lo, midLo, out)
	complementDivideAndConquer(merged, mid + 1, end, midHi, hi, out)
}

/**
 * Computes the set complement (`not`) of a set of real intervals `[lo, hi]`
 * within a given `universe` interval (defaulting to `[-Infinity, Infinity]`),
 * using a recursive divide-and-conquer algorithm for both normalization/merging
 * and complementation.
 *
 * The returned array of intervals is strictly normalized: sorted in ascending
 * order, disjoint, non-touching (`out[i][1] < out[i + 1][0]`), non-degenerate
 * (`lo < hi`), and contained within `universe`.
 *
 * Zero-width intervals `[a, a]` have measure zero and do not split an enclosing
 * interval; a zero-width universe `[u, u]` yields `[]`.
 *
 * @param {Array<[number, number]>} intervals - Input array of `[lo, hi]` real intervals (may be unsorted, overlapping, or touching).
 * @param {[number, number]} [universe=[-Infinity, Infinity]] - Bounding universe interval `[uLo, uHi]`.
 * @returns {Array<[number, number]>} Normalized, merged complement intervals within `universe`.
 * @throws {TypeError} If `intervals` is not an array, or any interval / `universe` is not a 2-tuple of numbers.
 * @throws {RangeError} If any bound is `NaN` or any interval / `universe` has `lo > hi`.
 */
export function notIntervalRecursive(intervals, universe = [-Infinity, Infinity]) {
	if (!Array.isArray(intervals)) {
		throw new TypeError('intervals must be an array of [lo, hi] tuples')
	}

	const [uLo, uHi] = validateInterval(universe, 'universe')

	const clipped = []
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = validateInterval(intervals[i], `intervals[${i}]`)
		const cLo = lo < uLo ? uLo : lo
		const cHi = hi > uHi ? uHi : hi
		if (cLo < cHi) {
			clipped.push([cLo, cHi])
		}
	}

	if (uLo === uHi) {
		return []
	}

	if (clipped.length === 0) {
		return [[uLo, uHi]]
	}

	const merged = normalizeDivideAndConquer(clipped, 0, clipped.length)
	const result = []
	complementDivideAndConquer(merged, 0, merged.length, uLo, uHi, result)
	return result
}
