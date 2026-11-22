/**
 * Computes the binomial coefficient C(n, k) = n! / (k! * (n - k)!) over exact
 * BigInt integers using a straightforward iterative multiplicative algorithm.
 *
 * Since binomial coefficients for non-negative integers are always exact
 * integers, the result is returned as an exact unscaled BigInt (no fixed-point
 * scaling is applied).
 *
 * Exploits symmetry `r = min(k, n - k)` so that the loop executes at most
 * `min(k, n - k)` iterations, maintaining exact divisibility at every step:
 * `result = (result * (n - r + i)) / i` for `i = 1n .. r`.
 *
 * @param {bigint} n - Total number of items (must be a non-negative BigInt).
 * @param {bigint} k - Number of items to choose (must be a non-negative BigInt).
 * @returns {bigint} Exact binomial coefficient C(n, k), or `0n` when `k > n`.
 * @throws {TypeError} If `n` or `k` is not a `bigint`.
 * @throws {RangeError} If `n < 0n` or `k < 0n`.
 */
export function combinationsBigIntIterative(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, got ${typeof n}`)
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(`Expected k to be a BigInt, got ${typeof k}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected n to be non-negative, got ${n}`)
	}
	if (k < 0n) {
		throw new RangeError(`Expected k to be non-negative, got ${k}`)
	}

	if (k > n) {
		return 0n
	}

	const r = k > n - k ? n - k : k
	if (r === 0n) {
		return 1n
	}
	if (r === 1n) {
		return n
	}

	let result = 1n
	for (let i = 1n; i <= r; i += 1n) {
		result = (result * (n - r + i)) / i
	}
	return result
}
