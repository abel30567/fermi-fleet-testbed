/**
 * Default fixed-point scaling factor (10^18).
 * @type {bigint}
 */
export const FIXED_POINT_SCALE = 10n ** 18n

/**
 * Computes the exact fixed-point quotient `roundHalfToEven((dividend * scale) / divisor)`
 * over arbitrary-precision BigInt integers with zero floating-point intermediate loss.
 *
 * Uses integer/fractional decomposition (`dividend = qInt * divisor + rInt`) with exact
 * remainder tracking (`2 * remainder` vs `|divisor|`) to perform unbiased round-half-to-even
 * (banker's rounding). The returned value `q` always satisfies the exact error bound:
 *
 *   |q * divisor - dividend * scale| <= |divisor| / 2
 *
 * with exact ties (`2 * |q * divisor - dividend * scale| === |divisor|`) broken to an even `q`.
 *
 * @param {bigint} dividend - The integer numerator.
 * @param {bigint} divisor - The non-zero integer denominator.
 * @param {bigint} [scale=FIXED_POINT_SCALE] - Positive fixed-point scale factor (defaults to 10^18).
 * @returns {bigint} The scaled quotient rounded half-to-even.
 * @throws {TypeError} If `dividend`, `divisor`, or `scale` is not a BigInt.
 * @throws {RangeError} If `divisor` is `0n` or `scale` is not strictly positive (`<= 0n`).
 */
export function divideBigIntStable(dividend, divisor, scale = FIXED_POINT_SCALE) {
	if (typeof dividend !== 'bigint') {
		throw new TypeError(`Expected dividend to be a BigInt, received ${typeof dividend}`)
	}
	if (typeof divisor !== 'bigint') {
		throw new TypeError(`Expected divisor to be a BigInt, received ${typeof divisor}`)
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError(`Expected scale to be a BigInt, received ${typeof scale}`)
	}
	if (scale <= 0n) {
		throw new RangeError('Expected scale to be a positive BigInt (> 0n)')
	}
	if (divisor === 0n) {
		throw new RangeError('Division by zero')
	}

	if (dividend === 0n) {
		return 0n
	}

	const isNegative = (dividend < 0n) !== (divisor < 0n)
	const absDividend = dividend < 0n ? -dividend : dividend
	const absDivisor = divisor < 0n ? -divisor : divisor

	// Decompose absDividend = qInt * absDivisor + rInt (0 <= rInt < absDivisor)
	// so only the bounded remainder is multiplied by scale before the fractional division.
	const qInt = absDividend / absDivisor
	const rInt = absDividend % absDivisor

	const scaledRemainder = rInt * scale
	const qFrac = scaledRemainder / absDivisor
	const remainder = scaledRemainder % absDivisor

	let quotient = qInt * scale + qFrac

	// Exact unbiased round-half-to-even comparison without float conversion:
	// remainder / absDivisor  <=>  1 / 2   iff   2 * remainder  <=>  absDivisor
	const twiceRemainder = remainder << 1n
	if (twiceRemainder > absDivisor || (twiceRemainder === absDivisor && (quotient & 1n) === 1n)) {
		quotient += 1n
	}

	if (quotient === 0n) {
		return 0n
	}

	return isNegative ? -quotient : quotient
}
