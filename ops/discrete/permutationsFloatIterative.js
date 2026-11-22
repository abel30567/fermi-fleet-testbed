/**
 * Computes the number of k-permutations of n distinct elements, P(n, k),
 * over IEEE-754 float64 numbers using a straightforward iterative product.
 *
 * Uses the reduced falling-factorial form:
 *
 *   P(n, k) = n! / (n - k)! = ∏_{i=0}^{k-1} (n - i)
 *
 * Computing the product iteratively avoids evaluating intermediate factorials
 * (e.g. `n!` and `(n - k)!`), preventing unnecessary overflow to `Infinity`
 * (and `Infinity / Infinity = NaN`) when `n` is large and `k` is small.
 *
 * Results are exact whenever `P(n, k) <= Number.MAX_SAFE_INTEGER`, approximate
 * in IEEE-754 float64 above `Number.MAX_SAFE_INTEGER`, and return `Infinity`
 * on float64 overflow. Returns `0` when `k > n` and `1` when `k === 0`.
 *
 * @param {number} n - Total number of distinct elements (non-negative safe integer).
 * @param {number} k - Number of elements to arrange (non-negative safe integer).
 * @returns {number} The number of k-permutations P(n, k) as a float64 Number.
 * @throws {TypeError} If `n` or `k` is not a number.
 * @throws {RangeError} If `n` or `k` is negative, non-integer, non-finite, or exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * permutationsFloatIterative(5, 3)    // => 60
 * permutationsFloatIterative(1000, 2) // => 999000
 * permutationsFloatIterative(4, 0)    // => 1
 * permutationsFloatIterative(3, 5)    // => 0
 */
export function permutationsFloatIterative(n, k) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected n to be a number, got ${typeof n}`)
	}
	if (typeof k !== 'number') {
		throw new TypeError(`Expected k to be a number, got ${typeof k}`)
	}
	if (!Number.isSafeInteger(n) || n < 0) {
		throw new RangeError(`Expected n to be a non-negative safe integer, got ${n}`)
	}
	if (!Number.isSafeInteger(k) || k < 0) {
		throw new RangeError(`Expected k to be a non-negative safe integer, got ${k}`)
	}

	if (k > n) {
		return 0
	}
	if (k === 0) {
		return 1
	}

	let result = 1
	for (let i = 0; i < k; i++) {
		result *= n - i
		if (!Number.isFinite(result)) {
			return Infinity
		}
	}

	return result
}
