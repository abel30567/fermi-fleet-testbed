/**
 * @fileoverview Base-2 logarithm (`log2`) over IEEE-754 binary64 (float64) numbers
 * using IEEE-754 exponent/significand extraction and the hyperbolic arctangent
 * power series.
 *
 * Decomposition:
 *   Given a finite positive float64 `x`, extract its exact binary exponent `k`
 *   and normalized mantissa `m` such that `x = m * 2^k` with `m ∈ [√2 / 2, √2]`.
 *   Then:
 *     log2(x) = k + ln(m) / ln(2)
 *
 * Series evaluation:
 *   With `u = m - 1` and `t = u / (m + 1) = (m - 1) / (m + 1)`:
 *     |t| ≤ (√2 - 1) / (√2 + 1) = 3 - 2√2 ≈ 0.171572875
 *     ln(m) = 2 * atanh(t) = 2 * Σ_{n=0..∞} t^(2n+1) / (2n + 1)
 *           = u + t * (2 * Σ_{n=1..∞} t^(2n) / (2n + 1) - u)
 *
 *   Because `t^2 ≤ 0.02944`, the series converges to full IEEE-754 float64
 *   precision in at most ~12 terms. The constant `ln(2)` is computed via the
 *   same atanh series at `m = 2` (`t = 1/3`), avoiding any delegation to
 *   `Math.log` or `Math.log2`.
 */

const _buf = new ArrayBuffer(8)
const _f64 = new Float64Array(_buf)
const _u64 = new BigUint64Array(_buf)

const EXP_BIAS = 1023
const SUBNORMAL_SHIFT = 54
const SUBNORMAL_SCALE = 2 ** SUBNORMAL_SHIFT // 2^54; exact exponent shift for subnormals
const EXP_MASK = 0x7ffn
const FRAC_MASK = 0x000fffffffffffffn
const ONE_EXP_BITS = 1023n << 52n
const SQRT2 = 1.4142135623730951
const MAX_SERIES_TERMS = 128

/**
 * Evaluates the natural logarithm `ln(m)` for `m > 0` using the atanh series:
 *   ln(m) = 2 * Σ_{n=0..∞} t^(2n+1) / (2n + 1),  where t = (m - 1) / (m + 1).
 *
 * Uses the cancellation-free leading-term rewrite `2t = u - u*t` (`u = m - 1`)
 * so precision is preserved when `m` is arbitrarily close to 1.
 *
 * @param {number} m - Positive finite number near 1 (best accuracy for m ∈ [1/√2, 2]).
 * @returns {number} Natural logarithm of `m`.
 */
function lnAtanhSeries(m) {
	const u = m - 1
	if (u === 0) return 0

	const t = u / (m + 1)
	const t2 = t * t

	// Compute tail = Σ_{n=1..∞} t^(2n) / (2n + 1)
	let power = t2
	let tail = 0
	for (let denom = 3; denom < 3 + MAX_SERIES_TERMS * 2; denom += 2) {
		const term = power / denom
		const next = tail + term
		if (next === tail) break
		tail = next
		power *= t2
	}

	// 2*t*(1 + tail) = (u - u*t) + 2*t*tail = u + t*(2*tail - u)
	return u + t * (2 * tail - u)
}

/**
 * Natural logarithm of 2 computed directly from the atanh series:
 *   ln(2) = 2 * Σ_{n=0..∞} (1/3)^(2n+1) / (2n + 1)
 */
const LN2 = lnAtanhSeries(2)

/**
 * Computes the base-2 logarithm (`log2`) of a positive finite IEEE-754 float64
 * number using exact binary exponent/significand extraction and the atanh power
 * series.
 *
 * @param {number} x - A strictly positive finite IEEE-754 float64 number.
 * @returns {number} The base-2 logarithm of `x`.
 * @throws {TypeError} If `x` is not a primitive `number`.
 * @throws {RangeError} If `x` is not finite (`NaN`, `Infinity`, `-Infinity`) or `x <= 0`.
 */
export function log2FloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`log2FloatSeries expected a number, got ${typeof x}`)
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`log2FloatSeries expected a finite number, got ${x}`)
	}
	if (x <= 0) {
		throw new RangeError(`log2FloatSeries expected a positive number (> 0), got ${x}`)
	}

	_f64[0] = x
	let bits = _u64[0]
	let rawExp = Number((bits >> 52n) & EXP_MASK)
	let k

	if (rawExp === 0) {
		// Subnormal: scale into normal range with an exact power-of-2 multiplication
		_f64[0] = x * SUBNORMAL_SCALE
		bits = _u64[0]
		rawExp = Number((bits >> 52n) & EXP_MASK)
		k = rawExp - EXP_BIAS - SUBNORMAL_SHIFT
	} else {
		k = rawExp - EXP_BIAS
	}

	const frac = bits & FRAC_MASK
	if (frac === 0n) {
		// Exact power of 2 (includes x === 1 -> 0 and subnormal powers of 2)
		return k
	}

	// Reconstruct exact normalized mantissa m ∈ (1, 2)
	_u64[0] = ONE_EXP_BITS | frac
	let m = _f64[0]

	// Reduce mantissa to [√2 / 2, √2] so |t| ≤ 3 - 2√2 ≈ 0.1716
	// Also eliminates cancellation when x approaches 1 from below (k = -1, m ≈ 2)
	if (m > SQRT2) {
		m *= 0.5
		k += 1
	}

	return k + lnAtanhSeries(m) / LN2
}
