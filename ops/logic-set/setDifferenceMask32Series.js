/**
 * Computes the bitwise set difference (A \ B) over equal-length Uint32Array bitmasks.
 *
 * Closed-form series identity per 32-bit word:
 * For each bit position k in [0, 31] with indicator bits a_k, b_k in {0, 1},
 * the set-difference bit is a_k * (1 - b_k) = a_k - a_k * b_k. Summing over
 * the binary place-value series yields:
 *
 *   sum_{k=0}^{31} a_k * (1 - b_k) * 2^k
 *     = sum_{k=0}^{31} a_k * 2^k - sum_{k=0}^{31} (a_k * b_k) * 2^k
 *     = wA - (wA & wB)
 *
 * Because (a_k * b_k) <= a_k at every bit position, the subtraction is
 * borrow-free across all 32 bits and exact in unsigned 32-bit arithmetic.
 *
 * @param {Uint32Array} a - Minuend bitmask words (set A).
 * @param {Uint32Array} b - Subtrahend bitmask words (set B).
 * @returns {Uint32Array} A new Uint32Array containing the word-wise set difference A \ B.
 * @throws {TypeError} If `a` or `b` is not a Uint32Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function setDifferenceMask32Series(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First argument "a" must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second argument "b" must be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: expected equal Uint32Array lengths, got ${a.length} and ${b.length}`
		)
	}

	const len = a.length
	const out = new Uint32Array(len)

	for (let i = 0; i < len; i++) {
		const wA = a[i]
		const intersection = (wA & b[i]) >>> 0
		out[i] = (wA - intersection) >>> 0
	}

	return out
}
