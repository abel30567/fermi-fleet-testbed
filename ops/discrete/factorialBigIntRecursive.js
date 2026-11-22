/**
 * Compute the product of all integers in the inclusive range [low, high]
 * using recursive binary splitting (divide-and-conquer).
 *
 * Dividing the range at the midpoint keeps recursion depth at O(log(high - low))
 * and produces balanced operand sizes for BigInt multiplication.
 *
 * @param {bigint} low - Lower bound of the inclusive integer range (low >= 1n).
 * @param {bigint} high - Upper bound of the inclusive integer range (high >= low).
 * @returns {bigint} Exact product low * (low + 1n) * ... * high.
 */
function rangeProduct(low, high) {
	if (low === high) {
		return low
	}
	if (high - low === 1n) {
		return low * high
	}
	const mid = (low + high) >> 1n
	return rangeProduct(low, mid) * rangeProduct(mid + 1n, high)
}

/**
 * Compute the exact factorial `n!` over BigInt integers using recursive
 * binary splitting (divide-and-conquer range product).
 *
 * Recursion depth is O(log n) and intermediate multiplications remain balanced.
 *
 * @param {bigint} n - Non-negative BigInt integer whose factorial to compute.
 * @returns {bigint} Exact BigInt value of `n!`.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n` is negative (`n < 0n`).
 */
export function factorialBigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${n === null ? 'null' : typeof n}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected a non-negative BigInt, received ${n}`)
	}
	if (n <= 1n) {
		return 1n
	}
	return rangeProduct(2n, n)
}
