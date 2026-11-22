/**
 * Computes the element-wise product of two Float64Array inputs using a
 * straightforward iterative loop.
 *
 * Neither input array is mutated; a new Float64Array of the same length is
 * allocated and returned. Element-wise multiplication follows standard
 * IEEE-754 double-precision semantics (including NaN, Infinity, and -0).
 *
 * @param {Float64Array} a - First input Float64Array operand.
 * @param {Float64Array} b - Second input Float64Array operand (must match length of `a`).
 * @returns {Float64Array} A new Float64Array where `result[i] = a[i] * b[i]`.
 * @throws {TypeError} If `a` or `b` is not an instance of Float64Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function multiplyTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Float64Array length mismatch: a.length (${len}) !== b.length (${b.length})`
		)
	}

	const result = new Float64Array(len)
	for (let i = 0; i < len; i += 1) {
		result[i] = a[i] * b[i]
	}

	return result
}
