/**
 * Validates that a value is a well-formed finite dual number `{ v, d }`.
 *
 * @param {unknown} dual - Candidate dual number object.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {{ v: number, d: number }} Validated dual number.
 * @throws {TypeError} If `dual` is not a non-null non-array object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is `NaN` or infinite.
 */
function assertValidDual(dual, name) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	if (typeof dual.v !== 'number') {
		throw new TypeError(`${name}.v must be a number`)
	}
	if (typeof dual.d !== 'number') {
		throw new TypeError(`${name}.d must be a number`)
	}
	if (!Number.isFinite(dual.v)) {
		throw new RangeError(`${name}.v must be a finite number`)
	}
	if (!Number.isFinite(dual.d)) {
		throw new RangeError(`${name}.d must be a finite number`)
	}
	return dual
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} x - Finite number.
 * @returns {number} Normalized number.
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Subtracts two dual numbers `{ v, d }` carrying a primal value `v` and a
 * forward-mode first derivative `d` (representing `v + d·ε` with `ε² = 0`).
 *
 * Uses the exact closed-form first-order Taylor / linearity identity for
 * `f(x, y) = x - y` evaluated on dual numbers:
 *
 *     (v_a + d_a·ε) - (v_b + d_b·ε)
 *       = (v_a - v_b) + (∂f/∂x · d_a + ∂f/∂y · d_b)·ε
 *       = (v_a - v_b) + (d_a - d_b)·ε
 *
 * Negative-zero results are canonicalized to `+0`. Inputs are not mutated.
 *
 * @param {{ v: number, d: number }} a - Minuend dual number `{ v, d }`.
 * @param {{ v: number, d: number }} b - Subtrahend dual number `{ v, d }`.
 * @returns {{ v: number, d: number }} Difference dual number `{ v, d }`.
 * @throws {TypeError} If either argument is not a valid `{ v, d }` object with numeric components.
 * @throws {RangeError} If any input component is non-finite (`NaN`, `±Infinity`) or if subtraction overflows.
 */
export function subtractDualSeries(a, b) {
	const left = assertValidDual(a, 'a')
	const right = assertValidDual(b, 'b')

	// First-order Taylor / closed-form identity:
	// ∂(x - y)/∂x = 1, ∂(x - y)/∂y = -1
	const v = left.v - right.v
	const d = left.d - right.d

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number subtraction overflowed to a non-finite value')
	}

	return {
		v: normalizeZero(v),
		d: normalizeZero(d),
	}
}
