/**
 * Validate that an input is a non-negative safe integer number.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 */
function assertNonNegativeSafeInteger(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number, received ${typeof value}`)
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative safe integer, received ${value}`)
	}
}

/**
 * Recursively compute the product of consecutive integers in [lo, hi]
 * using divide-and-conquer range splitting.
 *
 * @param {number} lo - Inclusive lower bound (positive safe integer).
 * @param {number} hi - Inclusive upper bound (positive safe integer, hi >= lo).
 * @returns {number} IEEE-754 float64 product of lo * (lo + 1) * ... * hi.
 */
function productRange(lo, hi) {
	if (lo > hi) {
		return 1
	}
	if (lo === hi) {
		return lo
	}
	if (hi - lo === 1) {
		return lo * hi
	}

	const mid = lo + Math.floor((hi - lo) / 2)
	const left = productRange(lo, mid)
	if (!Number.isFinite(left)) {
		return Infinity
	}
	const right = productRange(mid + 1, hi)
	return left * right
}

/**
 * Compute the number of k-permutations of n distinct items, P(n, k) = n! / (n - k)!,
 * over IEEE-754 float64 numbers using a recursive divide-and-conquer range product
 * over `(n - k + 1) ... n`.
 *
 * Avoiding explicit evaluation of `n!` allows large `n` with small `k` (e.g., P(1000, 3))
 * to be computed accurately without intermediate overflow. Results exceeding
 * `Number.MAX_VALUE` naturally overflow to `Infinity`.
 *
 * @param {number} n - Total number of items (non-negative safe integer).
 * @param {number} k - Number of items to arrange (non-negative safe integer).
 * @returns {number} The number of permutations P(n, k) as an IEEE-754 float64 number
 *   (`1` when `k === 0`, `0` when `k > n`, `Infinity` on float64 overflow).
 * @throws {TypeError} If `n` or `k` is not a number.
 * @throws {RangeError} If `n` or `k` is negative, non-integer, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function permutationsFloatRecursive(n, k) {
	assertNonNegativeSafeInteger(n, 'n')
	assertNonNegativeSafeInteger(k, 'k')

	if (k === 0) {
		return 1
	}
	if (k > n) {
		return 0
	}
	// For any n >= k >= 171, P(n, k) >= 171! > Number.MAX_VALUE (~1.7977e308).
	if (k >= 171) {
		return Infinity
	}

	return productRange(n - k + 1, n)
}
