/**
 * Exact rational number in lowest terms.
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
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
 * Validates and reduces a rational `{ num: bigint, den: bigint }` to lowest terms
 * with a strictly positive denominator.
 *
 * @param {Rational} value - Rational input to validate and normalize.
 * @param {string} name - Parameter name used in error messages.
 * @returns {Rational} Normalized rational in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `value.den === 0n`.
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}

	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}

	const divisor = gcd(n, d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Validates that a rational represents a non-negative integer and returns its BigInt value.
 *
 * @param {Rational} value - Rational input.
 * @param {string} name - Parameter name used in error messages.
 * @returns {bigint} Non-negative integer value.
 * @throws {TypeError} If `value` is not a valid rational object.
 * @throws {RangeError} If `value` has zero denominator, is not an integer, or is negative.
 */
function toNonNegativeInteger(value, name) {
	const normalized = normalizeRational(value, name)
	if (normalized.den !== 1n) {
		throw new RangeError(`${name} must represent an integer, got ${normalized.num}/${normalized.den}`)
	}
	if (normalized.num < 0n) {
		throw new RangeError(`${name} must be non-negative, got ${normalized.num}`)
	}
	return normalized.num
}

/**
 * Computes the exact binomial coefficient (combinations) `C(n, k)` over exact rationals
 * represented as `{ num: bigint, den: bigint }` in lowest terms, using a straightforward
 * iterative multiplicative algorithm.
 *
 * Both `n` and `k` must represent non-negative integers (unreduced forms such as
 * `{ num: 10n, den: 2n }` or `{ num: -6n, den: -3n }` are accepted and reduced first).
 * When `k > n`, returns `{ num: 0n, den: 1n }`.
 *
 * @param {Rational} n - Total number of items (non-negative integer rational).
 * @param {Rational} k - Number of chosen items (non-negative integer rational).
 * @returns {Rational} Exact combination `C(n, k)` as `{ num: bigint, den: 1n }` in lowest terms.
 * @throws {TypeError} If `n` or `k` is not a rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `n` or `k` has zero denominator, is non-integer, or is negative.
 */
export function combinationsRationalIterative(n, k) {
	const nInt = toNonNegativeInteger(n, 'n')
	const kInt = toNonNegativeInteger(k, 'k')

	if (kInt > nInt) {
		return { num: 0n, den: 1n }
	}
	if (kInt === 0n || kInt === nInt) {
		return { num: 1n, den: 1n }
	}

	const m = kInt < nInt - kInt ? kInt : nInt - kInt
	let result = 1n
	for (let i = 1n; i <= m; i++) {
		result = (result * (nInt - m + i)) / i
	}

	return { num: result, den: 1n }
}
