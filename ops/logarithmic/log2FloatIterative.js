const SQRT2 = 1.4142135623730951
const SQRT1_2 = 0.7071067811865476
const LOG2E = 1.4426950408889634
const MAX_SERIES_DENOM = 101

/**
 * Computes the base-2 logarithm of a positive IEEE-754 float64 number using a
 * straightforward iterative algorithm.
 *
 * The input is iteratively range-reduced by factors of 2 into the interval
 * `[sqrt(1/2), sqrt(2)]` such that `x = m * 2^k`, yielding `log2(x) = k + log2(m)`.
 * Exact powers of 2 reduce to `m === 1` and return `k` directly. For remaining
 * mantissas, `ln(m) = 2 * atanh((m - 1) / (m + 1))` is evaluated via its
 * iterative odd-power Taylor series and scaled by `log2(e)`.
 *
 * @param {number} x - A positive IEEE-754 float64 number (`NaN` returns `NaN`;
 *   `Infinity` returns `Infinity`).
 * @returns {number} The base-2 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 * @throws {RangeError} If `x <= 0` (including `0`, `-0`, negative finite numbers,
 *   and `-Infinity`).
 */
export function log2FloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`)
	}

	if (Number.isNaN(x)) {
		return NaN
	}

	if (x <= 0) {
		throw new RangeError(`Expected a positive number (> 0), got ${x}`)
	}

	if (x === Infinity) {
		return Infinity
	}

	// Iterative binary range reduction: x = m * 2^k with m in [sqrt(1/2), sqrt(2)]
	let m = x
	let k = 0

	while (m > SQRT2) {
		m *= 0.5
		k += 1
	}

	while (m < SQRT1_2) {
		m *= 2
		k -= 1
	}

	if (m === 1) {
		return k
	}

	// Iterative atanh series: ln(m) = 2 * (t + t^3/3 + t^5/5 + ...)
	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let term = t
	let tail = 0

	for (let denom = 3; denom <= MAX_SERIES_DENOM; denom += 2) {
		term *= t2
		const delta = term / denom
		const nextTail = tail + delta
		if (t + nextTail === t + tail) {
			tail = nextTail
			break
		}
		tail = nextTail
	}

	const lnM = 2 * (t + tail)
	return k + lnM * LOG2E
}
