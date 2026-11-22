/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as a numerator and denominator pair of BigInts.
 */

/**
 * Returns the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the greatest common divisor of two non-negative BigInts iteratively
 * using the Euclidean algorithm (stack-safe for arbitrarily large inputs).
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Validates and normalizes a rational operand into canonical lowest terms
 * with a strictly positive denominator ({ num: 0n, den: 1n } for zero).
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}

	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt values`)
	}

	if (den === 0n) {
		throw new RangeError(`${label}.den must not be zero`)
	}

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const signedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const divisor = gcdBigInt(absBigInt(signedNum), positiveDen)

	return {
		num: signedNum / divisor,
		den: positiveDen / divisor
	}
}

/**
 * Computes the exact difference `a - b` of two rational numbers in canonical lowest terms
 * using Knuth's GCD-scaled rational subtraction (TAOCP Vol. 2, Section 4.5.1).
 *
 * Pre-normalizing operands and factoring out `g = gcd(d1, d2)` before cross-multiplying
 * prevents unnecessary intermediate BigInt bit-length growth when denominators share large
 * common factors, guarantees zero catastrophic cancellation for nearly equal values, and
 * ensures the returned fraction is strictly reduced with a positive denominator.
 *
 * @param {Rational} a - Minuend as `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {Rational} b - Subtrahend as `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @returns {Rational} Exact difference `a - b` as `{ num: bigint, den: bigint }` in lowest
 *   terms (`den > 0n`, `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den` fields.
 * @throws {RangeError} If `a.den` or `b.den` is `0n`.
 */
export function subtractRationalStable(a, b) {
	const left = normalizeRational(a, 'a')
	const right = normalizeRational(b, 'b')

	if (right.num === 0n) {
		return { num: left.num, den: left.den }
	}
	if (left.num === 0n) {
		return { num: -right.num, den: right.den }
	}

	const g = gcdBigInt(left.den, right.den)

	if (g === 1n) {
		const num = left.num * right.den - right.num * left.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		return {
			num,
			den: left.den * right.den
		}
	}

	const leftDenScaled = left.den / g
	const rightDenScaled = right.den / g
	const scaledNum = left.num * rightDenScaled - right.num * leftDenScaled

	if (scaledNum === 0n) {
		return { num: 0n, den: 1n }
	}

	const g2 = gcdBigInt(absBigInt(scaledNum), g)

	return {
		num: scaledNum / g2,
		den: leftDenScaled * rightDenScaled * (g / g2)
	}
}
