/**
 * Computes the trigonometric tangent (in radians) element-wise over a Float64Array
 * using a straightforward iterative loop.
 *
 * @param {Float64Array} input - Input array of angles in radians.
 * @param {Float64Array} [out] - Optional pre-allocated output Float64Array of the same length as `input`.
 * @returns {Float64Array} A Float64Array containing `Math.tan(input[i])` for each element `i`.
 * @throws {TypeError} If `input` is not a Float64Array, or if `out` is provided and is not a Float64Array.
 * @throws {RangeError} If `out` is provided and `out.length !== input.length`.
 */
export function tanTypedIterative(input, out) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array');
	}

	const len = input.length;
	let result;
	if (out === undefined) {
		result = new Float64Array(len);
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('Expected out to be a Float64Array');
		}
		if (out.length !== len) {
			throw new RangeError(
				`Expected out length (${out.length}) to match input length (${len})`,
			);
		}
		result = out;
	}

	for (let i = 0; i < len; i++) {
		result[i] = Math.tan(input[i]);
	}

	return result;
}
