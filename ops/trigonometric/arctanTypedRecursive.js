/**
 * Recursively computes the element-wise arctangent over index range [lo, hi).
 *
 * @param {Float64Array} input - Source values.
 * @param {Float64Array} output - Destination array of equal length.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any element in the range is NaN.
 */
function arctanRange(input, output, lo, hi) {
	const length = hi - lo
	if (length <= 0) {
		return
	}
	if (length === 1) {
		const value = input[lo]
		if (Number.isNaN(value)) {
			throw new RangeError(`arctanTypedRecursive: element at index ${lo} is NaN`)
		}
		output[lo] = Math.atan(value)
		return
	}
	const mid = lo + Math.floor(length / 2)
	arctanRange(input, output, lo, mid)
	arctanRange(input, output, mid, hi)
}

/**
 * Computes the element-wise trigonometric arctangent (in radians, within [-π/2, π/2])
 * of a Float64Array using divide-and-conquer recursion.
 *
 * @param {Float64Array} values - Input Float64Array containing non-NaN numbers.
 * @returns {Float64Array} A new Float64Array with Math.atan applied to each element.
 * @throws {TypeError} If `values` is not a Float64Array.
 * @throws {RangeError} If any element in `values` is NaN.
 */
export function arctanTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('arctanTypedRecursive: expected a Float64Array input')
	}
	const result = new Float64Array(values.length)
	arctanRange(values, result, 0, values.length)
	return result
}
