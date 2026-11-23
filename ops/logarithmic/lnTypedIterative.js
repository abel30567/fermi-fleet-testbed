/**
 * Computes the natural logarithm (ln, base e) element-wise over a Float64Array
 * using a straightforward iterative implementation.
 *
 * Special and non-positive IEEE 754 values follow standard `Math.log` semantics:
 * - `ln(0)` and `ln(-0)` produce `-Infinity`
 * - `ln(x)` for `x < 0` or `NaN` produces `NaN`
 * - `ln(Infinity)` produces `Infinity`
 *
 * The input array is not mutated; a new `Float64Array` of equal length is returned.
 *
 * @param {Float64Array} input - Input values as a `Float64Array`.
 * @returns {Float64Array} A new `Float64Array` containing `ln(input[i])` for each element.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function lnTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const length = input.length;
	const result = new Float64Array(length);

	for (let i = 0; i < length; i++) {
		result[i] = Math.log(input[i]);
	}

	return result;
}
