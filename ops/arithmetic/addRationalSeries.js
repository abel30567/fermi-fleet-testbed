/**
 * Exact arithmetic addition over rational numbers represented as
 * `{ num: bigint, den: bigint }` in lowest terms.
 *
 * Uses Knuth's closed-form LCM/GCD identity (TAOCP Vol. 2, §4.5.1):
 * for normalized rationals `p/q` and `r/s` (`q > 0`, `s > 0`, `gcd(|p|, q) = 1`, `gcd(|r|, s) = 1`),
 * let `g = gcd(q, s)`, `q1 = q / g`, `s1 = s / g`, and `t = p * s1 + r * q1`.
 * Any common factor of `t` and `q1 * s` necessarily divides `g`, so with `h = gcd(|t|, g)`:
 *
 *     p/q + r/s = (t / h) / (q1 * (s / h))
 *
 * which is guaranteed to be in lowest terms with a positive denominator (and `{ num: 0n, den: 1n }`
 * whenever `t === 0n`).
 *
 * @module ops/arithmetic/addRationalSeries
 */

/**
 * @typedef {object} Rational
 * @property {bigint} num - The numerator as an exact BigInt.
 * @property {bigint} den - The non-zero denominator as an exact BigInt.
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
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Validates that a value is a well-formed Rational `{ num: bigint, den: bigint }`
 * with a non-zero denominator, and returns its canonical lowest-terms representation
 * with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `den` is `0n`.
 */
function validateAndNormalize(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}

	const { num, den } = value
	if (typeof num !== 'bigint') {
		throw new TypeError(`${name}.num must be a bigint`)
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${name}.den must be a bigint`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must be non-zero`)
	}

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const signedNum = den < 0n ? -num : num
	const posDen = den < 0n ? -den : den
	const divisor = gcdBigInt(signedNum, posDen)

	return {
		num: signedNum / divisor,
		den: posDen / divisor,
	}
}

/**
 * Adds two exact rational numbers and returns their sum in lowest terms
 * with a strictly positive denominator (`{ num: 0n, den: 1n }` for zero).
 *
 * Inputs may be unreduced or have negative denominators; they are validated
 * and normalized without mutating the input objects.
 *
 * @param {Rational} a - First rational addend `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Second rational addend `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact sum `a + b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If either argument is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If either argument has `den === 0n`.
 */
export function addRationalSeries(a, b) {
	const left = validateAndNormalize(a, 'a')
	const right = validateAndNormalize(b, 'b')

	if (left.num === 0n) {
		return { num: right.num, den: right.den }
	}
	if (right.num === 0n) {
		return { num: left.num, den: left.den }
	}

	const p = left.num
	const q = left.den
	const r = right.num
	const s = right.den

	// Closed-form LCM/GCD identity (Knuth TAOCP Vol. 2, §4.5.1):
	// Let g = gcd(q, s), q1 = q / g, s1 = s / g, t = p * s1 + r * q1.
	// Since gcd(|p|, q) = 1 and gcd(|r|, s) = 1, gcd(|t|, q1 * s) = gcd(|t|, g).
	const g = gcdBigInt(q, s)
	const q1 = q / g
	const s1 = s / g
	const t = p * s1 + r * q1

	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	const h = g === 1n ? 1n : gcdBigInt(t, g)
	return {
		num: t / h,
		den: q1 * (s / h),
	}
}
