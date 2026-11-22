/**
 * Computes the bitwise XOR (symmetric difference) of two Uint32Array bitmasks
 * iteratively word-by-word, returning a new Uint32Array without mutating inputs.
 *
 * Each word `i` in the output is computed as `(a[i] ^ b[i]) >>> 0`.
 *
 * @param {Uint32Array} a - First 32-bit word bitmask.
 * @param {Uint32Array} b - Second 32-bit word bitmask (must have the same length as `a`).
 * @returns {Uint32Array} A new Uint32Array containing the word-wise bitwise XOR of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function xorMask32Iterative(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: expected equal lengths, got ${a.length} and ${b.length}`
		)
	}

	const len = a.length
	const result = new Uint32Array(len)

	for (let i = 0; i < len; i++) {
		result[i] = (a[i] ^ b[i]) >>> 0
	}

	return result
}
