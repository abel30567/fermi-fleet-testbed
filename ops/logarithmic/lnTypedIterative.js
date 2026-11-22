/**
 * Computes the natural logarithm (base e) element-wise over a Float64Array
 * using a straightforward iterative loop.
 *
 * Preserves IEEE-754 floating-point semantics for boundary and special values:
 * - `ln(1) = +0`
 * - `ln(+0) = ln(-0) = -Infinity`
 * - `ln(x) = NaN` for `x < 0` (including `-Infinity`) or `x = NaN`
 * - `ln(+Infinity) = +Infinity`
 *
 * The input array is never mutated; a newly allocated Float64Array of the same
 * length is returned.
 *
 * @param {Float64Array} values - Input Float64Array of double-precision values.
 * @returns {Float64Array} A new Float64Array where `result[i] = Math.log(values[i])`.
 * @throws {TypeError} If `values` is not a Float64Array or its underlying ArrayBuffer is detached.
 */
export function lnTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}
	if (values.buffer.detached) {
		throw new TypeError('Input Float64Array has a detached ArrayBuffer')
	}

	const len = values.length
	const result = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		result[i] = Math.log(values[i])
	}

	return result
}
