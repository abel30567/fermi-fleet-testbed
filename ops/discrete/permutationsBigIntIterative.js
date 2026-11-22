/**
 * Computes the number of k-permutations of n items, P(n, k) = n! / (n - k)!,
 * using a straightforward iterative falling-product loop over exact BigInt integers.
 *
 * Since P(n, k) is always an exact non-negative integer for all non-negative
 * integers n and k, the returned BigInt is exact and unscaled (no fixed-point
 * 10^18 scaling is applied).
 *
 * By standard combinatorial convention (matching the falling factorial
 * product_{i=0}^{k-1} (n - i)):
 * - P(n, 0n) = 1n for all n >= 0n (including P(0n, 0n) = 1n)
 * - P(n, k) = 0n whenever k > n (with n >= 0n, k >= 0n)
 *
 * @param {bigint} n - Total number of distinct items (must be a BigInt >= 0n).
 * @param {bigint} k - Number of items to arrange (must be a BigInt >= 0n).
 * @returns {bigint} Exact integer value of P(n, k) = n! / (n - k)!.
 * @throws {TypeError} If `n` or `k` is not a BigInt.
 * @throws {RangeError} If `n < 0n` or `k < 0n`.
 */
export function permutationsBigIntIterative(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, received ${typeof n}`)
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(`Expected k to be a BigInt, received ${typeof k}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected n to be >= 0n, received ${n}`)
	}
	if (k < 0n) {
		throw new RangeError(`Expected k to be >= 0n, received ${k}`)
	}
	if (k > n) {
		return 0n
	}

	let result = 1n
	const stop = n - k
	for (let factor = n; factor > stop; factor -= 1n) {
		result *= factor
	}
	return result
}
