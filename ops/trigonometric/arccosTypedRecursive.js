/**
 * Recursively computes the element-wise arccosine of a slice `[start, end)`
 * of `src` into `dst` using a divide-and-conquer strategy.
 *
 * @param {Float64Array} src - Source array of input values in `[-1, 1]`.
 * @param {Float64Array} dst - Destination array receiving computed arccosine values.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @throws {RangeError} If any element in `[start, end)` is non-finite or outside `[-1, 1]`.
 */
function arccosDivideAndConquer(src, dst, start, end) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const value = src[start]
		if (!Number.isFinite(value) || value < -1 || value > 1) {
			throw new RangeError(
				`Input element at index ${start} must be a finite number in [-1, 1]; received ${value}`
			)
		}
		dst[start] = Math.acos(value)
		return
	}

	const mid = start + (len >>> 1)
	arccosDivideAndConquer(src, dst, start, mid)
	arccosDivideAndConquer(src, dst, mid, end)
}

/**
 * Computes the element-wise arccosine (in radians, range `[0, π]`) of a
 * `Float64Array` using a recursive divide-and-conquer algorithm.
 *
 * Runs in O(n) time with O(log n) recursion stack depth and does not mutate
 * the input array.
 *
 * @param {Float64Array} input - Input typed array whose elements lie in `[-1, 1]`.
 * @returns {Float64Array} A new `Float64Array` containing `Math.acos(x)` for each element.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 * @throws {RangeError} If any element is `NaN`, infinite, or outside `[-1, 1]`.
 */
export function arccosTypedRecursive(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`Expected input to be a Float64Array; received ${input === null ? 'null' : typeof input === 'object' ? input.constructor?.name ?? 'object' : typeof input}`
		)
	}

	const result = new Float64Array(input.length)
	arccosDivideAndConquer(input, result, 0, input.length)
	return result
}
