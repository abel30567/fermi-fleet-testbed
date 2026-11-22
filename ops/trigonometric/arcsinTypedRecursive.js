/**
 * Recursively computes element-wise arcsine over the half-open index range [lo, hi).
 *
 * @param {Float64Array} src - Source values in [-1, 1].
 * @param {Float64Array} dst - Destination buffer for arcsine results.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 */
function fillArcsinRange(src, dst, lo, hi) {
	const len = hi - lo
	if (len === 0) return

	if (len === 1) {
		const x = src[lo]
		if (Number.isNaN(x) || x < -1 || x > 1) {
			throw new RangeError(
				`Element at index ${lo} must be within [-1, 1], received ${x}`,
			)
		}
		dst[lo] = Math.asin(x)
		return
	}

	const mid = lo + ((hi - lo) >>> 1)
	fillArcsinRange(src, dst, lo, mid)
	fillArcsinRange(src, dst, mid, hi)
}

/**
 * Computes the element-wise arcsine (inverse sine, in radians within [-π/2, π/2])
 * of a `Float64Array` using a divide-and-conquer recursive algorithm that splits
 * the index range `[lo, hi)` into halves.
 *
 * @param {Float64Array} values - Input typed array whose elements must lie in `[-1, 1]`.
 * @returns {Float64Array} A new `Float64Array` containing `Math.asin(x)` for each element.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element is `NaN` or outside the closed interval `[-1, 1]`.
 */
export function arcsinTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError(
			`Expected a Float64Array, received ${values === null ? 'null' : typeof values === 'object' ? values.constructor?.name ?? 'Object' : typeof values}`,
		)
	}

	const result = new Float64Array(values.length)
	fillArcsinRange(values, result, 0, values.length)
	return result
}
