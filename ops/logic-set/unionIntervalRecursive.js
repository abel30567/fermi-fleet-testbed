/**
 * Validates and normalizes a single closed real interval `[lo, hi]`.
 *
 * @param {unknown} interval - Candidate interval tuple `[lo, hi]`.
 * @param {number} setIndex - Index of the containing set argument (for error messages).
 * @param {number} intervalIndex - Index of the interval within its set (for error messages).
 * @returns {[number, number]} A fresh canonical `[lo, hi]` pair with `-0` normalized to `0`.
 * @throws {TypeError} If `interval` is not an array or its endpoints are not numbers.
 * @throws {RangeError} If `interval` does not have length 2, has non-finite endpoints, or has `lo > hi`.
 */
function validateInterval(interval, setIndex, intervalIndex) {
	if (!Array.isArray(interval)) {
		throw new TypeError(
			`Expected interval at sets[${setIndex}][${intervalIndex}] to be an array [lo, hi]`
		)
	}
	if (interval.length !== 2) {
		throw new RangeError(
			`Expected interval at sets[${setIndex}][${intervalIndex}] to have length 2, got ${interval.length}`
		)
	}

	const [rawLo, rawHi] = interval
	if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
		throw new TypeError(
			`Expected finite numeric endpoints at sets[${setIndex}][${intervalIndex}]`
		)
	}
	if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
		throw new RangeError(
			`Expected finite endpoints at sets[${setIndex}][${intervalIndex}], got [${rawLo}, ${rawHi}]`
		)
	}
	if (rawLo > rawHi) {
		throw new RangeError(
			`Invalid interval at sets[${setIndex}][${intervalIndex}]: lo (${rawLo}) > hi (${rawHi})`
		)
	}

	const lo = rawLo === 0 ? 0 : rawLo
	const hi = rawHi === 0 ? 0 : rawHi
	return [lo, hi]
}

/**
 * Validates a set (array) of closed real intervals and returns a defensive copy.
 *
 * @param {unknown} set - Candidate interval set.
 * @param {number} setIndex - Index of the set argument (for error messages).
 * @returns {Array<[number, number]>} Validated copy of intervals.
 * @throws {TypeError} If `set` is not an array or contains invalid interval types.
 * @throws {RangeError} If any interval has invalid length, non-finite endpoints, or `lo > hi`.
 */
function validateIntervalSet(set, setIndex) {
	if (!Array.isArray(set)) {
		throw new TypeError(
			`Expected interval set at argument ${setIndex} to be an array`
		)
	}
	const copy = new Array(set.length)
	for (let i = 0; i < set.length; i++) {
		copy[i] = validateInterval(set[i], setIndex, i)
	}
	return copy
}

/**
 * Appends `interval` onto a normalized output list, coalescing with the last interval
 * if they overlap or touch (`interval[0] <= last[1]`).
 *
 * Precondition: `interval[0] >= out[out.length - 1][0]` whenever `out.length > 0`.
 *
 * @param {Array<[number, number]>} out - Accumulator of sorted, disjoint, non-touching intervals.
 * @param {[number, number]} interval - Next interval in non-decreasing `(lo, hi)` order.
 */
function appendOrMerge(out, interval) {
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
 * Combines two already-normalized (sorted, disjoint, non-touching) interval sets
 * into a single normalized interval set in O(|left| + |right|) time.
 *
 * @param {Array<[number, number]>} left - Normalized interval set.
 * @param {Array<[number, number]>} right - Normalized interval set.
 * @returns {Array<[number, number]>} Normalized union of `left` and `right`.
 */
function mergeNormalized(left, right) {
	if (left.length === 0) {
		return right.map(([lo, hi]) => [lo, hi])
	}
	if (right.length === 0) {
		return left.map(([lo, hi]) => [lo, hi])
	}

	const out = []
	let i = 0
	let j = 0

	while (i < left.length && j < right.length) {
		const a = left[i]
		const b = right[j]
		if (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) {
			appendOrMerge(out, a)
			i++
		} else {
			appendOrMerge(out, b)
			j++
		}
	}

	while (i < left.length) {
		appendOrMerge(out, left[i++])
	}
	while (j < right.length) {
		appendOrMerge(out, right[j++])
	}

	return out
}

/**
 * Recursively sorts and coalesces a slice `intervals[start..end)` using divide-and-conquer
 * merge-sort with integrated interval merging.
 *
 * @param {Array<[number, number]>} intervals - Validated intervals.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Array<[number, number]>} Normalized interval set for the slice.
 */
function normalizeSliceRecursive(intervals, start, end) {
	const len = end - start
	if (len <= 0) {
		return []
	}
	if (len === 1) {
		const [lo, hi] = intervals[start]
		return [[lo, hi]]
	}

	const mid = start + (len >>> 1)
	const left = normalizeSliceRecursive(intervals, start, mid)
	const right = normalizeSliceRecursive(intervals, mid, end)
	return mergeNormalized(left, right)
}

/**
 * Recursively computes the normalized union of `sets[start..end)` using divide-and-conquer.
 *
 * @param {Array<Array<[number, number]>>} sets - Validated interval sets.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Array<[number, number]>} Normalized union across the slice of sets.
 */
function unionSetsRecursive(sets, start, end) {
	const len = end - start
	if (len <= 0) {
		return []
	}
	if (len === 1) {
		const set = sets[start]
		return normalizeSliceRecursive(set, 0, set.length)
	}

	const mid = start + (len >>> 1)
	const left = unionSetsRecursive(sets, start, mid)
	const right = unionSetsRecursive(sets, mid, end)
	return mergeNormalized(left, right)
}

/**
 * Computes the set-theoretic union over zero or more sets of closed real intervals `[lo, hi]`,
 * returning a normalized canonical representation: sorted in ascending order, pairwise disjoint,
 * and non-touching (`result[i][1] < result[i + 1][0]`).
 *
 * Uses a divide-and-conquer recursive strategy both across input sets and within each set
 * (recursive merge-sort with integrated interval coalescing), running in O(N log N) time
 * and O(log N) recursion depth where N is the total number of input intervals.
 *
 * Input sets and intervals are never mutated; `-0` endpoints are canonicalized to `0`.
 *
 * @param {...Array<[number, number]>} sets - Zero or more arrays of closed real intervals `[lo, hi]`
 *   with finite numeric endpoints satisfying `lo <= hi`.
 * @returns {Array<[number, number]>} Normalized, sorted, merged array of disjoint closed intervals.
 * @throws {TypeError} If any argument is not an array, any interval is not an array, or any endpoint is not a number.
 * @throws {RangeError} If any interval does not have length 2, has a non-finite endpoint (`NaN`, `±Infinity`), or has `lo > hi`.
 *
 * @example
 * unionIntervalRecursive([[1, 3], [6, 8]], [[2, 5], [8, 10]])
 * // => [[1, 5], [6, 10]]
 */
export function unionIntervalRecursive(...sets) {
	const validatedSets = new Array(sets.length)
	for (let i = 0; i < sets.length; i++) {
		validatedSets[i] = validateIntervalSet(sets[i], i)
	}
	return unionSetsRecursive(validatedSets, 0, validatedSets.length)
}
