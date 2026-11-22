/**
 * Computes the product of consecutive integers in the inclusive range [lo, hi]
 * using recursive binary splitting (divide-and-conquer).
 *
 * @param {number} lo - Lower bound of the integer range (inclusive).
 * @param {number} hi - Upper bound of the integer range (inclusive).
 * @returns {number} Product of integers from lo through hi, or 1 if lo > hi.
 */
function rangeProduct(lo, hi) {
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
	return rangeProduct(lo, mid) * rangeProduct(mid + 1, hi)
}

/**
 * Validates a single (n, k) pair and computes the number of k-permutations
 * of n elements, P(n, k) = n! / (n - k)!.
 *
 * @param {number} n - Total number of distinct items (non-negative safe integer).
 * @param {number} k - Number of items selected in order (non-negative safe integer).
 * @param {number} index - Element index used in validation error messages.
 * @returns {number} The permutation count P(n, k) as a float64 number (Infinity on overflow).
 * @throws {RangeError} If n or k is not a non-negative safe integer.
 */
function computePermutation(n, k, index) {
	if (!Number.isSafeInteger(n) || n < 0) {
		throw new RangeError(
			`Invalid n at index ${index}: expected a non-negative safe integer, got ${n}`,
		)
	}
	if (!Number.isSafeInteger(k) || k < 0) {
		throw new RangeError(
			`Invalid k at index ${index}: expected a non-negative safe integer, got ${k}`,
		)
	}
	if (k === 0) {
		return 1
	}
	if (k > n) {
		return 0
	}
	// Since P(n, k) >= k! and 171! > Number.MAX_VALUE (~1.7977e308),
	// any k >= 171 with k <= n necessarily overflows IEEE 754 float64 to Infinity.
	if (k >= 171) {
		return Infinity
	}
	return rangeProduct(n - k + 1, n)
}

/**
 * Recursively populates `out[start..end)` with element-wise permutations P(ns[i], ks[i])
 * using divide-and-conquer splitting across the array range.
 *
 * @param {Float64Array} ns - Input array of n values.
 * @param {Float64Array} ks - Input array of k values.
 * @param {Float64Array} out - Output array to populate.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function fillRange(ns, ks, out, start, end) {
	if (start >= end) {
		return
	}
	if (end - start === 1) {
		out[start] = computePermutation(ns[start], ks[start], start)
		return
	}
	const mid = start + ((end - start) >>> 1)
	fillRange(ns, ks, out, start, mid)
	fillRange(ns, ks, out, mid, end)
}

/**
 * Computes discrete k-permutations of n, P(n, k) = n! / (n - k)!, element-wise
 * over two equal-length Float64Array inputs using a recursive divide-and-conquer
 * implementation (both for traversing the typed arrays and for binary-splitting
 * the falling factorial product).
 *
 * Conventions for valid non-negative safe integer inputs:
 * - P(n, 0) = 1 (including P(0, 0) = 1)
 * - P(n, k) = 0 when k > n
 * - P(n, k) = Infinity when the exact result exceeds Number.MAX_VALUE
 *
 * @param {Float64Array} ns - Element-wise total counts n (each a non-negative safe integer).
 * @param {Float64Array} ks - Element-wise selection counts k (each a non-negative safe integer).
 * @returns {Float64Array} A new Float64Array containing P(ns[i], ks[i]) at each index i.
 * @throws {TypeError} If either `ns` or `ks` is not a Float64Array.
 * @throws {RangeError} If `ns` and `ks` have different lengths, or if any element is not a non-negative safe integer.
 */
export function permutationsTypedRecursive(ns, ks) {
	if (!(ns instanceof Float64Array)) {
		throw new TypeError('Expected first argument "ns" to be a Float64Array')
	}
	if (!(ks instanceof Float64Array)) {
		throw new TypeError('Expected second argument "ks" to be a Float64Array')
	}
	if (ns.length !== ks.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (got ${ns.length} and ${ks.length})`,
		)
	}

	const out = new Float64Array(ns.length)
	fillRange(ns, ks, out, 0, ns.length)
	return out
}
