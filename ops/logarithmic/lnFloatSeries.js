/**
 * Natural logarithm (`ln`) over IEEE-754 float64 numbers using binary64 range
 * reduction and the hyperbolic arctangent (`atanh`) Taylor series identity.
 *
 * For any positive finite `x`, `x` is decomposed into `m * 2^k` via its exact
 * IEEE-754 binary64 bit representation (with subnormal normalization) and
 * shifted so that `m ∈ [√2 / 2, √2]`. Then:
 *
 *   ln(x) = k * ln(2) + ln(m)
 *
 * where `ln(m)` is evaluated via the identity:
 *
 *   ln(m) = 2 * atanh(y) = 2 * sum_{n=0}^{∞} y^(2n+1) / (2n + 1),  y = (m - 1) / (m + 1)
 *
 * Rewriting `2y = f - f*y` with `f = m - 1` avoids cancellation for `x` near `1`,
 * and splitting `ln(2) = LN2_HI + LN2_LO` preserves full float64 precision across
 * the entire exponent range `[-1074, 1023]`.
 *
 * @module ops/logarithmic/lnFloatSeries
 */

/**
 * High 32 significant bits of `ln(2)` (`0x1.62e42fee00000p-1`), chosen so that
 * `k * LN2_HI` is exact in IEEE-754 float64 for all valid exponents `|k| <= 1075`.
 */
const LN2_HI = 0.6931471803691238;

/**
 * Low correction term of `ln(2)` (`0x1.a39ef35793c76p-33`), such that
 * `LN2_HI + LN2_LO` matches `ln(2)` to ~85 bits of precision.
 */
const LN2_LO = 1.9082149292705877e-10;

/** Exact power of two `2^54` used to normalize IEEE-754 subnormal inputs. */
const TWO_54 = 18014398509481984;

/** Threshold `√2` used to center the reduced mantissa in `[√2 / 2, √2]`. */
const SQRT2 = 1.4142135623730951;

/** Exponent bias for IEEE-754 binary64. */
const EXP_BIAS = 1023;

/** Bitmask for the 11-bit exponent field after shifting right by 52. */
const EXP_MASK = 0x7ffn;

/** Bitmask for the 52-bit significand field. */
const FRAC_MASK = 0x000fffffffffffffn;

/** Biased exponent bit pattern for `2^0` (`1023 << 52`). */
const EXP_ZERO_BITS = 0x3ff0000000000000n;

/**
 * Precomputed odd-denominator reciprocals `1 / (2n + 1)` for `n = 1..15`
 * (`1/3` through `1/31`). Because `|y| <= 3 - 2√2 ≈ 0.1716`, `y^2 <= 0.02944`,
 * and the `n = 15` term contributes less than `1e-24` relative to `y`.
 */
const SERIES_COEFFS = [
	1 / 3,
	1 / 5,
	1 / 7,
	1 / 9,
	1 / 11,
	1 / 13,
	1 / 15,
	1 / 17,
	1 / 19,
	1 / 21,
	1 / 23,
	1 / 25,
	1 / 27,
	1 / 29,
	1 / 31,
];

/** Reusable 8-byte buffer for zero-allocation IEEE-754 float64 bit inspection. */
const scratchBuffer = new ArrayBuffer(8);
const floatView = new Float64Array(scratchBuffer);
const uint64View = new BigUint64Array(scratchBuffer);

/**
 * Compute the natural logarithm `ln(x)` of an IEEE-754 float64 number using
 * binary64 range reduction and the `atanh` power series identity.
 *
 * Follows IEEE-754 / ECMAScript special-value semantics for `number` inputs:
 * - `lnFloatSeries(NaN)` -> `NaN`
 * - `lnFloatSeries(x)` for `x < 0` (including `-Infinity`) -> `NaN`
 * - `lnFloatSeries(±0)` -> `-Infinity`
 * - `lnFloatSeries(+Infinity)` -> `+Infinity`
 * - `lnFloatSeries(1)` -> `+0`
 *
 * @param {number} x - The IEEE-754 float64 input value.
 * @returns {number} The natural logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function lnFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`lnFloatSeries expected a number, got ${x === null ? 'null' : typeof x}`);
	}

	if (Number.isNaN(x) || x < 0) {
		return Number.NaN;
	}

	if (x === 0) {
		return -Infinity;
	}

	if (x === Infinity) {
		return Infinity;
	}

	if (x === 1) {
		return 0;
	}

	// Extract IEEE-754 binary64 exponent and mantissa: x = m * 2^k, m ∈ [1, 2).
	floatView[0] = x;
	let bits = uint64View[0];
	let expBits = Number((bits >> 52n) & EXP_MASK);
	let k = 0;

	if (expBits === 0) {
		// Subnormal: scale up by 2^54 into the normal range.
		floatView[0] = x * TWO_54;
		bits = uint64View[0];
		expBits = Number((bits >> 52n) & EXP_MASK);
		k = -54;
	}

	k += expBits - EXP_BIAS;

	// Reconstruct m ∈ [1, 2) by setting the biased exponent to 1023 (2^0).
	uint64View[0] = (bits & FRAC_MASK) | EXP_ZERO_BITS;
	let m = floatView[0];

	// Center m in [√2 / 2, √2] so |y| = |(m - 1) / (m + 1)| <= 3 - 2√2 ≈ 0.1716.
	if (m > SQRT2) {
		m *= 0.5;
		k += 1;
	}

	// Evaluate ln(m) = 2 * atanh(y) = f - y * (f - R(y^2)), where
	// f = m - 1, y = f / (m + 1), and R(z) = 2 * z * (1/3 + z/5 + z^2/7 + ...).
	const f = m - 1;
	const y = f / (m + 1);
	const z = y * y;

	// Horner evaluation of the series tail from highest to lowest degree.
	let poly = SERIES_COEFFS[SERIES_COEFFS.length - 1];
	for (let i = SERIES_COEFFS.length - 2; i >= 0; i -= 1) {
		poly = SERIES_COEFFS[i] + z * poly;
	}

	const tail = 2 * z * poly;
	const lnM = f - y * (f - tail);

	if (k === 0) {
		return lnM;
	}

	return k * LN2_HI + (k * LN2_LO + lnM);
}
