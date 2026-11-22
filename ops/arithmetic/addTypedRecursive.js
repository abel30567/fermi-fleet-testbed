/**
 * Performs element-wise addition of two Float64Array instances using a
 * divide-and-conquer recursive algorithm over index ranges `[lo, hi)`.
 *
 * @param {Float64Array} a - First input Float64Array.
 * @param {Float64Array} b - Second input Float64Array of the same length as `a`.
 * @returns {Float64Array} A new Float64Array where each element is `a[i] + b[i]`.
 * @throws {TypeError} If either `a` or `b` is not a Float64Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function addTypedRecursive(a, b) {
	if (!(a instanceof Float64Array) || !(b instanceof Float64Array)) {
		throw new TypeError('Both arguments must be instances of Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Float64Array length mismatch: received lengths ${a.length} and ${b.length}`
		)
	}

	const result = new Float64Array(a.length)
	addRange(a, b, result, 0, a.length)
	return result
}

/**
 * Recursively computes `out[i] = a[i] + b[i]` for `i` in `[lo, hi)` by
 * dividing the range into two halves `[lo, mid)` and `[mid, hi)`.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {Float64Array} out
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 */
function addRange(a, b, out, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return
	}
	if (len === 1) {
		out[lo] = a[lo] + b[lo]
		return
	}
	const mid = lo + Math.floor(len / 2)
	addRange(a, b, out, lo, mid)
	addRange(a, b, out, mid, hi)
}
