/**
 * Computes the element-wise inverse sine (arcsin, in radians) of a Float64Array
 * using a straightforward iterative loop.
 *
 * Each element `x` must lie in the closed domain `[-1, 1]`, and the resulting
 * angles lie in `[-Math.PI / 2, Math.PI / 2]`. The input array is not mutated.
 *
 * @param {Float64Array} values - Input Float64Array of values in `[-1, 1]`.
 * @returns {Float64Array} A new Float64Array containing `arcsin(values[i])` in radians.
 * @throws {TypeError} If `values` is not a `Float64Array`.
 * @throws {RangeError} If any element is `NaN`, non-finite, or outside `[-1, 1]`.
 */
export function arcsinTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	const length = values.length
	const result = new Float64Array(length)

	for (let i = 0; i < length; i += 1) {
		const x = values[i]
		if (!(x >= -1 && x <= 1)) {
			throw new RangeError(
				`Element at index ${i} (${x}) is out of the valid arcsin domain [-1, 1]`
			)
		}
		result[i] = Math.asin(x)
	}

	return result
}
