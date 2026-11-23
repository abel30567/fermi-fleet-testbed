/**
 * Computes the greatest common divisor of two BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
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
 * Validates and normalizes an exact rational `{ num: bigint, den: bigint }`
 * into lowest terms with a strictly positive denominator (`den > 0n`).
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name Parameter name for error messages.
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = num * sign
	const posDen = den * sign
	if (signedNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcdBigInt(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Validates that a rational represents a non-negative integer and extracts its BigInt value.
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name Parameter name for error messages.
 * @returns {bigint}
 */
function extractNonNegativeInteger(value, name) {
	const r = normalizeRational(value, name)
	if (r.den !== 1n) {
		throw new RangeError(`${name} must represent an exact integer (got ${r.num}/${r.den})`)
	}
	if (r.num < 0n) {
		throw new RangeError(`${name} must be non-negative (got ${r.num})`)
	}
	return r.num
}

/**
 * Computes the contiguous integer product `low * (low + 1) * ... * high`
 * using balanced binary splitting so intermediate products remain balanced in bit-length
 * and recursion depth stays O(log(high - low + 1)).
 *
 * @param {bigint} low Lower bound (inclusive).
 * @param {bigint} high Upper bound (inclusive).
 * @returns {bigint}
 */
function productRange(low, high) {
	if (low > high) return 1n
	if (low === high) return low
	if (high - low === 1n) return low * high
	const mid = low + ((high - low) >> 1n)
	return productRange(low, mid) * productRange(mid + 1n, high)
}

/**
 * Computes exact k-permutations P(n, k) = n! / (n - k)! over exact rationals
 * `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`).
 *
 * Implementation notes:
 * - Evaluates the falling factorial `n * (n - 1) * ... * (n - k + 1)` directly via
 *   balanced binary splitting rather than computing `n!` and `(n - k)!` separately,
 *   avoiding catastrophic intermediate blowup when `k << n` and balancing operand
 *   bit-widths for large products.
 * - Accepts any exact rational representation of non-negative integers (including
 *   unreduced fractions or negative denominators such as `{ num: -10n, den: -2n }`).
 * - Follows standard combinatorics conventions:
 *   - `P(n, 0) = 1` for all integers `n >= 0` (including `P(0, 0) = 1`).
 *   - `P(n, n) = n!`.
 *   - `P(n, k) = 0` (`{ num: 0n, den: 1n }`) whenever `k > n`.
 *
 * @param {{ num: bigint, den: bigint }} n Total number of items (non-negative integer rational).
 * @param {{ num: bigint, den: bigint }} k Number of items selected in order (non-negative integer rational).
 * @returns {{ num: bigint, den: bigint }} Exact rational P(n, k) in lowest terms with `den > 0n`.
 * @throws {TypeError} If `n` or `k` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `n` or `k` has zero denominator, is non-integer, or is negative.
 */
export function permutationsRationalStable(n, k) {
	const nInt = extractNonNegativeInteger(n, 'n')
	const kInt = extractNonNegativeInteger(k, 'k')

	if (kInt === 0n) {
		return { num: 1n, den: 1n }
	}
	if (kInt > nInt) {
		return { num: 0n, den: 1n }
	}
	if (kInt === 1n) {
		return { num: nInt, den: 1n }
	}

	const result = productRange(nInt - kInt + 1n, nInt)
	return { num: result, den: 1n }
}
