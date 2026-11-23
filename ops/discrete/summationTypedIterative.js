/**
 * Computes the discrete summation of all elements in a Float64Array using a
 * straightforward iterative accumulation loop.
 *
 * @param {Float64Array} values - The typed array of double-precision values to sum.
 * @returns {number} The sum of all elements in `values` (0 for an empty array).
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 */
export function summationTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	let sum = 0
	for (let i = 0; i < values.length; i += 1) {
		sum += values[i]
	}

	return sum
}
