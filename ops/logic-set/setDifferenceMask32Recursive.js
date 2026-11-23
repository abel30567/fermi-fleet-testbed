/**
 * Recursively computes the bitwise set difference (`a \ b`, i.e., `a & ~b`)
 * over two equal-length `Uint32Array` bitmasks for the half-open word range
 * `[start, end)` using divide-and-conquer.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @param {Uint32Array} out
 * @param {number} start
 * @param {number} end
 */
function diffRangeRecursive(a, b, out, start, end) {
	const span = end - start
	if (span <= 0) {
		return
	}
	if (span === 1) {
		out[start] = (a[start] & ~b[start]) >>> 0
		return
	}

	const mid = start + (span >>> 1)
	diffRangeRecursive(a, b, out, start, mid)
	diffRangeRecursive(a, b, out, mid, end)
}

/**
 * Computes the set difference (`maskA \ maskB`) of two Uint32 bitmasks stored
 * as `Uint32Array` words using a recursive divide-and-conquer algorithm.
 *
 * Each word represents 32 bit positions, and each output word is computed as
 * `(maskA[i] & ~maskB[i]) >>> 0`. Input arrays are not mutated.
 *
 * @param {Uint32Array} maskA - Minuend bitmask words (`A`).
 * @param {Uint32Array} maskB - Subtrahend bitmask words (`B`).
 * @returns {Uint32Array} New `Uint32Array` containing `maskA \ maskB`.
 * @throws {TypeError} If either argument is not a `Uint32Array`.
 * @throws {RangeError} If `maskA` and `maskB` do not have the same length.
 */
export function setDifferenceMask32Recursive(maskA, maskB) {
	if (!(maskA instanceof Uint32Array)) {
		throw new TypeError('maskA must be a Uint32Array')
	}
	if (!(maskB instanceof Uint32Array)) {
		throw new TypeError('maskB must be a Uint32Array')
	}
	if (maskA.length !== maskB.length) {
		throw new RangeError(
			`maskA and maskB must have the same length (got ${maskA.length} and ${maskB.length})`,
		)
	}

	const out = new Uint32Array(maskA.length)
	diffRangeRecursive(maskA, maskB, out, 0, maskA.length)
	return out
}
