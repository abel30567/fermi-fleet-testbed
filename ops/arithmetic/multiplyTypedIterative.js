/**
 * Multiplies two Float64Array instances element-wise using a straightforward
 * iterative loop and returns a new Float64Array containing the products.
 *
 * Neither input array is mutated. Standard IEEE-754 floating-point
 * multiplication semantics apply (including -0, Infinity, and NaN).
 *
 * @param {Float64Array} a - First input Float64Array.
 * @param {Float64Array} b - Second input Float64Array (must have the same length as `a`).
 * @returns {Float64Array} A new Float64Array where `result[i] === a[i] * b[i]`.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function multiplyTypedIterative(a, b) {
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
	const result = new Float64Array(len)
	for (let i = 0; i < len; i += 1) {
		result[i] = a[i] * b[i]
	}
	return result
}
