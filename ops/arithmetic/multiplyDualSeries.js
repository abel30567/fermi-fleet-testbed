/**
 * @typedef {object} Dual
 * @property {number} v - Primal value (degree-0 coefficient in ℝ[ε]/(ε²)).
 * @property {number} d - First-order forward-mode derivative (degree-1 coefficient of ε).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value - Candidate dual number object to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `value` is not a non-null plain-like object or `v`/`d` are not numbers.
 * @throws {RangeError} If `value.v` or `value.d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertDual(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number') {
		throw new TypeError(`${name}.v must be a finite number`)
	}
	if (typeof value.d !== 'number') {
		throw new TypeError(`${name}.d must be a finite number`)
	}
	if (!Number.isFinite(value.v)) {
		throw new RangeError(`${name}.v must be a finite number`)
	}
	if (!Number.isFinite(value.d)) {
		throw new RangeError(`${name}.d must be a finite number`)
	}
}

/**
 * Multiplies two dual numbers `{ v, d }` in the truncated formal power series ring ℝ[ε]/(ε²).
 *
 * Treating each dual number as a first-order Taylor series
 * `A(ε) = a.v + a.d·ε` and `B(ε) = b.v + b.d·ε` with nilpotent infinitesimal `ε² = 0`,
 * the Cauchy series product truncated at degree 1 yields the closed-form Leibniz product rule:
 *
 * - `v = c₀ = a.v · b.v`
 * - `d = c₁ = a.v · b.d + a.d · b.v`
 *
 * Signed zeros (`-0`) in the output components are normalized to `+0`.
 *
 * @param {Dual} a - First dual number operand `{ v, d }`.
 * @param {Dual} b - Second dual number operand `{ v, d }`.
 * @returns {Dual} The product dual number `{ v, d }`.
 * @throws {TypeError} If either operand is not a dual object with numeric `v` and `d` fields.
 * @throws {RangeError} If any component `v` or `d` is `NaN` or non-finite.
 *
 * @example
 * multiplyDualSeries({ v: 2, d: 3 }, { v: 4, d: 5 })
 * // => { v: 8, d: 22 }
 */
export function multiplyDualSeries(a, b) {
	assertDual(a, 'a')
	assertDual(b, 'b')

	// Truncated Cauchy product in ℝ[ε]/(ε²): c_k = sum_{j=0}^k a_j * b_{k-j} for k in {0, 1}.
	const v = a.v * b.v
	const d = a.v * b.d + a.d * b.v

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
