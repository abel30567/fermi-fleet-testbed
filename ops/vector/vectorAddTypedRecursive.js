/**
 * Recursively adds elements in the half-open index range [start, end)
 * of two Float64Array vectors into `out` using divide-and-conquer.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @param {Float64Array} out - Preallocated output vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function addRange(a, b, out, start, end) {
	const count = end - start
	if (count === 1) {
		out[start] = a[start] + b[start]
		return
	}

	const mid = start + (count >>> 1)
	addRange(a, b, out, start, mid)
	addRange(a, b, out, mid, end)
}

/**
 * Computes the element-wise sum of two Float64Array vectors using a
 * recursive divide-and-conquer algorithm.
 *
 * Returns a new Float64Array of the same length without mutating either input.
 * Recursion depth is O(log n) in the vector length.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector (must have the same length as `a`).
 * @returns {Float64Array} A new Float64Array containing `a[i] + b[i]` for each index `i`.
 * @throws {TypeError} If either `a` or `b` is not a Float64Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function vectorAddTypedRecursive(a, b) {
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

	const result = new Float64Array(a.length)
	if (a.length === 0) {
		return result
	}

	addRange(a, b, result, 0, a.length)
	return result
}
