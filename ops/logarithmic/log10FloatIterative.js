/**
 * @module ops/logarithmic/log10FloatIterative
 *
 * Base-10 logarithm over IEEE-754 binary64 (float64) numbers using a
 * straightforward iterative implementation:
 *
 * 1. Exact binary range reduction: iteratively scales `x` by powers of 2
 *    (lossless in IEEE-754 float64, including subnormal numbers) into
 *    `m ∈ [Math.SQRT1_2, Math.SQRT2]` such that `x = m * 2^exp2`.
 * 2. Iterative `atanh` power series for natural logarithm near 1:
 *    `ln(m) = 2 * sum_{k=0}^∞ t^(2k+1) / (2k+1)` where `t = (m - 1) / (m + 1)`.
 *    Because `|t| <= (√2 - 1) / (√2 + 1) ≈ 0.1716`, the series converges to
 *    full float64 precision in ~12 iterations.
 * 3. Conversion to base-10: `log10(x) = (exp2 * LN2 + ln(m)) / LN10`, where
 *    `LN2` and `LN10` are themselves computed once via the same iterative series.
 */

const SQRT2 = Math.SQRT2
const SQRT1_2 = Math.SQRT1_2
const MAX_SERIES_ITERATIONS = 100

/**
 * Computes `ln(m)` iteratively using the `atanh` series around 1:
 * `ln(m) = 2 * sum_{k=0}^∞ t^(2k+1) / (2k+1)`, with `t = (m - 1) / (m + 1)`.
 *
 * @param {number} m - Positive finite number near 1.
 * @returns {number} Natural logarithm of `m`.
 */
function lnNearOne(m) {
	const t = (m - 1) / (m + 1)
	const t2 = t * t
	let term = t
	let sum = t

	for (let k = 1; k <= MAX_SERIES_ITERATIONS; k++) {
		term *= t2
		const next = sum + term / (2 * k + 1)
		if (next === sum) {
			break
		}
		sum = next
	}

	return 2 * sum
}

// Compute ln(2) and ln(10) iteratively from exact dyadic/rational arguments.
// 2 = 2 (t = 1/3), and 10 = 2^3 * 1.25 (1.25 is exact in binary64, t = 1/9).
const LN2 = lnNearOne(2)
const LN10 = 3 * LN2 + lnNearOne(1.25)

/**
 * Computes the base-10 logarithm of a positive IEEE-754 float64 number
 * using an iterative range-reduction and `atanh` series algorithm.
 *
 * Special values & error handling:
 * - Non-number inputs throw a `TypeError`.
 * - `NaN` returns `NaN`.
 * - Non-positive numbers (`x <= 0`, including `0`, `-0`, negative values, and
 *   `-Infinity`) throw a `RangeError`.
 * - `+Infinity` returns `Infinity`.
 * - `1` returns exact `0`.
 *
 * @param {number} x - Positive IEEE-754 float64 number.
 * @returns {number} The base-10 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 * @throws {RangeError} If `x <= 0` (including `0`, `-0`, and `-Infinity`).
 */
export function log10FloatIterative(x) {
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
	if (x === 1) {
		return 0
	}

	// Exact binary range reduction into [SQRT1_2, SQRT2]: x = m * 2^exp2.
	// Multiplying/dividing by 2 is exact in IEEE-754 binary64 (even from subnormals).
	let m = x
	let exp2 = 0

	while (m >= SQRT2) {
		m *= 0.5
		exp2 += 1
	}
	while (m < SQRT1_2) {
		m *= 2
		exp2 -= 1
	}

	const lnx = exp2 * LN2 + lnNearOne(m)
	return lnx / LN10
}
