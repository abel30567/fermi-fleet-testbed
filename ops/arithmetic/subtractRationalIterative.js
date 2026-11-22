/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as a numerator and non-zero denominator
 * of arbitrary-precision BigInts.
 */

/**
 * Validates that a value is a well-formed Rational object (`{ num: bigint, den: bigint }` with `den !== 0n`).
 *
 * @param {unknown} value - Candidate rational operand.
 * @param {string} name - Parameter name for error reporting.
 * @returns {Rational} The validated rational object.
 * @throws {TypeError} If `value` is not a non-null object or if `num`/`den` are not `bigint`s.
 * @throws {RangeError} If `den` is `0n`.
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a non-null object with bigint num and den properties`)
	}
	if (typeof value.num !== 'bigint') {
		throw new TypeError(`${name}.num must be a bigint`)
	}
	if (typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.den must be a bigint`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
	return /** @type {Rational} */ (value)
}

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdIterative(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Subtracts two exact rational numbers (`a - b`) and returns the result in
 * normalized lowest terms with a strictly positive denominator (`den > 0n`).
 *
 * Uses a straightforward iterative Euclidean GCD to reduce the resulting
 * fraction `(a.num * b.den - b.num * a.den) / (a.den * b.den)`.
 * Zero is always represented canonically as `{ num: 0n, den: 1n }`.
 *
 * @param {Rational} a - Minuend rational `{ num: bigint, den: bigint }` (`den !== 0n`).
 * @param {Rational} b - Subtrahend rational `{ num: bigint, den: bigint }` (`den !== 0n`).
 * @returns {Rational} Exact difference `a - b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function subtractRationalIterative(a, b) {
	const left = validateRational(a, 'a')
	const right = validateRational(b, 'b')

	let num = left.num * right.den - right.num * left.den
	let den = left.den * right.den

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	if (den < 0n) {
		num = -num
		den = -den
	}

	const divisor = gcdIterative(num, den)
	return {
		num: num / divisor,
		den: den / divisor,
	}
}
