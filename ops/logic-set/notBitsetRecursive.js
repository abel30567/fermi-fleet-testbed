const BASE_CHUNK_WIDTH = 32;

/**
 * Recursively computes the bitwise NOT of the low `width` bits of a non-negative
 * BigInt bitset using a divide-and-conquer strategy.
 *
 * @param {bigint} value - Non-negative BigInt bitset.
 * @param {number} width - Non-negative integer bit width.
 * @returns {bigint} Inverted `width`-bit bitset.
 */
function invertChunkRecursive(value, width) {
	if (width === 0) {
		return 0n;
	}

	if (width <= BASE_CHUNK_WIDTH) {
		const mask = (1n << BigInt(width)) - 1n;
		return (~value) & mask;
	}

	const lowWidth = Math.floor(width / 2);
	const highWidth = width - lowWidth;
	const shift = BigInt(lowWidth);
	const lowMask = (1n << shift) - 1n;

	const lowHalf = value & lowMask;
	const highHalf = value >> shift;

	const invertedLow = invertChunkRecursive(lowHalf, lowWidth);
	const invertedHigh = invertChunkRecursive(highHalf, highWidth);

	return (invertedHigh << shift) | invertedLow;
}

/**
 * Computes the bitwise NOT (set complement) of a BigInt bitset within an explicit
 * bit width using a recursive divide-and-conquer algorithm.
 *
 * Splits bitsets wider than the base chunk size (32 bits) into low and high halves,
 * recursively inverts each half, and recombines the results. Any bits in `bitset`
 * at positions `>= width` are masked out so the returned value is always strictly
 * bounded to `width` bits (`0n <= result < (1n << BigInt(width))`).
 *
 * @param {bigint} bitset - Non-negative BigInt representing the input bitset.
 * @param {number} width - Non-negative safe integer specifying the bit width of the universe.
 * @returns {bigint} A non-negative BigInt representing the `width`-bit complement of `bitset`.
 * @throws {TypeError} If `bitset` is not a BigInt or `width` is not a number.
 * @throws {RangeError} If `bitset` is negative or `width` is not a non-negative safe integer.
 */
export function notBitsetRecursive(bitset, width) {
	if (typeof bitset !== 'bigint') {
		throw new TypeError('bitset must be a BigInt');
	}
	if (bitset < 0n) {
		throw new RangeError('bitset must be a non-negative BigInt');
	}
	if (typeof width !== 'number') {
		throw new TypeError('width must be a number');
	}
	if (!Number.isSafeInteger(width) || width < 0) {
		throw new RangeError('width must be a non-negative safe integer');
	}

	return invertChunkRecursive(bitset, width);
}
