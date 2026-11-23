/**
 * Computes the falling-factorial product of all integers in the inclusive range [low, high]
 * using divide-and-conquer binary splitting.
 *
 * Binary splitting balances operand bit-lengths during BigInt multiplication and bounds
 * recursion depth to O(log(high - low + 1)).
 *
 * @param {bigint} low - Inclusive lower bound of the integer range.
 * @param {bigint} high - Inclusive upper bound of the integer range.
 * @returns {bigint} Product of all integers i with low <= i <= high, or 1n if low > high.
 */
function productRange(low, high) {
	if (low > high) {
		return 1n;
	}
	if (low === high) {
		return low;
	}
	if (high - low === 1n) {
		return low * high;
	}
	const mid = low + ((high - low) >> 1n);
	return productRange(low, mid) * productRange(mid + 1n, high);
}

/**
 * Validates that an argument is a non-negative BigInt integer.
 *
 * @param {unknown} value - Candidate input value.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If value is not a BigInt.
 * @throws {RangeError} If value is negative.
 */
function assertNonNegativeBigInt(value, name) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`${name} must be a BigInt, received ${typeof value}`);
	}
	if (value < 0n) {
		throw new RangeError(`${name} must be a non-negative BigInt, received ${value}`);
	}
}

/**
 * Computes the exact number of k-permutations of n distinct elements,
 * P(n, k) = n! / (n - k)! = prod_{i = n - k + 1}^{n} i,
 * over exact BigInt integers using a recursive divide-and-conquer (binary splitting) algorithm.
 *
 * Edge cases:
 * - P(n, 0n) = 1n for all n >= 0n (including P(0n, 0n) = 1n).
 * - P(n, k) = 0n whenever k > n.
 * - P(n, n) = n!.
 *
 * @param {bigint} n - Total number of distinct elements (non-negative BigInt).
 * @param {bigint} k - Number of elements to arrange (non-negative BigInt).
 * @returns {bigint} Exact integer count of ordered arrangements P(n, k).
 * @throws {TypeError} If either `n` or `k` is not a BigInt.
 * @throws {RangeError} If either `n` or `k` is negative.
 */
export function permutationsBigIntRecursive(n, k) {
	assertNonNegativeBigInt(n, 'n');
	assertNonNegativeBigInt(k, 'k');

	if (k === 0n) {
		return 1n;
	}
	if (k > n) {
		return 0n;
	}
	if (k === 1n) {
		return n;
	}

	return productRange(n - k + 1n, n);
}
