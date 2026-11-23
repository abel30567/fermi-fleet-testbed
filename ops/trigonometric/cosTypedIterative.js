/**
 * Computes the trigonometric cosine element-wise over a Float64Array
 * using a straightforward iterative loop.
 *
 * Does not mutate the input array; returns a new Float64Array of the same length.
 *
 * @param {Float64Array} input - Input angles in radians.
 * @returns {Float64Array} A new Float64Array containing `Math.cos(input[i])` for each element.
 * @throws {TypeError} If `input` is not a Float64Array.
 */
export function cosTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i += 1) {
		result[i] = Math.cos(input[i]);
	}

	return result;
}
