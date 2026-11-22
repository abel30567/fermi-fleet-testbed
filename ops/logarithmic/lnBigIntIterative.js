const OUTPUT_DECIMALS = 18n
const BASE_GUARD_DECIMALS = 18n

/**
 * Returns the bit length of a positive BigInt.
 *
 * @param {bigint} x - Strictly positive BigInt.
 * @returns {number} Number of bits required to represent `x`.
 */
function bitLength(x) {
	const hex = x.toString(16)
	const leadingNibble = Number.parseInt(hex[0], 16)
	return (hex.length - 1) * 4 + (32 - Math.clz32(leadingNibble))
}

/**
 * Computes `2 * atanh(absNum / den)` scaled by `internalScale` using the
 * iterative Taylor series:
 *
 *   2 * atanh(y) = 2 * sum_{k >= 0} y^(2k + 1) / (2k + 1)
 *
 * Requires `0 <= absNum < den`.
 *
 * @param {bigint} absNum - Non-negative numerator strictly less than `den`.
 * @param {bigint} den - Strictly positive denominator.
 * @param {bigint} internalScale - Fixed-point scaling factor (`10n ** decimals`).
 * @returns {bigint} Fixed-point approximation of `2 * atanh(absNum / den) * internalScale`.
 */
function atanh2Scaled(absNum, den, internalScale) {
	if (absNum === 0n) {
		return 0n
	}

	const yScaled = (absNum * internalScale + den / 2n) / den
	if (yScaled === 0n) {
		return 0n
	}

	const y2Scaled = (yScaled * yScaled + internalScale / 2n) / internalScale
	let sum = 0n
	let term = yScaled
	let denom = 1n

	while (term > 0n) {
		const contrib = term / denom
		if (contrib === 0n) {
			break
		}
		sum += contrib
		term = (term * y2Scaled) / internalScale
		denom += 2n
	}

	return 2n * sum
}

/**
 * Computes the natural logarithm `ln(x)` of a strictly positive `BigInt`,
 * returning a fixed-point `BigInt` scaled by `10n ** 18n` (rounded to the
 * nearest unit in the 18th decimal place).
 *
 * Algorithm:
 * 1. Range-reduces `x` by a power of two `2^exp` so that `m = x / 2^exp` lies
 *    in `[3/4, 3/2)`. Then `ln(x) = exp * ln(2) + ln(m)` and
 *    `y = (m - 1) / (m + 1) = (x - 2^exp) / (x + 2^exp)` satisfies `|y| < 1/5`.
 * 2. Evaluates `ln(2) = 2 * atanh(1/3)` and `ln(m) = 2 * atanh(y)` iteratively
 *    via the Taylor series `2 * sum_{k >= 0} y^(2k + 1) / (2k + 1)` using extra
 *    guard digits (scaled with the magnitude of `exp`) to prevent rounding drift.
 * 3. Rounds the combined fixed-point value back to `10^18` scale.
 *
 * @param {bigint} x - Strictly positive integer input (`x > 0n`).
 * @returns {bigint} Natural logarithm of `x` as a fixed-point `BigInt` scaled by `10n ** 18n`.
 * @throws {TypeError} If `x` is not a `BigInt`.
 * @throws {RangeError} If `x <= 0n`.
 */
export function lnBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof x}`)
	}
	if (x <= 0n) {
		throw new RangeError(`Expected a strictly positive BigInt (x > 0n), received ${x}`)
	}
	if (x === 1n) {
		return 0n
	}

	let exp = BigInt(bitLength(x) - 1)
	let powerOfTwo = 1n << exp

	if (2n * x >= 3n * powerOfTwo) {
		exp += 1n
		powerOfTwo <<= 1n
	}

	const expDigits = BigInt(exp.toString().length)
	const guardDecimals = BASE_GUARD_DECIMALS + expDigits
	const internalScale = 10n ** (OUTPUT_DECIMALS + guardDecimals)
	const guardScale = 10n ** guardDecimals

	const ln2 = atanh2Scaled(1n, 3n, internalScale)

	const diff = x - powerOfTwo
	const den = x + powerOfTwo
	const lnM =
		diff >= 0n
			? atanh2Scaled(diff, den, internalScale)
			: -atanh2Scaled(-diff, den, internalScale)

	const raw = exp * ln2 + lnM
	return (raw + guardScale / 2n) / guardScale
}
