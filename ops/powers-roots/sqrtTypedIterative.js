/**
 * Computes the element-wise square root of a Float64Array using a
 * straightforward iterative loop.
 *
 * Non-negative finite values, +0, -0, +Infinity, and NaN follow IEEE 754
 * square-root semantics. Negative values (including -Infinity) are rejected
 * with a RangeError because real-valued square roots are undefined for x < 0.
 * The input array is not mutated.
 *
 * @param {Float64Array} input - Input array of non-negative float64 values.
 * @returns {Float64Array} A new Float64Array containing the element-wise square roots.
 * @throws {TypeError} If `input` is not a Float64Array instance.
 * @throws {RangeError} If any element of `input` is strictly negative (`x < 0`).
 */
export function sqrtTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const length = input.length
	const output = new Float64Array(length)

	for (let i = 0; i < length; i += 1) {
		const value = input[i]
		if (value < 0) {
			throw new RangeError(
				`Cannot compute real square root of negative value at index ${i}: ${value}`
			)
		}
		output[i] = Math.sqrt(value)
	}

	return output
}
