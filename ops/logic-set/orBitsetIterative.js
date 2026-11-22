/**
 * Bitwise OR over arbitrary-width non-negative BigInt bitsets using a
 * straightforward iterative 32-bit chunk-by-chunk loop.
 *
 * Processes both operands from least-significant to most-significant 32-bit
 * chunks, computing each 32-bit chunk's unsigned OR and accumulating disjoint
 * shifted chunks into the resulting BigInt bitset.
 *
 * @param {bigint} a - First non-negative BigInt bitset operand.
 * @param {bigint} b - Second non-negative BigInt bitset operand.
 * @param {number | bigint} [bitWidth] - Optional non-negative bit width to
 *   truncate/mask the resulting bitset to the lowest `bitWidth` bits. When
 *   omitted, all bits of `a` and `b` are processed (arbitrary width).
 * @returns {bigint} Non-negative BigInt representing the bitwise OR (`a | b`),
 *   masked to `bitWidth` bits if `bitWidth` is specified.
 * @throws {TypeError} If `a` or `b` is not a BigInt, or if `bitWidth` is
 *   provided and is neither a number nor a BigInt.
 * @throws {RangeError} If `a` or `b` is negative, or if `bitWidth` is negative,
 *   non-integer, or not a safe integer (when passed as a number).
 */
export function orBitsetIterative(a, b, bitWidth = undefined) {
	if (typeof a !== 'bigint') {
		throw new TypeError('Expected first bitset operand "a" to be a BigInt');
	}
	if (typeof b !== 'bigint') {
		throw new TypeError('Expected second bitset operand "b" to be a BigInt');
	}
	if (a < 0n) {
		throw new RangeError('Expected first bitset operand "a" to be a non-negative BigInt');
	}
	if (b < 0n) {
		throw new RangeError('Expected second bitset operand "b" to be a non-negative BigInt');
	}

	let maxBits = null;
	if (bitWidth !== undefined) {
		if (typeof bitWidth === 'bigint') {
			if (bitWidth < 0n) {
				throw new RangeError('Expected "bitWidth" to be a non-negative BigInt');
			}
			maxBits = bitWidth;
		} else if (typeof bitWidth === 'number') {
			if (!Number.isSafeInteger(bitWidth) || bitWidth < 0) {
				throw new RangeError('Expected "bitWidth" to be a non-negative safe integer');
			}
			maxBits = BigInt(bitWidth);
		} else {
			throw new TypeError('Expected "bitWidth" to be a non-negative safe integer or BigInt');
		}
	}

	if (maxBits === 0n) {
		return 0n;
	}

	const CHUNK_BITS = 32n;
	const CHUNK_MASK = 0xffffffffn;

	let remA = a;
	let remB = b;
	let result = 0n;
	let shift = 0n;

	while ((remA > 0n || remB > 0n) && (maxBits === null || shift < maxBits)) {
		const chunkA = Number(remA & CHUNK_MASK);
		const chunkB = Number(remB & CHUNK_MASK);
		let orChunk = (chunkA | chunkB) >>> 0;

		if (maxBits !== null) {
			const remainingBits = maxBits - shift;
			if (remainingBits < CHUNK_BITS) {
				const partialMask = 0xffffffff >>> (32 - Number(remainingBits));
				orChunk = (orChunk & partialMask) >>> 0;
			}
		}

		if (orChunk !== 0) {
			result += BigInt(orChunk) << shift;
		}

		remA >>= CHUNK_BITS;
		remB >>= CHUNK_BITS;
		shift += CHUNK_BITS;
	}

	return result;
}
