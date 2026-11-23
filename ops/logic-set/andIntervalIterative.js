/**
 * Computes the logical AND (set intersection) of two sets of closed real
 * intervals `[lo, hi]`, returning a normalized and merged array of disjoint,
 * sorted intervals using a straightforward iterative two-pointer algorithm.
 *
 * Each input set may be unsorted and may contain overlapping, touching, or
 * duplicate intervals; both inputs are validated and normalized without
 * mutating the caller's data.
 *
 * @typedef {[number, number]} RealInterval
 *
 * @param {RealInterval[]} a - First set of closed real intervals `[lo, hi]`.
 * @param {RealInterval[]} b - Second set of closed real intervals `[lo, hi]`.
 * @returns {RealInterval[]} Normalized, merged, sorted, disjoint intersection
 *   of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array, any element is not a
 *   2-element array, or any endpoint is not a number.
 * @throws {RangeError} If any endpoint is not finite (`NaN`, `Infinity`,
 *   `-Infinity`) or if any interval has `lo > hi`.
 */
export function andIntervalIterative(a, b) {
	const normA = normalizeIntervals(a, 'a')
	const normB = normalizeIntervals(b, 'b')

	if (normA.length === 0 || normB.length === 0) {
		return []
	}

	/** @type {RealInterval[]} */
	const result = []
	let i = 0
	let j = 0

	while (i < normA.length && j < normB.length) {
		const [aLo, aHi] = normA[i]
		const [bLo, bHi] = normB[j]

		const lo = aLo >= bLo ? aLo : bLo
		const hi = aHi <= bHi ? aHi : bHi

		if (lo <= hi) {
			if (result.length > 0 && lo <= result[result.length - 1][1]) {
				const prev = result[result.length - 1]
				if (hi > prev[1]) {
					prev[1] = hi
				}
			} else {
				result.push([lo, hi])
			}
		}

		if (aHi < bHi) {
			i += 1
		} else if (bHi < aHi) {
			j += 1
		} else {
			i += 1
			j += 1
		}
	}

	return result
}

/**
 * Validates, clones, sorts, and merges a set of closed real intervals.
 *
 * @param {unknown} intervals - Candidate interval set.
 * @param {string} paramName - Parameter label for error messages.
 * @returns {RealInterval[]} Sorted, disjoint, merged intervals.
 */
function normalizeIntervals(intervals, paramName) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`Expected "${paramName}" to be an array of [lo, hi] intervals`)
	}

	/** @type {RealInterval[]} */
	const validated = new Array(intervals.length)

	for (let idx = 0; idx < intervals.length; idx += 1) {
		const entry = intervals[idx]
		if (!Array.isArray(entry) || entry.length !== 2) {
			throw new TypeError(
				`Expected "${paramName}[${idx}]" to be a 2-element [lo, hi] interval array`
			)
		}

		const [rawLo, rawHi] = entry
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(
				`Expected "${paramName}[${idx}]" endpoints to be numbers`
			)
		}

		if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
			throw new RangeError(
				`Expected "${paramName}[${idx}]" endpoints to be finite real numbers`
			)
		}

		if (rawLo > rawHi) {
			throw new RangeError(
				`Invalid interval "${paramName}[${idx}]": lo (${rawLo}) > hi (${rawHi})`
			)
		}

		const lo = rawLo === 0 ? 0 : rawLo
		const hi = rawHi === 0 ? 0 : rawHi
		validated[idx] = [lo, hi]
	}

	if (validated.length <= 1) {
		return validated
	}

	validated.sort((x, y) => (x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]))

	/** @type {RealInterval[]} */
	const merged = [validated[0]]
	for (let idx = 1; idx < validated.length; idx += 1) {
		const [lo, hi] = validated[idx]
		const last = merged[merged.length - 1]
		if (lo <= last[1]) {
			if (hi > last[1]) {
				last[1] = hi
			}
		} else {
			merged.push([lo, hi])
		}
	}

	return merged
}
