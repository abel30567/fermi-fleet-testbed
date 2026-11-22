/**
 * Performs element-wise arithmetic division of two Float64Array instances
 * (`result[i] = a[i] / b[i]`) using a straightforward iterative loop.
 *
 * Follows standard IEEE 754 double-precision floating-point semantics for
 * special values (such as division by `±0`, `±Infinity`, and `NaN`). Does not
 * mutate either input array.
 *
 * @param {Float64Array} a - The dividend array.
 * @param {Float64Array} b - The divisor array (must have the same length as `a`).
 * @returns {Float64Array} A new Float64Array containing the element-wise quotients.
 * @throws {TypeError} If either `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function divideTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Array lengths must match: received ${a.length} and ${b.length}`,
		)
	}

	const len = a.length
	const result = new Float64Array(len)

	for (let i = 0; i < len; i += 1) {
		result[i] = a[i] / b[i]
	}

	return result
}
