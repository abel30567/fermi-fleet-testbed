/**
 * Computes the bitwise set difference (`a \ b`) of two equal-length Uint32 bitmasks
 * stored as {@link Uint32Array} words, using a straightforward iterative loop.
 *
 * Each bit `k` in word `i` is set in the result if and only if it is set in `a[i]`
 * and not set in `b[i]`: `(a[i] & ~b[i]) >>> 0`.
 *
 * Neither input array is mutated; a new {@link Uint32Array} is returned.
 *
 * @param {Uint32Array} a - Minuend bitmask words (elements to start with).
 * @param {Uint32Array} b - Subtrahend bitmask words (elements to remove).
 * @returns {Uint32Array} A new Uint32Array containing the bitwise set difference `a \ b`.
 * @throws {TypeError} If `a` or `b` is not a {@link Uint32Array}.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function setDifferenceMask32Iterative(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask word lengths must match (got ${a.length} and ${b.length})`,
		)
	}

	const len = a.length
	const result = new Uint32Array(len)

	for (let i = 0; i < len; i += 1) {
		result[i] = (a[i] & ~b[i]) >>> 0
	}

	return result
}
