/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value.
 * @property {number} d - Forward-mode first derivative.
 */

const POW2_64 = 2 ** 64;
const POW2_NEG64 = 2 ** -64;
const MAX_SERIES_ITERATIONS = 64;

/**
 * Computes the base-2 logarithm of a positive finite number iteratively using
 * exact power-of-two range reduction into `[Math.SQRT1_2, Math.SQRT2)` followed
 * by the iterative inverse hyperbolic tangent series:
 * `ln(m) = 2 * sum_{k=0..inf} t^(2k+1) / (2k + 1)` with `t = (m - 1) / (m + 1)`.
 *
 * @param {number} v - Strictly positive finite number.
 * @returns {number} Base-2 logarithm of `v`.
 */
function iterativeLog2(v) {
	let m = v;
	let exp = 0;

	// Coarse range reduction using exact binary exponent shifts.
	while (m >= POW2_64) {
		m *= POW2_NEG64;
		exp += 64;
	}
	while (m < POW2_NEG64) {
		m *= POW2_64;
		exp -= 64;
	}

	// Fine range reduction into [sqrt(1/2), sqrt(2)).
	while (m >= Math.SQRT2) {
		m *= 0.5;
		exp += 1;
	}
	while (m < Math.SQRT1_2) {
		m *= 2;
		exp -= 1;
	}

	if (m === 1) {
		return exp;
	}

	// Iterative atanh series for ln(m): |t| <= 3 - 2*sqrt(2) ≈ 0.1716,
	// so terms shrink by ~0.0294 per step and reach double precision in ~11 iterations.
	const t = (m - 1) / (m + 1);
	const t2 = t * t;
	let power = t;
	let sum = t;

	for (let k = 1; k <= MAX_SERIES_ITERATIONS; k += 1) {
		power *= t2;
		const term = power / (2 * k + 1);
		const nextSum = sum + term;
		if (nextSum === sum) {
			break;
		}
		sum = nextSum;
	}

	return exp + (2 * sum) / Math.LN2;
}

/**
 * Computes the base-2 logarithm (`log2`) over a dual number `{ v, d }` carrying
 * a forward-mode derivative alongside the primal value, using a straightforward
 * iterative implementation.
 *
 * For a dual number `x = v + d*eps` with `v > 0`:
 *   `log2(v + d*eps) = log2(v) + (d / (v * ln(2))) * eps`
 *
 * @param {DualNumber} x - Dual number input `{ v, d }` with finite `v > 0` and finite `d`.
 * @returns {DualNumber} Dual number `{ v: log2(x.v), d: x.d / (x.v * Math.LN2) }`.
 * @throws {TypeError} If `x` is not a dual number object `{ v, d }` or if `v` or `d` is not a finite number.
 * @throws {RangeError} If `x.v <= 0`.
 */
export function log2DualIterative(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected dual number input to be a non-null object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError('Dual number primal value v must be a finite number');
	}

	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError('Dual number derivative d must be a finite number');
	}

	if (v <= 0) {
		throw new RangeError('Dual number primal value v must be strictly greater than 0');
	}

	const primal = iterativeLog2(v);
	const derivative = d === 0 ? 0 : v < 1 ? (d / v) / Math.LN2 : d / (v * Math.LN2);

	return { v: primal, d: derivative };
}
