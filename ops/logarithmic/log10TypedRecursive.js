/**
 * Recursively computes base-10 logarithms for elements in the half-open index
 * range `[lo, hi)` via divide-and-conquer, writing results into `out`.
 *
 * @param {Float64Array} values - Input array of strictly positive numbers.
 * @param {Float64Array} out - Destination array for computed logarithms.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any element in `[lo, hi)` is `<= 0` or `NaN`.
 */
function computeRange(values, out, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const value = values[lo]
		if (Number.isNaN(value) || value <= 0) {
			throw new RangeError(
				`log10TypedRecursive requires strictly positive numbers; got ${value} at index ${lo}`,
			)
		}
		out[lo] = Math.log10(value)
		return
	}

	const mid = lo + (len >>> 1)
	computeRange(values, out, lo, mid)
	computeRange(values, out, mid, hi)
}

/**
 * Computes the element-wise base-10 logarithm of a `Float64Array` using
 * divide-and-conquer recursion over half-open index ranges `[lo, hi)`.
 *
 * Returns a new `Float64Array` without mutating the input.
 *
 * @param {Float64Array} values - Input `Float64Array` of strictly positive numbers.
 * @returns {Float64Array} New `Float64Array` containing `Math.log10(x)` for each element.
 * @throws {TypeError} If `values` is not a `Float64Array`.
 * @throws {RangeError} If any element is `<= 0` or `NaN`.
 */
export function log10TypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('log10TypedRecursive expects a Float64Array input')
	}

	const result = new Float64Array(values.length)
	computeRange(values, result, 0, values.length)
	return result
}
