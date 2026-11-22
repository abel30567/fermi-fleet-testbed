/**
 * Normalizes and validates a single closed real interval `[lo, hi]`.
 *
 * @param {unknown} interval - Candidate interval tuple.
 * @param {number} setIndex - Index of the containing interval set (for error context).
 * @param {number} intervalIndex - Index of the interval within its set (for error context).
 * @returns {[number, number]} A fresh normalized `[lo, hi]` tuple with `-0` canonicalized to `0`.
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If either bound is `NaN` or if `lo > hi`.
 */
function normalizeInterval(interval, setIndex, intervalIndex) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(
			`intervalSets[${setIndex}][${intervalIndex}] must be a [lo, hi] array of length 2`
		)
	}

	const rawLo = interval[0]
	const rawHi = interval[1]

	if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
		throw new TypeError(
			`intervalSets[${setIndex}][${intervalIndex}] bounds must be numbers`
		)
	}

	if (Number.isNaN(rawLo) || Number.isNaN(rawHi)) {
		throw new RangeError(
			`intervalSets[${setIndex}][${intervalIndex}] bounds must not be NaN`
		)
	}

	if (rawLo > rawHi) {
		throw new RangeError(
			`intervalSets[${setIndex}][${intervalIndex}] has inverted bounds [${rawLo}, ${rawHi}]: lo must be <= hi`
		)
	}

	const lo = rawLo === 0 ? 0 : rawLo
	const hi = rawHi === 0 ? 0 : rawHi

	return [lo, hi]
}

/**
 * Computes the set union over zero or more sets of closed real intervals `[lo, hi]`
 * using a straightforward iterative collect-sort-merge algorithm.
 *
 * Each input set is an array of closed interval tuples `[lo, hi]` with `lo <= hi`
 * (finite numbers or `±Infinity`, excluding `NaN`). Input sets may be empty, unsorted,
 * contain overlapping/touching intervals, or include degenerate point intervals `[x, x]`.
 *
 * The returned interval set is canonically normalized:
 * - Strictly sorted in ascending order of lower bounds.
 * - Pairwise disjoint and non-touching (`result[i][1] < result[i + 1][0]`).
 * - `-0` bounds canonicalized to `0`.
 * - Inputs are never mutated.
 *
 * @param {...Array<[number, number]>} intervalSets - Interval sets to union (typically 2 or more).
 * @returns {Array<[number, number]>} Canonical merged union of all input interval sets.
 * @throws {TypeError} If any argument is not an array, or any interval is not a `[lo, hi]` pair of numbers.
 * @throws {RangeError} If any interval bound is `NaN` or has `lo > hi`.
 */
export function unionIntervalIterative(...intervalSets) {
	const allIntervals = []

	for (let s = 0; s < intervalSets.length; s++) {
		const set = intervalSets[s]
		if (!Array.isArray(set)) {
			throw new TypeError(`intervalSets[${s}] must be an array of [lo, hi] intervals`)
		}

		for (let i = 0; i < set.length; i++) {
			allIntervals.push(normalizeInterval(set[i], s, i))
		}
	}

	if (allIntervals.length === 0) {
		return []
	}

	// Safe comparator avoiding subtraction overflow with ±Infinity or ±Number.MAX_VALUE.
	allIntervals.sort((a, b) => {
		if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
		if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1
		return 0
	})

	const merged = [allIntervals[0]]

	for (let i = 1; i < allIntervals.length; i++) {
		const current = merged[merged.length - 1]
		const next = allIntervals[i]

		if (next[0] <= current[1]) {
			if (next[1] > current[1]) {
				current[1] = next[1]
			}
		} else {
			merged.push(next)
		}
	}

	return merged
}
