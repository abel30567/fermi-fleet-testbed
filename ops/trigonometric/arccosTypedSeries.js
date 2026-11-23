/**
 * Computes the inverse cosine (arccos) element-wise over a Float64Array using
 * range-reduction identities and the Maclaurin series for arcsin.
 *
 * Domain reduction keeps the series argument |t| <= 0.5 across [-1, 1]:
 * - |x| <= 0.5:  arccos(x) = pi/2 - arcsin(x)
 * - x > 0.5:     arccos(x) = 2 * arcsin(sqrt((1 - x) / 2))
 * - x < -0.5:    arccos(x) = pi - 2 * arcsin(sqrt((1 + x) / 2))
 *
 * Out-of-domain values (|x| > 1) and NaN produce NaN.
 *
 * @param {Float64Array} input - Input typed array of values in [-1, 1].
 * @returns {Float64Array} New Float64Array containing arccos values in [0, pi] (or NaN).
 * @throws {TypeError} If input is not a Float64Array.
 */

const HALF_PI = Math.PI / 2;
const MAX_SERIES_TERMS = 64;

/**
 * Evaluates arcsin(t) via its Maclaurin series for |t| <= 0.5:
 *   arcsin(t) = sum_{k=0}^{inf} ((2k)! / (4^k * (k!)^2 * (2k + 1))) * t^(2k + 1)
 *
 * @param {number} t - Input value with |t| <= 0.5.
 * @returns {number} Approximation of arcsin(t) accurate to IEEE-754 double precision.
 */
function arcsinSeries(t) {
	if (t === 0) {
		return 0;
	}
	const t2 = t * t;
	let sum = t;
	let coeffPow = t;

	for (let k = 1; k < MAX_SERIES_TERMS; k++) {
		const twoK = 2 * k;
		coeffPow *= ((twoK - 1) / twoK) * t2;
		const term = coeffPow / (twoK + 1);
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	return sum;
}

/**
 * Evaluates arccos(x) for a single scalar using range reduction and arcsinSeries.
 *
 * @param {number} x - Scalar input.
 * @returns {number} arccos(x) in [0, pi], or NaN if x is NaN or |x| > 1.
 */
function arccosScalar(x) {
	if (Number.isNaN(x) || x < -1 || x > 1) {
		return Number.NaN;
	}
	if (x === 1) {
		return 0;
	}
	if (x === -1) {
		return Math.PI;
	}
	if (x === 0) {
		return HALF_PI;
	}
	if (x > 0.5) {
		return 2 * arcsinSeries(Math.sqrt((1 - x) / 2));
	}
	if (x < -0.5) {
		return Math.PI - 2 * arcsinSeries(Math.sqrt((1 + x) / 2));
	}
	return HALF_PI - arcsinSeries(x);
}

/**
 * Computes arccos element-wise over a Float64Array without mutating the input.
 *
 * @param {Float64Array} input - Input Float64Array.
 * @returns {Float64Array} New Float64Array of arccos values.
 * @throws {TypeError} If input is not a Float64Array.
 */
export function arccosTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('arccosTypedSeries expects a Float64Array input');
	}

	const len = input.length;
	const result = new Float64Array(len);
	for (let i = 0; i < len; i++) {
		result[i] = arccosScalar(input[i]);
	}
	return result;
}
