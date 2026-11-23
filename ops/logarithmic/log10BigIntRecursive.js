/**
 * Fixed-point scale factor (10^18) for non-integer logarithmic results.
 */
const SCALE = 10n ** 18n;

/**
 * Internal working precision (10^40) used during recursive fractional
 * extraction so accumulated rounding error stays well below 10^-30.
 */
const WORK_PRECISION = 10n ** 40n;
const TEN_PRECISION = 10n * WORK_PRECISION;
const HALF_PRECISION = WORK_PRECISION >> 1n;

/**
 * Number of binary fractional bits extracted recursively (2^-120 ≈ 7.5e-37).
 */
const FRAC_BITS = 120;
const HALF_FRAC_UNIT = 1n << BigInt(FRAC_BITS - 1);

/**
 * Recursively computes `exp = floor(log10(n))` and `pow = 10^exp` via
 * divide-and-conquer repeated squaring of the base.
 *
 * Depth is O(log log n), keeping stack usage minimal even for inputs with
 * tens of thousands of digits.
 *
 * @param {bigint} n - Positive integer input.
 * @param {bigint} [base=10n] - Current power-of-10 chunk (`10^step`).
 * @param {bigint} [step=1n] - Exponent represented by `base`.
 * @returns {{ exp: bigint, pow: bigint }} Exact integer exponent and `10^exp`.
 */
function ilog10PowRecursive(n, base = 10n, step = 1n) {
	if (n < base) {
		return { exp: 0n, pow: 1n };
	}
	const { exp, pow } = ilog10PowRecursive(n, base * base, step * 2n);
	const nextPow = pow * base;
	if (n >= nextPow) {
		return { exp: exp + step, pow: nextPow };
	}
	return { exp, pow };
}

/**
 * Recursively extracts binary fractional bits of `log10(m / WORK_PRECISION)`
 * for `WORK_PRECISION <= m < 10 * WORK_PRECISION` using the identity:
 *
 *   log10(x) = 0.5 * log10(x^2)           if x^2 < 10
 *   log10(x) = 0.5 + 0.5 * log10(x^2/10)  if x^2 >= 10
 *
 * @param {bigint} m - Scaled mantissa in `[WORK_PRECISION, 10 * WORK_PRECISION)`.
 * @param {number} remainingBits - Number of binary fractional bits left to extract.
 * @param {bigint} [acc=0n] - Accumulated binary fractional bits.
 * @returns {bigint} Binary fixed-point fraction scaled by `2^FRAC_BITS`.
 */
function log10FracBitsRecursive(m, remainingBits, acc = 0n) {
	if (remainingBits === 0) {
		return acc;
	}
	const squared = (m * m + HALF_PRECISION) / WORK_PRECISION;
	if (squared >= TEN_PRECISION) {
		const nextM = (squared + 5n) / 10n;
		return log10FracBitsRecursive(nextM, remainingBits - 1, (acc << 1n) | 1n);
	}
	return log10FracBitsRecursive(squared, remainingBits - 1, acc << 1n);
}

/**
 * Computes the base-10 logarithm of an exact positive `BigInt` integer,
 * returned as a fixed-point `BigInt` scaled by `10^18` (rounded half-up to the
 * nearest integer unit of `10^-18`).
 *
 * Uses a recursive divide-and-conquer approach:
 * 1. Recursive exponentiation-by-squaring (`O(log log n)` depth) determines
 *    the integer part `k = floor(log10(n))` and exact `10^k`.
 * 2. Recursive repeated-squaring binary decomposition extracts the fractional
 *    part `log10(n / 10^k)` to 120 binary bits at `10^40` working precision.
 *
 * Exact powers of 10 return `k * 10n ** 18n` exactly.
 *
 * @param {bigint} n - A positive `BigInt` integer (`n > 0n`).
 * @returns {bigint} Fixed-point `BigInt` equal to `round(log10(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a `BigInt`.
 * @throws {RangeError} If `n <= 0n`.
 *
 * @example
 * log10BigIntRecursive(1n)     // 0n
 * log10BigIntRecursive(10n)    // 1000000000000000000n
 * log10BigIntRecursive(1000n)  // 3000000000000000000n
 * log10BigIntRecursive(2n)     // 301029995663981195n
 */
export function log10BigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`);
	}
	if (n <= 0n) {
		throw new RangeError('Input must be a positive BigInt (> 0n)');
	}

	const { exp, pow } = ilog10PowRecursive(n);
	if (n === pow) {
		return exp * SCALE;
	}

	const mantissa = (n * WORK_PRECISION + (pow >> 1n)) / pow;
	if (mantissa <= WORK_PRECISION) {
		return exp * SCALE;
	}
	if (mantissa >= TEN_PRECISION) {
		return (exp + 1n) * SCALE;
	}

	const fracBits = log10FracBitsRecursive(mantissa, FRAC_BITS);
	const fracScaled = (fracBits * SCALE + HALF_FRAC_UNIT) >> BigInt(FRAC_BITS);
	return exp * SCALE + fracScaled;
}
