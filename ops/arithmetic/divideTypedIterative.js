/**
 * Divides two Float64Array inputs element-wise using a straightforward iterative loop.
 *
 * Each element `result[i]` is computed as `a[i] / b[i]` following IEEE 754
 * double-precision floating-point semantics (e.g., division by `0` produces
 * `Infinity`, `-Infinity`, or `NaN`). Neither input array is mutated.
 *
 * @param {Float64Array} a - Dividend values.
 * @param {Float64Array} b - Divisor values (must have the same length as `a`).
 * @returns {Float64Array} A new Float64Array containing the element-wise quotients.
 * @throws {TypeError} If `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function divideTypedIterative(a, b) {
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

	const length = a.length
	const result = new Float64Array(length)
	for (let i = 0; i < length; i++) {
		result[i] = a[i] / b[i]
	}
	return result
}
