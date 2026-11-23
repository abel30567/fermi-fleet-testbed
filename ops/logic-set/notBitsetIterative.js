/**
 * Computes the minimum bit length of a non-negative BigInt iteratively.
 * For `0n`, the bit length is `0n`.
 *
 * @param {bigint} value - Non-negative BigInt.
 * @returns {bigint} Minimum number of bits required to represent `value`.
 */
function bitLengthIterative(value) {
	let length = 0n;
	let remaining = value;

	while (remaining > 0n) {
		remaining >>= 1n;
		length += 1n;
	}

	return length;
}

/**
 * Computes the bitwise NOT (set complement) of a non-negative BigInt bitset
 * over bit positions `0..width-1` using a straightforward iterative loop.
 *
 * Each bit at position `i` (`0 <= i < width`) is flipped: set in the result if
 * and only if it is clear in `bitset`.
 *
 * When `width` is omitted (`undefined`), the width is inferred as the minimum
 * bit length of `bitset` (for `0n`, the inferred width is `0`, yielding `0n`).
 *
 * @param {bigint} bitset - Non-negative BigInt representing a bitset.
 * @param {number | bigint} [width] - Optional bit width (non-negative safe
 *   integer or non-negative BigInt). Must be large enough to contain all set
 *   bits of `bitset`.
 * @returns {bigint} The bitwise complement of `bitset` over `0..width-1`.
 * @throws {TypeError} If `bitset` is not a BigInt, or if `width` is provided
 *   and is neither a number nor a BigInt.
 * @throws {RangeError} If `bitset` is negative, if `width` is negative,
 *   non-integer, or not a safe integer (when a number), or if `bitset` has set
 *   bits at positions `>= width`.
 */
export function notBitsetIterative(bitset, width) {
	if (typeof bitset !== 'bigint') {
		throw new TypeError('bitset must be a BigInt');
	}
	if (bitset < 0n) {
		throw new RangeError('bitset must be a non-negative BigInt');
	}

	let bitWidth;
	if (width === undefined) {
		bitWidth = bitLengthIterative(bitset);
	} else if (typeof width === 'number') {
		if (!Number.isSafeInteger(width) || width < 0) {
			throw new RangeError(
				'width must be a non-negative safe integer or BigInt',
			);
		}
		bitWidth = BigInt(width);
	} else if (typeof width === 'bigint') {
		if (width < 0n) {
			throw new RangeError(
				'width must be a non-negative safe integer or BigInt',
			);
		}
		bitWidth = width;
	} else {
		throw new TypeError(
			'width must be a non-negative safe integer, a non-negative BigInt, or undefined',
		);
	}

	if (bitset >> bitWidth !== 0n) {
		throw new RangeError('bitset exceeds the specified width');
	}

	let result = 0n;
	let remaining = bitset;

	for (let i = 0n; i < bitWidth; i += 1n) {
		if ((remaining & 1n) === 0n) {
			result |= 1n << i;
		}
		remaining >>= 1n;
	}

	return result;
}
