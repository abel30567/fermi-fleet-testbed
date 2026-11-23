/**
 * Computes the set difference `A \ B` over two sets of real intervals `[lo, hi]`,
 * returning a canonically normalized and merged list of pairwise disjoint intervals.
 *
 * Uses the set-algebraic complement identity:
 *
 *     A \ B = A ∩ B^c
 *
 * where `B^c = ℝ \ B` is the closed-form union of open intervals complementary to
 * the normalized interval set `B`. Intersecting each closed interval `[a, d] ∈ A`
 * with each open interval `(l, r) ∈ B^c` via a linear two-pointer sweep yields all
 * surviving components (preserving isolated point intervals `[p, p]` not covered
 * by `B` and merging adjacent components separated only by zero-width cuts).
 *
 * Both finite real intervals `[lo, hi]` and unbounded real intervals using
 * `-Infinity` / `Infinity` (excluding degenerate infinite points `[Infinity, Infinity]`
 * and `[-Infinity, -Infinity]`) are supported. Input arrays are never mutated.
 *
 * @param {Array<[number, number]>} a - Minuend set of real intervals `[lo, hi]` with `lo <= hi`.
 * @param {Array<[number, number]>} b - Subtrahend set of real intervals `[lo, hi]` with `lo <= hi`.
 * @returns {Array<[number, number]>} Normalized, sorted, disjoint merged intervals representing `a \ b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any interval is not a 2-tuple of numbers.
 * @throws {RangeError} If any endpoint is `NaN`, `lo > hi`, or an interval is a degenerate infinite point.
 */
export function setDifferenceIntervalSeries(a, b) {
	const normA = normalizeIntervals(a, 'a')
	const normB = normalizeIntervals(b, 'b')

	if (normA.length === 0) {
		return []
	}
	if (normB.length === 0) {
		return normA
	}

	const complementB = openComplement(normB)
	if (complementB.length === 0) {
		return []
	}

	const raw = intersectClosedWithOpen(normA, complementB)
	return mergeSorted(raw)
}

/**
 * Validates, copies, sorts, and merges an array of real intervals `[lo, hi]`.
 *
 * @param {unknown} intervals
 * @param {string} name
 * @returns {Array<[number, number]>}
 */
function normalizeIntervals(intervals, name) {
	if (!Array.isArray(intervals)) {
		throw new TypeError(`Expected "${name}" to be an array of [lo, hi] intervals`)
	}

	const copy = new Array(intervals.length)
	for (let i = 0; i < intervals.length; i++) {
		const iv = intervals[i]
		if (!Array.isArray(iv) || iv.length !== 2) {
			throw new TypeError(`Expected ${name}[${i}] to be a [lo, hi] tuple of length 2`)
		}
		const rawLo = iv[0]
		const rawHi = iv[1]
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(`Expected endpoints of ${name}[${i}] to be numbers`)
		}
		if (Number.isNaN(rawLo) || Number.isNaN(rawHi)) {
			throw new RangeError(`Endpoints of ${name}[${i}] must not be NaN`)
		}
		if (rawLo > rawHi) {
			throw new RangeError(`Interval ${name}[${i}] has lo (${rawLo}) > hi (${rawHi})`)
		}
		if (rawLo === Infinity || rawHi === -Infinity) {
			throw new RangeError(`Interval ${name}[${i}] cannot be a degenerate infinite point`)
		}
		copy[i] = [rawLo === 0 ? 0 : rawLo, rawHi === 0 ? 0 : rawHi]
	}

	if (copy.length <= 1) {
		return copy
	}

	copy.sort((u, v) => (u[0] !== v[0] ? u[0] - v[0] : u[1] - v[1]))
	return mergeSorted(copy)
}

/**
 * Merges a sorted array of intervals where overlapping or touching intervals
 * (`next.lo <= cur.hi`) are coalesced into a single interval.
 *
 * @param {Array<[number, number]>} sorted
 * @returns {Array<[number, number]>}
 */
function mergeSorted(sorted) {
	if (sorted.length <= 1) {
		return sorted
	}

	const merged = [[sorted[0][0], sorted[0][1]]]
	for (let i = 1; i < sorted.length; i++) {
		const [lo, hi] = sorted[i]
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

/**
 * Computes the closed-form open complement `B^c = ℝ \ B` of a normalized,
 * sorted, disjoint closed interval set `B`.
 *
 * Each returned tuple `[l, r]` represents an open interval `(l, r)` with `l < r`.
 *
 * @param {Array<[number, number]>} normB
 * @returns {Array<[number, number]>}
 */
function openComplement(normB) {
	const comp = []
	let cursor = -Infinity

	for (let i = 0; i < normB.length; i++) {
		const [lo, hi] = normB[i]
		if (cursor < lo) {
			comp.push([cursor, lo])
		}
		if (hi > cursor) {
			cursor = hi
		}
	}

	if (cursor < Infinity) {
		comp.push([cursor, Infinity])
	}

	return comp
}

/**
 * Intersects a normalized sorted array of closed intervals `A` with a sorted
 * array of disjoint open intervals `C = B^c` in linear time.
 *
 * @param {Array<[number, number]>} closedIntervals
 * @param {Array<[number, number]>} openIntervals
 * @returns {Array<[number, number]>}
 */
function intersectClosedWithOpen(closedIntervals, openIntervals) {
	const result = []
	let i = 0
	let j = 0

	while (i < closedIntervals.length && j < openIntervals.length) {
		const [a, d] = closedIntervals[i]
		const [l, r] = openIntervals[j]

		if (a === d) {
			if (l < a && a < r) {
				result.push([a, a])
			}
		} else {
			const lo = a > l ? a : l
			const hi = d < r ? d : r
			if (lo < hi) {
				result.push([lo, hi])
			}
		}

		if (d < r) {
			i++
		} else if (r < d) {
			j++
		} else {
			i++
			j++
		}
	}

	return result
}
