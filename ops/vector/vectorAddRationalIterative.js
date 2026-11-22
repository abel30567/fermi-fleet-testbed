/**
 * Exact rational vector addition using an iterative loop and iterative Euclidean GCD.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two non-negative BigInts iteratively
 * via the Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor of a and b.
 */
function gcdIterative(a, b) {
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
 * Validates that a value is a well-formed exact rational `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational value.
 * @param {string} label - Descriptive label for error messages.
 * @throws {TypeError} If value is not an object with bigint `num` and `den` properties.
 * @throws {RangeError} If `den` is `0n`.
 */
function assertRational(value, label) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${label} must be a non-null object with bigint num and den`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`)
	}
}

/**
 * Adds two equal-length vectors of exact rationals `{ num: bigint, den: bigint }`,
 * returning a new vector whose entries are reduced to lowest terms with `den > 0n`.
 *
 * Uses a straightforward iterative loop over indices and an iterative Euclidean GCD
 * for exact fraction reduction. Input vectors and their elements are not mutated.
 *
 * @param {readonly Rational[]} a - First rational vector.
 * @param {readonly Rational[]} b - Second rational vector (same length as `a`).
 * @returns {Rational[]} Component-wise sum in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 *   and `{ num: 0n, den: 1n }` for zero entries).
 * @throws {TypeError} If `a` or `b` is not an Array, or any element is not `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If `a` and `b` have different lengths, or any element has `den === 0n`.
 */
export function vectorAddRationalIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an Array of rationals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an Array of rationals')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector lengths must match (got ${a.length} and ${b.length})`)
	}

	const len = a.length
	const result = new Array(len)

	for (let i = 0; i < len; i += 1) {
		const left = a[i]
		const right = b[i]
		assertRational(left, `a[${i}]`)
		assertRational(right, `b[${i}]`)

		let num = left.num * right.den + right.num * left.den
		let den = left.den * right.den

		if (num === 0n) {
			result[i] = { num: 0n, den: 1n }
			continue
		}

		if (den < 0n) {
			num = -num
			den = -den
		}

		const absNum = num < 0n ? -num : num
		const divisor = gcdIterative(absNum, den)
		result[i] = { num: num / divisor, den: den / divisor }
	}

	return result
}
