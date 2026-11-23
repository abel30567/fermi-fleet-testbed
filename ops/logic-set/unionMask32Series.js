/**
 * Computes the bitwise set union of two `Uint32Array` bitmasks using the
 * closed-form inclusion-exclusion identity over 32-bit unsigned words.
 *
 * For each 32-bit word pair `(x, y)`, the bit-level inclusion-exclusion series
 *
 *     sum_{k=0}^{31} (x_k + y_k - x_k * y_k) * 2^k = x + y - (x & y)
 *
 * evaluates the exact unsigned 32-bit union without carries between bit
 * positions. Because `0 <= x + y <= 2^33 - 2 < Number.MAX_SAFE_INTEGER`, the
 * arithmetic identity is exact in IEEE-754 double precision for all `Uint32`
 * inputs.
 *
 * @param {Uint32Array} a - First bitmask represented as 32-bit unsigned words.
 * @param {Uint32Array} b - Second bitmask of the same word length as `a`.
 * @returns {Uint32Array} A new `Uint32Array` containing the word-wise set union.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function unionMask32Series(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('unionMask32Series: expected first argument to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('unionMask32Series: expected second argument to be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`unionMask32Series: length mismatch (${a.length} !== ${b.length})`
		)
	}

	const len = a.length
	const out = new Uint32Array(len)

	for (let i = 0; i < len; i++) {
		const x = a[i]
		const y = b[i]
		const overlap = (x & y) >>> 0
		out[i] = (x + y - overlap) >>> 0
	}

	return out
}
