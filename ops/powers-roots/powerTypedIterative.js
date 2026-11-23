/**
 * Computes element-wise exponentiation (`bases[i] ** exponents[i]`) over two
 * equal-length `Float64Array` inputs using a straightforward iterative loop.
 *
 * Follows IEEE 754 double-precision semantics (matching `Math.pow`), does not
 * mutate either input array, and returns a newly allocated `Float64Array`.
 *
 * @param {Float64Array} bases - Base values for each element.
 * @param {Float64Array} exponents - Exponent values corresponding to each base.
 * @returns {Float64Array} A new `Float64Array` where each element `i` equals `bases[i] ** exponents[i]`.
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

	const length = bases.length
	if (length !== exponents.length) {
		throw new RangeError(
			`Input length mismatch: bases has length ${length}, exponents has length ${exponents.length}`
		)
	}

	const result = new Float64Array(length)
	for (let i = 0; i < length; i += 1) {
		result[i] = Math.pow(bases[i], exponents[i])
	}

	return result
}
