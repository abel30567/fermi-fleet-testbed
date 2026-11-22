/**
 * Recursively computes the bitwise set union over the half-open word index
 * range `[lo, hi)` using divide-and-conquer, writing unsigned 32-bit results
 * into `out`.
 *
 * Shorter inputs are implicitly zero-extended for word indices beyond their
 * length. Because each recursive step halves the range, call-stack depth is
 * `O(log n)` where `n = out.length`.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @param {Uint32Array} out
 * @param {number} lo Inclusive start word index.
 * @param {number} hi Exclusive end word index.
 */
function unionRange(a, b, out, lo, hi) {
	if (lo >= hi) {
		return
	}

	if (hi - lo === 1) {
		const wordA = lo < a.length ? a[lo] : 0
		const wordB = lo < b.length ? b[lo] : 0
		out[lo] = (wordA | wordB) >>> 0
		return
	}

	const mid = lo + ((hi - lo) >>> 1)
	unionRange(a, b, out, lo, mid)
	unionRange(a, b, out, mid, hi)
}

/**
 * Computes the set union (`a | b`) of two unsigned 32-bit bitmask arrays using
 * a recursive divide-and-conquer traversal over word index ranges.
 *
 * Each element index `i >= 0` in the represented set corresponds to bit
 * `(i & 31)` of word `i >>> 5` (LSB-first within each 32-bit unsigned word).
 *
 * If `a` and `b` have different lengths, the shorter mask is treated as
 * zero-extended to `Math.max(a.length, b.length)`, and the returned
 * `Uint32Array` has length `Math.max(a.length, b.length)`.
 *
 * Neither input array is mutated; a new `Uint32Array` is always returned with
 * unsigned 32-bit word semantics.
 *
 * Complexity: `O(n)` time and `O(log n)` stack space, where
 * `n = Math.max(a.length, b.length)`.
 *
 * @param {Uint32Array} a First bitmask operand.
 * @param {Uint32Array} b Second bitmask operand.
 * @returns {Uint32Array} A new `Uint32Array` containing the bitwise union of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not an instance of `Uint32Array`.
 */
export function unionMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}

	const len = Math.max(a.length, b.length)
	const out = new Uint32Array(len)

	if (len > 0) {
		unionRange(a, b, out, 0, len)
	}

	return out
}
