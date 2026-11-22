/**
 * Compute the greatest common divisor of two non-negative BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Validate an exact rational object `{ num: bigint, den: bigint }`, reduce it
 * to lowest terms with `den > 0n`, and verify it represents a non-negative integer.
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name
 * @returns {bigint} The non-negative integer value represented by the rational.
 */
function toNonNegativeInteger(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}

	let num = value.num
	let den = value.den
	if (den < 0n) {
		num = -num
		den = -den
	}

	if (num === 0n) {
		return 0n
	}

	const divisor = gcdBigInt(num, den)
	const reducedNum = num / divisor
	const reducedDen = den / divisor

	if (reducedDen !== 1n) {
		throw new RangeError(`${name} must represent an integer after reduction (got ${reducedNum}/${reducedDen})`)
	}
	if (reducedNum < 0n) {
		throw new RangeError(`${name} must be a non-negative integer (got ${reducedNum})`)
	}

	return reducedNum
}

/**
 * Compute the binomial coefficient C(n, k) = n! / (k! * (n - k)!) iteratively
 * over exact rationals represented as `{ num: BigInt, den: BigInt }`.
 *
 * Both `n` and `k` must be valid exact rationals representing non-negative
 * integers (after reduction to lowest terms, `den === 1n` and `num >= 0n`).
 * Returns `{ num: 0n, den: 1n }` when `k > n`.
 *
 * @param {{ num: bigint, den: bigint }} n - Total number of items (non-negative integer rational).
 * @param {{ num: bigint, den: bigint }} k - Number of chosen items (non-negative integer rational).
 * @returns {{ num: bigint, den: bigint }} Exact rational in lowest terms `{ num, den: 1n }`.
 * @throws {TypeError} If `n` or `k` is not an object with BigInt `num` and `den` fields.
 * @throws {RangeError} If `n` or `k` has zero denominator, is non-integer, or is negative.
 */
export function combinationsRationalIterative(n, k) {
	const nInt = toNonNegativeInteger(n, 'n')
	const kInt = toNonNegativeInteger(k, 'k')

	if (kInt > nInt) {
		return { num: 0n, den: 1n }
	}

	const complement = nInt - kInt
	const m = kInt < complement ? kInt : complement

	let result = 1n
	for (let i = 1n; i <= m; i += 1n) {
		result = (result * (nInt - i + 1n)) / i
	}

	return { num: result, den: 1n }
}
