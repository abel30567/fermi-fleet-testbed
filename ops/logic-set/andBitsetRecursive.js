/**
 * Computes the bit-length (minimum number of bits required to represent) a
 * non-negative BigInt. Returns 0 for 0n.
 *
 * @param {bigint} n - Non-negative BigInt value.
 * @returns {number} Number of significant bits in `n`.
 */
function bitLength(n) {
	if (n === 0n) {
		return 0
	}
	const hex = n.toString(16)
	const topNibble = Number.parseInt(hex[0], 16)
	const topBits = 32 - Math.clz32(topNibble)
	return (hex.length - 1) * 4 + topBits
}

/**
 * Recursive divide-and-conquer bitwise AND over two non-negative BigInts
 * bounded by `width` bits (`0n <= a, b < (1n << BigInt(width))`).
 *
 * Splits both operands around the midpoint bit position into high and low
 * halves, recurses on each half down to the single-bit base case, and
 * recombines the result via `(hi << mid) | lo`.
 *
 * @param {bigint} a - First non-negative BigInt operand.
 * @param {bigint} b - Second non-negative BigInt operand.
 * @param {number} width - Bit-width upper bound (>= 1).
 * @returns {bigint} Bitwise AND of `a` and `b`.
 */
function andDivideAndConquer(a, b, width) {
	if (a === 0n || b === 0n) {
		return 0n
	}

	if (width <= 1) {
		return a === 1n && b === 1n ? 1n : 0n
	}

	const midWidth = Math.floor(width / 2)
	const mid = BigInt(midWidth)

	const aHi = a >> mid
	const aLo = a - (aHi << mid)
	const bHi = b >> mid
	const bLo = b - (bHi << mid)

	const hi = andDivideAndConquer(aHi, bHi, width - midWidth)
	const lo = andDivideAndConquer(aLo, bLo, midWidth)

	return (hi << mid) | lo
}

/**
 * Computes the bitwise AND (set intersection) of two arbitrary-width
 * non-negative BigInt bitsets using a recursive divide-and-conquer algorithm
 * that splits operands around the midpoint bit position and recombines halves
 * with `(hi << mid) | lo`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing `a ∩ b`.
 * @throws {TypeError} If `a` or `b` is not a BigInt.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function andBitsetRecursive(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected parameter "a" to be a BigInt, received ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected parameter "b" to be a BigInt, received ${typeof b}`)
	}
	if (a < 0n) {
		throw new RangeError('Expected parameter "a" to be a non-negative BigInt bitset')
	}
	if (b < 0n) {
		throw new RangeError('Expected parameter "b" to be a non-negative BigInt bitset')
	}

	if (a === 0n || b === 0n) {
		return 0n
	}

	const width = Math.max(bitLength(a), bitLength(b))
	return andDivideAndConquer(a, b, width)
}
