/**
 * Computes the bitwise set intersection (AND) of two 32-bit unsigned integer
 * bitmasks using a recursive divide-and-conquer strategy over word index
 * ranges `[lo, hi)`.
 *
 * Each word `i` represents 32 elements covering bit indices `[32 * i, 32 * i + 31]`
 * in little-endian bit order (bit `k` of word `i` corresponds to element `32 * i + k`).
 *
 * Differing input lengths are handled by implicitly zero-extending the shorter
 * mask to `Math.max(a.length, b.length)`:
 * - The returned `Uint32Array` always has length `Math.max(a.length, b.length)`.
 * - Words in `[0, Math.min(a.length, b.length))` hold `(a[i] & b[i]) >>> 0`.
 * - Trailing words in `[Math.min(a.length, b.length), Math.max(a.length, b.length))`
 *   are `0` (since intersecting any word with an implicit zero word yields `0`).
 *
 * Neither input array is mutated, and a newly allocated `Uint32Array` is always
 * returned.
 *
 * @param {Uint32Array} a First bitmask.
 * @param {Uint32Array} b Second bitmask.
 * @returns {Uint32Array} New `Uint32Array` of length `Math.max(a.length, b.length)`
 *   containing the unsigned 32-bit bitwise intersection of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 */
export function intersectionMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}

	const maxLen = Math.max(a.length, b.length)
	const minLen = Math.min(a.length, b.length)
	const out = new Uint32Array(maxLen)

	intersectRange(a, b, out, 0, minLen)

	return out
}

/**
 * Recursively computes `(a[i] & b[i]) >>> 0` for all `i` in `[lo, hi)` by
 * splitting the index range into `[lo, mid)` and `[mid, hi)`.
 *
 * @param {Uint32Array} a First bitmask.
 * @param {Uint32Array} b Second bitmask.
 * @param {Uint32Array} out Pre-allocated destination buffer.
 * @param {number} lo Inclusive start word index.
 * @param {number} hi Exclusive end word index.
 */
function intersectRange(a, b, out, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return
	}
	if (len === 1) {
		out[lo] = (a[lo] & b[lo]) >>> 0
		return
	}

	const mid = lo + (len >>> 1)
	intersectRange(a, b, out, lo, mid)
	intersectRange(a, b, out, mid, hi)
}
