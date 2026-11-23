/**
 * Computes the cube root of a dual number `{ v, d }` using a straightforward
 * iterative Newton-Raphson method in dual-number arithmetic.
 *
 * A dual number `x = v + dε` (with `ε² = 0`) carries a primal value `v` and a
 * forward-mode derivative `d`. For `v ≠ 0`:
 *
 *   cbrt(v + dε) = v^(1/3) + (d / (3 * v^(2/3)))ε
 *
 * To avoid overflow and underflow across the full finite IEEE 754 range while
 * keeping the iteration completely independent of `Math.cbrt`, the primal
 * magnitude is normalized by exact powers of `8 = 2³` into `[1, 8)`, solved
 * iteratively via Newton-Raphson directly on dual numbers, and rescaled back
 * using exact powers of `2`.
 *
 * At `v = 0`, the primal cube root is `0` (preserving `-0`), while the
 * derivative is `0` when `d = 0` and `±Infinity` (matching the sign of `d`)
 * when `d ≠ 0` due to the vertical tangent of `v^(1/3)` at the origin.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite numeric `v` and `d`.
 * @param {{ maxIterations?: number, tolerance?: number }} [options] - Optional solver parameters.
 * @param {number} [options.maxIterations=64] - Maximum Newton-Raphson iterations (positive integer).
 * @param {number} [options.tolerance=Number.EPSILON * 2] - Relative convergence tolerance (>= 0).
 * @returns {{ v: number, d: number }} The dual-number cube root `{ v, d }`.
 * @throws {TypeError} If `x` or `options` is not a plain object, or if numeric fields have the wrong type.
 * @throws {RangeError} If `x.v` or `x.d` is not finite, or if `options` values are out of range.
 */
export function cbrtDualIterative(x, options = {}) {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) {
		throw new TypeError('Input x must be a dual number object { v, d }');
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError('Dual number properties v and d must be numbers');
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError('Dual number properties v and d must be finite numbers');
	}

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Options must be an object');
	}

	const { maxIterations = 64, tolerance = Number.EPSILON * 2 } = options;

	if (typeof maxIterations !== 'number') {
		throw new TypeError('options.maxIterations must be a number');
	}
	if (!Number.isInteger(maxIterations) || maxIterations < 1) {
		throw new RangeError('options.maxIterations must be a positive integer');
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number');
	}

	const { v, d } = x;

	if (v === 0) {
		const zeroV = Object.is(v, -0) ? -0 : 0;
		const zeroD = d === 0 ? (Object.is(d, -0) ? -0 : 0) : d > 0 ? Infinity : -Infinity;
		return { v: zeroV, d: zeroD };
	}

	const sign = v < 0 ? -1 : 1;
	let m = Math.abs(v);
	let k = 0;

	// Normalize m into [1, 8) using exact powers of 8 = 2^3 so v = sign * m * 2^(3k).
	const POW2_300 = 2 ** 300;
	const POW2_NEG300 = 2 ** -300;
	const POW2_30 = 2 ** 30;
	const POW2_NEG30 = 2 ** -30;

	while (m >= POW2_300) {
		m *= POW2_NEG300;
		k += 100;
	}
	while (m < POW2_NEG300) {
		m *= POW2_300;
		k -= 100;
	}
	while (m >= POW2_30) {
		m *= POW2_NEG30;
		k += 10;
	}
	while (m < POW2_NEG30) {
		m *= POW2_30;
		k -= 10;
	}
	while (m >= 8) {
		m *= 0.125;
		k += 1;
	}
	while (m < 1) {
		m *= 8;
		k -= 1;
	}

	// Solve y^3 = (m + 1ε) iteratively via Newton-Raphson in dual arithmetic:
	//   y_{n+1} = (2 * y_n + w / y_n^2) / 3
	// On m in [1, 8), linear interpolation gives a tight initial guess in [1, 2].
	let yv = 1 + (m - 1) / 7;
	let yd = 1 / (3 * yv * yv);

	for (let i = 0; i < maxIterations; i++) {
		// Dual square: s = y^2 = (yv^2, 2 * yv * yd)
		const sv = yv * yv;
		const sd = 2 * yv * yd;

		// Dual quotient: q = (m, 1) / s = (m / sv, (1 - qv * sd) / sv)
		const qv = m / sv;
		const qd = (1 - qv * sd) / sv;

		// Dual Newton step
		const nextV = (2 * yv + qv) / 3;
		const nextD = (2 * yd + qd) / 3;

		const vConverged = Math.abs(nextV - yv) <= tolerance * Math.abs(nextV);
		const dConverged = Math.abs(nextD - yd) <= tolerance * Math.abs(nextD);

		yv = nextV;
		yd = nextD;

		if (vConverged && dConverged) {
			break;
		}
	}

	// Rescale back:
	//   cbrt(sign * m * 2^(3k)) = sign * yv * 2^k
	//   d/dv cbrt(v) = yd * 2^(-2k)  (always positive since v^(2/3) > 0)
	const scaleV = 2 ** k;
	const scaleD = 2 ** (-2 * k);

	return {
		v: sign * yv * scaleV,
		d: d * (yd * scaleD),
	};
}
