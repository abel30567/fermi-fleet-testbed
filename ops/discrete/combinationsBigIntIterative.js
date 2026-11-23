/**
 * Computes the binomial coefficient C(n, k) ("n choose k") over exact BigInt
 * integers using a straightforward iterative multiplicative loop.
 *
 * Uses symmetry `r = min(k, n - k)` to minimize iterations and evaluates:
 *   C(n, r) = prod_{i = 1..r} (n - r + i) / i
 * At each step `i`, the running product equals `C(n - r + i, i)`, so every
 * division is exact with zero remainder.
 *
 * Returns `0n` when `k > n`, and `1n` when `k === 0n` or `k === n`.
 *
 * @param {bigint} n - Total number of items (non-negative BigInt).
 * @param {bigint} k - Number of chosen items (non-negative BigInt).
 * @returns {bigint} Exact binomial coefficient C(n, k).
 * @throws {TypeError} If `n` or `k` is not a `bigint`.
 * @throws {RangeError} If `n` or `k` is negative.
 */
export function combinationsBigIntIterative(n, k) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a bigint, received ${typeof n}`)
	}
	if (typeof k !== 'bigint') {
		throw new TypeError(`Expected k to be a bigint, received ${typeof k}`)
	}
	if (n < 0n) {
		throw new RangeError('Expected n to be a non-negative bigint')
	}
	if (k < 0n) {
		throw new RangeError('Expected k to be a non-negative bigint')
	}

	if (k > n) {
		return 0n
	}
	if (k === 0n || k === n) {
		return 1n
	}

	const r = k > n - k ? n - k : k
	const base = n - r
	let result = 1n

	for (let i = 1n; i <= r; i += 1n) {
		result = (result * (base + i)) / i
	}

	return result
}
