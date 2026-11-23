/**
 * Computes the cube root of a dual number `{ v, d }` carrying a forward-mode
 * derivative alongside the primal value.
 *
 * Uses the exact first-order binomial / Taylor series expansion over dual
 * numbers (where the dual unit satisfies ε² = 0):
 *
 *   (v + d·ε)^(1/3) = v^(1/3) · (1 + (d / v)·ε)^(1/3)
 *                   = v^(1/3) + (d / (3 · (v^(1/3))²))·ε
 *
 * Equivalently, from the algebraic dual-number identity (r + r'·ε)³ = v + d·ε:
 *   r³ = v  =>  r  = cbrt(v)
 *   3·r²·r' = d  =>  r' = d / (3·r²)   for v ≠ 0.
 *
 * At the non-differentiable singularity v = 0:
 * - If d === 0 (constant zero), returns `{ v: 0, d: 0 }`.
 * - If d !== 0, throws a `RangeError` because the derivative is singular.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite real value `v` and derivative `d`.
 * @returns {{ v: number, d: number }} Dual number representing `cbrt(x)`.
 * @throws {TypeError} If `x` is not a non-null plain dual-number object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is non-finite, if `v === 0` with `d !== 0`, or if the derivative overflows finite range.
 */
export function cbrtDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	if (v === 0) {
		if (d === 0) {
			return { v: 0, d: 0 }
		}
		throw new RangeError('Derivative of cbrt is undefined at v = 0 when d is non-zero')
	}

	const r = Math.cbrt(v)
	const deriv = d === 0 ? 0 : d / (3 * r * r)
	if (!Number.isFinite(deriv)) {
		throw new RangeError('cbrtDualSeries derivative overflowed finite range')
	}

	return { v: r, d: deriv }
}
