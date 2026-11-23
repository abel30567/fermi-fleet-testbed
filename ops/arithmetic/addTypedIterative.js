/**
 * Performs element-wise arithmetic addition of two Float64Array inputs
 * using a straightforward iterative loop.
 *
 * Neither input array is mutated; a newly allocated Float64Array of the
 * same length is returned with IEEE-754 double-precision addition semantics.
 *
 * @param {Float64Array} a - First operand array.
 * @param {Float64Array} b - Second operand array (must have the same length as `a`).
 * @returns {Float64Array} New Float64Array where `result[i] = a[i] + b[i]`.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function addTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument must be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have the same length (got ${a.length} and ${b.length})`,
		)
	}

	const len = a.length
	const out = new Float64Array(len)
	for (let i = 0; i < len; i += 1) {
		out[i] = a[i] + b[i]
	}
	return out
}
