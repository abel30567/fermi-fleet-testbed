/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the rational number.
 * @property {bigint} den - Non-zero denominator of the rational number.
 */

/**
 * Validates that a value is a rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational value.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `value` is not a plain-like object with bigint `num` and `den`.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with bigint { num, den } properties`)
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
}

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value - Input BigInt.
 * @returns {bigint} Non-negative magnitude of `value`.
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdIterative(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)

	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}

	return x
}

/**
 * Multiplies two exact rational numbers `{ num: bigint, den: bigint }` and returns
 * their product normalized to lowest terms with a strictly positive denominator (`den > 0n`),
 * using a straightforward iterative Euclidean GCD implementation.
 *
 * @param {Rational} a - First rational operand.
 * @param {Rational} b - Second rational operand.
 * @returns {Rational} Exact product `{ num, den }` in lowest terms with `den > 0n`.
 * @throws {TypeError} If either operand is not an object with bigint `num` and `den`.
 * @throws {RangeError} If either operand has a zero denominator (`den === 0n`).
 */
export function multiplyRationalIterative(a, b) {
	validateRational(a, 'a')
	validateRational(b, 'b')

	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}

	let num = a.num * b.num
	let den = a.den * b.den

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
