/**
 * Computes the element-wise arithmetic difference of two Float64Array inputs
 * (`a[i] - b[i]`) using a straightforward iterative loop.
 *
 * Neither input array is mutated.
 *
 * @param {Float64Array} a - The minuend array.
 * @param {Float64Array} b - The subtrahend array (must have the same length as `a`).
 * @returns {Float64Array} A new Float64Array containing the element-wise differences `a[i] - b[i]`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function subtractTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument must be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have the same length (got ${a.length} and ${b.length})`
		)
	}

	const len = a.length
	const result = new Float64Array(len)

	for (let i = 0; i < len; i += 1) {
		result[i] = a[i] - b[i]
	}

	return result
}
