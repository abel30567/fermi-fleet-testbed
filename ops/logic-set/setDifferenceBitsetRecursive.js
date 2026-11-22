/**
 * Computes the bit-length of a non-negative BigInt.
 *
 * @param {bigint} value - Non-negative BigInt.
 * @returns {bigint} Number of bits required to represent `value` (0n for 0n).
 */
function bitLength(value) {
	if (value === 0n) {
		return 0n
	}
	return BigInt(value.toString(2).length)
}

/**
 * Recursive divide-and-conquer helper computing `a \ b` over a `width`-bit slice.
 *
 * Invariant: `0n <= a < (1n << width)`, `0n <= b < (1n << width)`, `width >= 1n`.
 *
 * @param {bigint} a - Minuend bitset slice.
 * @param {bigint} b - Subtrahend bitset slice.
 * @param {bigint} width - Bit-width of the current slice (>= 1n).
 * @returns {bigint} Bitset difference `a \ b` within the `width`-bit slice.
 */
function diffRecursive(a, b, width) {
	if (width === 1n) {
		return a === 1n && b === 0n ? 1n : 0n
	}
	if (a === 0n) {
		return 0n
	}
	if (b === 0n) {
		return a
	}

	const mid = width >> 1n
	const lowMask = (1n << mid) - 1n

	const hi = diffRecursive(a >> mid, b >> mid, width - mid)
	const lo = diffRecursive(a & lowMask, b & lowMask, mid)

	return (hi << mid) + lo
}

/**
 * Computes the set difference `A \ B` over arbitrary-width non-negative BigInt
 * bitsets using a recursive divide-and-conquer split on bit-width.
 *
 * Each bit index `i` represents membership of element `i` in the set. A bit is
 * set in the result if and only if it is `1` in `a` and `0` in `b`. The bitsets
 * are recursively split at `mid = width >> 1n` down to 1-bit leaves
 * (`bitA === 1n && bitB === 0n ? 1n : 0n`) and recombined via `(hi << mid) + lo`.
 *
 * @param {bigint} a - Non-negative BigInt bitset representing set A.
 * @param {bigint} b - Non-negative BigInt bitset representing set B.
 * @returns {bigint} Non-negative BigInt bitset representing `A \ B`.
 * @throws {TypeError} If `a` or `b` is not a BigInt.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function setDifferenceBitsetRecursive(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected parameter "a" to be a BigInt, received ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected parameter "b" to be a BigInt, received ${typeof b}`)
	}
	if (a < 0n) {
		throw new RangeError('Expected parameter "a" to be a non-negative BigInt')
	}
	if (b < 0n) {
		throw new RangeError('Expected parameter "b" to be a non-negative BigInt')
	}

	const lenA = bitLength(a)
	const lenB = bitLength(b)
	const maxLen = lenA >= lenB ? lenA : lenB
	const width = maxLen > 0n ? maxLen : 1n

	return diffRecursive(a, b, width)
}
