/**
 * Validates that an input is a dual number `{ v, d }` with finite real components.
 *
 * @param {unknown} dual - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ v: number, d: number }} The validated dual number.
 * @throws {TypeError} If the input is not a non-null object or has non-numeric `v`/`d`.
 * @throws {RangeError} If `v` or `d` is not a finite number (NaN or ±Infinity).
 */
function validateDual(dual, name) {
	if (dual === null || typeof dual !== 'object' || Array.isArray(dual)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	const { v, d } = dual
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v, d }
}

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Multiplies two dual numbers `{ v, d }` representing first-order truncated
 * Taylor / formal power series `a(ε) = v_a + d_a·ε (mod ε²)` and
 * `b(ε) = v_b + d_b·ε (mod ε²)`.
 *
 * By Cauchy series multiplication truncated at order 1 (`ε² = 0`), the product is:
 * - value: `v = v_a * v_b`
 * - forward-mode derivative (Leibniz product rule): `d = v_a * d_b + d_a * v_b`
 *
 * @param {{ v: number, d: number }} a - First dual number operand.
 * @param {{ v: number, d: number }} b - Second dual number operand.
 * @returns {{ v: number, d: number }} The product dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not a `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any component of `a` or `b` is non-finite (`NaN`, `±Infinity`).
 */
export function multiplyDualSeries(a, b) {
	const left = validateDual(a, 'a')
	const right = validateDual(b, 'b')

	// Truncated formal power series (degree 1) Cauchy product:
	// c[0] = a[0] * b[0]
	// c[1] = a[0] * b[1] + a[1] * b[0]
	const v = normalizeZero(left.v * right.v)
	const d = normalizeZero(left.v * right.d + left.d * right.v)

	return { v, d }
}
