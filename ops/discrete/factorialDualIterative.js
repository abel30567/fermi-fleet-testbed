/**
 * Euler-Mascheroni constant (γ = -ψ(1)), used as the base derivative
 * of the analytic continuation Γ(x + 1) at x = 0.
 */
const EULER_MASCHERONI = 0.5772156649015328606

/**
 * Largest non-negative integer n whose factorial n! fits in IEEE 754 double precision.
 * 170! ≈ 7.2574e306 < Number.MAX_VALUE; 171! overflows to Infinity.
 */
const MAX_FACTORIAL_INPUT = 170

/**
 * Computes the discrete factorial over a dual number `{ v, d }` carrying a
 * forward-mode derivative alongside the value, using a straightforward
 * iterative implementation.
 *
 * Uses the analytic continuation `f(x) = Γ(x + 1)` evaluated at non-negative
 * integer `v = n`:
 * - Value: `v_out = n!`
 * - Derivative: `d_out = n! * ψ(n + 1) * d = n! * (H_n - γ) * d`
 *
 * Iteratively applies dual-number multiplication `(val, der) * (k, 1)` from
 * `k = 1` to `v` starting from `Γ(1 + ε) = (1, -γ)`, then applies the chain
 * rule by scaling the unit derivative by `d`.
 *
 * @param {{ v: number, d: number }} x - Dual number input where `v` is a
 *   non-negative integer (`0 <= v <= 170`) and `d` is a finite derivative seed.
 * @returns {{ v: number, d: number }} Dual number `{ v, d }` containing `v!`
 *   and its forward-mode directional derivative.
 * @throws {TypeError} If `x` is not a non-null object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is non-finite, if `v` is not a non-negative
 *   integer, or if `v > 170` (which overflows IEEE 754 double precision).
 */
export function factorialDualIterative(x) {
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

	if (!Number.isInteger(v) || v < 0) {
		throw new RangeError('Factorial value component v must be a non-negative integer')
	}

	if (v > MAX_FACTORIAL_INPUT) {
		throw new RangeError(
			`Factorial value component v must be <= ${MAX_FACTORIAL_INPUT} (overflows IEEE 754 double precision)`
		)
	}

	let val = 1
	let der = -EULER_MASCHERONI

	for (let k = 1; k <= v; k++) {
		// Forward-mode dual product: (val, der) * (k, 1) = (val * k, der * k + val)
		der = der * k + val
		val *= k
	}

	const outDer = d === 0 ? 0 : der * d

	return {
		v: val,
		d: outDer === 0 ? 0 : outDer,
	}
}
