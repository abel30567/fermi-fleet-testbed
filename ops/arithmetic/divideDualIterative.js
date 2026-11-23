/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (real part).
 * @property {number} d - Forward-mode derivative (dual part / coefficient of ε).
 */

/**
 * Validates that a value is a well-formed finite dual number `{ v, d }`.
 *
 * @param {unknown} input - Candidate dual number to validate.
 * @param {string} label - Parameter label for error messages.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If the input is not an object with finite numeric `v` and `d` properties.
 */
function assertDual(input, label) {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	const { v, d } = input
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError(`${label}.v must be a finite number`)
	}
	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError(`${label}.d must be a finite number`)
	}
	return input
}

/**
 * Normalizes `-0` to `0` while preserving all other numbers.
 *
 * @param {number} n - Finite number to normalize.
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Divides dual numbers `{ v, d }` carrying a forward-mode derivative alongside
 * the primal value, using a straightforward left-to-right iterative loop.
 *
 * For two dual numbers `a = a.v + a.d·ε` and `b = b.v + b.d·ε` (with `ε² = 0`
 * and `b.v !== 0`), the quotient is computed in overflow-resistant form:
 *
 *   q = a.v / b.v
 *   d = (a.d - q * b.d) / b.v
 *
 * When more than two dual numbers are supplied, division associates left-to-right:
 * `divideDualIterative(a, b, c)` computes `(a / b) / c`.
 *
 * @param {DualNumber} a - Dividend dual number `{ v, d }`.
 * @param {DualNumber} b - First divisor dual number `{ v, d }` with `b.v !== 0`.
 * @param {...DualNumber} rest - Optional additional divisors applied left-to-right.
 * @returns {DualNumber} Quotient dual number `{ v, d }`.
 * @throws {TypeError} If any argument is missing or not a finite dual number `{ v, d }`.
 * @throws {RangeError} If any divisor has `v === 0` or if the result overflows to non-finite.
 */
export function divideDualIterative(a, b, ...rest) {
	assertDual(a, 'dividend')
	assertDual(b, 'divisor[0]')
	for (let i = 0; i < rest.length; i++) {
		assertDual(rest[i], `divisor[${i + 1}]`)
	}

	const divisors = [b, ...rest]
	let accV = a.v
	let accD = a.d

	for (let i = 0; i < divisors.length; i++) {
		const curr = divisors[i]
		if (curr.v === 0) {
			throw new RangeError(
				`Division by zero at divisor[${i}]: divisor value v must be non-zero`,
			)
		}

		const nextV = accV / curr.v
		const nextD = (accD - nextV * curr.d) / curr.v

		if (!Number.isFinite(nextV) || !Number.isFinite(nextD)) {
			throw new RangeError(
				`Overflow in dual division at divisor[${i}]: result is not finite`,
			)
		}

		accV = nextV
		accD = nextD
	}

	return {
		v: normalizeZero(accV),
		d: normalizeZero(accD),
	}
}
