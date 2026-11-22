/**
 * Exact BigInt binomial coefficient C(n, k) computed via recursive
 * divide-and-conquer binary splitting.
 *
 * Uses symmetry `r = min(k, n - k)` and computes the numerator product over
 * `[n - r + 1, n]` and denominator product over `[1, r]` using balanced
 * recursive range products (`O(log r)` recursion depth), then performs exact
 * integer division.
 *
 * @param {bigint} n - Non-negative integer total number of items.
 * @param {bigint} k - Non-negative integer number of chosen items.
 * @returns {bigint} Exact binomial coefficient C(n, k), or `0n` when `k > n`.
 * @throws {TypeError} If `n` or `k` is not a `bigint`.
 * @throws {RangeError} If `n` or `k` is negative.
 */
export function combinationsBigIntRecursive(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected bigint for n, got ${typeof n}`);
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(`Expected bigint for k, got ${typeof k}`);
	}
	if (n < 0n) {
		throw new RangeError(`Expected non-negative bigint for n, got ${n}`);
	}
	if (k < 0n) {
		throw new RangeError(`Expected non-negative bigint for k, got ${k}`);
	}

	if (k > n) {
		return 0n;
	}
	if (k === 0n || k === n) {
		return 1n;
	}

	const r = k > n - k ? n - k : k;
	if (r === 1n) {
		return n;
	}

	const numerator = rangeProduct(n - r + 1n, n);
	const denominator = rangeProduct(1n, r);
	return numerator / denominator;
}

/**
 * Recursively computes the product of consecutive BigInts in `[low, high]`
 * using balanced divide-and-conquer binary splitting (`O(log(high - low + 1))`
 * recursion depth).
 *
 * @param {bigint} low - Inclusive lower bound.
 * @param {bigint} high - Inclusive upper bound.
 * @returns {bigint} Product of all integers from `low` to `high`, or `1n` if `low > high`.
 */
function rangeProduct(low, high) {
	if (low > high) {
		return 1n;
	}
	if (low === high) {
		return low;
	}
	if (high - low === 1n) {
		return low * high;
	}

	const mid = (low + high) >> 1n;
	return rangeProduct(low, mid) * rangeProduct(mid + 1n, high);
}
