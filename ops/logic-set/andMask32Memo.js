/**
 * Table-driven and memoized bitwise AND (logic-set intersection) over
 * Uint32Array bitmask words.
 *
 * Precomputes a 64 KiB byte-pair AND lookup table (256 × 256) at module load
 * and backs 32-bit word-pair evaluations with a bounded direct-mapped
 * memoization cache keyed by canonicalized (min, max) word pairs.
 */

/** @type {Uint8Array} Precomputed lookup table for all 256 × 256 byte pairs. */
const BYTE_AND_TABLE = new Uint8Array(256 * 256);
for (let x = 0; x < 256; x++) {
	const rowOffset = x << 8;
	for (let y = 0; y < 256; y++) {
		BYTE_AND_TABLE[rowOffset | y] = x & y;
	}
}

/** Direct-mapped memoization cache size (must be a power of two). */
const MEMO_SIZE = 4096;
const MEMO_MASK = MEMO_SIZE - 1;

const memoKeyA = new Uint32Array(MEMO_SIZE);
const memoKeyB = new Uint32Array(MEMO_SIZE);
const memoVal = new Uint32Array(MEMO_SIZE);
const memoValid = new Uint8Array(MEMO_SIZE);

/**
 * Compute bitwise AND of two unsigned 32-bit words using the precomputed
 * byte-pair table, with direct-mapped memoization for repeated word pairs.
 *
 * @param {number} wa Unsigned 32-bit integer word.
 * @param {number} wb Unsigned 32-bit integer word.
 * @returns {number} Unsigned 32-bit integer result of `wa & wb`.
 */
function andWord32Memo(wa, wb) {
	// Canonicalize pair order to exploit commutativity (wa & wb === wb & wa).
	const lo = wa <= wb ? wa : wb;
	const hi = wa <= wb ? wb : wa;

	const slot = ((Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi, 0x85ebca6b)) >>> 20) & MEMO_MASK;
	if (memoValid[slot] === 1 && memoKeyA[slot] === lo && memoKeyB[slot] === hi) {
		return memoVal[slot];
	}

	const b0 = BYTE_AND_TABLE[((lo & 0xff) << 8) | (hi & 0xff)];
	const b1 = BYTE_AND_TABLE[(((lo >>> 8) & 0xff) << 8) | ((hi >>> 8) & 0xff)];
	const b2 = BYTE_AND_TABLE[(((lo >>> 16) & 0xff) << 8) | ((hi >>> 16) & 0xff)];
	const b3 = BYTE_AND_TABLE[((lo >>> 24) << 8) | (hi >>> 24)];
	const res = ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0;

	memoKeyA[slot] = lo;
	memoKeyB[slot] = hi;
	memoVal[slot] = res;
	memoValid[slot] = 1;

	return res;
}

/**
 * Determine whether two Uint32Array views overlap in the same underlying
 * ArrayBuffer at different byte offsets.
 *
 * @param {Uint32Array} target
 * @param {Uint32Array} source
 * @returns {boolean}
 */
function hasShiftedOverlap(target, source) {
	if (target.buffer !== source.buffer || target.byteOffset === source.byteOffset) {
		return false;
	}
	const targetStart = target.byteOffset;
	const targetEnd = targetStart + target.byteLength;
	const sourceStart = source.byteOffset;
	const sourceEnd = sourceStart + source.byteLength;
	return targetStart < sourceEnd && sourceStart < targetEnd;
}

/**
 * Computes the bitwise AND (logic-set intersection) of two Uint32 bitmasks
 * stored as `Uint32Array` word arrays using a precomputed byte-pair lookup
 * table and a bounded word-pair memoization cache.
 *
 * @param {Uint32Array} a First bitmask word array.
 * @param {Uint32Array} b Second bitmask word array (must match `a.length`).
 * @param {Uint32Array} [out] Optional output `Uint32Array` of matching length.
 *   May alias `a` or `b`. If omitted, a new `Uint32Array` is allocated.
 * @returns {Uint32Array} The resulting bitmask (`out` if provided, otherwise a new `Uint32Array`).
 * @throws {TypeError} If `a`, `b`, or a provided `out` is not a `Uint32Array`.
 * @throws {RangeError} If `a`, `b`, or a provided `out` do not have equal lengths.
 */
export function andMask32Memo(a, b, out) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError("Expected 'a' to be a Uint32Array");
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError("Expected 'b' to be a Uint32Array");
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		);
	}

	const len = a.length;
	let dest;
	let needsCopyBack = false;

	if (out === undefined) {
		dest = new Uint32Array(len);
	} else {
		if (!(out instanceof Uint32Array)) {
			throw new TypeError("Expected 'out' to be a Uint32Array when provided");
		}
		if (out.length !== len) {
			throw new RangeError(
				`Output length mismatch: out.length (${out.length}) !== a.length (${len})`
			);
		}
		if (hasShiftedOverlap(out, a) || hasShiftedOverlap(out, b)) {
			dest = new Uint32Array(len);
			needsCopyBack = true;
		} else {
			dest = out;
		}
	}

	for (let i = 0; i < len; i++) {
		dest[i] = andWord32Memo(a[i], b[i]);
	}

	if (needsCopyBack) {
		out.set(dest);
		return out;
	}

	return dest;
}
