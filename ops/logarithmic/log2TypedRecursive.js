/**
 * Computes the base-2 logarithm of each element in a Float64Array using a
 * divide-and-conquer recursion over index ranges `[lo, hi)`.
 *
 * @param {Float64Array} values - Input array of strictly positive finite/infinite numbers.
 * @returns {Float64Array} A new Float64Array containing `Math.log2(x)` for each element `x`.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element in `values` is `NaN` or less than or equal to `0`.
 */
export function log2TypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	const result = new Float64Array(values.length)
	computeRange(values, result, 0, values.length)
	return result
}

/**
 * Recursively computes `Math.log2` for indices in `[lo, hi)` by halving the range.
 *
 * @param {Float64Array} input
 * @param {Float64Array} output
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 */
function computeRange(input, output, lo, hi) {
	if (lo >= hi) {
		return
	}

	if (hi - lo === 1) {
		const value = input[lo]
		if (Number.isNaN(value) || value <= 0) {
			throw new RangeError(
				`Expected positive non-NaN value at index ${lo}, received ${value}`
			)
		}
		output[lo] = Math.log2(value)
		return
	}

	const mid = lo + ((hi - lo) >>> 1)
	computeRange(input, output, lo, mid)
	computeRange(input, output, mid, hi)
}
