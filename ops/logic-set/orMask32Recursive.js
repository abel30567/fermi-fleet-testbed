/**
 * Computes the bitwise OR (set union) of two Uint32 bitmasks stored as
 * `Uint32Array` words using a recursive divide-and-conquer strategy.
 *
 * The input arrays are not mutated; a new `Uint32Array` of the same length
 * containing `(a[i] | b[i]) >>> 0` for every word index `i` is returned.
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand (must have the same length as `a`).
 * @returns {Uint32Array} A new `Uint32Array` representing `a | b`.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function orMask32Recursive(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First argument "a" must be a Uint32Array');
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second argument "b" must be a Uint32Array');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: expected equal lengths, got ${a.length} and ${b.length}`
		);
	}

	const len = a.length;
	const out = new Uint32Array(len);
	if (len === 0) {
		return out;
	}

	orRange(a, b, out, 0, len);
	return out;
}

/**
 * Recursively computes `out[i] = (a[i] | b[i]) >>> 0` over the half-open
 * range `[start, end)` via divide-and-conquer.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @param {Uint32Array} out
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 */
function orRange(a, b, out, start, end) {
	if (end - start === 1) {
		out[start] = (a[start] | b[start]) >>> 0;
		return;
	}

	const mid = start + ((end - start) >>> 1);
	orRange(a, b, out, start, mid);
	orRange(a, b, out, mid, end);
}
