/**
 * Fixed-point scale factor (10^18) used to represent fractional results
 * when raising a non-zero BigInt base to a negative exponent.
 */
const FIXED_POINT_SCALE = 1_000_000_000_000_000_000n

/**
 * Computes exact `base^exp` for `exp >= 0n` via the dyadic decomposition
 * (binary exponentiation) identity:
 *
 *   a^(sum_{k=0}^{m} b_k * 2^k) = prod_{k=0}^{m} (a^(2^k))^(b_k),  b_k in {0, 1}
 *
 * By the empty-product convention, `exp === 0n` always yields `1n`
 * (including `0n^0n === 1n`).
 *
 * @param {bigint} base - Exact BigInt base.
 * @param {bigint} exp - Non-negative BigInt exponent (`exp >= 0n`).
 * @returns {bigint} Exact BigInt value of `base^exp`.
 */
function powNonNegative(base, exp) {
	if (exp === 0n) {
		return 1n
	}
	if (base === 0n) {
		return 0n
	}
	if (base === 1n) {
		return 1n
	}
	if (base === -1n) {
		return (exp & 1n) === 0n ? 1n : -1n
	}

	let result = 1n
	let factor = base
	let remaining = exp

	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result *= factor
		}
		remaining >>= 1n
		if (remaining > 0n) {
			factor *= factor
		}
	}

	return result
}

/**
 * Computes `base` raised to the power `exp` over exact BigInt integers,
 * returning a fixed-point BigInt scaled by `10^18` for negative exponents.
 *
 * Algorithm / Identities:
 * - For `exp >= 0n`: evaluates exact `base^exp` using the binary exponentiation
 *   (dyadic decomposition) identity:
 *   `a^(sum_{k=0}^{m} b_k * 2^k) = prod_{k=0}^{m} (a^(2^k))^(b_k)` with `b_k in {0, 1}`,
 *   achieving O(log(exp)) multiplications. Follows the convention `0n^0n === 1n`.
 * - For `exp < 0n`: applies the reciprocal exponent identity `a^(-k) = 1 / a^k`
 *   scaled into fixed-point BigInt representation by `10^18`:
 *   `trunc(10^18 / base^|exp|)` (BigInt integer division truncating toward zero).
 *   For example, `powerBigIntSeries(2n, -1n)` returns `500_000_000_000_000_000n` (`0.5 * 10^18`),
 *   `powerBigIntSeries(1n, -5n)` returns `1_000_000_000_000_000_000n` (`1.0 * 10^18`),
 *   and values with `|base|^|exp| > 10^18` underflow to `0n`.
 *
 * @param {bigint} base - The BigInt base.
 * @param {bigint} exp - The BigInt exponent.
 * @returns {bigint} Exact BigInt `base^exp` when `exp >= 0n`, or fixed-point
 *   BigInt `trunc(10^18 / base^|exp|)` scaled by `10^18` when `exp < 0n`.
 * @throws {TypeError} If `base` or `exp` is not a `bigint`.
 * @throws {RangeError} If `base === 0n` and `exp < 0n` (division by zero).
 */
export function powerBigIntSeries(base, exp) {
	if (typeof base !== 'bigint') {
		throw new TypeError(`Expected "base" to be a bigint, received ${typeof base}`)
	}
	if (typeof exp !== 'bigint') {
		throw new TypeError(`Expected "exp" to be a bigint, received ${typeof exp}`)
	}

	if (exp >= 0n) {
		return powNonNegative(base, exp)
	}

	if (base === 0n) {
		throw new RangeError('Cannot raise 0n to a negative exponent (division by zero)')
	}

	const absExp = -exp

	if (base === 1n) {
		return FIXED_POINT_SCALE
	}
	if (base === -1n) {
		return (absExp & 1n) === 0n ? FIXED_POINT_SCALE : -FIXED_POINT_SCALE
	}

	const absBase = base < 0n ? -base : base
	// For |base| >= 2, |base|^absExp >= 2^60 > 10^18 whenever absExp >= 60,
	// and |base|^absExp >= |base| > 10^18 whenever |base| > 10^18.
	// In both cases, trunc(10^18 / base^absExp) === 0n.
	if (absBase > FIXED_POINT_SCALE || absExp >= 60n) {
		return 0n
	}

	const denominator = powNonNegative(base, absExp)
	return FIXED_POINT_SCALE / denominator
}
