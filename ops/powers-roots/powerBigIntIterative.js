/**
 * Scale factor (10^18) applied to fixed-point BigInt results when raising
 * a non-zero BigInt base to a negative BigInt exponent.
 */
const FIXED_POINT_SCALE = 10n ** 18n

/**
 * Raises a BigInt `base` to a BigInt `exponent` using straightforward iterative
 * exponentiation by squaring.
 *
 * - For `exponent >= 0n`, returns the exact integer result `base ** exponent`
 *   as a `BigInt` (with `0n ** 0n === 1n`).
 * - For `exponent < 0n` (where results are generally non-integer), returns a
 *   fixed-point `BigInt` scaled by `10n ** 18n`, computed via truncated BigInt
 *   division `10n ** 18n / (base ** (-exponent))` (truncating toward zero).
 *
 * @param {bigint} base - The base integer. Must be a `bigint`.
 * @param {bigint} exponent - The exponent integer. Must be a `bigint`.
 * @returns {bigint} Exact BigInt power for `exponent >= 0n`, or fixed-point
 *   BigInt scaled by `10^18` for `exponent < 0n`.
 * @throws {TypeError} If `base` or `exponent` is not a `bigint`.
 * @throws {RangeError} If `base === 0n` and `exponent < 0n` (division by zero).
 */
export function powerBigIntIterative(base, exponent) {
	if (typeof base !== 'bigint') {
		throw new TypeError(`base must be a bigint, received ${typeof base}`)
	}
	if (typeof exponent !== 'bigint') {
		throw new TypeError(`exponent must be a bigint, received ${typeof exponent}`)
	}
	if (base === 0n && exponent < 0n) {
		throw new RangeError('Cannot raise 0n to a negative exponent')
	}

	if (exponent >= 0n) {
		let result = 1n
		let factor = base
		let remaining = exponent

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

	// Negative exponent: compute fixed-point 10^18 / (base ** |exponent|)
	let denom = 1n
	let factor = base
	let remaining = -exponent

	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			denom *= factor
			if (denom > FIXED_POINT_SCALE || denom < -FIXED_POINT_SCALE) {
				return 0n
			}
		}
		remaining >>= 1n
		if (remaining > 0n) {
			factor *= factor
			if (factor > FIXED_POINT_SCALE || factor < -FIXED_POINT_SCALE) {
				return 0n
			}
		}
	}

	return FIXED_POINT_SCALE / denom
}
