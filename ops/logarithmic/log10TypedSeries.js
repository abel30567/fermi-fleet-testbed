/**
 * Element-wise base-10 logarithm over Float64Array inputs using IEEE-754
 * binary range reduction, the hyperbolic arctangent (Mercator) series for
 * ln(m), and the change-of-base identity:
 *
 *   log10(m * 2^k) = k * log10(2) + ln(m) / ln(10)
 *
 * where m in [sqrt(1/2), sqrt(2)], t = (m - 1) / (m + 1), and
 *
 *   ln(m) = 2 * atanh(t) = 2 * sum_{n=0}^{11} t^(2n+1) / (2n + 1).
 */

const SQRT2 = 1.4142135623730951;
const TWO_54 = 18014398509481984; // 2^54, normalizes all positive IEEE-754 subnormals

// Split constants for high-precision Cody-Waite style accumulation:
// log10(2) = LOG10_2_HI + LOG10_2_LO (LOG10_2_HI has trailing zero bits so k * LOG10_2_HI is exact for |k| <= 1074)
const LOG10_2_HI = 3.01029995663611771306e-1;
const LOG10_2_LO = 3.69423907715893078616e-13;

// 1 / ln(10) = log10(e) = INV_LN10_HI + INV_LN10_LO
const INV_LN10_HI = 4.34294481878168880939e-1;
const INV_LN10_LO = 2.50829467116452752298e-11;
const INV_LN10 = 0.4342944819032518;

// Reusable 8-byte buffer for endian-independent IEEE-754 bit extraction
const f64Scratch = new ArrayBuffer(8);
const f64View = new DataView(f64Scratch);

/**
 * Computes base-10 logarithm for a single positive finite IEEE-754 float64
 * using binary range reduction and the atanh series.
 *
 * @param {number} x - Positive finite number (x > 0, x !== Infinity).
 * @returns {number} Approximate log10(x).
 */
function log10ScalarSeries(x) {
	if (x === 1) {
		return 0;
	}

	let val = x;
	let expAdjust = 0;

	f64View.setFloat64(0, val, false);
	let hi = f64View.getUint32(0, false);
	let lo = f64View.getUint32(4, false);
	let biasedExp = (hi >>> 20) & 0x7ff;

	// Normalize positive subnormals by scaling by 2^54
	if (biasedExp === 0) {
		val *= TWO_54;
		expAdjust = -54;
		f64View.setFloat64(0, val, false);
		hi = f64View.getUint32(0, false);
		lo = f64View.getUint32(4, false);
		biasedExp = (hi >>> 20) & 0x7ff;
	}

	let k = biasedExp - 1023 + expAdjust;

	// Extract mantissa m in [1, 2) by setting biased exponent to 1023 (0x3ff)
	const mHi = (hi & 0x000fffff) | 0x3ff00000;
	f64View.setUint32(0, mHi, false);
	f64View.setUint32(4, lo, false);
	let m = f64View.getFloat64(0, false);

	// Center m onto [sqrt(1/2), sqrt(2)] so |t| <= (sqrt(2) - 1) / (sqrt(2) + 1) ~= 0.17157
	if (m > SQRT2) {
		m *= 0.5;
		k += 1;
	}

	// Hyperbolic arctangent transformation: ln(m) = 2 * atanh(t), t = (m - 1) / (m + 1)
	// Since m in [0.7071, 1.4142], (m - 1) is exact by Sterbenz's lemma.
	const t = (m - 1) / (m + 1);
	const u = t * t;

	// Horner evaluation of sum_{n=1}^{11} u^(n-1) / (2n + 1).
	// For |t| <= 0.17157, the truncated tail t^25 / 25 < 3e-21 << eps.
	const tail =
		1 / 3 +
		u *
			(1 / 5 +
				u *
					(1 / 7 +
						u *
							(1 / 9 +
								u *
									(1 / 11 +
										u *
											(1 / 13 +
												u *
													(1 / 15 +
														u *
															(1 / 17 +
																u *
																	(1 / 19 +
																		u *
																			(1 / 21 +
																				u * (1 / 23))))))))));

	const twoT = 2 * t;
	const seriesTail = twoT * u * tail;

	// Convert ln(m) = twoT + seriesTail to log10(m) via split 1/ln(10)
	const log10Mantissa =
		twoT * INV_LN10_HI + (twoT * INV_LN10_LO + seriesTail * INV_LN10);

	if (k === 0) {
		return log10Mantissa;
	}

	// Combine k * log10(2) + log10(m) using split log10(2) for accuracy
	return k * LOG10_2_HI + (k * LOG10_2_LO + log10Mantissa);
}

/**
 * Computes the base-10 logarithm element-wise over a Float64Array using a
 * binary range reduction and hyperbolic arctangent (Mercator) series
 * implementation.
 *
 * Follows IEEE-754 semantics for special values:
 * - `x < 0` or `NaN` -> `NaN`
 * - `x === 0` (`+0` or `-0`) -> `-Infinity`
 * - `x === Infinity` -> `Infinity`
 * - `x === 1` -> `0`
 *
 * @param {Float64Array} input - Input Float64Array of values.
 * @returns {Float64Array} New Float64Array containing element-wise log10(input[i]).
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function log10TypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const len = input.length;
	const out = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const x = input[i];
		if (x !== x || x < 0) {
			out[i] = Number.NaN;
		} else if (x === 0) {
			out[i] = -Infinity;
		} else if (x === Infinity) {
			out[i] = Infinity;
		} else {
			out[i] = log10ScalarSeries(x);
		}
	}

	return out;
}
