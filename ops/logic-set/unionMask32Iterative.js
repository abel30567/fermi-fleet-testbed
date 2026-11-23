/**
 * Computes the set union (bitwise OR) of two Uint32Array bitmasks using a
 * straightforward iterative loop.
 *
 * Each 32-bit word `i` encodes membership of bit indices `[32*i, 32*i + 31]`.
 * When the input masks have different lengths, the shorter mask is implicitly
 * zero-extended so the returned mask has length `Math.max(a.length, b.length)`.
 * Neither input array is mutated; a new `Uint32Array` is always returned.
 *
 * @param {Uint32Array} a - First bitmask.
 * @param {Uint32Array} b - Second bitmask.
 * @returns {Uint32Array} A new `Uint32Array` containing the bitwise union of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
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
	const maxLen = lenA >= lenB ? lenA : lenB
	const result = new Uint32Array(maxLen)

	for (let i = 0; i < maxLen; i += 1) {
		const wordA = i < lenA ? a[i] : 0
		const wordB = i < lenB ? b[i] : 0
		result[i] = (wordA | wordB) >>> 0
	}

	return result
}
