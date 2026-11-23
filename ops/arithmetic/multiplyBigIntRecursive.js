/**
 * Multiplies two arbitrary-precision BigInt integers using a recursive
 * divide-and-conquer Karatsuba algorithm.
 *
 * For non-negative operands exceeding the base bit-width threshold, each
 * operand is split into high and low halves around a midpoint bit shift and
 * combined recursively using three sub-multiplications (or two when one
 * operand's upper half is zero), yielding exact integer results in
 * O(n^(log2 3)) time without external dependencies.
 *
 * @param {bigint} a - The first integer operand.
 * @param {bigint} b - The second integer operand.
 * @returns {bigint} The exact BigInt product `a * b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 */
export function multiplyBigIntRecursive(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, received ${a === null ? 'null' : typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, received ${b === null ? 'null' : typeof b}`);
	}

	if (a === 0n || b === 0n) {
		return 0n;
	}

	const isNegative = (a < 0n) !== (b < 0n);
	const x = a < 0n ? -a : a;
	const y = b < 0n ? -b : b;

	if (x === 1n) {
		return isNegative ? -y : y;
	}
	if (y === 1n) {
		return isNegative ? -x : x;
	}

	const product = karatsuba(x, y);
	return isNegative ? -product : product;
}

const BASE_BITS = 16;
const BASE_THRESHOLD = 1n << BigInt(BASE_BITS);

/**
 * Returns the bit length of a positive BigInt.
 *
 * @param {bigint} n - A positive BigInt (`n > 0n`).
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
	return n.toString(2).length;
}

/**
 * Recursive Karatsuba divide-and-conquer multiplication for non-negative BigInts.
 *
 * @param {bigint} x - First non-negative BigInt.
 * @param {bigint} y - Second non-negative BigInt.
 * @returns {bigint} Exact product `x * y`.
 */
function karatsuba(x, y) {
	if (x === 0n || y === 0n) {
		return 0n;
	}
	if (x === 1n) {
		return y;
	}
	if (y === 1n) {
		return x;
	}
	if (x < BASE_THRESHOLD && y < BASE_THRESHOLD) {
		return x * y;
	}

	const maxBits = Math.max(bitLength(x), bitLength(y));
	const half = BigInt(maxBits >> 1);
	const mask = (1n << half) - 1n;

	const xLow = x & mask;
	const xHigh = x >> half;
	const yLow = y & mask;
	const yHigh = y >> half;

	// Unbalanced operands: split only the larger operand into two subproblems.
	if (xHigh === 0n) {
		const high = karatsuba(xLow, yHigh);
		const low = karatsuba(xLow, yLow);
		return (high << half) + low;
	}
	if (yHigh === 0n) {
		const high = karatsuba(xHigh, yLow);
		const low = karatsuba(xLow, yLow);
		return (high << half) + low;
	}

	// Balanced Karatsuba divide-and-conquer step:
	// x * y = z2 * 2^(2*half) + z1 * 2^half + z0
	const z0 = karatsuba(xLow, yLow);
	const z2 = karatsuba(xHigh, yHigh);
	const z1 = karatsuba(xLow + xHigh, yLow + yHigh) - z2 - z0;

	return (z2 << (half << 1n)) + (z1 << half) + z0;
}
