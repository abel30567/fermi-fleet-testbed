/**
 * Computes the exact product of all consecutive BigInt integers in the inclusive
 * range [low, high] using recursive binary splitting (divide-and-conquer).
 *
 * Balancing the left and right sub-products keeps operand bit-lengths similar,
 * improving multiplication efficiency while bounding recursion depth to O(log2(high - low + 1)).
 *
 * @param {bigint} low - Lower bound of the inclusive integer range.
 * @param {bigint} high - Upper bound of the inclusive integer range.
 * @returns {bigint} Product of all integers from low to high inclusive.
 */
function productRange(low, high) {
	if (low > high) {
		return 1n
	}
	if (low === high) {
		return low
	}
	if (high - low === 1n) {
		return low * high
	}
	const mid = (low + high) >> 1n
	return productRange(low, mid) * productRange(mid + 1n, high)
}

/**
 * Computes the exact factorial n! over BigInt integers using a recursive
 * divide-and-conquer (binary splitting) range product.
 *
 * @param {bigint} n - Non-negative BigInt integer whose factorial is computed.
 * @returns {bigint} The exact factorial n! as a BigInt.
 * @throws {TypeError} If n is not a BigInt.
 * @throws {RangeError} If n is negative.
 */
export function factorialBigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${n === null ? 'null' : typeof n}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected a non-negative BigInt, received ${n}n`)
	}
	if (n <= 1n) {
		return 1n
	}
	return productRange(2n, n)
}
