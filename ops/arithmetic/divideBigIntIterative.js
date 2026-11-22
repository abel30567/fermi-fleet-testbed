const FIXED_POINT_SCALE = 10n ** 18n

/**
 * Divides two exact BigInt integers using a straightforward iterative binary
 * long-division algorithm (shift-and-subtract), returning a fixed-point BigInt
 * scaled by 10^18 (truncated toward zero).
 *
 * For inputs `a` and `b` (`b !== 0n`), the returned quotient `q` satisfies:
 * - `q === (a * 10n ** 18n) / b` (truncated toward zero)
 * - `|q * b - a * 10n ** 18n| < |b|`
 *
 * @param {bigint} a - The dividend (exact BigInt integer).
 * @param {bigint} b - The divisor (non-zero exact BigInt integer).
 * @returns {bigint} The fixed-point quotient scaled by 10^18, truncated toward zero.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `b` is `0n` (division by zero).
 */
export function divideBigIntIterative(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError('Both arguments a and b must be BigInt values')
	}

	if (b === 0n) {
		throw new RangeError('Division by zero: divisor b must not be 0n')
	}

	if (a === 0n) {
		return 0n
	}

	const isNegative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b

	let remainder = absA * FIXED_POINT_SCALE
	let quotient = 0n

	if (remainder >= absB) {
		let shiftedDivisor = absB
		let bit = 1n

		while ((shiftedDivisor << 1n) <= remainder) {
			shiftedDivisor <<= 1n
			bit <<= 1n
		}

		while (bit > 0n) {
			if (remainder >= shiftedDivisor) {
				remainder -= shiftedDivisor
				quotient += bit
			}
			shiftedDivisor >>= 1n
			bit >>= 1n
		}
	}

	return isNegative ? -quotient : quotient
}
