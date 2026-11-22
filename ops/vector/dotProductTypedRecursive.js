/**
 * Recursively computes the dot product of `a` and `b` over the half-open
 * index interval `[lo, hi)` using divide-and-conquer pairwise summation.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {number} Partial dot product over `[lo, hi)`.
 */
function dotRange(a, b, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return 0
	}
	if (len === 1) {
		return a[lo] * b[lo]
	}
	const mid = lo + (len >>> 1)
	return dotRange(a, b, lo, mid) + dotRange(a, b, mid, hi)
}

/**
 * Computes the Euclidean dot product of two equal-length `Float64Array`
 * vectors using a divide-and-conquer recursive pairwise summation.
 *
 * Pairwise summation splits the index range `[lo, hi)` into halves at each
 * recursive step, reducing accumulated floating-point rounding error compared
 * to naive sequential summation while keeping recursion depth at O(log n).
 *
 * @param {Float64Array} a - First vector of finite 64-bit floats.
 * @param {Float64Array} b - Second vector of finite 64-bit floats.
 * @returns {number} The scalar dot product (returns `0` for empty vectors).
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths or contain any
 *   non-finite (`NaN`, `Infinity`, `-Infinity`) element.
 */
export function dotProductTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument must be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vectors must have the same length (received ${a.length} and ${b.length})`,
		)
	}

	const n = a.length
	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(a[i])) {
			throw new RangeError(
				`First vector contains non-finite element at index ${i}: ${a[i]}`,
			)
		}
		if (!Number.isFinite(b[i])) {
			throw new RangeError(
				`Second vector contains non-finite element at index ${i}: ${b[i]}`,
			)
		}
	}

	const result = dotRange(a, b, 0, n)
	return result === 0 ? 0 : result
}
