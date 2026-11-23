/**
 * Exact BigInt arithmetic subtraction using a recursive divide-and-conquer algorithm.
 *
 * Splits non-negative operands into high and low bit halves recursively down to
 * 1-bit full-subtractor / full-adder base cases, propagating borrows/carries across
 * halves. Operates on arbitrary-precision signed BigInt integers, including
 * fixed-point BigInt values scaled by 10^18 (which remain exact under subtraction).
 *
 * @module ops/arithmetic/subtractBigIntRecursive
 */

/**
 * Computes the exact bit length of a non-negative BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {number} Number of bits required to represent `n` (0 for `0n`).
 */
function bitLength(n) {
	if (n === 0n) return 0
	const hex = n.toString(16)
	const topNibble = parseInt(hex[0], 16)
	const topBits = 32 - Math.clz32(topNibble)
	return (hex.length - 1) * 4 + topBits
}

/**
 * Recursively subtracts two non-negative `width`-bit BigInts with an incoming borrow
 * using divide-and-conquer binary splitting.
 *
 * Computes `diff` and `borrowOut` such that:
 * `x - y - borrowIn === diff - borrowOut * 2^width` with `0n <= diff < 2^width`.
 *
 * @param {bigint} x - Minuend (`0n <= x < 2^width`).
 * @param {bigint} y - Subtrahend (`0n <= y < 2^width`).
 * @param {bigint} borrowIn - Incoming borrow (`0n` or `1n`).
 * @param {number} width - Bit width (`>= 1`).
 * @returns {{ diff: bigint, borrowOut: bigint }} Low `width`-bit difference and borrow out.
 */
function subWithBorrowRecursive(x, y, borrowIn, width) {
	if (y === 0n && borrowIn === 0n) {
		return { diff: x, borrowOut: 0n }
	}
	if (x === y && borrowIn === 0n) {
		return { diff: 0n, borrowOut: 0n }
	}
	if (width === 1) {
		const diff = x ^ y ^ borrowIn
		const borrowOut = ((x ^ 1n) & (y | borrowIn)) | (y & borrowIn)
		return { diff, borrowOut }
	}

	const lowWidth = width >> 1
	const highWidth = width - lowWidth
	const shift = BigInt(lowWidth)
	const mask = (1n << shift) - 1n

	const lo = subWithBorrowRecursive(x & mask, y & mask, borrowIn, lowWidth)
	const hi = subWithBorrowRecursive(x >> shift, y >> shift, lo.borrowOut, highWidth)

	return {
		diff: (hi.diff << shift) | lo.diff,
		borrowOut: hi.borrowOut,
	}
}

/**
 * Recursively adds two non-negative `width`-bit BigInts with an incoming carry
 * using divide-and-conquer binary splitting.
 *
 * Computes `sum` and `carryOut` such that:
 * `x + y + carryIn === sum + carryOut * 2^width` with `0n <= sum < 2^width`.
 *
 * @param {bigint} x - First addend (`0n <= x < 2^width`).
 * @param {bigint} y - Second addend (`0n <= y < 2^width`).
 * @param {bigint} carryIn - Incoming carry (`0n` or `1n`).
 * @param {number} width - Bit width (`>= 1`).
 * @returns {{ sum: bigint, carryOut: bigint }} Low `width`-bit sum and carry out.
 */
function addWithCarryRecursive(x, y, carryIn, width) {
	if (y === 0n && carryIn === 0n) {
		return { sum: x, carryOut: 0n }
	}
	if (x === 0n && carryIn === 0n) {
		return { sum: y, carryOut: 0n }
	}
	if (width === 1) {
		const xor = x ^ y
		const sum = xor ^ carryIn
		const carryOut = (x & y) | (carryIn & xor)
		return { sum, carryOut }
	}

	const lowWidth = width >> 1
	const highWidth = width - lowWidth
	const shift = BigInt(lowWidth)
	const mask = (1n << shift) - 1n

	const lo = addWithCarryRecursive(x & mask, y & mask, carryIn, lowWidth)
	const hi = addWithCarryRecursive(x >> shift, y >> shift, lo.carryOut, highWidth)

	return {
		sum: (hi.sum << shift) | lo.sum,
		carryOut: hi.carryOut,
	}
}

/**
 * Subtracts non-negative BigInt `y` from `x` where `x >= y >= 0n`.
 *
 * @param {bigint} x - Larger or equal non-negative BigInt.
 * @param {bigint} y - Smaller or equal non-negative BigInt.
 * @returns {bigint} Exact non-negative difference `x - y`.
 */
function subMagnitude(x, y) {
	const width = Math.max(bitLength(x), 1)
	return subWithBorrowRecursive(x, y, 0n, width).diff
}

/**
 * Adds two non-negative BigInts `x` and `y`.
 *
 * @param {bigint} x - First non-negative BigInt.
 * @param {bigint} y - Second non-negative BigInt.
 * @returns {bigint} Exact non-negative sum `x + y`.
 */
function addMagnitude(x, y) {
	const width = Math.max(bitLength(x), bitLength(y), 1)
	const { sum, carryOut } = addWithCarryRecursive(x, y, 0n, width)
	return (carryOut << BigInt(width)) | sum
}

/**
 * Subtracts two exact BigInt integers (`a - b`) using a recursive divide-and-conquer
 * bit-splitting implementation.
 *
 * Works on arbitrary-precision signed BigInt values as well as fixed-point BigInt
 * representations scaled by `10^18` (since `(x * 10^18) - (y * 10^18) === (x - y) * 10^18`).
 *
 * @param {bigint} a - Minuend (must be a `bigint`).
 * @param {bigint} b - Subtrahend (must be a `bigint`).
 * @returns {bigint} Exact difference `a - b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 */
export function subtractBigIntRecursive(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError(
			`subtractBigIntRecursive expects BigInt arguments, received (${typeof a}, ${typeof b})`
		)
	}

	if (b === 0n) return a
	if (a === 0n) return -b
	if (a === b) return 0n

	const aNeg = a < 0n
	const bNeg = b < 0n
	const absA = aNeg ? -a : a
	const absB = bNeg ? -b : b

	if (!aNeg && !bNeg) {
		return absA >= absB ? subMagnitude(absA, absB) : -subMagnitude(absB, absA)
	}
	if (aNeg && bNeg) {
		return absB >= absA ? subMagnitude(absB, absA) : -subMagnitude(absA, absB)
	}
	if (!aNeg && bNeg) {
		return addMagnitude(absA, absB)
	}
	return -addMagnitude(absA, absB)
}
