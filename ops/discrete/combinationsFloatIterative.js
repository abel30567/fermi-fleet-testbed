/**
 * Computes the binomial coefficient C(n, k) ("n choose k") over IEEE-754
 * float64 Numbers using an iterative multiplicative algorithm.
 *
 * Uses symmetry `k = Math.min(k, n - k)` to minimize iterations and evaluates
 * `result = (result * (n - i + 1)) / i` for `i = 1..k`. Results remain exact
 * integers while intermediate products stay within `Number.MAX_SAFE_INTEGER`,
 * and follow standard IEEE-754 float64 rounding/overflow (`Infinity`) beyond
 * that range.
 *
 * @param {number} n - Total number of items (non-negative integer).
 * @param {number} k - Number of chosen items (non-negative integer).
 * @returns {number} The number of combinations C(n, k), or `0` when `k > n`.
 * @throws {TypeError} If `n` or `k` is not a number.
 * @throws {RangeError} If `n` or `k` is not a non-negative finite integer.
 */
export function combinationsFloatIterative(n, k) {
	if (typeof n !== 'number' || typeof k !== 'number') {
		throw new TypeError('combinationsFloatIterative expects numeric arguments n and k')
	}
	if (!Number.isInteger(n) || !Number.isInteger(k)) {
		throw new RangeError('combinationsFloatIterative expects finite integer arguments n and k')
	}
	if (n < 0 || k < 0) {
		throw new RangeError('combinationsFloatIterative expects non-negative integer arguments n and k')
	}

	if (k > n) {
		return 0
	}
	if (k === 0 || k === n) {
		return 1
	}

	const r = Math.min(k, n - k)
	let result = 1
	for (let i = 1; i <= r; i++) {
		result = (result * (n - i + 1)) / i
		if (!Number.isFinite(result)) {
			return result
		}
	}
	return result
}
