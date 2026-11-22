/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number represented as a numerator and denominator of type `bigint`.
 * Outputs are always normalized to canonical lowest terms: `den > 0n`,
 * `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for zero.
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Computes the greatest common divisor of two non-negative BigInts using
 * the iterative Euclidean algorithm (safe against stack overflow for very
 * large integers).
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
 * Validates and normalizes a rational object to canonical lowest terms.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} has zero denominator`)
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
	if (g === 1n) {
		return { num: n, den: d }
	}
	return { num: n / g, den: d / g }
}

/**
 * Adds two normalized exact rationals using Knuth's GCD-scaled algorithm
 * (TAOCP Vol. 2, Section 4.5.1) to minimize intermediate BigInt growth
 * and guarantee a canonical lowest-terms result.
 *
 * Precondition: `a` and `b` are already normalized (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addNormalizedRationals(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}

	const d1 = gcdBigInt(a.den, b.den)
	if (d1 === 1n) {
		const num = a.num * b.den + b.num * a.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		// Since gcd(|a.num|, a.den) = 1, gcd(|b.num|, b.den) = 1, and gcd(a.den, b.den) = 1,
		// num is guaranteed to be coprime to a.den * b.den.
		return { num, den: a.den * b.den }
	}

	const aDenScaled = a.den / d1
	const bDenScaled = b.den / d1
	const t = a.num * bDenScaled + b.num * aDenScaled
	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	// Any common factor between t and lcm(a.den, b.den) = aDenScaled * b.den must divide d1.
	const d2 = gcdBigInt(t, d1)
	return {
		num: t / d2,
		den: aDenScaled * (b.den / d2),
	}
}

/**
 * Adds two vectors of exact rational numbers element-wise, returning a new
 * vector whose entries are exact rationals reduced to canonical lowest terms.
 *
 * Uses Knuth's GCD-scaled rational addition (TAOCP Vol. 2, §4.5.1) to prevent
 * unnecessary intermediate BigInt coefficient swell when denominators share
 * large common factors, while preserving exactness even under extreme dynamic
 * range or catastrophic cancellation.
 *
 * @param {readonly Rational[]} a - First input vector of exact rationals `{ num: bigint, den: bigint }`.
 * @param {readonly Rational[]} b - Second input vector of exact rationals `{ num: bigint, den: bigint }`.
 * @returns {Rational[]} New vector `c` of length `a.length` where `c[i] = a[i] + b[i]` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an array, or any entry is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a` and `b` have different lengths, or any entry has a zero denominator.
 */
export function vectorAddRationalStable(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of rationals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of rationals')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`)
	}

	const n = a.length
	/** @type {Rational[]} */
	const result = new Array(n)

	for (let i = 0; i < n; i++) {
		const ra = normalizeRational(a[i], `a[${i}]`)
		const rb = normalizeRational(b[i], `b[${i}]`)
		result[i] = addNormalizedRationals(ra, rb)
	}

	return result
}
