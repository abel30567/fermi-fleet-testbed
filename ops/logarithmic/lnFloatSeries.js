/**
 * Natural logarithm over IEEE-754 float64 numbers using exact binary range
 * reduction and the hyperbolic arctangent (area hyperbolic tangent) power series.
 *
 * Given a finite positive float64 `x`:
 *   1. Decompose `x = m * 2^k` exactly via IEEE-754 bit manipulation (scaling
 *      subnormals by `2^54` first), then normalize `m` into `(sqrt(1/2), sqrt(2)]`
 *      by halving `m` and incrementing `k` whenever `m > sqrt(2)`.
 *   2. Let `u = (m - 1) / (m + 1)` so that `|u| <= 3 - 2*sqrt(2) ≈ 0.17157`.
 *      Evaluate the rapidly converging odd-power series:
 *        `ln(m) = 2 * sum_{j=0..inf} u^(2j+1) / (2j+1)`
 *   3. Recombine `ln(x) = k * ln(2) + ln(m)` using a high/low split of `ln(2)`
 *      (`LN2_HI + LN2_LO`) to preserve full float64 precision for large `|k|`.
 */

// Shared 8-byte buffer for zero-allocation IEEE-754 float64 <-> uint64 bit views.
// Both typed arrays use host endianness, so bit 63 is sign, 62..52 exponent, 51..0 mantissa.
const f64View = new Float64Array(1)
const u64View = new BigUint64Array(f64View.buffer)

const EXPONENT_BIAS = 1023
const EXPONENT_MASK = 0x7ffn
const MANTISSA_MASK = 0x000fffffffffffffn
const EXP_ZERO_BITS = 0x3ff0000000000000n // Biased exponent 1023 -> 2^0

// Exact power of two (2^54) used to normalize IEEE-754 subnormal inputs without rounding.
const SUBNORMAL_SCALE = 18014398509481984 // 2^54
const SUBNORMAL_EXP_SHIFT = 54

// Range-reduction upper threshold: sqrt(2)
const SQRT2 = Math.SQRT2

// High/low split of ln(2) = 0.693147180559945309417232121458...
// LN2_HI has trailing zero bits so `k * LN2_HI` is exact for all float64 exponents |k| <= 1074.
const LN2_HI = 0.6931471803691238 // 0x1.62e42fee00000p-1
const LN2_LO = 1.9082149292705877e-10 // 0x1.a39ef35793c76p-33

const MAX_SERIES_DENOM = 1001

/**
 * Computes the natural logarithm `ln(x)` of a finite positive IEEE-754 float64
 * number using binary range reduction and the atanh power series.
 *
 * @param {number} x - A finite positive IEEE-754 float64 number (`0 < x < Infinity`).
 * @returns {number} The natural logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `number`.
 * @throws {RangeError} If `x` is `NaN`, non-finite (`±Infinity`), or `<= 0`.
 */
export function lnFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`lnFloatSeries expected a number, got ${typeof x}`)
	}
	if (!Number.isFinite(x)) {
		throw new RangeError(`lnFloatSeries expected a finite number, got ${x}`)
	}
	if (x <= 0) {
		throw new RangeError(`lnFloatSeries expected a positive number (> 0), got ${x}`)
	}
	if (x === 1) {
		return 0
	}

	let scaled = x
	let k = 0

	f64View[0] = scaled
	let bits = u64View[0]
	let biasedExp = Number((bits >> 52n) & EXPONENT_MASK)

	// Normalize subnormals by multiplying by 2^54 (exact in IEEE-754)
	if (biasedExp === 0) {
		scaled *= SUBNORMAL_SCALE
		k -= SUBNORMAL_EXP_SHIFT
		f64View[0] = scaled
		bits = u64View[0]
		biasedExp = Number((bits >> 52n) & EXPONENT_MASK)
	}

	k += biasedExp - EXPONENT_BIAS

	// Extract mantissa m in [1, 2) by setting the exponent bits to 2^0 (biased 1023)
	u64View[0] = (bits & MANTISSA_MASK) | EXP_ZERO_BITS
	let m = f64View[0]

	// Reduce m from [1, 2) into (sqrt(1/2), sqrt(2)] so |u| <= 3 - 2*sqrt(2) ≈ 0.17157
	if (m > SQRT2) {
		m *= 0.5
		k += 1
	}

	// Series: ln(m) = 2 * (u + u^3/3 + u^5/5 + ...), where u = (m - 1) / (m + 1)
	const u = (m - 1) / (m + 1)
	const u2 = u * u
	let term = u
	let seriesTail = 0

	for (let denom = 3; denom <= MAX_SERIES_DENOM; denom += 2) {
		term *= u2
		const next = seriesTail + term / denom
		if (next === seriesTail) {
			break
		}
		seriesTail = next
	}

	const lnM = 2 * (u + seriesTail)

	// Recombine k * ln(2) + ln(m) using high/low split to minimize rounding error
	return k * LN2_HI + (k * LN2_LO + lnM)
}
