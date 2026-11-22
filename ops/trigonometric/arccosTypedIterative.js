/**
 * Computes the element-wise arccosine (inverse cosine, in radians in [0, pi])
 * of a Float64Array using a straightforward iterative implementation.
 *
 * @param {Float64Array} values - Input Float64Array with all elements finite and in [-1, 1].
 * @returns {Float64Array} A new Float64Array containing arccos(values[i]) for each element.
 * @throws {TypeError} If `values` is not an instance of Float64Array.
 * @throws {RangeError} If any element in `values` is non-finite or outside [-1, 1].
 */
export function arccosTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	const length = values.length
	const result = new Float64Array(length)

	for (let i = 0; i < length; i += 1) {
		const x = values[i]
		if (!Number.isFinite(x) || x < -1 || x > 1) {
			throw new RangeError(
				`Element at index ${i} must be a finite number in [-1, 1], received ${x}`
			)
		}
		result[i] = Math.acos(x)
	}

	return result
}
