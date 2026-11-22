/**
 * Extended-precision (high + low) splits of pi/2 and pi/4 in IEEE-754 float64.
 * PI_2_HI + PI_2_LO approximates pi/2 to ~106 bits of precision,
 * and PI_4_HI + PI_4_LO approximates pi/4 to ~106 bits of precision.
 */
const PI_2_HI = 1.5707963267948966; // Math.PI / 2 (0x3ff921fb54442d18)
const PI_2_LO = 6.123233995736766e-17; // pi/2 - PI_2_HI (0x3c91a62633145c07)
const PI_4_HI = 0.7853981633974483; // Math.PI / 4 (0x3fe921fb54442d18)
const PI_4_LO = 3.061616997868383e-17; // pi/4 - PI_4_HI (0x3c81a62633145c07)

/**
 * Threshold below which arctan(x) === x in IEEE-754 float64 (2^-27).
 * Since |x^3 / 3| < (1/3) * 2^-81 < 0.5 ULP(x) for all |x| < 2^-27,
 * returning x directly is correctly rounded and avoids subnormal underflow.
 */
const TINY_THRESHOLD = 2 ** -27;

/**
 * Number of odd-power tail terms in the Maclaurin series for arctan(u):
 *   arctan(u) = u + sum_{k=1}^{N} (-1)^k * u^(2k+1) / (2k + 1)
 * For |u| <= 0.5, the first omitted term at k = 29 has magnitude
 * <= 0.5^59 / 59 ~= 2.94e-20, more than 3 orders of magnitude below
 * IEEE-754 float64 machine epsilon.
 */
const SERIES_MAX_K = 28;

/**
 * Evaluates the Maclaurin series tail of arctan(u) - u using Horner's method:
 *   tail(u) = u^3 * (-1/3 + u^2/5 - u^4/7 + ... + (-1)^N * u^(2N-2) / (2N + 1))
 *
 * @param {number} u - Reduced argument with |u| <= 0.5.
 * @returns {number} Value of arctan(u) - u.
 */
function arctanMaclaurinTail(u) {
	const u2 = u * u;
	let poly = ((SERIES_MAX_K & 1) === 1 ? -1 : 1) / (2 * SERIES_MAX_K + 1);
	for (let k = SERIES_MAX_K - 1; k >= 1; k--) {
		const sign = (k & 1) === 1 ? -1 : 1;
		poly = sign / (2 * k + 1) + u2 * poly;
	}
	return u * u2 * poly;
}

/**
 * Computes the principal value of the inverse tangent arctan(x) in radians
 * (in the range [-pi/2, pi/2]) over IEEE-754 float64 numbers using exact
 * trigonometric range-reduction identities and the Maclaurin series,
 * without delegating to `Math.atan`.
 *
 * Algorithm:
 * 1. Validate input (`TypeError` for non-numbers, `RangeError` for `NaN`).
 * 2. Handle exact special values (`+0`, `-0`, `+Infinity`, `-Infinity`) and
 *    tiny magnitudes (`|x| < 2^-27`, where `arctan(x) = x` to float64 precision).
 * 3. Apply odd symmetry `arctan(-x) = -arctan(x)` so `a = |x| > 0`.
 * 4. Reduce `a` to a small argument `|u| <= 0.5`:
 *    - If `a < 0.5`: evaluate `a + tail(a)` directly.
 *    - If `0.5 <= a <= 2`: apply `arctan(a) = pi/4 + arctan((a - 1) / (a + 1))`.
 *      Here `a - 1` is exact in float64 by Sterbenz's lemma and `|u| <= 1/3`.
 *    - If `a > 2`: apply `arctan(a) = pi/2 - arctan(1 / a)` where `0 < 1/a < 0.5`.
 * 5. Sum the Maclaurin series tail via Horner's method and combine with
 *    high/low splits of `pi/4` or `pi/2` to maintain <= 1 ULP accuracy.
 *
 * @param {number} x - Real IEEE-754 float64 input value (including +/-Infinity).
 * @returns {number} Principal arctangent of `x` in radians, in `[-pi/2, pi/2]`.
 * @throws {TypeError} If `x` is not a `number`.
 * @throws {RangeError} If `x` is `NaN`.
 */
export function arctanFloatSeries(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`);
	}
	if (Number.isNaN(x)) {
		throw new RangeError('Input must not be NaN');
	}

	if (x === 0) {
		return x; // Preserves +0 and -0
	}
	if (x === Infinity) {
		return PI_2_HI;
	}
	if (x === -Infinity) {
		return -PI_2_HI;
	}

	const negative = x < 0;
	const a = negative ? -x : x;

	if (a < TINY_THRESHOLD) {
		return x;
	}

	let result;
	if (a < 0.5) {
		result = a + arctanMaclaurinTail(a);
	} else if (a <= 2) {
		const u = (a - 1) / (a + 1);
		result = PI_4_HI + (u + (arctanMaclaurinTail(u) + PI_4_LO));
	} else {
		const u = 1 / a;
		result = PI_2_HI + (PI_2_LO - (u + arctanMaclaurinTail(u)));
	}

	return negative ? -result : result;
}
