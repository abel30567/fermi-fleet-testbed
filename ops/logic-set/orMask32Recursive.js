/**
 * Recursively computes the bitwise OR of two Uint32Array bitmasks over the
 * half-open word index range `[lo, hi)`, writing unsigned 32-bit results into `out`.
 *
 * @param {Uint32Array} a - First input bitmask.
 * @param {Uint32Array} b - Second input bitmask.
 * @param {Uint32Array} out - Destination buffer of the same length.
 * @param {number} lo - Inclusive start word index.
 * @param {number} hi - Exclusive end word index.
 */
function orMask32Range(a, b, out, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return
	}
	if (len === 1) {
		out[lo] = (a[lo] | b[lo]) >>> 0
		return
	}
	const mid = lo + Math.floor(len / 2)
	orMask32Range(a, b, out, lo, mid)
	orMask32Range(a, b, out, mid, hi)
}

/**
 * Computes the bitwise OR (set union) of two Uint32 bitmasks represented as
 * `Uint32Array` words using a recursive divide-and-conquer algorithm.
 *
 * Splits the word index range `[0, a.length)` recursively in half until reaching
 * single-word base cases, applying unsigned 32-bit OR (`(a[i] | b[i]) >>> 0`).
 * Neither input array is mutated; a newly allocated `Uint32Array` is returned.
 *
 * Time complexity: O(n), where n is the number of 32-bit words.
 * Stack space complexity: O(log n).
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand (must have the same length as `a`).
 * @returns {Uint32Array} A new `Uint32Array` containing `(a[i] | b[i]) >>> 0` for each word `i`.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function orMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First argument "a" must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second argument "b" must be a Uint32Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		)
	}

	const out = new Uint32Array(a.length)
	orMask32Range(a, b, out, 0, a.length)
	return out
}
