/**
 * Exact BigInt addition implemented with a recursive divide-and-conquer
 * bit-splitting algorithm and recursive bitwise carry/borrow base cases.
 *
 * Also supports fixed-point BigInt values scaled by 10^18 (since addition
 * preserves fixed-point scaling).
 *
 * @module ops/arithmetic/addBigIntRecursive
 */

const BASE_BITS = 32n;

/**
 * Computes the bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Number of bits required to represent `n` (`0n` for `0n`).
 */
function bitLength(n) {
	if (n === 0n) return 0n;
	const hex = n.toString(16);
	const firstNibble = parseInt(hex[0], 16);
	const topBits = 32 - Math.clz32(firstNibble);
	return BigInt(hex.length - 1) * 4n + BigInt(topBits);
}

/**
 * Recursive bitwise half-adder for small non-negative BigInts.
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint} Exact sum `a + b`.
 */
function addBitsRecursive(a, b) {
	if (b === 0n) return a;
	return addBitsRecursive(a ^ b, (a & b) << 1n);
}

/**
 * Recursive bitwise subtractor for small non-negative BigInts (`a >= b >= 0n`).
 *
 * @param {bigint} a - Minuend (`a >= b`).
 * @param {bigint} b - Subtrahend (`b >= 0n`).
 * @returns {bigint} Exact difference `a - b`.
 */
function subBitsRecursive(a, b) {
	if (b === 0n) return a;
	return subBitsRecursive(a ^ b, (~a & b) << 1n);
}

/**
 * Divide-and-conquer recursive addition of two non-negative BigInts.
 * Splits operands into high and low bit halves and recursively combines
 * partial sums with carry propagation.
 *
 * @param {bigint} x - Non-negative BigInt.
 * @param {bigint} y - Non-negative BigInt.
 * @returns {bigint} Exact sum `x + y`.
 */
function addNonNegative(x, y) {
	if (x === 0n) return y;
	if (y === 0n) return x;

	const bitsX = bitLength(x);
	const bitsY = bitLength(y);
	const bits = bitsX >= bitsY ? bitsX : bitsY;

	if (bits <= BASE_BITS) {
		return addBitsRecursive(x, y);
	}

	const half = bits >> 1n;
	const mask = (1n << half) - 1n;

	const xLo = x & mask;
	const xHi = x >> half;
	const yLo = y & mask;
	const yHi = y >> half;

	const loSum = addNonNegative(xLo, yLo);
	const carry = loSum >> half;
	const lo = loSum & mask;

	const hiSum = addNonNegative(xHi, yHi);
	const hi = carry === 0n ? hiSum : addNonNegative(hiSum, carry);

	return (hi << half) | lo;
}

/**
 * Divide-and-conquer recursive subtraction of two non-negative BigInts (`x >= y >= 0n`).
 * Splits operands into high and low bit halves and propagates borrow across halves.
 *
 * @param {bigint} x - Non-negative minuend (`x >= y`).
 * @param {bigint} y - Non-negative subtrahend (`y >= 0n`).
 * @returns {bigint} Exact difference `x - y`.
 */
function subNonNegative(x, y) {
	if (y === 0n) return x;
	if (x === y) return 0n;

	const bits = bitLength(x);
	if (bits <= BASE_BITS) {
		return subBitsRecursive(x, y);
	}

	const half = bits >> 1n;
	const mask = (1n << half) - 1n;

	const xLo = x & mask;
	const xHi = x >> half;
	const yLo = y & mask;
	const yHi = y >> half;

	if (xLo >= yLo) {
		const lo = subNonNegative(xLo, yLo);
		const hi = subNonNegative(xHi, yHi);
		return (hi << half) | lo;
	}

	const borrowedLo = (1n << half) | xLo;
	const lo = subNonNegative(borrowedLo, yLo);
	const hiDiff = subNonNegative(xHi, yHi);
	const hi = subNonNegative(hiDiff, 1n);

	return (hi << half) | lo;
}

/**
 * Adds two exact BigInt integers (or 10^18-scaled fixed-point BigInts) using a
 * recursive divide-and-conquer implementation.
 *
 * @param {bigint} a - First addend (must be a `bigint`).
 * @param {bigint} b - Second addend (must be a `bigint`).
 * @returns {bigint} The exact BigInt sum of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 */
export function addBigIntRecursive(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, got ${typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, got ${typeof b}`);
	}

	if (a === 0n) return b;
	if (b === 0n) return a;

	if (a > 0n && b > 0n) {
		return addNonNegative(a, b);
	}
	if (a < 0n && b < 0n) {
		return -addNonNegative(-a, -b);
	}

	if (a > 0n) {
		const absB = -b;
		return a >= absB ? subNonNegative(a, absB) : -subNonNegative(absB, a);
	}

	const absA = -a;
	return b >= absA ? subNonNegative(b, absA) : -subNonNegative(absA, b);
}
