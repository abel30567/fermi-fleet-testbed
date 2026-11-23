/**
 * Computes the element-wise real cube root of a Float64Array using a
 * straightforward iterative loop.
 *
 * Does not mutate the input array and preserves IEEE-754 special values
 * (`+0`, `-0`, `NaN`, `Infinity`, `-Infinity`).
 *
 * @param {Float64Array} input - The input Float64Array of real numbers.
 * @returns {Float64Array} A new Float64Array containing the cube root of each element.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 */
export function cbrtTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i += 1) {
		result[i] = Math.cbrt(input[i]);
	}

	return result;
}
