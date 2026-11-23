/**
 * Computes the base-2 logarithm (`log2`) element-wise over a `Float64Array`
 * using a straightforward iterative loop.
 *
 * Follows IEEE 754 / `Math.log2` semantics for each element:
 * - Positive finite values return their base-2 logarithm.
 * - `0` and `-0` return `-Infinity`.
 * - `Infinity` returns `Infinity`.
 * - Negative values and `NaN` return `NaN`.
 *
 * Does not mutate the input array.
 *
 * @param {Float64Array} input - The input `Float64Array` of numeric values.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise base-2 logarithms.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function log2TypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i++) {
		result[i] = Math.log2(input[i]);
	}

	return result;
}
