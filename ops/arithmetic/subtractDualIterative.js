/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value component (must be a finite number).
 * @property {number} d - Forward-mode derivative (tangent) component (must be a finite number).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} value - Candidate dual number to validate.
 * @param {string} label - Parameter label used in error messages.
 * @throws {TypeError} If `value` is not a non-null non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateDualNumber(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number') {
		throw new TypeError(`${label}.v must be a number`)
	}
	if (typeof value.d !== 'number') {
		throw new TypeError(`${label}.d must be a number`)
	}
	if (!Number.isFinite(value.v)) {
		throw new RangeError(`${label}.v must be a finite number`)
	}
	if (!Number.isFinite(value.d)) {
		throw new RangeError(`${label}.d must be a finite number`)
	}
}

/**
 * Subtracts one or more dual numbers from an initial dual number using a
 * straightforward iterative left-to-right loop.
 *
 * Dual numbers have the form `v + d*ε` with `ε² = 0`, carrying a primal value `v`
 * alongside a forward-mode derivative `d`. Subtraction is linear in both components:
 * `(a.v + a.d*ε) - (b.v + b.d*ε) = (a.v - b.v) + (a.d - b.d)*ε`.
 *
 * When additional dual numbers are provided, each is subtracted iteratively in order:
 * `(((a - b) - c) - ...)`. Negative zero (`-0`) components are normalized to `0`.
 *
 * @param {DualNumber} a - Minuend dual number `{ v, d }`.
 * @param {DualNumber} b - First subtrahend dual number `{ v, d }`.
 * @param {...DualNumber} rest - Optional additional subtrahend dual numbers `{ v, d }`.
 * @returns {DualNumber} A new dual number `{ v, d }` representing the difference.
 * @throws {TypeError} If fewer than two operands are supplied or any operand is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any component is non-finite (`NaN`, `±Infinity`) or if intermediate subtraction overflows to a non-finite value.
 */
export function subtractDualIterative(a, b, ...rest) {
	validateDualNumber(a, 'a')
	validateDualNumber(b, 'b')
	for (let i = 0; i < rest.length; i += 1) {
		validateDualNumber(rest[i], `rest[${i}]`)
	}

	const subtrahends = [b, ...rest]
	let v = a.v
	let d = a.d

	for (let i = 0; i < subtrahends.length; i += 1) {
		const term = subtrahends[i]
		v -= term.v
		d -= term.d
		if (!Number.isFinite(v) || !Number.isFinite(d)) {
			throw new RangeError('Dual subtraction overflowed to a non-finite value')
		}
	}

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
