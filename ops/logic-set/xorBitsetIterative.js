/**
 * Validates that a value is a non-negative BigInt suitable for bitset operations.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative (`< 0n`).
 */
function assertBitset(value, name) {
	if (typeof value !== 'bigint') {
		const received = value === null ? 'null' : typeof value
		throw new TypeError(`${name} must be a non-negative BigInt bitset, received ${received}`)
	}
	if (value < 0n) {
		throw new RangeError(`${name} must be a non-negative BigInt bitset (>= 0n), received ${value}n`)
	}
}

/**
 * Computes the bitwise XOR (symmetric difference) of two non-negative arbitrary-width
 * BigInt bitsets using a straightforward bit-by-bit iterative algorithm.
 *
 * Each bit position `i` (0-indexed from the least-significant bit) is set in the
 * resulting bitset if and only if bit `i` is set in exactly one of `a` or `b`.
 *
 * Runs in `O(max(bitLength(a), bitLength(b)))` iterations.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing `a XOR b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 * @throws {RangeError} If either `a` or `b` is negative (`< 0n`).
 *
 * @example
 * xorBitsetIterative(0b1010n, 0b1100n) // => 0b0110n (6n)
 */
export function xorBitsetIterative(a, b) {
	assertBitset(a, 'a')
	assertBitset(b, 'b')

	let x = a
	let y = b
	let result = 0n
	let bit = 1n

	while (x > 0n || y > 0n) {
		if ((x & 1n) !== (y & 1n)) {
			result |= bit
		}
		x >>= 1n
		y >>= 1n
		bit <<= 1n
	}

	return result
}
