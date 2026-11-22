/**
 * Computes the bitwise set difference `A \ B` over 32-bit unsigned bitmasks
 * (`(a[i] & ~b[i]) >>> 0`) using a recursive divide-and-conquer strategy over
 * word index ranges `[lo, hi)`.
 *
 * Length semantics:
 * - The returned `Uint32Array` always has length `a.length`.
 * - When `b.length < a.length`, `b` is conceptually zero-extended with `0`
 *   words for indices `i >= b.length`, so `a[i]` passes through unchanged.
 * - When `b.length > a.length`, words in `b` at indices `i >= a.length` have
 *   no corresponding bits in `a` (`0 & ~b[i] === 0`) and are ignored.
 *
 * Neither input array is mutated; a newly allocated `Uint32Array` is always
 * returned with unsigned 32-bit word semantics.
 *
 * @param {Uint32Array} a - Minuend bitmask `A` (each bit represents set membership).
 * @param {Uint32Array} b - Subtrahend bitmask `B` (bits to remove from `A`).
 * @returns {Uint32Array} A new `Uint32Array` of length `a.length` containing `A \ B`.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
 */
export function setDifferenceMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected first argument "a" to be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected second argument "b" to be a Uint32Array')
	}

	const out = new Uint32Array(a.length)
	fillDifferenceRange(a, b, out, 0, a.length)
	return out
}

/**
 * Recursively computes `(a[i] & ~b[i]) >>> 0` over the half-open word index
 * range `[lo, hi)` by splitting the interval at its midpoint.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @param {Uint32Array} out
 * @param {number} lo - Inclusive start word index.
 * @param {number} hi - Exclusive end word index.
 */
function fillDifferenceRange(a, b, out, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const bWord = lo < b.length ? b[lo] : 0
		out[lo] = (a[lo] & ~bWord) >>> 0
		return
	}
	const mid = lo + (len >>> 1)
	fillDifferenceRange(a, b, out, lo, mid)
	fillDifferenceRange(a, b, out, mid, hi)
}
