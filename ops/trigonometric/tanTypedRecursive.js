/**
 * Recursively computes `Math.tan` over the half-open index range `[lo, hi)`
 * using divide-and-conquer, writing results into `out`.
 *
 * @param {Float64Array} input - Source array of angles in radians.
 * @param {Float64Array} out - Destination array for tangent values.
 * @param {number} lo - Inclusive lower bound of the range.
 * @param {number} hi - Exclusive upper bound of the range.
 * @throws {RangeError} If any element in `[lo, hi)` is `NaN` or non-finite.
 */
function tanRange(input, out, lo, hi) {
	if (lo >= hi) {
		return;
	}

	if (hi - lo === 1) {
		const value = input[lo];
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected all elements to be finite numbers, received ${value} at index ${lo}`,
			);
		}
		out[lo] = Math.tan(value);
		return;
	}

	const mid = lo + Math.floor((hi - lo) / 2);
	tanRange(input, out, lo, mid);
	tanRange(input, out, mid, hi);
}

/**
 * Computes the element-wise trigonometric tangent of a `Float64Array` of angles
 * (in radians) using a divide-and-conquer recursive algorithm.
 *
 * Does not mutate the input array and always returns a new `Float64Array`.
 *
 * @param {Float64Array} values - Input `Float64Array` of finite angles in radians.
 * @returns {Float64Array} A new `Float64Array` containing `Math.tan(x)` for each element `x`.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `values` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function tanTypedRecursive(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array');
	}

	const result = new Float64Array(values.length);
	tanRange(values, result, 0, values.length);
	return result;
}
