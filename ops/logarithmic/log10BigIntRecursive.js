/**
 * Fixed-point scaling factor (10^18) for non-integer BigInt logarithmic results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const GUARD_BITS = 128
const GUARD_BITS_BIG = BigInt(GUARD_BITS)
const GUARD_SCALE = 1n << GUARD_BITS_BIG
const TEN_GUARD_SCALE = 10n * GUARD_SCALE
const HALF_GUARD_UNIT = 1n << (GUARD_BITS_BIG - 1n)

/**
 * Divide-and-conquer computation of floor(log10(n)) and 10^floor(log10(n)).
 *
 * Uses exponential squaring of the base on the way down and binary narrowing
 * on the way back up, running in O(log log n) recursion depth.
 *
 * Invariant: returns { k, p } such that p === 10n ** k and p <= n < p * base.
 *
 * @param {bigint} n - Positive integer.
 * @param {bigint} base - Current power of 10 (10^exp).
 * @param {bigint} exp - Exponent corresponding to `base`.
 * @returns {{ k: bigint, p: bigint }}
 */
function intLog10DivideAndConquer(n, base, exp) {
	if (n < base) {
		return { k: 0n, p: 1n }
	}
	const { k, p } = intLog10DivideAndConquer(n, base * base, exp * 2n)
	const nextP = p * base
	if (n >= nextP) {
		return { k: k + exp, p: nextP }
	}
	return { k, p }
}

/**
 * Recursive binary interval bisection for the fractional part of log10(m),
 * where m represents a fixed-point value x = m / 2^GUARD_BITS in [1, 10).
 *
 * At each recursive step, squares x and checks whether x^2 >= 10:
 * - If x^2 >= 10, emits binary bit 1 and rescales x <- x^2 / 10.
 * - Otherwise, emits binary bit 0 and sets x <- x^2.
 *
 * Because the telescoping error across B steps is strictly bounded by
 * 2 / (2^GUARD_BITS * ln(10)) + 2^-B, with GUARD_BITS = 128 the fractional
 * error is < 6e-39 (~20 guard decimal digits beyond the 10^18 output scale).
 *
 * @param {bigint} m - Normalized mantissa in [GUARD_SCALE, 10 * GUARD_SCALE).
 * @param {number} bitsRemaining - Number of binary fractional bits left to extract.
 * @returns {bigint} Binary fractional representation scaled by 2^bitsRemaining.
 */
function fracLog10Recursive(m, bitsRemaining) {
	if (bitsRemaining === 0) {
		return 0n
	}
	const sq = (m * m) >> GUARD_BITS_BIG
	const nextBits = bitsRemaining - 1
	if (sq >= TEN_GUARD_SCALE) {
		return (1n << BigInt(nextBits)) | fracLog10Recursive(sq / 10n, nextBits)
	}
	return fracLog10Recursive(sq, nextBits)
}

/**
 * Computes the base-10 logarithm of a positive BigInt using recursive
 * divide-and-conquer algorithms, returning a fixed-point BigInt scaled by
 * `SCALE = 10n ** 18n` (rounded to the nearest integer).
 *
 * Algorithm:
 * 1. Integer part `k = floor(log10(n))` and `p = 10^k` are computed via
 *    divide-and-conquer exponent doubling and binary narrowing in O(log log n)
 *    recursion depth.
 * 2. If `n === p` (an exact power of 10), returns `k * SCALE` exactly.
 * 3. Otherwise, normalizes `n / p` into fixed-point mantissa `m` with 128 guard
 *    bits and recursively extracts 128 binary fractional bits of `log10(n / p)`
 *    via repeated squaring and base-10 range reduction, then rounds to `SCALE`.
 *
 * @param {bigint} n - Positive BigInt input (`n > 0n`).
 * @returns {bigint} `round(log10(n) * 10^18)` as a BigInt.
 * @throws {TypeError} If `n` is not a `bigint`.
 * @throws {RangeError} If `n <= 0n`.
 */
export function log10BigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a bigint, received ${typeof n}`)
	}
	if (n <= 0n) {
		throw new RangeError('log10BigIntRecursive is only defined for positive BigInts (n > 0n)')
	}

	const { k, p } = intLog10DivideAndConquer(n, 10n, 1n)
	if (n === p) {
		return k * SCALE
	}

	const m0 = (n << GUARD_BITS_BIG) / p
	const fracBits = fracLog10Recursive(m0, GUARD_BITS)
	const scaledFrac = (fracBits * SCALE + HALF_GUARD_UNIT) >> GUARD_BITS_BIG

	return k * SCALE + scaledFrac
}
