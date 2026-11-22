/**
 * Computes the element-wise inverse tangent (arctangent) of a Float64Array
 * using a straightforward iterative loop.
 *
 * Algorithm:
 * Allocates a new `Float64Array` of the same length as `input` and iterates
 * sequentially with an explicit `for` loop, evaluating `Math.atan(input[i])`
 * for each element. Results lie in `[-π/2, π/2]` radians, preserving IEEE-754
 * semantics for signed zero (`±0`), infinities (`±Infinity -> ±π/2`), and `NaN`.
 *
 * @param {Float64Array} input - Input vector of real numbers.
 * @returns {Float64Array} A new `Float64Array` containing `arctan(input[i])` in radians.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function arctanTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i += 1) {
		result[i] = Math.atan(input[i]);
	}

	return result;
}
