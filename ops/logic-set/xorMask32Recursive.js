/**
 * Recursively computes the bitwise XOR of two Uint32Array bitmasks over the
 * half-open word range [start, end) using divide-and-conquer.
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand.
 * @param {Uint32Array} out - Destination buffer of the same length.
 * @param {number} start - Inclusive start word index.
 * @param {number} end - Exclusive end word index.
 */
function xorRange(a, b, out, start, end) {
	const count = end - start;
	if (count <= 0) {
		return;
	}
	if (count === 1) {
		out[start] = (a[start] ^ b[start]) >>> 0;
		return;
	}
	const mid = start + (count >>> 1);
	xorRange(a, b, out, start, mid);
	xorRange(a, b, out, mid, end);
}

/**
 * Computes the bitwise XOR (symmetric difference) of two Uint32 bitmasks
 * represented as equal-length {@link Uint32Array} word arrays, using a
 * recursive divide-and-conquer strategy.
 *
 * Time complexity: O(n) word operations.
 * Call-stack depth: O(log n).
 * Does not mutate either input array.
 *
 * @param {Uint32Array} a - First Uint32 bitmask.
 * @param {Uint32Array} b - Second Uint32 bitmask (must have the same length as `a`).
 * @returns {Uint32Array} A new Uint32Array containing `(a[i] ^ b[i]) >>> 0` for each word.
 * @throws {TypeError} If either `a` or `b` is not a Uint32Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function xorMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError("First argument must be a Uint32Array");
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError("Second argument must be a Uint32Array");
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask lengths must match: received ${a.length} and ${b.length}`,
		);
	}

	const result = new Uint32Array(a.length);
	xorRange(a, b, result, 0, a.length);
	return result;
}
