/**
 * @typedef {object} Rational
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
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Normalizes a rational number to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num - Rational numerator.
 * @param {bigint} den - Rational denominator (must be non-zero).
 * @returns {Rational} Normalized rational `{ num, den }` with `den > 0n` and `gcd(|num|, den) === 1n`.
 * @throws {RangeError} If `den === 0n`.
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero.')
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
	const divisor = gcdBigInt(n, d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Recursively computes the product of all integers in the inclusive range `[low, high]`
 * using binary splitting (product-tree divide-and-conquer).
 *
 * Splitting the range in half yields `O(log n)` recursion depth and balanced operand sizes,
 * avoiding stack overflows while improving BigInt multiplication performance for large `n`.
 *
 * @param {bigint} low - Lower bound of the inclusive integer range.
 * @param {bigint} high - Upper bound of the inclusive integer range.
 * @returns {bigint} Product `low * (low + 1n) * ... * high`, or `1n` if `low > high`.
 */
function productRange(low, high) {
	if (low > high) {
		return 1n
	}
	if (low === high) {
		return low
	}
	if (high - low === 1n) {
		return low * high
	}
	const mid = (low + high) >> 1n
	return productRange(low, mid) * productRange(mid + 1n, high)
}

/**
 * Computes the discrete factorial `q!` for an exact rational number `q = { num, den }`
 * representing a non-negative integer, using a recursive binary-splitting (divide-and-conquer)
 * product tree.
 *
 * The input rational is first validated and normalized to lowest terms with `den > 0n`.
 * Unreduced integer rationals such as `{ num: 6n, den: 2n }` or `{ num: -6n, den: -2n }`
 * are accepted (both normalize to `3/1`, returning `3! = { num: 6n, den: 1n }`).
 * Negative rationals, non-integer rationals, and rationals with a zero denominator are rejected.
 *
 * @param {Rational} rational - Exact rational input `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact factorial result `{ num: bigint, den: bigint }` normalized to lowest terms with `den > 0n`.
 * @throws {TypeError} If `rational` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `rational.den === 0n`, or if the normalized value is negative or not an integer.
 */
export function factorialRationalRecursive(rational) {
	if (
		typeof rational !== 'object' ||
		rational === null ||
		Array.isArray(rational)
	) {
		throw new TypeError(
			'Expected an exact rational object with { num: bigint, den: bigint }.',
		)
	}

	const { num, den } = rational
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			'Rational num and den must both be bigint values.',
		)
	}

	const normalized = normalizeRational(num, den)

	if (normalized.den !== 1n) {
		throw new RangeError(
			`Discrete factorial requires an integer rational, received ${normalized.num}/${normalized.den}.`,
		)
	}

	if (normalized.num < 0n) {
		throw new RangeError(
			`Discrete factorial is undefined for negative integers, received ${normalized.num}.`,
		)
	}

	const n = normalized.num
	if (n <= 1n) {
		return normalizeRational(1n, 1n)
	}

	const result = productRange(2n, n)
	return normalizeRational(result, 1n)
}
