/**
 * Computes the bitwise AND of two equal-length `Uint32Array` bitmasks using a
 * straightforward iterative loop.
 *
 * Each 32-bit word `i` of the returned `Uint32Array` is `(a[i] & b[i]) >>> 0`.
 * Neither input buffer is mutated; a new `Uint32Array` of the same length is
 * always allocated and returned.
 *
 * @param {Uint32Array} a - First 32-bit word bitmask.
 * @param {Uint32Array} b - Second 32-bit word bitmask (must have the same length as `a`).
 * @returns {Uint32Array} A new `Uint32Array` containing the word-wise bitwise AND of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function andMask32Iterative(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First argument "a" must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second argument "b" must be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: expected equal lengths, got ${a.length} and ${b.length}`
		)
	}

	const len = a.length
	const out = new Uint32Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = (a[i] & b[i]) >>> 0
	}
	return out
}
