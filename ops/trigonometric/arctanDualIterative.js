/**
 * Computes the arctangent of a dual number `{ v, d }` iteratively, carrying
 * the forward-mode derivative alongside the primal value.
 *
 * For a dual number `x = v + d·ε` (with `ε² = 0`):
 *   `arctan(v + d·ε) = arctan(v) + (d / (1 + v²))·ε`
 *
 * The primal `arctan(v)` is evaluated iteratively using:
 * 1. Odd symmetry (`arctan(-v) = -arctan(v)`).
 * 2. Reciprocal range reduction for `|v| > 1` (`arctan(v) = π/2 - arctan(1/v)`).
 * 3. Iterative half-angle reduction (`arctan(u) = 2 * arctan(u / (1 + sqrt(1 + u²)))`)
 *    until `u <= 0.05`.
 * 4. Alternating Taylor series `u - u³/3 + u⁵/5 - ...` until IEEE 754 convergence.
 *
 * @param {{ v: number, d: number }} x - Dual number with finite numeric `v` (primal) and `d` (derivative).
 * @returns {{ v: number, d: number }} Dual number `{ v, d }` representing `arctan(x)` and its derivative.
 * @throws {TypeError} If `x` is not a valid dual object or if `x.v` or `x.d` is not a finite number.
 */
export function arctanDualIterative(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected dual number object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError('Expected dual number property "v" to be a finite number');
	}

	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError('Expected dual number property "d" to be a finite number');
	}

	if (v === 0) {
		return { v, d };
	}

	const HALF_PI = Math.PI / 2;
	const REDUCTION_THRESHOLD = 0.05;
	const MAX_TERMS = 64;

	const sign = v < 0 ? -1 : 1;
	const absV = Math.abs(v);
	const inverted = absV > 1;
	let u = inverted ? 1 / absV : absV;

	// Iterative half-angle reduction: arctan(u) = 2 * arctan(u / (1 + sqrt(1 + u^2)))
	let scale = 1;
	while (u > REDUCTION_THRESHOLD) {
		u = u / (1 + Math.sqrt(1 + u * u));
		scale *= 2;
	}

	// Iterative alternating Taylor series: u - u^3/3 + u^5/5 - ...
	const u2 = u * u;
	let sum = u;
	let termPower = u;
	for (let k = 1; k <= MAX_TERMS; k++) {
		termPower *= -u2;
		const term = termPower / (2 * k + 1);
		const nextSum = sum + term;
		if (nextSum === sum) {
			break;
		}
		sum = nextSum;
	}

	let primal = scale * sum;
	if (inverted) {
		primal = HALF_PI - primal;
	}
	primal *= sign;

	// Forward-mode derivative: d / (1 + v^2), avoiding v^2 overflow for huge |v|
	const derivative = absV > 1e150
		? (d / absV) / (absV + 1 / absV)
		: d / (1 + v * v);

	return { v: primal, d: derivative };
}
