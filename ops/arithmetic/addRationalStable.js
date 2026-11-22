/**
 * @typedef {Object} Rational
 * @property {bigint} num - Exact integer numerator.
 * @property {bigint} den - Exact non-zero integer denominator.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using an
 * iterative Euclidean algorithm (O(1) stack space, safe for arbitrarily large
 * inputs).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates that a value is a well-formed Rational `{ num: bigint, den: bigint }`
 * with `den !== 0n`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`Expected ${name} to be an object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint') {
		throw new TypeError(`Expected ${name}.num to be a bigint`)
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`Expected ${name}.den to be a bigint`)
	}
	if (den === 0n) {
		throw new RangeError(`Expected ${name}.den to be non-zero`)
	}
	return { num, den }
}

/**
 * Normalizes a validated rational to canonical lowest terms:
 * - `den > 0n`
 * - `gcd(|num|, den) === 1n`
 * - `num === 0n` implies `den === 1n`
 *
 * @param {Rational} r
 * @returns {Rational}
 */
function normalize(r) {
	let { num, den } = r
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return g === 1n ? { num, den } : { num: num / g, den: den / g }
}

/**
 * Adds two exact rational numbers `{ num: bigint, den: bigint }` and returns
 * their exact sum in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` for zero).
 *
 * Uses Knuth's GCD-scaled rational addition (TAOCP Vol. 2, Section 4.5.1):
 * both operands are first reduced to lowest terms, then denominators are scaled
 * by `d1 = gcd(a.den, b.den)` prior to cross-multiplication, and any remaining
 * common factor `d2 = gcd(|t|, d1)` is divided out before forming the final
 * denominator `(a.den / d1) * (b.den / d2)`. This eliminates rounding error,
 * avoids catastrophic cancellation, and strictly minimizes intermediate BigInt
 * bit-widths.
 *
 * @param {Rational} a - First rational addend `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Second rational addend `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact sum `a + b` in canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function addRationalStable(a, b) {
	const aNorm = normalize(validateRational(a, 'a'))
	const bNorm = normalize(validateRational(b, 'b'))

	if (aNorm.num === 0n) {
		return { num: bNorm.num, den: bNorm.den }
	}
	if (bNorm.num === 0n) {
		return { num: aNorm.num, den: aNorm.den }
	}

	const d1 = gcd(aNorm.den, bNorm.den)
	if (d1 === 1n) {
		const num = aNorm.num * bNorm.den + bNorm.num * aNorm.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		return { num, den: aNorm.den * bNorm.den }
	}

	const aDenScaled = aNorm.den / d1
	const bDenScaled = bNorm.den / d1
	const t = aNorm.num * bDenScaled + bNorm.num * aDenScaled
	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	const d2 = gcd(t, d1)
	return {
		num: t / d2,
		den: aDenScaled * (bNorm.den / d2),
	}
}
