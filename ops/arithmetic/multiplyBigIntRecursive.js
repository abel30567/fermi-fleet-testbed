const BASE_BIT_LENGTH = 26

/**
 * Returns the bit length of a positive BigInt.
 *
 * @param {bigint} value - A positive BigInt.
 * @returns {number} Number of bits required to represent `value`.
 */
function bitLength(value) {
	return value.toString(2).length
}

/**
 * Recursive Karatsuba divide-and-conquer multiplication for non-negative BigInts.
 *
 * Splits operands at half the maximum bit length:
 *   x = xHigh * 2^m + xLow
 *   y = yHigh * 2^m + yLow
 *   x * y = z2 * 2^(2m) + z1 * 2^m + z0
 * where:
 *   z2 = xHigh * yHigh
 *   z0 = xLow * yLow
 *   z1 = (xLow + xHigh) * (yLow + yHigh) - z2 - z0
 *
 * @param {bigint} x - Non-negative multiplicand.
 * @param {bigint} y - Non-negative multiplier.
 * @returns {bigint} Exact product `x * y`.
 */
function karatsuba(x, y) {
	if (x === 0n || y === 0n) return 0n
	if (x === 1n) return y
	if (y === 1n) return x

	const maxBits = Math.max(bitLength(x), bitLength(y))
	if (maxBits <= BASE_BIT_LENGTH) {
		return BigInt(Number(x) * Number(y))
	}

	const half = BigInt(maxBits >> 1)
	const mask = (1n << half) - 1n

	const xLow = x & mask
	const xHigh = x >> half
	const yLow = y & mask
	const yHigh = y >> half

	const z0 = karatsuba(xLow, yLow)
	const z2 = karatsuba(xHigh, yHigh)
	const z1 = karatsuba(xLow + xHigh, yLow + yHigh) - z2 - z0

	return (z2 << (half << 1n)) + (z1 << half) + z0
}

/**
 * Multiplies two exact BigInt integers using recursive Karatsuba
 * divide-and-conquer multiplication.
 *
 * Handles positive, negative, and zero operands cleanly, recursively
 * splitting large BigInts at half bit-length down to a base case.
 *
 * @param {bigint} a - The multiplicand (must be a BigInt).
 * @param {bigint} b - The multiplier (must be a BigInt).
 * @returns {bigint} The exact BigInt product of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 */
export function multiplyBigIntRecursive(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError(
			`multiplyBigIntRecursive requires BigInt arguments, received (${typeof a}, ${typeof b})`
		)
	}

	if (a === 0n || b === 0n) {
		return 0n
	}

	const isNegative = (a < 0n) !== (b < 0n)
	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b

	const product = karatsuba(absA, absB)
	return isNegative ? -product : product
}
