/**
 * Fixed-point scaling factor (10^18) used for non-integer fixed-point BigInt results.
 * A returned BigInt `y` represents the real value `y / 10^18`.
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Number of fractional binary digits extracted for the mantissa logarithm.
 * 128 fractional bits (~38.5 decimal digits) provide >20 decimal guard digits
 * beyond the 10^18 output scale so rounding to nearest 10^-18 is accurate.
 *
 * @type {bigint}
 */
const FRAC_BITS = 128n

/**
 * Internal binary fixed-point precision for mantissa squaring (160 bits).
 * Each squaring step incurs < 2^-160 truncation error, whose telescoped total
 * contribution to log2(m) is strictly < 2.9 * 2^-160.
 *
 * @type {bigint}
 */
const FRAC_PREC = 160n

const ONE_FP = 1n << FRAC_PREC
const TWO_SQ_FP = 1n << (2n * FRAC_PREC + 1n)
const HALF_FRAC_UNIT = 1n << (FRAC_BITS - 1n)

/**
 * Recursively finds the smallest power-of-two shift `s` such that `(n >> s) === 0n`.
 * Runs in O(log log n) recursive calls.
 *
 * @param {bigint} n - Positive BigInt.
 * @param {bigint} shift - Current power-of-two shift candidate.
 * @returns {bigint} Power-of-two upper bound on floor(log2(n)) + 1.
 */
function findShiftBoundRecursive(n, shift) {
	if ((n >> shift) === 0n) {
		return shift
	}
	return findShiftBoundRecursive(n, shift << 1n)
}

/**
 * Computes `floor(log2(n))` via recursive divide-and-conquer binary search over bit shifts.
 * Given `step` a power of two with `n < 2^(2 * step)`, halves the bit-position interval
 * at each recursive step in O(log log n) depth.
 *
 * @param {bigint} n - Positive BigInt.
 * @param {bigint} step - Current power-of-two shift to test (0n at base case).
 * @returns {bigint} Exact integer `floor(log2(n))`.
 */
function floorLog2DivideAndConquer(n, step) {
	if (step === 0n) {
		return 0n
	}
	const half = step >> 1n
	const hi = n >> step
	if (hi > 0n) {
		return step + floorLog2DivideAndConquer(hi, half)
	}
	return floorLog2DivideAndConquer(n, half)
}

/**
 * Recursively extracts `bitsRemaining` fractional binary digits of `log2(m / 2^FRAC_PREC)`
 * for `m` in `[2^FRAC_PREC, 2^(FRAC_PREC + 1) - 1]`, using the identity:
 *   log2(u) = (b + log2(u^2 / 2^b)) / 2, where b = 1 if u^2 >= 2 else 0.
 *
 * Short-circuits immediately when `m === ONE_FP` (exact power of two).
 * Recursion depth is bounded by `FRAC_BITS` (128).
 *
 * @param {bigint} m - Mantissa in Q(FRAC_PREC) fixed-point format, `ONE_FP <= m < 2 * ONE_FP`.
 * @param {bigint} bitsRemaining - Remaining fractional bits to extract.
 * @param {bigint} acc - Accumulated fractional bits.
 * @returns {bigint} Fractional part scaled by `2^FRAC_BITS`.
 */
function fractionalBitsRecursive(m, bitsRemaining, acc) {
	if (bitsRemaining === 0n || m === ONE_FP) {
		return acc << bitsRemaining
	}
	const sq = m * m
	if (sq >= TWO_SQ_FP) {
		return fractionalBitsRecursive(
			sq >> (FRAC_PREC + 1n),
			bitsRemaining - 1n,
			(acc << 1n) | 1n
		)
	}
	return fractionalBitsRecursive(
		sq >> FRAC_PREC,
		bitsRemaining - 1n,
		acc << 1n
	)
}

/**
 * Computes the base-2 logarithm `log2(n)` of a positive exact `BigInt`, returning a
 * fixed-point `BigInt` scaled by `SCALE = 10n ** 18n` (rounded to the nearest `10^-18`).
 *
 * Algorithm (genuinely recursive / divide-and-conquer, pure BigInt arithmetic):
 * 1. Integer part `k = floor(log2(n))` is found via recursive exponential bracketing
 *    followed by divide-and-conquer binary search over bit shifts (`O(log log n)` depth).
 * 2. Normalized mantissa `m = n / 2^k` in `[1, 2)` is represented in 160-bit binary
 *    fixed-point (`FRAC_PREC = 160n`).
 * 3. Fractional part `log2(m)` is computed recursively to 128 binary digits
 *    (`FRAC_BITS = 128n`) using repeated squaring and halving:
 *    `log2(u) = (b + log2(u^2 / 2^b)) / 2`.
 * 4. The high-precision binary fraction is converted to base-10 fixed-point (`10^18`)
 *    with half-up rounding and added to `k * SCALE`.
 *
 * @param {bigint} n - Positive integer input (`n > 0n`).
 * @returns {bigint} Fixed-point `BigInt` equal to `round(log2(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a `BigInt`.
 * @throws {RangeError} If `n <= 0n` (domain error for logarithm).
 */
export function log2BigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`)
	}
	if (n <= 0n) {
		throw new RangeError(`log2 domain error: expected positive BigInt (> 0n), received ${n}`)
	}

	const bound = findShiftBoundRecursive(n, 1n)
	const intPart = floorLog2DivideAndConquer(n, bound >> 1n)

	// Normalize n / 2^intPart into Q(FRAC_PREC) fixed-point [ONE_FP, 2 * ONE_FP).
	const mantissa =
		intPart <= FRAC_PREC
			? n << (FRAC_PREC - intPart)
			: n >> (intPart - FRAC_PREC)

	const fracBits = fractionalBitsRecursive(mantissa, FRAC_BITS, 0n)
	const fracScaled = (fracBits * SCALE + HALF_FRAC_UNIT) >> FRAC_BITS

	return intPart * SCALE + fracScaled
}
