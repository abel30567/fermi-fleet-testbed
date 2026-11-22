/**
 * @typedef {Object} Rational
 * @property {bigint} num - The numerator (carries the sign; 0n when value is zero).
 * @property {bigint} den - The denominator (strictly positive in canonical lowest terms).
 */

/**
 * Compute the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Compute the greatest common divisor of two non-negative BigInts using the
 * iterative Euclidean algorithm (stack-safe for arbitrarily large inputs).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validate and normalize a rational operand to canonical lowest terms
 * with a strictly positive denominator.
 *
 * @param {unknown} value - Candidate rational object `{ num: bigint, den: bigint }`.
 * @param {string} name - Parameter name used in error messages.
 * @returns {Rational}
 */
function normalizeRational(value, name) {
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

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	let normNum = num
	let normDen = den
	if (normDen < 0n) {
		normNum = -normNum
		normDen = -normDen
	}

	const g = gcdBigInt(absBigInt(normNum), normDen)
	return {
		num: normNum / g,
		den: normDen / g,
	}
}

/**
 * Multiply two exact rationals represented as `{ num: bigint, den: bigint }`
 * and return their product in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` for zero).
 *
 * Numerical robustness & scaling:
 * - Validates and pre-reduces both operands independently before any multiplication.
 * - Cross-cancels common factors (`gcd(|a.num|, b.den)` and `gcd(|b.num|, a.den)`)
 *   prior to multiplying, preventing unnecessary intermediate BigInt bit-growth
 *   and guaranteeing the resulting fraction is already in lowest terms.
 * - Uses an iterative Euclidean GCD so arbitrarily large operands cannot overflow
 *   the call stack.
 *
 * @param {Rational} a - First rational operand `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Second rational operand `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact product in canonical lowest terms.
 * @throws {TypeError} If either operand is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If either operand has a zero denominator (`den === 0n`).
 */
export function multiplyRationalStable(a, b) {
	const ra = normalizeRational(a, 'a')
	const rb = normalizeRational(b, 'b')

	if (ra.num === 0n || rb.num === 0n) {
		return { num: 0n, den: 1n }
	}

	// Cross-cancel common factors before multiplication to minimize intermediate magnitude.
	const g1 = gcdBigInt(absBigInt(ra.num), rb.den)
	const g2 = gcdBigInt(absBigInt(rb.num), ra.den)

	const n1 = ra.num / g1
	const d2 = rb.den / g1
	const n2 = rb.num / g2
	const d1 = ra.den / g2

	return {
		num: n1 * n2,
		den: d1 * d2,
	}
}
