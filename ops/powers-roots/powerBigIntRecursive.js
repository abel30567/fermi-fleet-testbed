const FIXED_POINT_SCALE = 10n ** 18n
const MAX_NEGATIVE_EXP_FOR_NON_UNIT_BASE = 60n

/**
 * Recursive divide-and-conquer exponentiation by squaring for non-negative BigInt exponents.
 *
 * @param {bigint} base
 * @param {bigint} exp - Non-negative BigInt exponent (`exp >= 0n`).
 * @returns {bigint} Exact `base ** exp`.
 */
function powNonNegativeRecursive(base, exp) {
	if (exp === 0n) {
		return 1n
	}
	if (exp === 1n) {
		return base
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

	const half = powNonNegativeRecursive(base, exp >> 1n)
	const squared = half * half
	return (exp & 1n) === 0n ? squared : squared * base
}

/**
 * Computes `base` raised to `exp` over exact `BigInt` values using recursive
 * exponentiation by squaring (divide-and-conquer, O(log |exp|) multiplications).
 *
 * - For non-negative exponents (`exp >= 0n`), returns the exact `BigInt` value `base ** exp`
 *   (with `0n ** 0n === 1n`).
 * - For negative exponents (`exp < 0n`), where results may be non-integer, returns a
 *   fixed-point `BigInt` scaled by `10n ** 18n`, specifically `10n ** 18n / (base ** (-exp))`
 *   using standard `BigInt` division (truncating toward zero).
 *
 * @param {bigint} base - The BigInt base.
 * @param {bigint} exp - The BigInt exponent.
 * @returns {bigint} Exact `base ** exp` for `exp >= 0n`, or `10n ** 18n / (base ** (-exp))` for `exp < 0n`.
 * @throws {TypeError} If `base` or `exp` is not a `bigint`.
 * @throws {RangeError} If `base === 0n` and `exp < 0n` (division by zero).
 */
export function powerBigIntRecursive(base, exp) {
	if (typeof base !== 'bigint') {
		throw new TypeError(`Expected base to be a BigInt, received ${typeof base}`)
	}
	if (typeof exp !== 'bigint') {
		throw new TypeError(`Expected exponent to be a BigInt, received ${typeof exp}`)
	}

	if (exp === 0n) {
		return 1n
	}

	if (exp < 0n) {
		if (base === 0n) {
			throw new RangeError('Cannot raise 0n to a negative exponent')
		}
		const positiveExp = -exp
		// For |base| >= 2 and positiveExp >= 60, |base ** positiveExp| >= 2^60 > 10^18,
		// so fixed-point division 10^18 / (base ** positiveExp) truncates to 0n.
		if (base !== 1n && base !== -1n && positiveExp >= MAX_NEGATIVE_EXP_FOR_NON_UNIT_BASE) {
			return 0n
		}
		const denominator = powNonNegativeRecursive(base, positiveExp)
		return FIXED_POINT_SCALE / denominator
	}

	return powNonNegativeRecursive(base, exp)
}
