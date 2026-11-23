/**
 * @typedef {Object} DualNumber
 * @property {number} v - The primal (real) value component.
 * @property {number} d - The tangent (first-order forward-mode derivative) component.
 */

/**
 * Validates that a value is a well-formed finite dual number `{ v, d }`.
 *
 * @param {unknown} value - Candidate dual number to validate.
 * @param {number} index - Zero-based position of the factor for error reporting.
 * @throws {TypeError} If the value is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateDual(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Factor at index ${index} must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number' || typeof value.d !== 'number') {
		throw new TypeError(`Factor at index ${index} must have numeric "v" and "d" properties`)
	}
	if (!Number.isFinite(value.v) || !Number.isFinite(value.d)) {
		throw new RangeError(`Factor at index ${index} must have finite "v" and "d" values`)
	}
}

/**
 * Multiplies dual numbers `{ v, d }` carrying a forward-mode derivative alongside
 * the primal value, using a straightforward iterative implementation.
 *
 * Each dual number represents `v + d * ε` where `ε² = 0`. Multiplying an accumulator
 * `(accV, accD)` by `(v, d)` applies the product rule:
 * - `nextV = accV * v`
 * - `nextD = accV * d + accD * v`
 *
 * Accepts either one or more dual number arguments (`multiplyDualIterative(a, b, ...)`)
 * or a single array of dual numbers (`multiplyDualIterative([a, b, ...])`). An empty array
 * returns the multiplicative identity `{ v: 1, d: 0 }`.
 *
 * @param {...(DualNumber|DualNumber[])} args - Dual number factors, or a single array of dual numbers.
 * @returns {DualNumber} The product dual number `{ v, d }`.
 * @throws {TypeError} If called with no arguments or if any factor is not a valid `{ v, d }` object.
 * @throws {RangeError} If any factor has non-finite `v` or `d`.
 */
export function multiplyDualIterative(...args) {
	if (args.length === 0) {
		throw new TypeError('multiplyDualIterative requires at least one dual number or an array of dual numbers')
	}

	const factors = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	let v = 1
	let d = 0

	for (let i = 0; i < factors.length; i++) {
		const factor = factors[i]
		validateDual(factor, i)

		const nextV = v * factor.v
		const nextD = v * factor.d + d * factor.v

		v = nextV === 0 ? 0 : nextV
		d = nextD === 0 ? 0 : nextD
	}

	return { v, d }
}
