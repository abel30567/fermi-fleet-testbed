/**
 * Computes the bitwise set union of two 32-bit word bitmasks (`Uint32Array`)
 * using a straightforward iterative word-by-word loop.
 *
 * Variable-length bitsets are supported: the returned `Uint32Array` has length
 * `Math.max(a.length, b.length)`, and any missing trailing (high-index) words
 * of the shorter bitmask are treated as `0` (`0x00000000`).
 *
 * Neither input array is modified; a newly allocated `Uint32Array` is always
 * returned.
 *
 * @param {Uint32Array} a - First bitmask represented as 32-bit unsigned words.
 * @param {Uint32Array} b - Second bitmask represented as 32-bit unsigned words.
 * @returns {Uint32Array} A new `Uint32Array` containing the bitwise OR (set union) of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array` instance.
 */
export function unionMask32Iterative(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}

	const lenA = a.length
	const lenB = b.length
	const minLen = lenA < lenB ? lenA : lenB
	const maxLen = lenA > lenB ? lenA : lenB
	const out = new Uint32Array(maxLen)

	for (let i = 0; i < minLen; i++) {
		out[i] = (a[i] | b[i]) >>> 0
	}

	for (let i = minLen; i < lenA; i++) {
		out[i] = a[i]
	}

	for (let i = minLen; i < lenB; i++) {
		out[i] = b[i]
	}

	return out
}
