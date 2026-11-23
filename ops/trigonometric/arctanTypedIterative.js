/**
 * Computes the element-wise arctangent (in radians, within [-π/2, π/2])
 * over a Float64Array using a straightforward iterative loop.
 *
 * @param {Float64Array} input - The input Float64Array of real values.
 * @returns {Float64Array} A new Float64Array where each element is arctan(input[i]).
 * @throws {TypeError} If input is not an instance of Float64Array.
 */
export function arctanTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const length = input.length
	const output = new Float64Array(length)

	for (let i = 0; i < length; i++) {
		output[i] = Math.atan(input[i])
	}

	return output
}
