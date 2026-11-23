/**
 * Computes the bit length of a positive BigInt (number of bits required to represent it).
 *
 * @param {bigint} value - A positive BigInt (> 0n).
 * @returns {bigint} The bit length as a BigInt.
 */
function bitLength(value) {
	return BigInt(value.toString(2).length);
}

/**
 * Recursive divide-and-conquer helper computing the set difference (a \ b)
 * over bitsets within the given bit width.
 *
 * Splits both bitsets into lower and upper halves across `width / 2` bits,
 * recursively computes the difference on each half, and recombines them.
 *
 * @param {bigint} a - Left operand bitset (0n <= a < 2^width).
 * @param {bigint} b - Right operand bitset (0n <= b < 2^width).
 * @param {bigint} width - Bit width covering both operands (>= 1n).
 * @returns {bigint} Bitset representing a \ b.
 */
function diffRecursive(a, b, width) {
	if (a === 0n || a === b) {
		return 0n;
	}
	if (b === 0n) {
		return a;
	}
	if (width <= 1n) {
		return (a & 1n) === 1n && (b & 1n) === 0n ? 1n : 0n;
	}

	const half = width >> 1n;
	const lowMask = (1n << half) - 1n;

	const aLow = a & lowMask;
	const aHigh = a >> half;
	const bLow = b & lowMask;
	const bHigh = b >> half;

	const lowResult = diffRecursive(aLow, bLow, half);
	const highResult = diffRecursive(aHigh, bHigh, width - half);

	return (highResult << half) | lowResult;
}

/**
 * Computes the set difference (A \ B) of two arbitrary-width non-negative BigInt bitsets
 * using a recursive divide-and-conquer algorithm over bit-width halves.
 *
 * Bit `i` (0-indexed from least significant bit) is set in the returned bitset
 * if and only if bit `i` is set in `a` and not set in `b`.
 *
 * @param {bigint} a - Non-negative BigInt bitset representing set A.
 * @param {bigint} b - Non-negative BigInt bitset representing set B.
 * @returns {bigint} Non-negative BigInt bitset representing A \ B.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 * @throws {RangeError} If either `a` or `b` is negative.
 */
export function setDifferenceBitsetRecursive(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError('Both arguments must be BigInt values.');
	}
	if (a < 0n || b < 0n) {
		throw new RangeError('Both bitset arguments must be non-negative BigInt values.');
	}
	if (a === 0n || a === b) {
		return 0n;
	}
	if (b === 0n) {
		return a;
	}

	const width = bitLength(a);
	const mask = (1n << width) - 1n;
	return diffRecursive(a, b & mask, width);
}
