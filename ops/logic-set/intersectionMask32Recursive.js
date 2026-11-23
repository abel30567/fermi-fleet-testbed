/**
 * Recursively computes the bitwise intersection into `out[start..end)` using
 * divide-and-conquer splitting.
 *
 * @param {Uint32Array} a First input bitmask words.
 * @param {Uint32Array} b Second input bitmask words.
 * @param {Uint32Array} out Destination buffer for intersected words.
 * @param {number} start Inclusive start word index.
 * @param {number} end Exclusive end word index.
 */
function intersectRange(a, b, out, start, end) {
	const count = end - start
	if (count <= 0) {
		return
	}
	if (count === 1) {
		out[start] = (a[start] & b[start]) >>> 0
		return
	}
	const mid = start + (count >>> 1)
	intersectRange(a, b, out, start, mid)
	intersectRange(a, b, out, mid, end)
}

/**
 * Computes the set intersection of two Uint32 bitmasks stored as `Uint32Array`
 * word arrays using a recursive divide-and-conquer strategy.
 *
 * Each word index `i` holds 32 bit flags for elements `[32 * i, 32 * i + 31]`.
 * When `a` and `b` have different lengths, words beyond the shorter mask are
 * implicitly zero, so the returned `Uint32Array` has length
 * `Math.min(a.length, b.length)`.
 *
 * Time complexity is O(n) and recursion stack depth is O(log n) for
 * `n = Math.min(a.length, b.length)`. Neither input array is mutated.
 *
 * @param {Uint32Array} a First Uint32 bitmask.
 * @param {Uint32Array} b Second Uint32 bitmask.
 * @returns {Uint32Array} New `Uint32Array` containing the bitwise AND of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`.
 */
export function intersectionMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}

	const len = Math.min(a.length, b.length)
	const out = new Uint32Array(len)
	intersectRange(a, b, out, 0, len)
	return out
}
