/**
 * Precomputed 256x256 byte-wise XOR lookup table (64 KiB).
 * Entry `(x << 8) | y` holds `x ^ y` for `x, y ∈ [0, 255]`.
 *
 * @type {Uint8Array}
 */
const XOR_BYTE_TABLE = new Uint8Array(256 * 256);
for (let i = 0; i < 256; i++) {
	const rowOffset = i << 8;
	for (let j = 0; j < 256; j++) {
		XOR_BYTE_TABLE[rowOffset | j] = i ^ j;
	}
}

/**
 * Fixed-size direct-mapped memoization cache for canonicalized 32-bit word pairs.
 * Bounded in size (no heap growth) and keyed on `(min(wa, wb), max(wa, wb))`
 * to exploit XOR commutativity.
 */
const CACHE_SIZE = 1024;
const CACHE_MASK = CACHE_SIZE - 1;
const cacheKeyLo = new Uint32Array(CACHE_SIZE);
const cacheKeyHi = new Uint32Array(CACHE_SIZE);
const cacheValue = new Uint32Array(CACHE_SIZE);
const cacheValid = new Uint8Array(CACHE_SIZE);

/**
 * Compute bitwise XOR of two unsigned 32-bit words using the memoization cache
 * backed by the precomputed byte-wise XOR lookup table.
 *
 * @param {number} wa - First uint32 word.
 * @param {number} wb - Second uint32 word.
 * @returns {number} Unsigned 32-bit result of `wa XOR wb`.
 */
function xorWordMemo(wa, wb) {
	const lo = wa <= wb ? wa : wb;
	const hi = wa <= wb ? wb : wa;
	const slot = (Math.imul(lo, 0x9e3779b1) ^ Math.imul(hi, 0x85ebca6b)) & CACHE_MASK;

	if (cacheValid[slot] === 1 && cacheKeyLo[slot] === lo && cacheKeyHi[slot] === hi) {
		return cacheValue[slot];
	}

	const b0 = XOR_BYTE_TABLE[((lo & 0xff) << 8) | (hi & 0xff)];
	const b1 = XOR_BYTE_TABLE[(((lo >>> 8) & 0xff) << 8) | ((hi >>> 8) & 0xff)];
	const b2 = XOR_BYTE_TABLE[(((lo >>> 16) & 0xff) << 8) | ((hi >>> 16) & 0xff)];
	const b3 = XOR_BYTE_TABLE[((lo >>> 24) << 8) | (hi >>> 24)];
	const result = ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0;

	cacheValid[slot] = 1;
	cacheKeyLo[slot] = lo;
	cacheKeyHi[slot] = hi;
	cacheValue[slot] = result;

	return result;
}

/**
 * Determine whether two Uint32Array views partially overlap in memory
 * (same underlying ArrayBuffer, distinct byteOffset, intersecting byte ranges).
 *
 * @param {Uint32Array} dst
 * @param {Uint32Array} src
 * @returns {boolean}
 */
function hasPartialOverlap(dst, src) {
	if (dst.buffer !== src.buffer || dst.byteOffset === src.byteOffset || dst.byteLength === 0) {
		return false;
	}
	const dstStart = dst.byteOffset;
	const dstEnd = dstStart + dst.byteLength;
	const srcStart = src.byteOffset;
	const srcEnd = srcStart + src.byteLength;
	return dstStart < srcEnd && srcStart < dstEnd;
}

/**
 * Validate that a value is a non-detached `Uint32Array`.
 *
 * @param {unknown} value
 * @param {string} name
 */
function assertUint32Array(value, name) {
	if (!(value instanceof Uint32Array)) {
		throw new TypeError(`${name} must be a Uint32Array`);
	}
	if (value.buffer.detached) {
		throw new TypeError(`${name} must not have a detached ArrayBuffer`);
	}
}

/**
 * Computes the bitwise XOR (symmetric difference) of two Uint32 bitmasks
 * represented as `Uint32Array` words, using a precomputed byte-wise XOR lookup
 * table combined with a bounded direct-mapped word-pair memoization cache.
 *
 * @param {Uint32Array} a - First bitmask word array.
 * @param {Uint32Array} b - Second bitmask word array (must have the same length as `a`).
 * @param {Uint32Array} [out] - Optional destination `Uint32Array` of the same length.
 *   May alias `a`, `b`, or partially overlap their underlying buffer safely.
 *   If omitted, a new `Uint32Array` is allocated and returned.
 * @returns {Uint32Array} A `Uint32Array` (either `out` or a newly allocated array)
 *   containing the word-wise bitwise XOR of `a` and `b`.
 * @throws {TypeError} If `a`, `b`, or a provided `out` is not a `Uint32Array`
 *   (or uses a detached `ArrayBuffer`).
 * @throws {RangeError} If `a`, `b`, and (when provided) `out` do not have equal lengths.
 */
export function xorMask32Memo(a, b, out) {
	assertUint32Array(a, 'a');
	assertUint32Array(b, 'b');

	const len = a.length;
	if (b.length !== len) {
		throw new RangeError(`Length mismatch: a has length ${len}, b has length ${b.length}`);
	}

	let target;
	let writeDirectly = true;

	if (out === undefined) {
		target = new Uint32Array(len);
	} else {
		assertUint32Array(out, 'out');
		if (out.length !== len) {
			throw new RangeError(`Length mismatch: out has length ${out.length}, expected ${len}`);
		}
		if (hasPartialOverlap(out, a) || hasPartialOverlap(out, b)) {
			target = new Uint32Array(len);
			writeDirectly = false;
		} else {
			target = out;
		}
	}

	for (let i = 0; i < len; i++) {
		target[i] = xorWordMemo(a[i], b[i]);
	}

	if (!writeDirectly) {
		out.set(target);
		return out;
	}

	return target;
}
