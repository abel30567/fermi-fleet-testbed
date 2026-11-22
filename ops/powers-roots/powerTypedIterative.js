/**
 * Computes the element-wise power (`bases[i] ** exponents[i]`) of two
 * `Float64Array` inputs using a straightforward iterative loop.
 *
 * @param {Float64Array} bases - Typed array of base values.
 * @param {Float64Array} exponents - Typed array of exponent values matching `bases` in length.
 * @returns {Float64Array} A new `Float64Array` containing `Math.pow(bases[i], exponents[i])` for each index `i`.
 * @throws {TypeError} If `bases` or `exponents` is not a `Float64Array`.
 * @throws {RangeError} If `bases` and `exponents` do not have the same length.
 */
export function powerTypedIterative(bases, exponents) {
	if (!(bases instanceof Float64Array)) {
		throw new TypeError('Expected bases to be a Float64Array')
	}
	if (!(exponents instanceof Float64Array)) {
		throw new TypeError('Expected exponents to be a Float64Array')
	}
	if (bases.length !== exponents.length) {
		throw new RangeError(
			`Float64Array inputs must have the same length (got ${bases.length} and ${exponents.length})`
		)
	}

	const length = bases.length
	const result = new Float64Array(length)

	for (let i = 0; i < length; i += 1) {
		result[i] = Math.pow(bases[i], exponents[i])
	}

	return result
}
