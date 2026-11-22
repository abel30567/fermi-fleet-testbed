/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Infinitesimal (forward-mode derivative) component.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value - Candidate dual number to validate.
 * @param {string} name - Parameter name used in error messages.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If `value` is not a plain-like non-null, non-array object or if `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is `NaN` or not finite (`Infinity` / `-Infinity`).
 */
function validateDual(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	const { v, d } = value
	if (typeof v !== 'number') {
		throw new TypeError(`${name}.v must be a number`)
	}
	if (typeof d !== 'number') {
		throw new TypeError(`${name}.d must be a number`)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(`${name}.v must be a finite number`)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(`${name}.d must be a finite number`)
	}
	return { v, d }
}

/**
 * Divides two dual numbers `a = a.v + a.d*ε` and `b = b.v + b.d*ε` (where `ε^2 = 0`)
 * using the exact truncated geometric series identity.
 *
 * Because `ε^k = 0` for all `k >= 2`, the reciprocal of `b` expands exactly as:
 *
 * ```
 * 1 / (b.v + b.d*ε)
 *   = (1 / b.v) * 1 / (1 + (b.d / b.v)*ε)
 *   = (1 / b.v) * (1 - (b.d / b.v)*ε)
 * ```
 *
 * Multiplying by `(a.v + a.d*ε)` and discarding the `ε^2` term yields:
 *
 * ```
 * (a.v + a.d*ε) / (b.v + b.d*ε)
 *   = (a.v / b.v) + ((a.d * b.v - a.v * b.d) / (b.v * b.v)) * ε
 * ```
 *
 * When `b.v * b.v` would overflow or underflow IEEE-754 double precision, the derivative
 * is computed via the algebraically equivalent scaled series form `(a.d - (a.v / b.v) * b.d) / b.v`.
 *
 * @param {DualNumber} a - Dividend dual number `{ v, d }`.
 * @param {DualNumber} b - Divisor dual number `{ v, d }` with `b.v !== 0`.
 * @returns {DualNumber} Quotient dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not a valid `{ v, d }` object with numeric components.
 * @throws {RangeError} If any component is non-finite, or if `b.v === 0` (division by zero).
 */
export function divideDualSeries(a, b) {
	const num = validateDual(a, 'a')
	const den = validateDual(b, 'b')

	if (den.v === 0) {
		throw new RangeError('Division by zero: b.v must be non-zero')
	}

	const v = num.v / den.v
	const denomSq = den.v * den.v

	let d
	if (Number.isFinite(denomSq) && denomSq !== 0) {
		const numer = num.d * den.v - num.v * den.d
		d = Number.isFinite(numer)
			? numer / denomSq
			: (num.d - v * den.d) / den.v
	} else {
		d = (num.d - v * den.d) / den.v
	}

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
