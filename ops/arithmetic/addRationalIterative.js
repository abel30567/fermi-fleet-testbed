/**
 * @typedef {object} Rational
 * @property {bigint} num - Numerator of the rational number.
 * @property {bigint} den - Non-zero denominator of the rational number.
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
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
 * Validates that a value is a well-formed rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {string} name
 * @throws {TypeError} If `value` is not a plain-like object with `bigint` `num` and `den`.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with bigint { num, den } properties`)
	}

	const { num, den } = value
	if (typeof num !== 'bigint') {
		throw new TypeError(`${name}.num must be a bigint`)
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${name}.den must be a bigint`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
}

/**
 * Reduces a rational `(num, den)` to canonical lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}

	const divisor = gcdIterative(n, d)
	return {
		num: n / divisor,
		den: d / divisor,
	}
}

/**
 * Adds two exact rational numbers `{ num: bigint, den: bigint }` and returns
 * their sum in canonical lowest terms with a strictly positive denominator (`den > 0n`).
 *
 * Uses a straightforward iterative Euclidean GCD implementation for reduction.
 *
 * @param {Rational} a - First rational addend.
 * @param {Rational} b - Second rational addend.
 * @returns {Rational} Exact sum `a + b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If either argument is not an object with `bigint` `num` and `den`.
 * @throws {RangeError} If either argument has denominator `0n`.
 */
export function addRationalIterative(a, b) {
	validateRational(a, 'a')
	validateRational(b, 'b')

	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den

	return normalizeRational(num, den)
}
