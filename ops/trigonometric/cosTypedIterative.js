/**
 * Computes the trigonometric cosine element-wise over a Float64Array using a
 * straightforward iterative loop.
 *
 * @param {Float64Array} input - Input array of angles in radians.
 * @param {Float64Array} [out] - Optional pre-allocated output Float64Array with the same
 *   length as `input`. When omitted, a new Float64Array is allocated and `input` is not
 *   mutated. Passing `input` as `out` performs the computation safely in place.
 * @returns {Float64Array} A Float64Array where each element `i` is `Math.cos(input[i])`.
 * @throws {TypeError} If `input` is not a Float64Array, if `out` is provided and is not
 *   a Float64Array, or if an underlying ArrayBuffer is detached.
 * @throws {RangeError} If `out` is provided and `out.length !== input.length`.
 */
export function cosTypedIterative(input, out) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}
	if (input.buffer.detached) {
		throw new TypeError('Input Float64Array has a detached underlying ArrayBuffer')
	}

	const len = input.length
	let result

	if (out === undefined) {
		result = new Float64Array(len)
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('Expected out to be a Float64Array')
		}
		if (out.buffer.detached) {
			throw new TypeError('Output Float64Array has a detached underlying ArrayBuffer')
		}
		if (out.length !== len) {
			throw new RangeError(
				`Expected out length (${out.length}) to equal input length (${len})`
			)
		}
		result = out
	}

	for (let i = 0; i < len; i++) {
		result[i] = Math.cos(input[i])
	}

	return result
}
