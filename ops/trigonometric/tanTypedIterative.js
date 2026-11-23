/**
 * Computes the trigonometric tangent (`Math.tan`) element-wise over a `Float64Array`
 * using a straightforward iterative loop.
 *
 * Does not mutate the input array; returns a newly allocated `Float64Array` of the
 * same length. Special IEEE-754 values follow standard `Math.tan` semantics
 * (`±0` preserves sign, `±Infinity` and `NaN` yield `NaN`).
 *
 * @param {Float64Array} input - Input array of angles in radians.
 * @returns {Float64Array} A new `Float64Array` containing `Math.tan(input[i])` for each element.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 */
export function tanTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const length = input.length
	const output = new Float64Array(length)

	for (let i = 0; i < length; i++) {
		output[i] = Math.tan(input[i])
	}

	return output
}
