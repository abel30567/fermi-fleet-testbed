/**
 * Computes the bitwise NOT (set complement) of a non-negative BigInt bitset
 * within a fixed bit width using a recursive divide-and-conquer strategy.
 *
 * Bits at positions `>= width` in `bitset` are masked off so the returned
 * bitset always fits within `[0n, (1n << BigInt(width)) - 1n]`.
 *
 * @param {bigint} bitset - Non-negative BigInt representing the input bitset.
 * @param {number | bigint} width - Non-negative integer bit width of the bitset universe.
 * @returns {bigint} The bitwise complement of `bitset` masked to `width` bits.
 * @throws {TypeError} If `bitset` is not a BigInt or `width` is not a number or BigInt.
 * @throws {RangeError} If `bitset` is negative, or `width` is negative, non-integer, or an unsafe number.
 */
export function notBitsetRecursive(bitset, width) {
	if (typeof bitset !== 'bigint') {
		throw new TypeError(`Expected bitset to be a bigint, received ${typeof bitset}`)
	}
	if (bitset < 0n) {
		throw new RangeError('Expected bitset to be a non-negative bigint')
	}

	let widthBigInt
	if (typeof width === 'bigint') {
		if (width < 0n) {
			throw new RangeError('Expected width to be non-negative')
		}
		widthBigInt = width
	} else if (typeof width === 'number') {
		if (!Number.isInteger(width) || !Number.isSafeInteger(width)) {
			throw new RangeError('Expected numeric width to be a safe integer')
		}
		if (width < 0) {
			throw new RangeError('Expected width to be non-negative')
		}
		widthBigInt = BigInt(width)
	} else {
		throw new TypeError(`Expected width to be a number or bigint, received ${typeof width}`)
	}

	return complementDivideAndConquer(bitset, widthBigInt)
}

/**
 * Recursively splits the bit width in half, complements the lower and upper
 * halves independently, and recombines them.
 *
 * @param {bigint} value - Non-negative BigInt slice to complement.
 * @param {bigint} width - Non-negative BigInt bit width of the slice.
 * @returns {bigint} Complemented slice masked to `width` bits.
 */
function complementDivideAndConquer(value, width) {
	if (width === 0n) {
		return 0n
	}
	if (width === 1n) {
		return (value & 1n) ^ 1n
	}

	const lowWidth = width >> 1n
	const highWidth = width - lowWidth
	const lowMask = (1n << lowWidth) - 1n

	const lowPart = value & lowMask
	const highPart = value >> lowWidth

	const notLow = complementDivideAndConquer(lowPart, lowWidth)
	const notHigh = complementDivideAndConquer(highPart, highWidth)

	return (notHigh << lowWidth) | notLow
}
