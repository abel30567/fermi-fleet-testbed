/**
 * Computes the trigonometric sine element-wise over a Float64Array using a
 * straightforward iterative loop.
 *
 * Does not mutate the input array; returns a newly allocated Float64Array of
 * the same length where each element is `Math.sin(input[i])`.
 *
 * @param {Float64Array} input - Input angles in radians.
 * @returns {Float64Array} A new Float64Array containing the sine of each input element.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function sinTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('sinTypedIterative expects a Float64Array input');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i += 1) {
		result[i] = Math.sin(input[i]);
	}

	return result;
}
