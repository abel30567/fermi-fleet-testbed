/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Non-zero denominator of the exact rational number.
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
 * Computes the greatest common divisor of two non-negative BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational number to canonical lowest terms with a positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Denominator must not be zero')
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Adds two normalized rational numbers and returns the sum in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return normalizeRational(num, den)
}

/**
 * Validates and normalizes an input rational number.
 *
 * @param {Rational} x
 * @returns {Rational}
 */
function validateRational(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input rational must be a non-null object with BigInt num and den properties')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	return normalizeRational(x.num, x.den)
}

/**
 * Computes sin(x) for an exact rational angle x (in radians) using a straightforward
 * iterative Maclaurin series expansion:
 *
 *   sin(x) ≈ Σ_{k=0}^{terms - 1} (-1)^k * x^(2k + 1) / (2k + 1)!
 *
 * Each term is computed iteratively from the previous term without recursion, and
 * intermediate results are reduced to canonical lowest terms.
 *
 * @param {Rational} x - Angle in radians as an exact rational `{ num: BigInt, den: BigInt }`.
 * @param {number} [terms=15] - Positive safe integer count of Maclaurin series terms to sum.
 * @returns {Rational} Exact rational approximation of sin(x) in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 * @throws {TypeError} If `x` is not an object with `BigInt` `num` and `den`, or if `terms` is not a number.
 * @throws {RangeError} If `x.den` is `0n`, or if `terms` is not a positive safe integer.
 */
export function sinRationalIterative(x, terms = 15) {
	const normalized = validateRational(x)

	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number')
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer')
	}

	if (normalized.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const xSqNum = normalized.num * normalized.num
	const xSqDen = normalized.den * normalized.den

	let term = { num: normalized.num, den: normalized.den }
	let sum = { num: normalized.num, den: normalized.den }

	for (let k = 1; k < terms; k++) {
		const twoK = 2n * BigInt(k)
		const factorDen = twoK * (twoK + 1n)
		term = normalizeRational(-term.num * xSqNum, term.den * xSqDen * factorDen)
		sum = addRational(sum, term)
	}

	return sum
}
