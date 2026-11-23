/**
 * Computes the inverse sine (arcsin, in radians) element-wise over a Float64Array
 * using a Maclaurin series and half-angle range-reduction identity.
 *
 * For |x| <= 0.5, evaluates the Maclaurin series:
 *   arcsin(x) = sum_{n=0}^{inf} ((2n)! / (4^n * (n!)^2 * (2n + 1))) * x^(2n + 1)
 *
 * For 0.5 < |x| <= 1, applies the identity:
 *   arcsin(x) = sign(x) * (pi / 2 - 2 * arcsin(sqrt((1 - |x|) / 2)))
 * which maps the argument into [0, 0.5) for rapid convergence without
 * cancellation near +/-1.
 *
 * Values outside [-1, 1] and NaN produce NaN.
 *
 * @param {Float64Array} input - Input typed array of values in [-1, 1].
 * @returns {Float64Array} A new Float64Array containing arcsin(x) in [-pi/2, pi/2] (or NaN).
 * @throws {TypeError} If `input` is not a Float64Array.
 */

const HALF_PI = Math.PI / 2;
const MAX_TERMS = 64;

/**
 * Evaluates arcsin(x) via Maclaurin series for |x| <= 0.5.
 *
 * @param {number} x - Value with |x| <= 0.5.
 * @returns {number} arcsin(x) in radians.
 */
function arcsinSeriesSmall(x) {
	if (x === 0) {
		return x;
	}
	const x2 = x * x;
	let sum = x;
	let coeffPower = x;

	for (let n = 1; n <= MAX_TERMS; n += 1) {
		coeffPower *= ((2 * n - 1) / (2 * n)) * x2;
		const term = coeffPower / (2 * n + 1);
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	return sum;
}

/**
 * Computes scalar arcsin(x) using series and range reduction.
 *
 * @param {number} x - Input scalar.
 * @returns {number} arcsin(x) in radians, or NaN if |x| > 1 or NaN.
 */
function arcsinScalar(x) {
	if (Number.isNaN(x)) {
		return Number.NaN;
	}
	const absX = Math.abs(x);
	if (absX > 1) {
		return Number.NaN;
	}
	if (absX <= 0.5) {
		return arcsinSeriesSmall(x);
	}
	if (absX === 1) {
		return x < 0 ? -HALF_PI : HALF_PI;
	}
	const reduced = Math.sqrt((1 - absX) / 2);
	const magnitude = HALF_PI - 2 * arcsinSeriesSmall(reduced);
	return x < 0 ? -magnitude : magnitude;
}

export function arcsinTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('arcsinTypedSeries expects a Float64Array input');
	}

	const len = input.length;
	const out = new Float64Array(len);
	for (let i = 0; i < len; i += 1) {
		out[i] = arcsinScalar(input[i]);
	}
	return out;
}
