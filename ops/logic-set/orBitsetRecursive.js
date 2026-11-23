const BASE_CHUNK_BITS = 32;

/**
 * Returns the exact bit length of a non-negative BigInt.
 *
 * @param {bigint} value - Non-negative BigInt value.
 * @returns {number} Number of bits required to represent `value` (`0` for `0n`).
 */
function bitLength(value) {
	return value === 0n ? 0 : value.toString(2).length;
}

/**
 * Recursively computes the bitwise OR of two non-negative BigInt bitsets
 * bounded by `width` bits using divide-and-conquer splitting.
 *
 * @param {bigint} a - First non-negative BigInt bitset (`< 2^width`).
 * @param {bigint} b - Second non-negative BigInt bitset (`< 2^width`).
 * @param {number} width - Upper bound on the bit width of `a` and `b`.
 * @returns {bigint} Bitwise OR of `a` and `b`.
 */
function orDivideAndConquer(a, b, width) {
	if (a === 0n) return b;
	if (b === 0n) return a;
	if (a === b) return a;

	if (width <= BASE_CHUNK_BITS) {
		return BigInt((Number(a) | Number(b)) >>> 0);
	}

	const half = Math.floor(width / 2);
	const shift = BigInt(half);

	const aHigh = a >> shift;
	const aLow = a - (aHigh << shift);
	const bHigh = b >> shift;
	const bLow = b - (bHigh << shift);

	const highOr = orDivideAndConquer(aHigh, bHigh, width - half);
	const lowOr = orDivideAndConquer(aLow, bLow, half);

	return (highOr << shift) + lowOr;
}

/**
 * Computes the bitwise OR (set union) of two arbitrary-width non-negative BigInt
 * bitsets using a recursive divide-and-conquer algorithm.
 *
 * The operands are recursively split into high and low bit-halves down to a
 * 32-bit base chunk width, combined without relying on BigInt bitwise OR.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt representing the bitwise OR of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 * @throws {RangeError} If either `a` or `b` is negative.
 */
export function orBitsetRecursive(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError('orBitsetRecursive expects two BigInt arguments');
	}
	if (a < 0n || b < 0n) {
		throw new RangeError('orBitsetRecursive expects non-negative BigInt bitsets');
	}
	if (a === 0n) return b;
	if (b === 0n) return a;
	if (a === b) return a;

	const width = Math.max(bitLength(a), bitLength(b));
	return orDivideAndConquer(a, b, width);
}
