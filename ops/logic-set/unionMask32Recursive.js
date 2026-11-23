/**
 * Recursively computes the bitwise union (OR) of two Uint32Array bitmasks
 * across the half-open word index range [start, end) using divide-and-conquer.
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand.
 * @param {Uint32Array} out - Preallocated destination bitmask.
 * @param {number} start - Inclusive starting word index.
 * @param {number} end - Exclusive ending word index.
 */
function unionRange(a, b, out, start, end) {
	const span = end - start
	if (span <= 0) return
	if (span === 1) {
		const wordA = start < a.length ? a[start] : 0
		const wordB = start < b.length ? b[start] : 0
		out[start] = (wordA | wordB) >>> 0
		return
	}
	const mid = start + (span >>> 1)
	unionRange(a, b, out, start, mid)
	unionRange(a, b, out, mid, end)
}

/**
 * Computes the logic-set union (bitwise OR) of two Uint32 bitmasks stored as
 * Uint32Array word arrays, using a recursive divide-and-conquer traversal over
 * the word index range.
 *
 * If the two bitmasks have different word lengths, the shorter bitmask is
 * treated as zero-extended in its higher-order words. Neither input is mutated;
 * a newly allocated Uint32Array of length `Math.max(a.length, b.length)` is
 * always returned.
 *
 * @param {Uint32Array} a - First Uint32 bitmask.
 * @param {Uint32Array} b - Second Uint32 bitmask.
 * @returns {Uint32Array} New Uint32Array containing the word-wise bitwise union of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 */
export function unionMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First argument "a" must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second argument "b" must be a Uint32Array')
	}

	const len = Math.max(a.length, b.length)
	const out = new Uint32Array(len)
	if (len === 0) {
		return out
	}

	unionRange(a, b, out, 0, len)
	return out
}
