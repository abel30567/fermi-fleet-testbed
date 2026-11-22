/**
 * @typedef {object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Non-zero denominator of the exact rational number.
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Validates and normalizes a rational number to lowest terms with a strictly
 * positive denominator (`den > 0n`).
 *
 * @param {Rational} rational
 * @returns {Rational}
 */
function normalizeRational(rational) {
	if (rational === null || typeof rational !== 'object' || Array.isArray(rational)) {
		throw new TypeError('base must be an object with BigInt num and den properties')
	}
	const { num, den } = rational
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('base.num and base.den must both be BigInt values')
	}
	if (den === 0n) {
		throw new RangeError('base.den must not be 0n')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const divisor = gcd(n, d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Validates and normalizes an integer exponent (BigInt or safe integer Number)
 * to a BigInt.
 *
 * @param {bigint | number} exponent
 * @returns {bigint}
 */
function normalizeExponent(exponent) {
	if (typeof exponent === 'bigint') {
		return exponent
	}
	if (typeof exponent === 'number') {
		if (!Number.isSafeInteger(exponent)) {
			throw new RangeError('exponent must be a BigInt or a safe integer number')
		}
		return BigInt(exponent)
	}
	throw new TypeError('exponent must be a BigInt or a safe integer number')
}

/**
 * Raises an exact rational number `{ num: BigInt, den: BigInt }` to an integer
 * exponent using straightforward iterative exponentiation by squaring.
 *
 * - Normalizes the base to lowest terms before exponentiation; since coprime
 *   integers remain coprime when raised to any non-negative integer power, the
 *   returned rational is guaranteed to be in lowest terms with `den > 0n`.
 * - Follows the convention `0^0 = 1` (returning `{ num: 1n, den: 1n }`).
 * - Handles negative exponents by inverting the normalized base and negating
 *   the exponent; throws a `RangeError` if the base is zero and the exponent
 *   is negative.
 *
 * @param {Rational} base - Exact rational base `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {bigint | number} exponent - Integer exponent as a `BigInt` or safe integer `number`.
 * @returns {Rational} Exact rational result in lowest terms with `den > 0n`.
 * @throws {TypeError} If `base` is not a valid rational object or `exponent` is not a `BigInt` or `number`.
 * @throws {RangeError} If `base.den === 0n`, if a numeric `exponent` is not a safe integer, or if raising zero to a negative exponent.
 */
export function powerRationalIterative(base, exponent) {
	let { num, den } = normalizeRational(base)
	let exp = normalizeExponent(exponent)

	if (exp === 0n) {
		return { num: 1n, den: 1n }
	}

	if (num === 0n) {
		if (exp < 0n) {
			throw new RangeError('Cannot raise zero to a negative exponent')
		}
		return { num: 0n, den: 1n }
	}

	if (exp < 0n) {
		const prevNum = num
		num = den
		den = prevNum
		if (den < 0n) {
			num = -num
			den = -den
		}
		exp = -exp
	}

	if (den === 1n) {
		if (num === 1n) {
			return { num: 1n, den: 1n }
		}
		if (num === -1n) {
			return { num: (exp & 1n) === 0n ? 1n : -1n, den: 1n }
		}
	}

	let resNum = 1n
	let resDen = 1n
	let curNum = num
	let curDen = den

	while (exp > 0n) {
		if ((exp & 1n) === 1n) {
			resNum *= curNum
			resDen *= curDen
		}
		exp >>= 1n
		if (exp > 0n) {
			curNum *= curNum
			curDen *= curDen
		}
	}

	return { num: resNum, den: resDen }
}
