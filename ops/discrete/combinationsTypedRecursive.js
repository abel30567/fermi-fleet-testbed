/**
 * Natural logarithm threshold slightly above `Math.log(Number.MAX_VALUE)` (~709.7827).
 * Used with the exact lower bound `C(n, r) >= (n / r)^r` (for `1 <= r <= n`) to
 * short-circuit guaranteed IEEE-754 overflow to `Infinity` in O(1) time.
 */
const OVERFLOW_LOG_BOUND = 710

/**
 * Validates that a single element of an input `Float64Array` is a non-negative
 * safe integer.
 *
 * @param {number} value - Element value to validate.
 * @param {string} name - Parameter name for error diagnostics.
 * @param {number} index - Element index for error diagnostics.
 * @throws {RangeError} If `value` is not a finite, non-negative safe integer.
 */
function validateNonNegativeSafeInteger(value, name, index) {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name}[${index}] must be a finite integer, got ${value}`)
	}
	if (!Number.isInteger(value)) {
		throw new RangeError(`${name}[${index}] must be an integer, got ${value}`)
	}
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`${name}[${index}] must be a safe integer, got ${value}`)
	}
	if (value < 0) {
		throw new RangeError(`${name}[${index}] must be non-negative, got ${value}`)
	}
}

/**
 * Computes the product of all integers in the inclusive range `[lo, hi]`
 * using recursive divide-and-conquer binary splitting.
 *
 * @param {bigint} lo - Lower bound (inclusive).
 * @param {bigint} hi - Upper bound (inclusive).
 * @returns {bigint} Product `lo * (lo + 1) * ... * hi`, or `1n` when `lo > hi`.
 */
function productRangeRecursive(lo, hi) {
	if (lo > hi) {
		return 1n
	}
	if (lo === hi) {
		return lo
	}
	const mid = lo + ((hi - lo) >> 1n)
	return productRangeRecursive(lo, mid) * productRangeRecursive(mid + 1n, hi)
}

/**
 * Computes the binomial coefficient `C(n, k)` for validated non-negative safe
 * integers `n` and `k` using symmetry reduction and recursive binary splitting.
 *
 * @param {number} n - Total number of items (non-negative safe integer).
 * @param {number} k - Number of chosen items (non-negative safe integer).
 * @returns {number} Binomial coefficient `C(n, k)` as a float64 (`Infinity` on overflow).
 */
function combinationsScalarRecursive(n, k) {
	if (k > n) {
		return 0
	}

	const r = k < n - k ? k : n - k
	if (r === 0) {
		return 1
	}
	if (r === 1) {
		return n === 0 ? 0 : n
	}

	// Exact lower bound: C(n, r) >= (n / r)^r for 1 <= r <= n.
	if (r * Math.log(n / r) > OVERFLOW_LOG_BOUND) {
		return Infinity
	}

	const bigN = BigInt(n)
	const bigR = BigInt(r)
	const numerator = productRangeRecursive(bigN - bigR + 1n, bigN)
	const denominator = productRangeRecursive(1n, bigR)
	return Number(numerator / denominator)
}

/**
 * Recursively populates `out[start..end)` with element-wise `C(nValues[i], kValues[i])`
 * using divide-and-conquer splitting of the array index range.
 *
 * @param {Float64Array} nValues - Input array of `n` values.
 * @param {Float64Array} kValues - Input array of `k` values.
 * @param {Float64Array} out - Destination output array.
 * @param {number} start - Start index (inclusive).
 * @param {number} end - End index (exclusive).
 */
function fillCombinationsRangeRecursive(nValues, kValues, out, start, end) {
	const count = end - start
	if (count <= 0) {
		return
	}
	if (count === 1) {
		const n = nValues[start]
		const k = kValues[start]
		validateNonNegativeSafeInteger(n, 'nValues', start)
		validateNonNegativeSafeInteger(k, 'kValues', start)
		out[start] = combinationsScalarRecursive(n, k)
		return
	}

	const mid = start + (count >>> 1)
	fillCombinationsRangeRecursive(nValues, kValues, out, start, mid)
	fillCombinationsRangeRecursive(nValues, kValues, out, mid, end)
}

/**
 * Computes discrete combinations `C(n, k)` ("n choose k") element-wise over two
 * equal-length `Float64Array` inputs using a recursive divide-and-conquer
 * implementation (both for traversing the typed arrays and for binary-splitting
 * factorial products).
 *
 * For each index `i`:
 * - `nValues[i]` and `kValues[i]` must be finite, non-negative safe integers.
 * - If `kValues[i] > nValues[i]`, the result is `0`.
 * - If `C(n, k)` exceeds `Number.MAX_VALUE`, the result is `Infinity`.
 *
 * @param {Float64Array} nValues - Element-wise `n` values (non-negative safe integers).
 * @param {Float64Array} kValues - Element-wise `k` values (non-negative safe integers).
 * @returns {Float64Array} A new `Float64Array` containing `C(nValues[i], kValues[i])`.
 * @throws {TypeError} If `nValues` or `kValues` is not a `Float64Array`.
 * @throws {RangeError} If input lengths differ or any element is not a non-negative safe integer.
 */
export function combinationsTypedRecursive(nValues, kValues) {
	if (!(nValues instanceof Float64Array)) {
		throw new TypeError('nValues must be a Float64Array')
	}
	if (!(kValues instanceof Float64Array)) {
		throw new TypeError('kValues must be a Float64Array')
	}
	if (nValues.length !== kValues.length) {
		throw new RangeError(
			`nValues and kValues must have the same length (${nValues.length} !== ${kValues.length})`
		)
	}

	const out = new Float64Array(nValues.length)
	fillCombinationsRangeRecursive(nValues, kValues, out, 0, nValues.length)
	return out
}
