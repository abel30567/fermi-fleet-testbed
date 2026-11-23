/**
 * Compute arcsin(u) for |u| <= 0.5 using its Maclaurin power series:
 *   arcsin(u) = sum_{k=0}^inf ((2k)! / (4^k (k!)^2 (2k + 1))) * u^(2k + 1)
 *
 * At |u| <= 0.5, u^2 <= 0.25 so the series converges to full IEEE-754 double
 * precision in under 30 iterations.
 *
 * @param {number} u - Value with |u| <= 0.5.
 * @returns {number} arcsin(u).
 */
function arcsinSeries(u) {
	if (u === 0) return 0;
	const u2 = u * u;
	let term = u;
	let sum = u;
	for (let k = 0; k < 60; k++) {
		const odd = 2 * k + 1;
		term *= (odd * odd * u2) / ((2 * k + 2) * (2 * k + 3));
		const next = sum + term;
		if (next === sum) break;
		sum = next;
	}
	return sum;
}

/**
 * Compute arccos(v) for v in [-1, 1] using range-reduction identities and
 * the arcsin Maclaurin series:
 *   - |v| <= 0.5: arccos(v) = pi/2 - arcsin(v)
 *   - v > 0.5:    arccos(v) = 2 * arcsin(sqrt((1 - v) / 2))
 *   - v < -0.5:   arccos(v) = pi - 2 * arcsin(sqrt((1 + v) / 2))
 *
 * @param {number} v - Primal value in [-1, 1].
 * @returns {number} arccos(v) in [0, pi].
 */
function arccosSeries(v) {
	if (v > 0.5) {
		return 2 * arcsinSeries(Math.sqrt((1 - v) / 2));
	}
	if (v < -0.5) {
		return Math.PI - 2 * arcsinSeries(Math.sqrt((1 + v) / 2));
	}
	return Math.PI / 2 - arcsinSeries(v);
}

/**
 * Computes the trigonometric arccosine over a dual number `{ v, d }` carrying
 * a primal value `v` and forward-mode derivative `d` (representing `v + d*eps`
 * with `eps^2 = 0`), using a range-reduced Maclaurin series for the primal
 * value and the exact closed-form derivative `-d / sqrt((1 - v) * (1 + v))`.
 *
 * At the non-differentiable domain endpoints `v = +/-1`, the primal value is
 * `0` (for `v = 1`) or `Math.PI` (for `v = -1`), and the derivative follows
 * IEEE-754 limit semantics (`-Infinity` for `d > 0`, `+Infinity` for `d < 0`,
 * and `NaN` for `d === 0`).
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite `v` in `[-1, 1]` and finite `d`.
 * @returns {{ v: number, d: number }} Dual number `{ v: arccos(x.v), d: -x.d / sqrt(1 - x.v^2) }`.
 * @throws {TypeError} If `x` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite, or if `x.v` is outside `[-1, 1]`.
 */
export function arccosDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('arccosDualSeries expects a dual number object { v, d }');
	}
	const { v, d } = x;
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers');
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers');
	}
	if (v < -1 || v > 1) {
		throw new RangeError(`Primal value v must be in [-1, 1], received ${v}`);
	}

	const value = arccosSeries(v);
	const denom = Math.sqrt((1 - v) * (1 + v));

	let deriv;
	if (denom === 0) {
		deriv = -d / 0;
	} else if (d === 0) {
		deriv = 0;
	} else {
		deriv = -d / denom;
	}

	return { v: value, d: deriv };
}
