/**
 * Computes the base-2 logarithm element-wise over a Float64Array using a
 * straightforward iterative loop.
 *
 * Each element must be strictly positive (`x > 0`, including `+Infinity`).
 * Returns a new `Float64Array` without mutating the input.
 *
 * @param {Float64Array} input - Input typed array of strictly positive numbers.
 * @returns {Float64Array} A new `Float64Array` containing `log2(input[i])` for each index `i`.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element in `input` is `NaN` or not strictly positive (`<= 0`).
 */
export function log2TypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const length = input.length
	const result = new Float64Array(length)

	for (let i = 0; i < length; i++) {
		const value = input[i]
		if (!(value > 0)) {
			throw new RangeError(
				`Expected strictly positive value at index ${i}, received ${value}`
			)
		}
		result[i] = Math.log2(value)
	}

	return result
}
