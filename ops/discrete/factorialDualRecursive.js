/**
 * Euler-Mascheroni constant (γ), equal to -ψ(1), where ψ is the digamma function.
 * Used as the base derivative factor for Γ'(1) = -γ.
 */
const GAMMA = 0.5772156649015328606

/**
 * Maximum integer argument whose factorial is finite in IEEE-754 float64.
 * 170! ≈ 7.257415615307999e+306; 171! overflows to Infinity.
 */
const MAX_FACTORIAL_N = 170

/**
 * Multiply two dual numbers `(a.v + a.d ε) * (b.v + b.d ε)` using
 * first-order forward-mode automatic differentiation.
 *
 * @param {{ v: number, d: number }} a - Left dual operand.
 * @param {{ v: number, d: number }} b - Right dual operand.
 * @returns {{ v: number, d: number }} The dual product.
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Compute the dual product ∏_{k=lo}^{hi} { v: k, d } using a balanced
 * divide-and-conquer recursive product tree.
 *
 * For `[1, n]`, this evaluates to `{ v: n!, d: n! * H_n * d }`, where
 * `H_n = ∑_{k=1}^{n} 1/k` is the n-th harmonic number.
 *
 * @param {number} lo - Inclusive lower integer bound.
 * @param {number} hi - Inclusive upper integer bound.
 * @param {number} d - Tangent (derivative) component carried by each factor.
 * @returns {{ v: number, d: number }} Product of the dual factors over `[lo, hi]`.
 */
function productTree(lo, hi, d) {
	if (lo > hi) {
		return { v: 1, d: 0 }
	}
	if (lo === hi) {
		return { v: lo, d }
	}
	const mid = (lo + hi) >>> 1
	return dualMul(productTree(lo, mid, d), productTree(mid + 1, hi, d))
}

/**
 * Validate that the input is a well-formed finite dual number `{ v, d }`
 * whose primal value `v` is a non-negative integer within `[0, 170]`.
 *
 * @param {{ v: number, d: number }} n - Candidate dual number input.
 * @throws {TypeError} If `n` is not an object or `n.v`/`n.d` are not numbers.
 * @throws {RangeError} If `n.v`/`n.d` are non-finite, or `n.v` is not an integer in `[0, 170]`.
 */
function validateDualFactorialInput(n) {
	if (n === null || typeof n !== 'object') {
		throw new TypeError('Input must be a dual number object { v, d }')
	}
	if (typeof n.v !== 'number' || typeof n.d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}
	if (!Number.isFinite(n.v) || !Number.isFinite(n.d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}
	if (!Number.isInteger(n.v)) {
		throw new RangeError(`Factorial requires an integer primal value v; got ${n.v}`)
	}
	if (n.v < 0) {
		throw new RangeError(`Factorial requires a non-negative integer v; got ${n.v}`)
	}
	if (n.v > MAX_FACTORIAL_N) {
		throw new RangeError(
			`Factorial overflows IEEE-754 double precision for v > ${MAX_FACTORIAL_N}; got ${n.v}`,
		)
	}
}

/**
 * Compute the discrete factorial over a dual number `n = { v, d }` carrying a
 * forward-mode derivative alongside the value, using a recursive
 * divide-and-conquer product tree.
 *
 * Extending factorial smoothly via the Gamma function `f(x) = Γ(x + 1)`:
 * - Primal value: `v = n.v! = Γ(n.v + 1)`
 * - Derivative:   `d = n.v! * ψ(n.v + 1) * n.d = n.v! * (H_{n.v} - γ) * n.d`
 *
 * Computed via `dualMul({ v: 1, d: -γ * n.d }, productTree(1, n.v, n.d))`,
 * where `base = 0! = { v: 1, d: -γ * n.d }` and `productTree(1, n.v, n.d)`
 * multiplies dual factors `{ v: k, d: n.d }` for `k = 1..n.v` in `O(log n)`
 * recursion depth.
 *
 * @param {{ v: number, d: number }} n - Dual number with integer `0 <= n.v <= 170` and finite `n.d`.
 * @returns {{ v: number, d: number }} Dual factorial `{ v: n.v!, d: n.v! * (H_{n.v} - γ) * n.d }`.
 * @throws {TypeError} If `n` is not a dual number object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is non-finite, or `v` is not an integer in `[0, 170]`.
 */
export function factorialDualRecursive(n) {
	validateDualFactorialInput(n)

	const d = n.d === 0 ? 0 : n.d
	const base = { v: 1, d: d === 0 ? 0 : -GAMMA * d }
	const result = dualMul(base, productTree(1, n.v, d))

	return {
		v: result.v,
		d: result.d === 0 ? 0 : result.d,
	}
}
