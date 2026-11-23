/**
 * Computes the normalized, merged set union over zero or more sets of closed
 * real intervals `[lo, hi]`.
 *
 * Implementation uses the discrete step-function (indicator-series) identity:
 * the union indicator `1_U(x) = I(sum_k 1_[a_k, b_k](x) >= 1)` is evaluated
 * exactly via the cumulative coverage series of endpoint impulse events
 * `(lo, +1)` and `(hi, -1)`. Ordering `+1` before `-1` at equal coordinates
 * merges overlapping and touching closed intervals (`[a, c] U [c, b] = [a, b]`)
 * and preserves degenerate point intervals `[c, c]`.
 *
 * Input arrays and interval tuples are never mutated.
 *
 * @param {...Array<[number, number]>} sets - Zero or more sets of closed real
 *   intervals `[lo, hi]` with `lo <= hi` (`-Infinity` allowed as `lo`,
 *   `+Infinity` allowed as `hi`, `NaN` rejected).
 * @returns {Array<[number, number]>} Disjoint, strictly ordered, merged
 *   intervals `[lo, hi]` representing the union of all input sets.
 * @throws {TypeError} If any set is not an array, any interval is not a
 *   2-element array, or any endpoint is not a number.
 * @throws {RangeError} If any endpoint is `NaN`, if `lo > hi`, or if an
 *   interval is degenerate at infinity (`[Infinity, Infinity]` or
 *   `[-Infinity, -Infinity]`).
 */
export function unionIntervalSeries(...sets) {
	const events = []

	for (let s = 0; s < sets.length; s++) {
		const set = sets[s]
		if (!Array.isArray(set)) {
			throw new TypeError(`Interval set at argument ${s} must be an array`)
		}

		for (let i = 0; i < set.length; i++) {
			const interval = set[i]
			if (!Array.isArray(interval) || interval.length !== 2) {
				throw new TypeError(
					`Interval at set ${s}, index ${i} must be a [lo, hi] 2-element array`
				)
			}

			const rawLo = interval[0]
			const rawHi = interval[1]

			if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
				throw new TypeError(
					`Interval endpoints at set ${s}, index ${i} must be numbers`
				)
			}

			if (Number.isNaN(rawLo) || Number.isNaN(rawHi)) {
				throw new RangeError(
					`Interval endpoints at set ${s}, index ${i} must not be NaN`
				)
			}

			if (rawLo === Infinity || rawHi === -Infinity) {
				throw new RangeError(
					`Interval at set ${s}, index ${i} has invalid infinite bound [${rawLo}, ${rawHi}]`
				)
			}

			if (rawLo > rawHi) {
				throw new RangeError(
					`Interval at set ${s}, index ${i} must satisfy lo <= hi (got [${rawLo}, ${rawHi}])`
				)
			}

			// Normalize -0 to +0 for canonical output.
			const lo = rawLo === 0 ? 0 : rawLo
			const hi = rawHi === 0 ? 0 : rawHi

			events.push({ coord: lo, delta: 1 }, { coord: hi, delta: -1 })
		}
	}

	if (events.length === 0) {
		return []
	}

	// Sort by coordinate ascending; at identical coordinates, process +1 before -1
	// so touching closed intervals merge and point intervals [x, x] are preserved.
	events.sort((a, b) => {
		if (a.coord < b.coord) return -1
		if (a.coord > b.coord) return 1
		return b.delta - a.delta
	})

	const merged = []
	let coverage = 0
	let activeStart = 0

	for (let i = 0; i < events.length; i++) {
		const { coord, delta } = events[i]
		const prevCoverage = coverage
		coverage += delta

		if (prevCoverage === 0 && coverage > 0) {
			activeStart = coord
		} else if (prevCoverage > 0 && coverage === 0) {
			merged.push([activeStart, coord])
		}
	}

	return merged
}
