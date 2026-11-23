/**
 * Computes the number of k-permutations of n distinct items, P(n, k) = n! / (n - k)!,
 * over exact BigInt integers using a straightforward iterative implementation.
 *
 * Returns 0n when k > n, and 1n when k === 0n.
 *
 * @param {bigint} n - Total number of items (non-negative BigInt).
 * @param {bigint} k - Number of ordered items to select (non-negative BigInt).
 * @returns {bigint} Exact BigInt value of P(n, k).
 * @throws {TypeError} If `n` or `k` is not a BigInt.
 * @throws {RangeError} If `n` or `k` is negative.
 */
export function permutationsBigIntIterative(n, k) {
  if (typeof n !== 'bigint' || typeof k !== 'bigint') {
    throw new TypeError('n and k must both be BigInt values');
  }
  if (n < 0n || k < 0n) {
    throw new RangeError('n and k must be non-negative BigInt values');
  }
  if (k > n) {
    return 0n;
  }

  let result = 1n;
  const stop = n - k;
  for (let i = n; i > stop; i--) {
    result *= i;
  }
  return result;
}
