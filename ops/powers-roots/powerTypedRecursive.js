/**
 * Computes element-wise exponentiation over a half-open index range [lo, hi)
 * using divide-and-conquer recursion.
 *
 * @param {Float64Array} bases - Input base values.
 * @param {Float64Array} exponents - Input exponent values.
 * @param {Float64Array} out - Destination array for computed powers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 */
function powerRange(bases, exponents, out, lo, hi) {
	const count = hi - lo
	if (count <= 0) {
		return
	}
	if (count === 1) {
		out[lo] = Math.pow(bases[lo], exponents[lo])
		return
	}
	const mid = lo + Math.floor(count / 2)
	powerRange(bases, exponents, out, lo, mid)
	powerRange(bases, exponents, out, mid, hi)
}

/**
 * Computes element-wise exponentiation (`Math.pow(bases[i], exponents[i])`)
 * for two equal-length `Float64Array` inputs using divide-and-conquer recursion.
 *
 * @param {Float64Array} bases - Base values.
 * @param {Float64Array} exponents - Exponent values.
 * @returns {Float64Array} A new `Float64Array` containing `bases[i] ** exponents[i]`.
 * @throws {TypeError} If either `bases` or `exponents` is not a `Float64Array`.
 * @throws {RangeError} If `bases` and `exponents` do not have the same length.
 */
export function powerTypedRecursive(bases, exponents) {
	if (!(bases instanceof Float64Array)) {
		throw new TypeError('bases must be a Float64Array')
	}
	if (!(exponents instanceof Float64Array)) {
		throw new TypeError('exponents must be a Float64Array')
	}
	if (bases.length !== exponents.length) {
		throw new RangeError(
			`bases and exponents must have the same length (got ${bases.length} and ${exponents.length})`
		)
	}

	const result = new Float64Array(bases.length)
	powerRange(bases, exponents, result, 0, bases.length)
	return result
}
