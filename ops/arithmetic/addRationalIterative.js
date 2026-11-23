/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the rational number.
 * @property {bigint} den - Non-zero denominator of the rational number.
 */

/**
 * Validate that a value is a well-formed rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {Rational} The validated rational object.
 * @throws {TypeError} If `value` is not a plain-like object with `bigint` `num` and `den`.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with bigint num and den properties`)
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
	return value
}

/**
 * Compute the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} x - First integer.
 * @param {bigint} y - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `x` and `y`.
 */
function gcdIterative(x, y) {
	let a = x < 0n ? -x : x
	let b = y < 0n ? -y : y
	while (b !== 0n) {
		const remainder = a % b
		a = b
		b = remainder
	}
	return a
}

/**
 * Add two exact rational numbers `{ num: bigint, den: bigint }` and return
 * the sum in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` when the sum is zero), using a straightforward
 * iterative implementation.
 *
 * @param {Rational} a - First rational addend.
 * @param {Rational} b - Second rational addend.
 * @returns {Rational} Exact sum in lowest terms with a positive denominator.
 * @throws {TypeError} If `a` or `b` is not an object with `bigint` `num` and `den`.
 * @throws {RangeError} If `a.den` or `b.den` is `0n`.
 */
export function addRationalIterative(a, b) {
	validateRational(a, 'a')
	validateRational(b, 'b')

	let aNum = a.num
	let aDen = a.den
	if (aDen < 0n) {
		aNum = -aNum
		aDen = -aDen
	}

	let bNum = b.num
	let bDen = b.den
	if (bDen < 0n) {
		bNum = -bNum
		bDen = -bDen
	}

	const num = aNum * bDen + bNum * aDen
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const den = aDen * bDen
	const divisor = gcdIterative(num, den)

	return {
		num: num / divisor,
		den: den / divisor,
	}
}
