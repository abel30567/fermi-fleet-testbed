/**
 * Computes the recursive divide-and-conquer pairwise dot product of a slice [start, end).
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @param {number} start - Inclusive starting index.
 * @param {number} end - Exclusive ending index.
 * @returns {number} Partial dot product for the range [start, end).
 */
function dotRange(a, b, start, end) {
	const len = end - start
	if (len === 1) {
		return a[start] * b[start]
	}
	const mid = start + Math.floor(len / 2)
	return dotRange(a, b, start, mid) + dotRange(a, b, mid, end)
}

/**
 * Computes the dot product of two Float64Array vectors using a recursive
 * divide-and-conquer (pairwise summation) algorithm.
 *
 * Pairwise summation keeps recursion depth at O(log n) and reduces
 * floating-point rounding error compared to naive linear accumulation.
 *
 * @param {Float64Array} a - First vector.
 * @param {Float64Array} b - Second vector (must have the same length as `a`).
 * @returns {number} The scalar dot product `sum_i (a[i] * b[i])`, or `0` for empty vectors.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
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
			`Vectors must have the same length (got ${a.length} and ${b.length})`
		)
	}
	if (a.length === 0) {
		return 0
	}
	return dotRange(a, b, 0, a.length)
}
