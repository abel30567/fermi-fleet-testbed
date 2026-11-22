/**
 * Validates that a value is a non-detached Uint32Array.
 *
 * @param {unknown} value - Candidate value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a `Uint32Array` or its buffer is detached.
 */
function validateUint32Mask(value, name) {
	if (!(value instanceof Uint32Array)) {
		throw new TypeError(`Expected ${name} to be a Uint32Array`);
	}
	if (value.buffer.detached) {
		throw new TypeError(`Expected ${name} to have a non-detached ArrayBuffer`);
	}
}

/**
 * Checks whether `out` overlaps `src` in the same ArrayBuffer at a different
 * byte offset, where direct forward iteration could overwrite unread words.
 *
 * @param {Uint32Array} out - Output bitmask view.
 * @param {Uint32Array} src - Input bitmask view.
 * @returns {boolean} True if `out` and `src` overlap with distinct byte offsets.
 */
function hasShiftedOverlap(out, src) {
	if (out.buffer !== src.buffer || out.byteOffset === src.byteOffset) {
		return false;
	}
	const outStart = out.byteOffset;
	const outEnd = outStart + out.byteLength;
	const srcStart = src.byteOffset;
	const srcEnd = srcStart + src.byteLength;
	return outStart < srcEnd && srcStart < outEnd;
}

/**
 * Computes the bitwise set difference (`A \ B = A & ~B`) over two equal-length
 * `Uint32Array` bitmasks using a straightforward iterative word-by-word loop.
 *
 * Each 32-bit unsigned word `i` encodes membership of elements `32 * i + k`
 * for `0 <= k < 32`. A bit is set in the resulting bitmask if and only if it is
 * set in `a` and clear in `b`.
 *
 * @param {Uint32Array} a - Minuend bitmask (`A`).
 * @param {Uint32Array} b - Subtrahend bitmask (`B`).
 * @param {Uint32Array} [out] - Optional preallocated output bitmask of the same
 *   length as `a` and `b`. When omitted, a new `Uint32Array` is allocated.
 *   Exact in-place aliasing (`out === a` or `out === b`) and shifted
 *   overlapping subarrays are both handled safely.
 * @returns {Uint32Array} A `Uint32Array` where each word `i` equals
 *   `(a[i] & ~b[i]) >>> 0` (`out` when provided, otherwise a new instance).
 * @throws {TypeError} If `a`, `b`, or a provided `out` is not a `Uint32Array`,
 *   or if any underlying `ArrayBuffer` is detached.
 * @throws {RangeError} If `a.length !== b.length`, or if a provided `out` has
 *   `out.length !== a.length`.
 */
export function setDifferenceMask32Iterative(a, b, out = undefined) {
	validateUint32Mask(a, 'a');
	validateUint32Mask(b, 'b');

	const len = a.length;
	if (b.length !== len) {
		throw new RangeError(
			`Bitmask length mismatch: a.length (${len}) !== b.length (${b.length})`
		);
	}

	if (out !== undefined) {
		validateUint32Mask(out, 'out');
		if (out.length !== len) {
			throw new RangeError(
				`Output bitmask length mismatch: out.length (${out.length}) !== a.length (${len})`
			);
		}
	}

	if (out === undefined) {
		const result = new Uint32Array(len);
		for (let i = 0; i < len; i++) {
			result[i] = (a[i] & ~b[i]) >>> 0;
		}
		return result;
	}

	if (hasShiftedOverlap(out, a) || hasShiftedOverlap(out, b)) {
		const tmp = new Uint32Array(len);
		for (let i = 0; i < len; i++) {
			tmp[i] = (a[i] & ~b[i]) >>> 0;
		}
		out.set(tmp);
		return out;
	}

	for (let i = 0; i < len; i++) {
		out[i] = (a[i] & ~b[i]) >>> 0;
	}
	return out;
}
