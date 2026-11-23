/**
 * Computes the Euclidean magnitude (L2 norm) of a vector represented as a
 * Float64Array using a straightforward iterative loop over its elements.
 *
 * @param {Float64Array} vector - The input vector of double-precision floats.
 * @returns {number} The Euclidean magnitude (non-negative square root of the sum of squared elements).
 * @throws {TypeError} If `vector` is not an instance of `Float64Array`.
 */
export function magnitudeTypedIterative(vector) {
	if (!(vector instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	let sumOfSquares = 0
	for (let i = 0; i < vector.length; i++) {
		const value = vector[i]
		sumOfSquares += value * value
	}

	return Math.sqrt(sumOfSquares)
}
