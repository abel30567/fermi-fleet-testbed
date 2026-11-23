/**
 * Computes the discrete product of all elements in a `Float64Array` using a
 * straightforward iterative loop.
 *
 * Follows standard mathematical and IEEE 754 floating-point conventions:
 * - The empty product (length 0) evaluates to `1`.
 * - Special floating-point values (`NaN`, `Infinity`, `-Infinity`, `-0`)
 *   propagate according to IEEE 754 multiplication rules.
 *
 * @param {Float64Array} values - The input typed array of double-precision floats.
 * @returns {number} The product of all elements in `values`.
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 */
export function productTypedIterative(values) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('Expected values to be a Float64Array')
	}

	let product = 1
	for (let i = 0; i < values.length; i++) {
		product *= values[i]
	}

	return product
}
