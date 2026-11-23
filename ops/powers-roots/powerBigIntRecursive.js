const FIXED_POINT_SCALE = 10n ** 18n;

/**
 * Recursive divide-and-conquer exponentiation by squaring for non-negative BigInt exponents.
 *
 * @param {bigint} base - The BigInt base.
 * @param {bigint} exp - Non-negative BigInt exponent.
 * @returns {bigint} Exact value of base^exp.
 */
function powRecursive(base, exp) {
	if (exp === 0n) {
		return 1n;
	}
	if (exp === 1n) {
		return base;
	}
	const half = powRecursive(base, exp >> 1n);
	const squared = half * half;
	return (exp & 1n) === 1n ? squared * base : squared;
}

/**
 * Computes `base` raised to the power of `exponent` over exact BigInt integers
 * using a recursive divide-and-conquer (exponentiation by squaring) algorithm.
 *
 * - For `exponent >= 0n`, returns the exact BigInt integer `base^exponent` (with `0n^0n === 1n`).
 * - For `exponent < 0n`, returns a fixed-point BigInt scaled by `10^18` representing
 *   `trunc(10^18 / base^|exponent|)` (truncated toward zero).
 *
 * @param {bigint} base - The BigInt base.
 * @param {bigint} exponent - The BigInt exponent (positive, zero, or negative).
 * @returns {bigint} Exact integer power for `exponent >= 0n`, or `10^18`-scaled fixed-point BigInt for `exponent < 0n`.
 * @throws {TypeError} If `base` or `exponent` is not a `bigint`.
 * @throws {RangeError} If `base === 0n` and `exponent < 0n` (division by zero).
 */
export function powerBigIntRecursive(base, exponent) {
	if (typeof base !== 'bigint') {
		throw new TypeError(`Expected base to be a bigint, got ${typeof base}`);
	}
	if (typeof exponent !== 'bigint') {
		throw new TypeError(`Expected exponent to be a bigint, got ${typeof exponent}`);
	}

	if (exponent === 0n) {
		return 1n;
	}

	if (base === 0n) {
		if (exponent < 0n) {
			throw new RangeError('Cannot raise 0n to a negative exponent (division by zero)');
		}
		return 0n;
	}

	if (base === 1n) {
		return exponent < 0n ? FIXED_POINT_SCALE : 1n;
	}

	if (base === -1n) {
		const sign = (exponent & 1n) === 0n ? 1n : -1n;
		return exponent < 0n ? sign * FIXED_POINT_SCALE : sign;
	}

	if (exponent > 0n) {
		return powRecursive(base, exponent);
	}

	const absExponent = -exponent;
	// Since |base| >= 2 and 2^60 = 1,152,921,504,606,846,976 > 10^18,
	// |base|^absExponent > 10^18 for all absExponent >= 60, so trunc(10^18 / denom) === 0n.
	if (absExponent >= 60n) {
		return 0n;
	}

	const denominator = powRecursive(base, absExponent);
	return FIXED_POINT_SCALE / denominator;
}
