/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number represented as a numerator and denominator of `bigint`s.
 * Canonical outputs are reduced to lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 */

/**
 * Compute the greatest common divisor of two non-negative BigInts iteratively.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Greatest common divisor of `a` and `b`.
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
 * Validate and normalize an exact rational input to lowest terms with `den > 0n`,
 * then ensure it represents a non-negative integer (`den === 1n` and `num >= 0n`).
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} name - Parameter name for error messages.
 * @returns {bigint} The non-negative integer value represented by `value`.
 * @throws {TypeError} If `value` is not a plain object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `den === 0n`, or the reduced rational is non-integral or negative.
 */
function validateNonNegativeIntegerRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}

	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}

	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}

	let normNum = num
	let normDen = den
	if (normDen < 0n) {
		normNum = -normNum
		normDen = -normDen
	}

	if (normNum === 0n) {
		return 0n
	}

	const absNum = normNum < 0n ? -normNum : normNum
	const g = gcdBigInt(absNum, normDen)
	normNum /= g
	normDen /= g

	if (normDen !== 1n) {
		throw new RangeError(`${name} must represent an integer (reduced denominator is ${normDen}n)`)
	}

	if (normNum < 0n) {
		throw new RangeError(`${name} must be a non-negative integer (got ${normNum}n)`)
	}

	return normNum
}

/**
 * Compute the number of k-permutations of n distinct items, `P(n, k) = n! / (n - k)!`,
 * using a straightforward iterative falling-factorial product over exact rationals.
 *
 * Both `n` and `k` must be valid exact rationals `{ num: BigInt, den: BigInt }` that,
 * after reduction to lowest terms, represent non-negative integers (`den === 1n` and `num >= 0n`).
 *
 * Following the standard combinatorial convention, when `k > n`, `P(n, k)` returns
 * `{ num: 0n, den: 1n }`. Otherwise it iteratively computes `n * (n - 1) * ... * (n - k + 1)`
 * and returns `{ num: result, den: 1n }`.
 *
 * @param {Rational} n - Total number of distinct items as a non-negative integer rational.
 * @param {Rational} k - Number of items to arrange as a non-negative integer rational.
 * @returns {Rational} Exact rational `{ num: bigint, den: 1n }` in lowest terms representing `P(n, k)`.
 * @throws {TypeError} If `n` or `k` is not a rational object with `bigint` `num` and `den`.
 * @throws {RangeError} If `n` or `k` has a zero denominator, is non-integral, or is negative.
 */
export function permutationsRationalIterative(n, k) {
	const nInt = validateNonNegativeIntegerRational(n, 'n')
	const kInt = validateNonNegativeIntegerRational(k, 'k')

	if (kInt > nInt) {
		return { num: 0n, den: 1n }
	}

	let result = 1n
	for (let i = 0n; i < kInt; i += 1n) {
		result *= nInt - i
	}

	return { num: result, den: 1n }
}
