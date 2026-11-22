const SCALE = 10n ** 18n
const SCALE_SQUARED = SCALE * SCALE

/**
 * Computes the square root of a non-negative BigInt using an iterative
 * Newton-Raphson (Heron's) method, returning a fixed-point BigInt scaled by
 * `10^18` (truncated toward zero: `floor(sqrt(x * 10^36))`).
 *
 * For an exact integer input `x >= 0n`, the returned value `r` satisfies:
 * `r^2 <= x * 10^36 < (r + 1)^2`, so `r / 10^18` equals `sqrt(x)` truncated
 * to 18 fractional decimal digits.
 *
 * @param {bigint} value - Non-negative BigInt radicand.
 * @returns {bigint} Fixed-point square root scaled by `10n ** 18n`.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative.
 *
 * @example
 * sqrtBigIntIterative(4n) // 2000000000000000000n (2.0)
 * sqrtBigIntIterative(2n) // 1414213562373095048n (1.414213562373095048)
 */
export function sqrtBigIntIterative(value) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`Expected a bigint, received ${typeof value}`)
	}
	if (value < 0n) {
		throw new RangeError('Cannot compute square root of a negative bigint')
	}
	if (value === 0n) {
		return 0n
	}

	const scaled = value * SCALE_SQUARED

	// Upper-bound power-of-two initial estimate: 2^ceil(bitLength / 2) >= floor(sqrt(scaled))
	const bitLength = BigInt(scaled.toString(2).length)
	let guess = 1n << ((bitLength + 1n) >> 1n)
	let next = (guess + scaled / guess) >> 1n

	// Because guess starts >= floor(sqrt(scaled)), Heron's integer iteration
	// decreases strictly until guess === floor(sqrt(scaled)), where next >= guess.
	while (next < guess) {
		guess = next
		next = (guess + scaled / guess) >> 1n
	}

	return guess
}
