/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - First-order forward-mode derivative (finite real number).
 */

/**
 * Validate that a value is a well-formed finite dual number `{ v, d }`.
 *
 * @param {unknown} x - Candidate dual number.
 * @param {string} name - Parameter name for diagnostic error messages.
 * @throws {TypeError} If `x` is not a non-null object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertValidDual(x, name) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError(`${name} must be a non-null dual number object { v, d }`)
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
}

/**
 * Normalize signed zero (`-0`) to `+0`.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Compute floored modulo `a mod b` over dual numbers `{ v, d }`.
 *
 * Uses the closed-form identity for floored (Knuth) modulo:
 *
 *     a mod b = a - b * floor(a / b)
 *
 * In forward-mode dual arithmetic with `a = a.v + ε a.d` and `b = b.v + ε b.d`,
 * the integer quotient `q = floor(a.v / b.v)` is locally constant away from
 * integer jump discontinuities (`a.v / b.v ∉ ℤ`), so `floor(a / b) = { v: q, d: 0 }`,
 * yielding:
 *
 *     v = a.v - b.v * q
 *     d = a.d - q * b.d
 *
 * At exact integer multiples (`a.v / b.v ∈ ℤ`), `Math.floor` is right-continuous,
 * so the returned value (`0`) and derivative (`a.d - q * b.d`) correspond to the
 * right-sided branch of `floor(a / b)` and preserve the dual identity
 * `(a mod b) + b * q === a`.
 *
 * @param {DualNumber} a - Dividend dual number `{ v, d }`.
 * @param {DualNumber} b - Divisor dual number `{ v, d }` with `b.v !== 0`.
 * @returns {DualNumber} Remainder dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any component is non-finite, `b.v === 0`, or intermediate/output arithmetic overflows.
 */
export function moduloDualSeries(a, b) {
	assertValidDual(a, 'a')
	assertValidDual(b, 'b')

	if (b.v === 0) {
		throw new RangeError('Divisor b.v must be non-zero')
	}

	const ratio = a.v / b.v
	if (!Number.isFinite(ratio)) {
		throw new RangeError('Quotient a.v / b.v overflowed to a non-finite value')
	}

	const q = Math.floor(ratio)
	const v = a.v - b.v * q
	const d = a.d - q * b.d

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Resulting dual number components overflowed to a non-finite value')
	}

	return {
		v: normalizeZero(v),
		d: normalizeZero(d),
	}
}
