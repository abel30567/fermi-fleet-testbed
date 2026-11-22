/**
 * Exact, numerically robust computation of k-permutations of n items,
 * P(n, k) = n! / (n - k)! = ∏_{i=0}^{k-1} (n - i), using arbitrary-precision BigInt.
 *
 * Numerical & Algorithmic Guarantees:
 * - Exactness: All results are exact non-negative integers represented as unscaled BigInt
 *   values (no floating-point rounding, overflow, or precision loss beyond Number.MAX_SAFE_INTEGER).
 * - Avoidance of catastrophic intermediate blowup: Computes the falling factorial directly over
 *   the interval [n - k + 1, n] rather than forming n! and dividing by (n - k)!. This makes
 *   queries such as P(10^30, 5) execute in O(k) multiplications instead of trying to materialize
 *   (10^30)!.
 * - Balanced binary-splitting range product: Recursively splits [low, high] into balanced halves
 *   so that multiplied subproducts have comparable bit-lengths, achieving O(M(b) log k) time
 *   complexity (where M(b) is the cost of b-bit BigInt multiplication) and O(log k) call-stack
 *   depth without intermediate divisions.
 *
 * @module ops/discrete/permutationsBigIntStable
 */

/**
 * Computes the exact product of all integers in the inclusive range [low, high]
 * using balanced binary splitting.
 *
 * Precondition: 1n <= low <= high.
 *
 * @param {bigint} low - Lower bound of the product range (inclusive).
 * @param {bigint} high - Upper bound of the product range (inclusive).
 * @returns {bigint} Exact product ∏_{x=low}^{high} x.
 */
function rangeProduct(low, high) {
	const span = high - low;
	if (span === 0n) {
		return low;
	}
	if (span === 1n) {
		return low * high;
	}
	if (span === 2n) {
		return (low * (low + 1n)) * high;
	}
	const mid = low + (span >> 1n);
	return rangeProduct(low, mid) * rangeProduct(mid + 1n, high);
}

/**
 * Computes the exact number of k-permutations of n distinct items:
 *   P(n, k) = n * (n - 1) * ... * (n - k + 1)
 *
 * Scaling & Precision Convention:
 * - Permutations are always exact non-negative integers; the returned BigInt is exact and unscaled.
 * - By standard combinatorial convention:
 *   - P(n, 0) = 1n for all n >= 0n (including P(0n, 0n) = 1n).
 *   - P(n, k) = 0n whenever k > n >= 0n.
 *
 * @param {bigint} n - Total number of distinct items (non-negative BigInt).
 * @param {bigint} k - Number of ordered positions to select (non-negative BigInt).
 * @returns {bigint} Exact falling factorial P(n, k).
 * @throws {TypeError} If either `n` or `k` is not a BigInt.
 * @throws {RangeError} If either `n` or `k` is negative.
 */
export function permutationsBigIntStable(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(
			`Expected parameter "n" to be a BigInt, received ${n === null ? 'null' : typeof n}`
		);
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(
			`Expected parameter "k" to be a BigInt, received ${k === null ? 'null' : typeof k}`
		);
	}
	if (n < 0n) {
		throw new RangeError(`Expected parameter "n" to be non-negative, received ${n}n`);
	}
	if (k < 0n) {
		throw new RangeError(`Expected parameter "k" to be non-negative, received ${k}n`);
	}

	if (k === 0n) {
		return 1n;
	}
	if (k > n) {
		return 0n;
	}
	if (k === 1n) {
		return n;
	}
	if (k === 2n) {
		return n * (n - 1n);
	}

	return rangeProduct(n - k + 1n, n);
}
