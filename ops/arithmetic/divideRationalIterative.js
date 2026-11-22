/**
 * @typedef {Object} Rational
 * @property {bigint} num - The numerator as a BigInt.
 * @property {bigint} den - The non-zero denominator as a BigInt.
 */

/**
 * Validates that a value is a well-formed Rational object with BigInt `num` and non-zero BigInt `den`.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Rational} The validated Rational object.
 * @throws {TypeError} If `value` is not a plain-like object or `num`/`den` are not BigInts.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt num and den properties`)
	}
	if (typeof value.num !== 'bigint') {
		throw new TypeError(`${name}.num must be a BigInt`)
	}
	if (typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.den must be a BigInt`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
	return value
}

/**
 * Computes the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
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
 * Divides two exact rational numbers represented as `{ num: BigInt, den: BigInt }`
 * and returns the quotient normalized to lowest terms with a strictly positive denominator (`den > 0n`).
 *
 * Uses a straightforward iterative Euclidean GCD algorithm for reduction.
 *
 * @param {Rational} dividend - The rational dividend (`a`).
 * @param {Rational} divisor - The non-zero rational divisor (`b`).
 * @returns {Rational} Exact quotient `dividend / divisor` in lowest terms with `den > 0n`.
 * @throws {TypeError} If either operand is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If either operand has `den === 0n` or if `divisor.num === 0n`.
 */
export function divideRationalIterative(dividend, divisor) {
	const a = validateRational(dividend, 'dividend')
	const b = validateRational(divisor, 'divisor')

	if (b.num === 0n) {
		throw new RangeError('Cannot divide by zero (divisor.num must not be 0n)')
	}

	let num = a.num * b.den
	let den = a.den * b.num

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	if (den < 0n) {
		num = -num
		den = -den
	}

	const divisorGcd = gcdIterative(num, den)
	return {
		num: num / divisorGcd,
		den: den / divisorGcd,
	}
}
