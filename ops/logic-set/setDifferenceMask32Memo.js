/**
 * @fileoverview Table-driven, memoized set difference (`A \ B`) over Uint32 bitmasks
 * stored in {@link Uint32Array} words.
 */

/**
 * Precomputed 256×256 lookup table for 8-bit set difference:
 * `BYTE_DIFF_LUT[(x << 8) | y] === (x & ~y) & 0xff`.
 *
 * Indexed by concatenating the 8-bit minuend lane `x` (high byte) and
 * 8-bit subtrahend lane `y` (low byte).
 *
 * @type {Uint8Array}
 */
const BYTE_DIFF_LUT = new Uint8Array(65536);
for (let x = 0; x < 256; x += 1) {
	const rowOffset = x << 8;
	for (let y = 0; y < 256; y += 1) {
		BYTE_DIFF_LUT[rowOffset | y] = x & (~y & 0xff);
	}
}

/**
 * Fixed-size direct-mapped word-pair memoization cache (power of two).
 * Stores recently evaluated 32-bit word pairs `(aw, bw) -> (aw & ~bw) >>> 0`
 * in parallel typed arrays to avoid per-entry heap allocations and bound memory.
 */
const MEMO_SIZE = 4096;
const MEMO_MASK = MEMO_SIZE - 1;
const memoA = new Uint32Array(MEMO_SIZE);
const memoB = new Uint32Array(MEMO_SIZE);
const memoOut = new Uint32Array(MEMO_SIZE);
const memoValid = new Uint8Array(MEMO_SIZE);

/**
 * Compute 32-bit unsigned set difference `(aw & ~bw) >>> 0` for a single word pair
 * using the direct-mapped memo cache backed by the precomputed 8-bit lookup table.
 *
 * @param {number} aw - Unsigned 32-bit word from minuend mask `a`.
 * @param {number} bw - Unsigned 32-bit word from subtrahend mask `b`.
 * @returns {number} Unsigned 32-bit word representing `aw \ bw`.
 */
function diffWord32Memo(aw, bw) {
	const slot =
		(Math.imul(aw ^ 0x9e3779b9, 0x85ebca6b) ^
			Math.imul(bw ^ 0xc2b2ae35, 0x27d4eb2f)) &
		MEMO_MASK;

	if (memoValid[slot] === 1 && memoA[slot] === aw && memoB[slot] === bw) {
		return memoOut[slot];
	}

	const b0 = BYTE_DIFF_LUT[((aw & 0xff) << 8) | (bw & 0xff)];
	const b1 = BYTE_DIFF_LUT[(((aw >>> 8) & 0xff) << 8) | ((bw >>> 8) & 0xff)];
	const b2 = BYTE_DIFF_LUT[(((aw >>> 16) & 0xff) << 8) | ((bw >>> 16) & 0xff)];
	const b3 = BYTE_DIFF_LUT[(((aw >>> 24) & 0xff) << 8) | ((bw >>> 24) & 0xff)];
	const diff = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;

	memoA[slot] = aw;
	memoB[slot] = bw;
	memoOut[slot] = diff;
	memoValid[slot] = 1;

	return diff;
}

/**
 * Detect whether two {@link Uint32Array} views overlap in the same underlying
 * buffer at different byte offsets (where sequential writes into `dst` could
 * clobber unread elements of `src`).
 *
 * @param {Uint32Array} dst
 * @param {Uint32Array} src
 * @returns {boolean}
 */
function hasShiftedOverlap(dst, src) {
	if (dst.buffer !== src.buffer || dst.byteOffset === src.byteOffset) {
		return false;
	}
	const dstStart = dst.byteOffset;
	const dstEnd = dstStart + dst.byteLength;
	const srcStart = src.byteOffset;
	const srcEnd = srcStart + src.byteLength;
	return dstStart < srcEnd && srcStart < dstEnd;
}

/**
 * Compute the bitwise set difference (`a \ b`, i.e., elements present in `a`
 * and not present in `b`) over two equal-length {@link Uint32Array} bitmasks
 * using a precomputed 8-bit difference lookup table and a bounded word-pair
 * memoization cache.
 *
 * For every word index `i` in `0 .. a.length - 1`, `result[i] === (a[i] & ~b[i]) >>> 0`.
 * Neither `a` nor `b` is mutated unless explicitly passed as `out`.
 *
 * @param {Uint32Array} a - Minuend bitmask (set `A`) as 32-bit unsigned words.
 * @param {Uint32Array} b - Subtrahend bitmask (set `B`) as 32-bit unsigned words.
 * @param {Uint32Array} [out] - Optional pre-allocated destination {@link Uint32Array}
 *   of length `a.length`. May alias `a`, `b`, or an overlapping view into the same buffer.
 * @returns {Uint32Array} The resulting set-difference bitmask (`out` if provided,
 *   otherwise a newly allocated {@link Uint32Array}).
 * @throws {TypeError} If `a`, `b`, or a provided `out` is not a {@link Uint32Array}.
 * @throws {RangeError} If `a.length !== b.length`, or if `out` is provided and
 *   `out.length !== a.length`.
 */
export function setDifferenceMask32Memo(a, b, out) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected argument "a" to be a Uint32Array');
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Expected argument "b" to be a Uint32Array');
	}
	const len = a.length;
	if (b.length !== len) {
		throw new RangeError(
			`Bitmask word-length mismatch: a.length (${len}) !== b.length (${b.length})`,
		);
	}

	let target;
	let writeBack = null;

	if (out === undefined) {
		target = new Uint32Array(len);
	} else {
		if (!(out instanceof Uint32Array)) {
			throw new TypeError('Expected optional argument "out" to be a Uint32Array');
		}
		if (out.length !== len) {
			throw new RangeError(
				`Output buffer word-length mismatch: out.length (${out.length}) !== a.length (${len})`,
			);
		}
		if (hasShiftedOverlap(out, a) || hasShiftedOverlap(out, b)) {
			target = new Uint32Array(len);
			writeBack = out;
		} else {
			target = out;
		}
	}

	for (let i = 0; i < len; i += 1) {
		target[i] = diffWord32Memo(a[i], b[i]);
	}

	if (writeBack !== null) {
		writeBack.set(target);
		return writeBack;
	}

	return target;
}
