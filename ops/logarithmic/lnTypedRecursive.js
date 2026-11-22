/**
 * Recursively computes the element-wise natural logarithm for the index range
 * `[lo, hi)` using divide-and-conquer, writing results into `out`.
 *
 * @param {Float64Array} values - Input array of strictly positive finite/infinite numbers.
 * @param {Float64Array} out - Destination array receiving computed natural logarithms.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any element in `[lo, hi)` is `<= 0` or `NaN`.
 */
function lnRange(values, out, lo, hi) {
	const count = hi - lo
	if (count <= 0) {
		return
	}
	if (count === 1) {
		const value = values[lo]
		if (Number.isNaN(value) || value <= 0) {
			throw new RangeError(
				`lnTypedRecursive requires all elements to be strictly positive numbers; received ${value} at index ${lo}`,
			)
		}
		out[lo] = Math.log(value)
		return
	}

	const mid = lo + Math.floor(count / 2)
	lnRange(values, out, lo, mid)
	lnRange(values, out, mid, hi)
}

/**
 * Computes the element-wise natural logarithm (base e) over a `Float64Array`
 * using a divide-and-conquer recursive strategy splitting `[lo, hi)` into halves.
 *
 * Does not mutate the input array; always returns a new `Float64Array`.
 *
 * @param {Float64Array} values - Input `Float64Array` containing strictly positive values (`> 0`).
 * @returns {Float64Array} A new `Float64Array` of the same length containing `Math.log(values[i])`.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element in `values` is `<= 0` or `NaN`.
 */
export function lnTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError(
			`lnTypedRecursive expects a Float64Array, received ${values === null ? 'null' : typeof values}`,
		)
	}

	const result = new Float64Array(values.length)
	lnRange(values, result, 0, values.length)
	return result
}
