/**
 * Validate that a value is a non-negative BigInt suitable for representing a bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {number} index - Zero-based argument index for error reporting.
 * @throws {TypeError} If `value` is not a BigInt.
 * @throws {RangeError} If `value` is a negative BigInt.
 */
function assertValidBitset(value, index) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`Expected BigInt bitset at argument index ${index}, received ${value === null ? 'null' : typeof value}`
		)
	}
	if (value < 0n) {
		throw new RangeError(
			`Expected non-negative BigInt bitset at argument index ${index}, received ${value}`
		)
	}
}

/**
 * Compute the set union of two non-negative BigInt bitsets iteratively,
 * inspecting bit positions from least-significant bit upward.
 *
 * Loop invariant: `result` holds the union of the lowest `shift` bits of `a`
 * and `b`, so `0n <= result < (1n << shift)`. Setting bit `shift` via addition
 * therefore never carries, and once either operand is exhausted, the remaining
 * upper bits of the other operand can be shifted and added directly.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Bitset containing every bit set in `a` or `b`.
 */
function unionPairIterative(a, b) {
	let result = 0n
	let shift = 0n
	let x = a
	let y = b

	while (x > 0n && y > 0n) {
		if ((x & 1n) === 1n || (y & 1n) === 1n) {
			result += 1n << shift
		}
		x >>= 1n
		y >>= 1n
		shift += 1n
	}

	if (x > 0n) {
		result += x << shift
	} else if (y > 0n) {
		result += y << shift
	}

	return result
}

/**
 * Compute the set union over two or more non-negative BigInt bitsets of
 * arbitrary bit width using a straightforward iterative algorithm.
 *
 * Each bit index `i >= 0` represents membership of element `i` in the set
 * (bit `i` is `1` if present, `0` if absent). Negative BigInts are rejected
 * because two's-complement negative values represent infinite leading 1-bits.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @param {...bigint} rest - Additional non-negative BigInt bitsets to union.
 * @returns {bigint} Non-negative BigInt bitset representing the union of all inputs.
 * @throws {TypeError} If any argument is missing or not a BigInt.
 * @throws {RangeError} If any argument is a negative BigInt.
 */
export function unionBitsetIterative(a, b, ...rest) {
	const bitsets = [a, b, ...rest]
	for (let i = 0; i < bitsets.length; i += 1) {
		assertValidBitset(bitsets[i], i)
	}

	let acc = unionPairIterative(bitsets[0], bitsets[1])
	for (let i = 2; i < bitsets.length; i += 1) {
		acc = unionPairIterative(acc, bitsets[i])
	}

	return acc
}
