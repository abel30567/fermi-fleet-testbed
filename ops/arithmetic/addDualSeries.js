/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (first-order forward-mode derivative) component.
 */

/**
 * Validates that a value is a finite dual number `{ v, d }`.
 *
 * @param {unknown} x - Candidate dual number.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {DualNumber} Validated dual number.
 * @throws {TypeError} If `x` is not a non-null, non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is not a finite number (`NaN`, `±Infinity`).
 */
function validateDual(x, name) {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return x
}

/**
 * Normalizes `-0` to `+0` while preserving all other finite numbers.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Adds two dual numbers `a = a.v + a.d·ε` and `b = b.v + b.d·ε` (where `ε² = 0`)
 * using the closed-form truncated Taylor-series identity for forward-mode automatic
 * differentiation:
 *
 *   f(a, b) = (a.v + a.d·ε) + (b.v + b.d·ε)
 *           = (a.v + b.v) + (∂f/∂a · a.d + ∂f/∂b · b.d)·ε + O(ε²)
 *           = (a.v + b.v) + (a.d + b.d)·ε
 *
 * Since `ε² = 0` and all second- and higher-order partial derivatives of addition
 * vanish identically, the first-order series representation is exact.
 *
 * @param {DualNumber} a - First dual number `{ v, d }`.
 * @param {DualNumber} b - Second dual number `{ v, d }`.
 * @returns {DualNumber} Sum `{ v, d }` as a new dual number object.
 * @throws {TypeError} If `a` or `b` is not a valid dual number object `{ v, d }`.
 * @throws {RangeError} If any input component is non-finite or the sum overflows to non-finite.
 */
export function addDualSeries(a, b) {
	const left = validateDual(a, 'a')
	const right = validateDual(b, 'b')

	const v = left.v + right.v
	const d = left.d + right.d

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number addition overflowed to a non-finite value')
	}

	return {
		v: normalizeZero(v),
		d: normalizeZero(d),
	}
}
