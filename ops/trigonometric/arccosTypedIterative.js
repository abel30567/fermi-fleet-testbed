/**
 * Computes the arccosine (inverse cosine, in radians in [0, pi]) element-wise
 * over a Float64Array using a straightforward iterative loop.
 *
 * Values outside the domain [-1, 1] or NaN yield NaN in the corresponding
 * output element, matching IEEE 754 / Math.acos semantics. The input array
 * is not mutated.
 *
 * @param {Float64Array} input - Input Float64Array of cosine values.
 * @returns {Float64Array} A new Float64Array containing the arccosine of each element in radians.
 * @throws {TypeError} If `input` is not a Float64Array.
 */
export function arccosTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('arccosTypedIterative expects a Float64Array input');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i += 1) {
		result[i] = Math.acos(input[i]);
	}

	return result;
}
