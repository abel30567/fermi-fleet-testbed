/**
 * Computes the element-wise arithmetic difference (`a[i] - b[i]`) of two
 * `Float64Array` instances using a straightforward iterative loop.
 *
 * Neither input array is mutated; a new `Float64Array` of the same length is
 * allocated and returned. Standard IEEE-754 floating-point semantics apply to
 * each element (including `NaN`, `Infinity`, `-Infinity`, and signed zeros).
 *
 * @param {Float64Array} a - Minuend typed array.
 * @param {Float64Array} b - Subtrahend typed array (must match `a.length`).
 * @returns {Float64Array} A new `Float64Array` where each element is `a[i] - b[i]`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function subtractTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	const length = a.length
	if (length !== b.length) {
		throw new RangeError(
			`Expected Float64Array inputs of equal length, got ${length} and ${b.length}`
		)
	}

	const result = new Float64Array(length)
	for (let i = 0; i < length; i += 1) {
		result[i] = a[i] - b[i]
	}
	return result
}
