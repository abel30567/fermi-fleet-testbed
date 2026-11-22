/**
 * Recursively computes the element-wise arccosine of `src[lo..hi)` into `dst[lo..hi)`
 * using divide-and-conquer over the half-open index interval `[lo, hi)`.
 *
 * @param {Float64Array} src - Source array of values in `[-1, 1]`.
 * @param {Float64Array} dst - Destination array receiving `Math.acos` results.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any element in `src[lo..hi)` is `NaN` or outside `[-1, 1]`.
 */
function arccosRange(src, dst, lo, hi) {
	if (hi - lo <= 1) {
		if (lo < hi) {
			const value = src[lo]
			if (Number.isNaN(value) || value < -1 || value > 1) {
				throw new RangeError(
					`arccosTypedRecursive: element at index ${lo} must be within [-1, 1], received ${value}`
				)
			}
			dst[lo] = Math.acos(value)
		}
		return
	}

	const mid = lo + Math.floor((hi - lo) / 2)
	arccosRange(src, dst, lo, mid)
	arccosRange(src, dst, mid, hi)
}

/**
 * Computes the element-wise arccosine (in radians, `[0, π]`) of a `Float64Array`
 * using a divide-and-conquer recursive strategy.
 *
 * @param {Float64Array} values - Input `Float64Array` whose elements must lie in `[-1, 1]`.
 * @returns {Float64Array} A new `Float64Array` containing `Math.acos(values[i])` for each index `i`.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `values` is `NaN` or outside `[-1, 1]`.
 */
export function arccosTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError(
			`arccosTypedRecursive: expected a Float64Array, received ${values === null ? 'null' : typeof values}`
		)
	}

	const result = new Float64Array(values.length)
	arccosRange(values, result, 0, values.length)
	return result
}
