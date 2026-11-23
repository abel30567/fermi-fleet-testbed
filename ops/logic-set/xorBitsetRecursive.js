/**
 * Computes the bitwise XOR (symmetric difference) of two non-negative BigInt
 * bitsets of arbitrary width using a recursive divide-and-conquer algorithm.
 *
 * Each operand is recursively partitioned at the midpoint of the current bit
 * width into high and low halves until the subproblem fits within `baseBits`,
 * where the base chunk XOR is evaluated directly and results are recombined.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @param {number} [baseBits=32] - Positive integer base chunk width for recursion termination.
 * @returns {bigint} The bitwise XOR (`a ^ b`) of the two bitsets.
 * @throws {TypeError} If `a` or `b` is not a BigInt, or `baseBits` is not a number.
 * @throws {RangeError} If `a` or `b` is negative, or `baseBits` is not a positive integer.
 */
export function xorBitsetRecursive(a, b, baseBits = 32) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError('xorBitsetRecursive expects BigInt bitset operands');
	}
	if (a < 0n || b < 0n) {
		throw new RangeError('xorBitsetRecursive expects non-negative BigInt bitsets');
	}
	if (typeof baseBits !== 'number') {
		throw new TypeError('baseBits must be a number');
	}
	if (!Number.isInteger(baseBits) || baseBits < 1) {
		throw new RangeError('baseBits must be a positive integer');
	}

	const widthA = a === 0n ? 0 : a.toString(2).length;
	const widthB = b === 0n ? 0 : b.toString(2).length;
	const width = widthA > widthB ? widthA : widthB;

	return xorDivideAndConquer(a, b, width, baseBits);
}

/**
 * Recursively computes the XOR of `x` and `y`, both strictly less than `2^bits`.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @param {number} bits
 * @param {number} baseBits
 * @returns {bigint}
 */
function xorDivideAndConquer(x, y, bits, baseBits) {
	if (x === 0n) {
		return y;
	}
	if (y === 0n) {
		return x;
	}
	if (bits <= baseBits) {
		if (bits <= 32) {
			return BigInt((Number(x) ^ Number(y)) >>> 0);
		}
		return x ^ y;
	}

	const half = bits >> 1;
	const shift = BigInt(half);
	const lowMask = (1n << shift) - 1n;

	const xLow = x & lowMask;
	const xHigh = x >> shift;
	const yLow = y & lowMask;
	const yHigh = y >> shift;

	const lowXor = xorDivideAndConquer(xLow, yLow, half, baseBits);
	const highXor = xorDivideAndConquer(xHigh, yHigh, bits - half, baseBits);

	return (highXor << shift) | lowXor;
}
