/**
 * Normalize a zero value so `-0` becomes `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function canonicalZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate and normalize a set of closed real intervals `[lo, hi]` into a
 * sorted array of strictly disjoint, merged intervals (`lo <= hi`, `u_i < l_{i+1}`).
 *
 * @param {unknown} set - Candidate interval set.
 * @param {number} argIndex - Zero-based argument position for error reporting.
 * @returns {Array<[number, number]>}
 */
function normalizeIntervalSet(set, argIndex) {
	if (!Array.isArray(set)) {
		throw new TypeError(
			`andIntervalSeries: argument ${argIndex} must be an array of [lo, hi] intervals`
		)
	}

	const parsed = new Array(set.length)
	for (let i = 0; i < set.length; i++) {
		const interval = set[i]
		if (!Array.isArray(interval) || interval.length !== 2) {
			throw new TypeError(
				`andIntervalSeries: interval at argument ${argIndex}[${i}] must be a [lo, hi] pair`
			)
		}

		const [rawLo, rawHi] = interval
		if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
			throw new TypeError(
				`andIntervalSeries: interval endpoints at argument ${argIndex}[${i}] must be numbers`
			)
		}
		if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
			throw new RangeError(
				`andIntervalSeries: interval endpoints at argument ${argIndex}[${i}] must be finite real numbers`
			)
		}
		if (rawLo > rawHi) {
			throw new RangeError(
				`andIntervalSeries: interval at argument ${argIndex}[${i}] has lo (${rawLo}) > hi (${rawHi})`
			)
		}

		parsed[i] = [canonicalZero(rawLo), canonicalZero(rawHi)]
	}

	if (parsed.length <= 1) {
		return parsed
	}

	parsed.sort((u, v) => (u[0] !== v[0] ? u[0] - v[0] : u[1] - v[1]))

	const merged = [parsed[0]]
	for (let i = 1; i < parsed.length; i++) {
		const [lo, hi] = parsed[i]
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
 * Computes the logical AND (set intersection) of two or more sets of closed
 * real intervals `[lo, hi]`, returning a normalized, sorted, and merged array
 * of strictly disjoint intervals.
 *
 * Uses a Heaviside step-series indicator identity: after normalizing each
 * input set `S_k` into disjoint intervals so its characteristic function
 * satisfies `1_{S_k}(x) in {0, 1}`, each set is expanded as the finite step
 * series:
 *
 *   `1_{S_k}(x) = sum_{[l, u] in S_k} (H_+(x - l) - H_-(x - u))`
 *
 * where `H_+(t) = 1_{t >= 0}` and `H_-(t) = 1_{t > 0}`. By the indicator
 * product identity `1_{AND_k S_k}(x) = prod_k 1_{S_k}(x) = 1_{sum_k 1_{S_k}(x) == K}`,
 * evaluating the combined step series across ordered critical points yields
 * the exact normalized intersection in `O(N log N)` time.
 *
 * @param {Array<[number, number]>} a - First set of closed real intervals `[lo, hi]`.
 * @param {Array<[number, number]>} b - Second set of closed real intervals `[lo, hi]`.
 * @param {...Array<[number, number]>} rest - Optional additional interval sets to AND.
 * @returns {Array<[number, number]>} Normalized, sorted, disjoint closed intervals.
 * @throws {TypeError} If fewer than two arguments are provided, any set is not an array,
 *   any interval is not a 2-element array, or any endpoint is not a number.
 * @throws {RangeError} If any endpoint is non-finite (`NaN`, `±Infinity`) or `lo > hi`.
 */
export function andIntervalSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'andIntervalSeries: requires at least two interval set arguments'
		)
	}

	const inputs = [a, b, ...rest]
	const setCount = inputs.length
	const normalizedSets = new Array(setCount)
	let hasEmpty = false
	let totalIntervals = 0

	for (let k = 0; k < setCount; k++) {
		const norm = normalizeIntervalSet(inputs[k], k)
		normalizedSets[k] = norm
		if (norm.length === 0) {
			hasEmpty = true
		}
		totalIntervals += norm.length
	}

	if (hasEmpty) {
		return []
	}

	// Build the combined Heaviside step series:
	// phase 0 = +1 step H_+(x - lo) active at x >= lo
	// phase 1 = -1 step -H_-(x - hi) active at x > hi
	const series = new Array(totalIntervals * 2)
	let idx = 0
	for (let k = 0; k < setCount; k++) {
		const intervals = normalizedSets[k]
		for (let i = 0; i < intervals.length; i++) {
			const [lo, hi] = intervals[i]
			series[idx++] = [lo, 0, 1]
			series[idx++] = [hi, 1, -1]
		}
	}

	series.sort((u, v) => (u[0] !== v[0] ? u[0] - v[0] : u[1] - v[1]))

	const result = []
	let coverage = 0
	let activeStart = null

	for (let i = 0; i < series.length; i++) {
		const [x, , delta] = series[i]
		const prev = coverage
		coverage += delta

		if (prev < setCount && coverage === setCount) {
			activeStart = x
		} else if (prev === setCount && coverage < setCount) {
			result.push([activeStart, x])
			activeStart = null
		}
	}

	return result
}
