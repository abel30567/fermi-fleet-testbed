/**
 * Computes the 3D vector cross product of two Float64Array vectors using a
 * straightforward iterative implementation.
 *
 * For 3D vectors `a` and `b`, each component of the resulting vector `out` is:
 * `out[i] = a[(i + 1) % 3] * b[(i + 2) % 3] - a[(i + 2) % 3] * b[(i + 1) % 3]`
 * for `i = 0, 1, 2`.
 *
 * Neither input array is mutated.
 *
 * @param {Float64Array} a - First 3D vector (length 3).
 * @param {Float64Array} b - Second 3D vector (length 3).
 * @returns {Float64Array} A new length-3 Float64Array containing `a × b`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` or `b` does not have length 3.
 */
export function crossProductTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	if (a.length !== 3) {
		throw new RangeError(
			`Expected first argument "a" to have length 3, received ${a.length}`
		)
	}
	if (b.length !== 3) {
		throw new RangeError(
			`Expected second argument "b" to have length 3, received ${b.length}`
		)
	}

	const result = new Float64Array(3)
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		result[i] = a[j] * b[k] - a[k] * b[j]
	}

	return result
}
