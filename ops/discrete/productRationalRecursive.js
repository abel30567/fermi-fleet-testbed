/**
 * Exact rational number represented as a numerator/denominator pair of BigInts.
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Normalizes a rational (num / den) to lowest terms with strictly positive
 * denominator (den > 0n). Zero is represented canonically as { num: 0n, den: 1n }.
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Multiplies two already-normalized rationals in lowest terms using
 * cross-cancellation so the returned rational is directly in lowest terms
 * with den > 0n.
 *
 * @param {Rational} left
 * @param {Rational} right
 * @returns {Rational}
 */
function multiplyNormalized(left, right) {
	if (left.num === 0n || right.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(left.num, right.den)
	const g2 = gcdBigInt(right.num, left.den)
	return {
		num: (left.num / g1) * (right.num / g2),
		den: (left.den / g2) * (right.den / g1),
	}
}

/**
 * Validates that the input is an array of valid rational objects with BigInt
 * `num` and non-zero BigInt `den`.
 *
 * @param {unknown} factors
 * @returns {asserts factors is Rational[]}
 */
function validateFactors(factors) {
	if (!Array.isArray(factors)) {
		throw new TypeError('factors must be an array of { num: bigint, den: bigint } objects')
	}
	for (let i = 0; i < factors.length; i++) {
		const item = factors[i]
		if (item === null || typeof item !== 'object') {
			throw new TypeError(`factors[${i}] must be a non-null object with BigInt num and den`)
		}
		if (typeof item.num !== 'bigint') {
			throw new TypeError(`factors[${i}].num must be a BigInt`)
		}
		if (typeof item.den !== 'bigint') {
			throw new TypeError(`factors[${i}].den must be a BigInt`)
		}
		if (item.den === 0n) {
			throw new RangeError(`factors[${i}].den must not be 0n`)
		}
	}
}

/**
 * Recursively computes the product of factors[start..end) via a balanced
 * binary product tree (divide-and-conquer).
 *
 * @param {Rational[]} factors
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Rational}
 */
function productRange(factors, start, end) {
	const len = end - start
	if (len === 0) {
		return { num: 1n, den: 1n }
	}
	if (len === 1) {
		const { num, den } = factors[start]
		return normalizeRational(num, den)
	}
	const mid = start + (len >>> 1)
	const left = productRange(factors, start, mid)
	if (left.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const right = productRange(factors, mid, end)
	return multiplyNormalized(left, right)
}

/**
 * Computes the exact discrete product of an array of rational numbers
 * represented as `{ num: BigInt, den: BigInt }` using a recursive
 * divide-and-conquer product tree.
 *
 * The empty product returns `{ num: 1n, den: 1n }`. Every result is normalized
 * to lowest terms (`gcd(|num|, den) === 1n`) with `den > 0n`, and any product
 * containing a zero factor returns `{ num: 0n, den: 1n }`.
 *
 * @param {Rational[]} factors - Array of exact rationals `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @returns {Rational} Exact product in lowest terms with `den > 0n`.
 * @throws {TypeError} If `factors` is not an array or any element lacks BigInt `num`/`den`.
 * @throws {RangeError} If any element has `den === 0n`.
 */
export function productRationalRecursive(factors) {
	validateFactors(factors)
	return productRange(factors, 0, factors.length)
}
