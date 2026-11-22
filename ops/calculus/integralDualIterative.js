/**
 * Validates that a value is a finite dual number `{ v, d }`.
 *
 * @param {unknown} dual - Value to validate.
 * @param {string} name - Descriptive parameter or return name for error messages.
 * @returns {{ v: number, d: number }} The validated dual number.
 * @throws {TypeError} If `dual` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `dual.v` or `dual.d` is not a finite number.
 */
function validateDual(dual, name) {
	if (dual === null || typeof dual !== 'object') {
		throw new TypeError(`${name} must be a dual number object { v, d }`);
	}
	if (typeof dual.v !== 'number' || typeof dual.d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`);
	}
	if (!Number.isFinite(dual.v) || !Number.isFinite(dual.d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`);
	}
	return dual;
}

/**
 * Computes the definite integral of a dual-valued function over dual limits
 * `a` and `b` using an iterative composite Simpson's rule:
 *
 *   I = ∫_a^b fn(x) dx
 *
 * Using the dual linear substitution `x(u) = a + u * (b - a)` for `u ∈ [0, 1]`,
 * the integral becomes `(b - a) * ∫_0^1 fn(a + u * (b - a)) du`. Evaluating this
 * over dual numbers `{ v, d }` simultaneously computes:
 * - `v`: the primal definite integral `∫_{a.v}^{b.v} fn(x).v dx`
 * - `d`: the forward-mode derivative given by the Leibniz integral rule,
 *   `fn(b.v).v * b.d - fn(a.v).v * a.d + ∫_{a.v}^{b.v} ∂fn/∂t dx`
 *
 * @param {(x: { v: number, d: number }) => { v: number, d: number }} fn
 *   Integrand accepting a dual number `{ v, d }` and returning a dual number `{ v, d }`.
 * @param {{ v: number, d: number }} a - Lower integration limit as a dual number.
 * @param {{ v: number, d: number }} b - Upper integration limit as a dual number.
 * @param {number} [steps=1000] - Number of Simpson subintervals (must be a positive even integer).
 * @returns {{ v: number, d: number }} The definite integral as a dual number `{ v, d }`.
 * @throws {TypeError} If `fn` is not a function, `a`/`b`/`fn(x)` are not valid dual objects, or `steps` is not a number.
 * @throws {RangeError} If any dual component is non-finite, `steps` is not a positive even safe integer, or the result overflows.
 */
export function integralDualIterative(fn, a, b, steps = 1000) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function');
	}
	validateDual(a, 'a');
	validateDual(b, 'b');

	if (typeof steps !== 'number') {
		throw new TypeError('steps must be a number');
	}
	if (!Number.isSafeInteger(steps) || steps <= 0 || steps % 2 !== 0) {
		throw new RangeError('steps must be a positive even safe integer');
	}

	const spanV = b.v - a.v;
	const spanD = b.d - a.d;
	if (!Number.isFinite(spanV) || !Number.isFinite(spanD)) {
		throw new RangeError('integration span (b - a) overflowed to a non-finite number');
	}

	const f0 = validateDual(fn({ v: a.v, d: a.d }), 'fn(a)');
	const fN = validateDual(fn({ v: b.v, d: b.d }), 'fn(b)');

	let oddV = 0;
	let oddD = 0;
	let evenV = 0;
	let evenD = 0;

	for (let i = 1; i < steps; i++) {
		const u = i / steps;
		const x = {
			v: a.v + u * spanV,
			d: a.d + u * spanD,
		};
		const fx = validateDual(fn(x), `fn(x_${i})`);

		if (i % 2 === 1) {
			oddV += fx.v;
			oddD += fx.d;
		} else {
			evenV += fx.v;
			evenD += fx.d;
		}
	}

	const denom = 3 * steps;
	const unitV = (f0.v + fN.v + 4 * oddV + 2 * evenV) / denom;
	const unitD = (f0.d + fN.d + 4 * oddD + 2 * evenD) / denom;

	const rawV = spanV * unitV;
	const rawD = spanD * unitV + spanV * unitD;

	if (!Number.isFinite(rawV) || !Number.isFinite(rawD)) {
		throw new RangeError('integral result overflowed to a non-finite number');
	}

	return {
		v: rawV === 0 ? 0 : rawV,
		d: rawD === 0 ? 0 : rawD,
	};
}
