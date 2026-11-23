/**
 * Recursively computes the bitwise AND of `a[start..end)` and `b[start..end)`
 * into `out[start..end)` using divide-and-conquer over word ranges.
 *
 * Recursion depth is O(log n), avoiding call-stack overflow for large masks.
 *
 * @param {Uint32Array} a - First 32-bit word bitmask.
 * @param {Uint32Array} b - Second 32-bit word bitmask.
 * @param {Uint32Array} out - Destination buffer of matching length.
 * @param {number} start - Inclusive start word index.
 * @param {number} end - Exclusive end word index.
 */
function andRange(a, b, out, start, end) {
	const count = end - start
	if (count <= 0) {
		return
	}
	if (count === 1) {
		out[start] = (a[start] & b[start]) >>> 0
		return
	}
	const mid = start + (count >>> 1)
	andRange(a, b, out, start, mid)
	andRange(a, b, out, mid, end)
}

/**
 * Computes the bitwise AND (set intersection) of two Uint32 bitmasks stored as
 * `Uint32Array` words using a recursive divide-and-conquer implementation.
 *
 * Does not mutate either input array and returns a new `Uint32Array` of the
 * same length where `result[i] === ((a[i] & b[i]) >>> 0)`.
 *
 * @param {Uint32Array} a - First Uint32Array bitmask.
 * @param {Uint32Array} b - Second Uint32Array bitmask (must match `a.length`).
 * @returns {Uint32Array} New Uint32Array containing the word-wise bitwise AND.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a` and `b` have different lengths.
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
			`Bitmask length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		)
	}

	const out = new Uint32Array(a.length)
	andRange(a, b, out, 0, a.length)
	return out
}
