/**
 * Computes the base-10 logarithm (`Math.log10`) element-wise over a
 * `Float64Array` using a straightforward iterative loop.
 *
 * Follows standard IEEE 754 semantics for special values:
 * - `x === 0` or `x === -0` yields `-Infinity`
 * - `x < 0` or `x === -Infinity` yields `NaN`
 * - `x === Infinity` yields `Infinity`
 * - `NaN` yields `NaN`
 *
 * Does not mutate the input array.
 *
 * @param {Float64Array} input - Input array of 64-bit floating-point numbers.
 * @returns {Float64Array} A new `Float64Array` containing `log10(input[i])` for each index `i`.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function log10TypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i++) {
		result[i] = Math.log10(input[i]);
	}

	return result;
}
