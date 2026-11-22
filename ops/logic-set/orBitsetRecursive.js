/**
 * Computes the bitwise OR (set union) of two arbitrary-width non-negative BigInt
 * bitsets using a recursive divide-and-conquer algorithm over bit-width.
 *
 * The algorithm splits both operands at the midpoint bit position into high and
 * low halves, recursively computes the OR of each half down to a single-bit
 * base case (with short-circuit exits for zero and identical sub-bitsets), and
 * recombines the results via `(hi << mid) + lo`.
 *
 * Complexity: `O(log W)` recursion depth for maximum bit-width `W`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt representing the bitwise OR of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a BigInt.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function orBitsetRecursive(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError('Expected first argument "a" to be a BigInt')
	}
	if (typeof b !== 'bigint') {
		throw new TypeError('Expected second argument "b" to be a BigInt')
	}
	if (a < 0n) {
		throw new RangeError('Expected first argument "a" to be a non-negative BigInt bitset')
	}
	if (b < 0n) {
		throw new RangeError('Expected second argument "b" to be a non-negative BigInt bitset')
	}

	if (a === 0n) return b
	if (b === 0n) return a
	if (a === b) return a

	const maxVal = a > b ? a : b
	const width = BigInt(maxVal.toString(2).length)

	return orDivideAndConquer(a, b, width)
}

/**
 * Recursively computes the bitwise OR of non-negative bitsets `x` and `y`
 * bounded to `width` bits by dividing around the midpoint bit position.
 *
 * @param {bigint} x - First non-negative bitset (`0n <= x < 2n ** width`).
 * @param {bigint} y - Second non-negative bitset (`0n <= y < 2n ** width`).
 * @param {bigint} width - Bit-width bound (`width >= 1n`).
 * @returns {bigint} Bitwise OR of `x` and `y`.
 */
function orDivideAndConquer(x, y, width) {
	if (x === 0n) return y
	if (y === 0n) return x
	if (x === y) return x

	if (width <= 1n) {
		return x !== 0n || y !== 0n ? 1n : 0n
	}

	const mid = width >> 1n
	const lowMask = (1n << mid) - 1n

	const xHi = x >> mid
	const xLo = x & lowMask
	const yHi = y >> mid
	const yLo = y & lowMask

	const hi = orDivideAndConquer(xHi, yHi, width - mid)
	const lo = orDivideAndConquer(xLo, yLo, mid)

	return (hi << mid) + lo
}
