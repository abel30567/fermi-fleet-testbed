/**
 * Computes the balanced product of all BigInt integers in the closed interval [lo, hi].
 *
 * Uses binary splitting so that multiplications combine factors of comparable bit-length,
 * enabling sub-quadratic BigInt multiplication (Karatsuba / Toom-Cook / FFT in V8) while
 * keeping recursion depth at O(log2(hi - lo + 1)).
 *
 * @param {bigint} lo - Lower bound (inclusive), must satisfy lo <= hi.
 * @param {bigint} hi - Upper bound (inclusive).
 * @returns {bigint} Exact product lo * (lo + 1n) * ... * hi.
 */
function balancedRangeProduct(lo, hi) {
	if (lo === hi) {
		return lo;
	}
	if (lo + 1n === hi) {
		return lo * hi;
	}
	const mid = lo + ((hi - lo) >> 1n);
	return balancedRangeProduct(lo, mid) * balancedRangeProduct(mid + 1n, hi);
}

/**
 * Computes the exact number of k-permutations of n distinct items,
 * P(n, k) = n! / (n - k)! = n * (n - 1) * ... * (n - k + 1),
 * over arbitrary-precision BigInt integers.
 *
 * Evaluates the falling factorial directly via a balanced binary-splitting product over
 * [n - k + 1, n], avoiding the computation of full n! and (n - k)!. This keeps work
 * proportional to k (not n), allows very large n with small k, and leverages balanced
 * operand sizes for BigInt multiplication performance.
 *
 * Edge cases:
 * - k === 0n (for any n >= 0n, including n === 0n): returns 1n.
 * - k > n: returns 0n.
 * - k === 1n: returns n.
 * - k === n: returns n!.
 *
 * @param {bigint} n - Total number of items (non-negative BigInt).
 * @param {bigint} k - Number of items to arrange (non-negative BigInt).
 * @returns {bigint} Exact BigInt value of P(n, k).
 * @throws {TypeError} If n or k is not a BigInt.
 * @throws {RangeError} If n < 0n or k < 0n.
 */
export function permutationsBigIntStable(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a bigint, got ${n === null ? 'null' : typeof n}`);
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(`Expected k to be a bigint, got ${k === null ? 'null' : typeof k}`);
	}
	if (n < 0n) {
		throw new RangeError(`Expected n >= 0n, got ${n}`);
	}
	if (k < 0n) {
		throw new RangeError(`Expected k >= 0n, got ${k}`);
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

	return balancedRangeProduct(n - k + 1n, n);
}
