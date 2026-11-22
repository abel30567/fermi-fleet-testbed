const CHUNK_BITS = 64n;
const CHUNK_MASK = (1n << CHUNK_BITS) - 1n;

/**
 * Computes the bitwise NOT (complement) of a non-negative BigInt bitset over an
 * arbitrary specified bit width using a straightforward iterative chunk-based loop.
 *
 * Unlike JavaScript's unary `~` operator on `BigInt` (which produces negative
 * two's-complement sign-extended values), this function iterates over the bit
 * range `[0, width)` in 64-bit chunks and XOR-inverts each chunk against its
 * exact width mask. Bits at positions `>= width` in `bitset` are masked off,
 * guaranteeing a non-negative result in `[0n, (1n << BigInt(width)) - 1n]`.
 *
 * @param {bigint} bitset - Non-negative BigInt representing the input bitset.
 * @param {number | bigint} width - Non-negative bit width (safe integer or BigInt).
 * @returns {bigint} Non-negative width-masked bitwise complement of `bitset`.
 * @throws {TypeError} If `bitset` is not a BigInt, or `width` is neither a number nor a BigInt.
 * @throws {RangeError} If `bitset` is negative, or `width` is negative, non-integer, or not a safe integer.
 */
export function notBitsetIterative(bitset, width) {
	if (typeof bitset !== 'bigint') {
		throw new TypeError('Expected bitset to be a BigInt');
	}
	if (bitset < 0n) {
		throw new RangeError('Expected bitset to be a non-negative BigInt');
	}

	let bitWidth;
	if (typeof width === 'number') {
		if (!Number.isInteger(width) || !Number.isSafeInteger(width) || width < 0) {
			throw new RangeError('Expected width to be a non-negative safe integer or non-negative BigInt');
		}
		bitWidth = BigInt(width);
	} else if (typeof width === 'bigint') {
		if (width < 0n) {
			throw new RangeError('Expected width to be a non-negative BigInt');
		}
		bitWidth = width;
	} else {
		throw new TypeError('Expected width to be a non-negative safe integer or non-negative BigInt');
	}

	if (bitWidth === 0n) {
		return 0n;
	}

	let result = 0n;
	let remaining = bitWidth;
	let shift = 0n;
	let cursor = bitset;

	while (remaining > 0n) {
		const chunkSize = remaining >= CHUNK_BITS ? CHUNK_BITS : remaining;
		const chunkMask = chunkSize === CHUNK_BITS ? CHUNK_MASK : (1n << chunkSize) - 1n;
		const chunk = cursor & chunkMask;
		const invertedChunk = chunk ^ chunkMask;

		result |= invertedChunk << shift;
		cursor >>= chunkSize;
		shift += chunkSize;
		remaining -= chunkSize;
	}

	return result;
}
