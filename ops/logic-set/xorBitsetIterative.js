/**
 * Computes the bitwise XOR (symmetric difference) of two arbitrary-width
 * non-negative BigInt bitsets using a straightforward iterative bit-by-bit
 * algorithm.
 *
 * Each bit position `i >= 0` represents membership of element `i` in the
 * corresponding set (`1` = present, `0` = absent). The resulting bitset has
 * bit `i` set if and only if bit `i` is set in exactly one of `a` or `b`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing `a XOR b` (symmetric difference).
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative (negative BigInts have infinite leading 1-bits).
 */
export function xorBitsetIterative(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(
			`xorBitsetIterative: expected first argument "a" to be a BigInt, got ${a === null ? 'null' : typeof a}`
		);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(
			`xorBitsetIterative: expected second argument "b" to be a BigInt, got ${b === null ? 'null' : typeof b}`
		);
	}
	if (a < 0n) {
		throw new RangeError(
			'xorBitsetIterative: first argument "a" must be a non-negative BigInt'
		);
	}
	if (b < 0n) {
		throw new RangeError(
			'xorBitsetIterative: second argument "b" must be a non-negative BigInt'
		);
	}

	let left = a;
	let right = b;
	let result = 0n;
	let bitPos = 0n;

	while (left > 0n && right > 0n) {
		const bitA = left & 1n;
		const bitB = right & 1n;

		if (bitA !== bitB) {
			result |= 1n << bitPos;
		}

		left >>= 1n;
		right >>= 1n;
		bitPos += 1n;
	}

	// Any remaining higher-order bits in the wider operand XOR with 0 unchanged.
	if (left > 0n) {
		result |= left << bitPos;
	} else if (right > 0n) {
		result |= right << bitPos;
	}

	return result;
}
