/**
 * Computes the set intersection of two non-negative arbitrary-width BigInt bitsets
 * using a straightforward iterative bit-by-bit scan.
 *
 * Each bit position `i` (0-indexed from the least significant bit) represents
 * membership of element `i` in the set. A bit is set in the returned bitset if
 * and only if it is set in both `a` and `b`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing `a ∩ b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 * @throws {RangeError} If either `a` or `b` is negative.
 * @example
 * intersectionBitsetIterative(0b1101n, 0b1011n) // => 0b1001n (9n)
 * intersectionBitsetIterative(0n, 0b1111n)      // => 0n
 */
export function intersectionBitsetIterative(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, got ${typeof b}`)
	}
	if (a < 0n) {
		throw new RangeError('Expected first argument "a" to be a non-negative bigint')
	}
	if (b < 0n) {
		throw new RangeError('Expected second argument "b" to be a non-negative bigint')
	}

	let left = a
	let right = b
	let result = 0n
	let bitPosition = 0n

	while (left > 0n && right > 0n) {
		if ((left & 1n) === 1n && (right & 1n) === 1n) {
			result |= 1n << bitPosition
		}
		left >>= 1n
		right >>= 1n
		bitPosition += 1n
	}

	return result
}
