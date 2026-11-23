/**
 * Computes the element-wise arcsine (in radians, in `[-π/2, π/2]`) of a
 * `Float64Array` using a straightforward iterative loop.
 *
 * Elements outside `[-1, 1]` or `NaN` produce `NaN`, matching `Math.asin`.
 * Signed zero (`-0`) is preserved. The input array is not mutated.
 *
 * @param {Float64Array} input - Input values whose arcsine will be computed.
 * @returns {Float64Array} A new `Float64Array` of the same length containing
 *   the element-wise arcsine results in radians.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 */
export function arcsinTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i += 1) {
		output[i] = Math.asin(input[i])
	}

	return output
}
