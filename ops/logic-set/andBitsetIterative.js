/**
 * Bitwise AND over non-negative arbitrary-width BigInt bitsets using a
 * straightforward iterative 32-bit word-chunk traversal.
 *
 * Each bit at index `i` (0-based, least-significant bit first) represents
 * membership of element `i` in the set. The result contains bit `i` set if
 * and only if bit `i` is set in both `a` and `b`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing the intersection (`a AND b`).
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 * @throws {RangeError} If either `a` or `b` is negative.
 */
export function andBitsetIterative(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError('Expected first argument "a" to be a BigInt')
	}
	if (typeof b !== 'bigint') {
		throw new TypeError('Expected second argument "b" to be a BigInt')
	}
	if (a < 0n) {
		throw new RangeError('Expected first argument "a" to be a non-negative BigInt')
	}
	if (b < 0n) {
		throw new RangeError('Expected second argument "b" to be a non-negative BigInt')
	}

	const WORD_BITS = 32n
	let remA = a
	let remB = b
	let shift = 0n
	let result = 0n

	while (remA > 0n && remB > 0n) {
		const wordA = Number(BigInt.asUintN(32, remA))
		const wordB = Number(BigInt.asUintN(32, remB))
		const wordAnd = (wordA & wordB) >>> 0

		if (wordAnd !== 0) {
			result += BigInt(wordAnd) << shift
		}

		remA >>= WORD_BITS
		remB >>= WORD_BITS
		shift += WORD_BITS
	}

	return result
}
