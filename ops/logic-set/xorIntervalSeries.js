/**
 * @fileoverview Logical XOR (symmetric difference) over sets of real intervals
 * `[lo, hi]`, normalized and merged, using a Heaviside step-series and
 * closed-form Boolean indicator identity.
 */

/**
 * Overflow-safe numeric comparator for finite real numbers.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function compareNumbers(x, y) {
	return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Overflow-safe lexicographic comparator for `[lo, hi]` interval tuples.
 *
 * @param {[number, number]} u
 * @param {[number, number]} v
 * @returns {number}
 */
function compareIntervals(u, v) {
	if (u[0] !== v[0]) return u[0] < v[0] ? -1 : 1
	if (u[1] !== v[1]) return u[1] < v[1] ? -1 : 1
	return 0
}

/**
 * Sort and merge a list of validated `[lo, hi]` intervals into canonical
 * disjoint, non-touching, ascending order.
 *
 * @param {Array<[number, number]>} intervals
 * @returns {Array<[number, number]>}
 */
function mergeIntervals(intervals) {
	if (intervals.length === 0) return []
	const sorted = intervals.slice().sort(compareIntervals)
	const merged = [[sorted[0][0], sorted[0][1]]]
	for (let i = 1; i < sorted.length; i++) {
		const prev = merged[merged.length - 1]
		const [lo, hi] = sorted[i]
		if (lo <= prev[1]) {
			if (hi > prev[1]) prev[1] = hi
		} else {
			merged.push([lo, hi])
		}
	}
	return merged
}

/**
 * Validate and normalize an interval set into sorted, merged, disjoint
 * closed intervals `[lo, hi]` with `-0` canonicalized to `0`.
 *
 * @param {unknown} intervals
 * @param {string} name
 * @returns {Array<[number, number]>}
 */
function normalizeIntervalSet(intervals, name) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`${name} must be an array of [lo, hi] intervals`)
	}
	const validated = new Array(intervals.length)
	for (let i = 0; i < intervals.length; i++) {
		const item = intervals[i]
		if (!Array.isArray(item) || item.length !== 2) {
			throw new TypeError(`${name}[${i}] must be a [lo, hi] tuple of length 2`)
		}
		const [rawLo, rawHi] = item
		if (
			typeof rawLo !== 'number' ||
			typeof rawHi !== 'number' ||
			!Number.isFinite(rawLo) ||
			!Number.isFinite(rawHi)
		) {
			throw new TypeError(`${name}[${i}] bounds must be finite numbers`)
		}
		if (rawLo > rawHi) {
			throw new RangeError(`${name}[${i}] has lo (${rawLo}) > hi (${rawHi})`)
		}
		validated[i] = [rawLo === 0 ? 0 : rawLo, rawHi === 0 ? 0 : rawHi]
	}
	return mergeIntervals(validated)
}

/**
 * Closed-form Boolean polynomial identity for indicator XOR:
 * `chi_XOR = chi_A + chi_B - 2 * chi_A * chi_B` for `chi_A, chi_B in {0, 1}`.
 *
 * @param {number} chiA
 * @param {number} chiB
 * @returns {number}
 */
function indicatorXor(chiA, chiB) {
	return chiA + chiB - 2 * chiA * chiB
}

/**
 * Binary-search point membership indicator `1_S(x) in {0, 1}` over a
 * normalized (sorted, disjoint) closed interval set.
 *
 * @param {Array<[number, number]>} normSet
 * @param {number} x
 * @returns {number}
 */
function pointIndicator(normSet, x) {
	let lo = 0
	let hi = normSet.length - 1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		const [a, b] = normSet[mid]
		if (x < a) {
			hi = mid - 1
		} else if (x > b) {
			lo = mid + 1
		} else {
			return 1
		}
	}
	return 0
}

/**
 * Compute the logical XOR (symmetric difference) of two sets of closed real
 * intervals `[lo, hi]`, returning a normalized and merged array of disjoint
 * intervals sorted in ascending order.
 *
 * Each normalized input set `S = U_i [l_i, r_i]` is represented on open
 * sub-intervals via its finite Heaviside step series
 * `chi_S(x) = sum_i (H(x - l_i) - H(x - r_i))`, and combined using the
 * closed-form Boolean polynomial identity
 * `chi_{A xor B}(x) = chi_A(x) + chi_B(x) - 2 * chi_A(x) * chi_B(x)`.
 * Degenerate point intervals `[c, c]` are resolved with the same indicator
 * identity before final normalization and merging.
 *
 * @param {Array<[number, number]>} a - First set of closed real intervals `[lo, hi]`.
 * @param {Array<[number, number]>} b - Second set of closed real intervals `[lo, hi]`.
 * @returns {Array<[number, number]>} Normalized, merged, sorted disjoint intervals for `a XOR b`.
 * @throws {TypeError} If `a` or `b` is not an array of 2-element finite number tuples.
 * @throws {RangeError} If any interval has `lo > hi`.
 */
export function xorIntervalSeries(a, b) {
	const normA = normalizeIntervalSet(a, 'a')
	const normB = normalizeIntervalSet(b, 'b')

	const jumpsA = new Map()
	const jumpsB = new Map()
	const criticalPoints = new Set()
	const degeneratePoints = new Set()

	for (const [lo, hi] of normA) {
		if (lo < hi) {
			jumpsA.set(lo, (jumpsA.get(lo) ?? 0) + 1)
			jumpsA.set(hi, (jumpsA.get(hi) ?? 0) - 1)
			criticalPoints.add(lo)
			criticalPoints.add(hi)
		} else {
			degeneratePoints.add(lo)
		}
	}

	for (const [lo, hi] of normB) {
		if (lo < hi) {
			jumpsB.set(lo, (jumpsB.get(lo) ?? 0) + 1)
			jumpsB.set(hi, (jumpsB.get(hi) ?? 0) - 1)
			criticalPoints.add(lo)
			criticalPoints.add(hi)
		} else {
			degeneratePoints.add(lo)
		}
	}

	const points = Array.from(criticalPoints).sort(compareNumbers)
	const result = []

	let chiA = 0
	let chiB = 0
	for (let i = 0; i + 1 < points.length; i++) {
		const p = points[i]
		const nextP = points[i + 1]
		chiA += jumpsA.get(p) ?? 0
		chiB += jumpsB.get(p) ?? 0
		if (indicatorXor(chiA, chiB) === 1) {
			result.push([p, nextP])
		}
	}

	for (const c of degeneratePoints) {
		const inA = pointIndicator(normA, c)
		const inB = pointIndicator(normB, c)
		if (indicatorXor(inA, inB) === 1) {
			result.push([c, c])
		}
	}

	return mergeIntervals(result)
}
