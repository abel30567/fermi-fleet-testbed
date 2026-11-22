/**
 * Recursively computes the bitwise AND of two Uint32Array bitmasks over the
 * half-open word range [lo, hi), writing unsigned 32-bit results into `out`.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @param {Uint32Array} out
 * @param {number} lo
 * @param {number} hi
 */
function andRange(a, b, out, lo, hi) {
	if (hi - lo <= 0) {
		return
	}
	if (hi - lo === 1) {
		out[lo] = (a[lo] & b[lo]) >>> 0
		return
	}
	const mid = (lo + hi) >>> 1
	andRange(a, b, out, lo, mid)
	andRange(a, b, out, mid, hi)
}

/**
 * Computes the element-wise bitwise AND (set intersection) of two equal-length
 * `Uint32Array` bitmasks using a recursive divide-and-conquer strategy.
 *
 * The word range `[0, a.length)` is recursively split at `mid = (lo + hi) >>> 1`
 * until reaching single-word base cases, preserving unsigned 32-bit semantics
 * via `(a[i] & b[i]) >>> 0`. Input arrays are never mutated.
 *
 * Time complexity: O(n), where n is the number of 32-bit words.
 * Auxiliary call-stack space: O(log n).
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand.
 * @returns {Uint32Array} A new `Uint32Array` containing the bitwise AND of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function andMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First argument "a" must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second argument "b" must be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: expected equal lengths, got ${a.length} and ${b.length}`,
		)
	}

	const out = new Uint32Array(a.length)
	andRange(a, b, out, 0, a.length)
	return out
}
