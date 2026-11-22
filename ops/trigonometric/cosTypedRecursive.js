/**
 * Recursively computes element-wise cosine over the half-open index range [lo, hi)
 * using divide-and-conquer, writing results into `out`.
 *
 * @param {Float64Array} values - Input angles in radians.
 * @param {Float64Array} out - Output buffer of equal length.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any element in [lo, hi) is NaN or non-finite.
 */
function fillCosRange(values, out, lo, hi) {
	if (hi <= lo) {
		return
	}

	if (hi - lo === 1) {
		const angle = values[lo]
		if (!Number.isFinite(angle)) {
			throw new RangeError(
				`Expected finite number at index ${lo}, received ${angle}`
			)
		}
		out[lo] = Math.cos(angle)
		return
	}

	const mid = lo + ((hi - lo) >>> 1)
	fillCosRange(values, out, lo, mid)
	fillCosRange(values, out, mid, hi)
}

/**
 * Computes the trigonometric cosine element-wise over a Float64Array of angles
 * (in radians) using a divide-and-conquer recursive implementation.
 *
 * @param {Float64Array} values - Input Float64Array of finite angles in radians.
 * @returns {Float64Array} A new Float64Array containing the cosine of each element.
 * @throws {TypeError} If `values` is not a Float64Array.
 * @throws {RangeError} If any element in `values` is NaN, Infinity, or -Infinity.
 */
export function cosTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	const out = new Float64Array(values.length)
	fillCosRange(values, out, 0, values.length)
	return out
}
