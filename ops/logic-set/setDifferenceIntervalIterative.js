/**
 * Validate and normalize a collection of real intervals `[lo, hi]` into a
 * sorted, merged array of disjoint, non-touching intervals.
 *
 * @param {unknown} intervals - Candidate array of `[lo, hi]` intervals.
 * @param {string} paramName - Parameter name used in error messages.
 * @returns {Array<[number, number]>} Normalized, sorted, and merged intervals.
 */
function normalizeIntervals(intervals, paramName) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`${paramName} must be an array of [lo, hi] intervals`)
	}

	const copy = new Array(intervals.length)
	for (let i = 0; i < intervals.length; i++) {
		const interval = intervals[i]
		if (!Array.isArray(interval)) {
			throw new TypeError(`${paramName}[${i}] must be a [lo, hi] array`)
		}
		if (interval.length !== 2) {
			throw new RangeError(`${paramName}[${i}] must have length 2`)
		}

		const rawLo = interval[0]
		const rawHi = interval[1]
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(`${paramName}[${i}] endpoints must be numbers`)
		}
		if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
			throw new RangeError(`${paramName}[${i}] endpoints must be finite numbers`)
		}
		if (rawLo > rawHi) {
			throw new RangeError(`${paramName}[${i}] has lo (${rawLo}) > hi (${rawHi})`)
		}

		const lo = rawLo === 0 ? 0 : rawLo
		const hi = rawHi === 0 ? 0 : rawHi
		copy[i] = [lo, hi]
	}

	if (copy.length <= 1) {
		return copy
	}

	copy.sort((u, v) => (u[0] !== v[0] ? u[0] - v[0] : u[1] - v[1]))

	const merged = [copy[0]]
	for (let i = 1; i < copy.length; i++) {
		const next = copy[i]
		const last = merged[merged.length - 1]
		if (next[0] <= last[1]) {
			if (next[1] > last[1]) {
				last[1] = next[1]
			}
		} else {
			merged.push(next)
		}
	}

	return merged
}

/**
 * Compute the set difference `A \ B` over sets of real intervals `[lo, hi]`,
 * returning a normalized and merged array of disjoint, non-touching intervals.
 *
 * Uses a straightforward iterative two-pointer sweep over normalized inputs:
 * - Both inputs are validated, sorted, and merged without mutating the callers' arrays.
 * - Subtracting a non-degenerate interval `[bLo, bHi]` from `[aLo, aHi]` trims or
 *   splits `[aLo, aHi]` at `bLo` and `bHi`, while touching boundaries leave
 *   non-degenerate intervals intact.
 * - A degenerate point interval `[x, x]` in `A` is removed if covered by any interval
 *   in `B` (including `[x, x]` or an endpoint of a wider interval), whereas a point
 *   interval in `B` does not split a non-degenerate interval in `A` because the
 *   result is normalized and merged.
 *
 * @param {Array<[number, number]>} a - Minuend set of real intervals `[lo, hi]` with `lo <= hi`.
 * @param {Array<[number, number]>} b - Subtrahend set of real intervals `[lo, hi]` with `lo <= hi`.
 * @returns {Array<[number, number]>} Normalized, sorted, and merged intervals representing `a \ b`.
 * @throws {TypeError} If `a` or `b` is not an array, an entry is not an array, or an endpoint is not a number.
 * @throws {RangeError} If an entry does not have length 2, an endpoint is non-finite, or `lo > hi`.
 */
export function setDifferenceIntervalIterative(a, b) {
	const normA = normalizeIntervals(a, 'a')
	const normB = normalizeIntervals(b, 'b')

	if (normA.length === 0) {
		return []
	}
	if (normB.length === 0) {
		return normA
	}

	const result = []
	let j = 0

	for (let i = 0; i < normA.length; i++) {
		let curLo = normA[i][0]
		const curHi = normA[i][1]
		let alive = true

		// Skip B intervals that end strictly before curLo.
		while (j < normB.length && normB[j][1] < curLo) {
			j++
		}

		// Process all B intervals overlapping or touching [curLo, curHi].
		while (j < normB.length && normB[j][0] <= curHi) {
			const bLo = normB[j][0]
			const bHi = normB[j][1]

			if (bLo === bHi) {
				if (curLo === curHi) {
					alive = false
					break
				}
				// Removing a single point does not split a normalized closed interval.
				j++
				continue
			}

			if (bLo > curLo) {
				result.push([curLo, bLo])
			}

			if (bHi >= curHi) {
				alive = false
				break
			}

			curLo = bHi
			j++
		}

		if (alive) {
			result.push([curLo, curHi])
		}
	}

	return result
}
