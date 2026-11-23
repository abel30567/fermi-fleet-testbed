/**
 * Precomputed 256x256 byte-wise bitwise OR lookup table.
 * Indexed by `(byteA << 8) | byteB`, storing `byteA | byteB`.
 * @type {Uint8Array}
 */
const BYTE_OR_TABLE = new Uint8Array(256 * 256);
for (let x = 0; x < 256; x++) {
	const row = x << 8;
	for (let y = 0; y < 256; y++) {
		BYTE_OR_TABLE[row | y] = x | y;
	}
}

/**
 * Direct-mapped word-pair memoization table for 32-bit mask unions.
 * Zero-initialized slots satisfy `(0 | 0) >>> 0 === 0`, so every slot
 * maintains the invariant `cacheVal[i] === ((cacheKeyA[i] | cacheKeyB[i]) >>> 0)`.
 */
const CACHE_BITS = 12;
const CACHE_SIZE = 1 << CACHE_BITS;
const CACHE_SHIFT = 32 - CACHE_BITS;
const cacheKeyA = new Uint32Array(CACHE_SIZE);
const cacheKeyB = new Uint32Array(CACHE_SIZE);
const cacheVal = new Uint32Array(CACHE_SIZE);

/**
 * Compute the unsigned 32-bit union of two Uint32 words using the
 * direct-mapped memoization table backed by the precomputed byte-OR table.
 *
 * @param {number} wa - First unsigned 32-bit word.
 * @param {number} wb - Second unsigned 32-bit word.
 * @returns {number} Unsigned 32-bit bitwise union `(wa | wb) >>> 0`.
 */
function unionWord32Memo(wa, wb) {
	const hash =
		Math.imul(wa ^ 0x9e3779b1, 0x85ebca6b) ^
		Math.imul(wb ^ 0xc2b2ae35, 0x27d4eb2f);
	const slot = hash >>> CACHE_SHIFT;

	if (cacheKeyA[slot] === wa && cacheKeyB[slot] === wb) {
		return cacheVal[slot];
	}

	const b0 = BYTE_OR_TABLE[((wa & 0xff) << 8) | (wb & 0xff)];
	const b1 = BYTE_OR_TABLE[(((wa >>> 8) & 0xff) << 8) | ((wb >>> 8) & 0xff)];
	const b2 = BYTE_OR_TABLE[(((wa >>> 16) & 0xff) << 8) | ((wb >>> 16) & 0xff)];
	const b3 = BYTE_OR_TABLE[((wa >>> 24) << 8) | (wb >>> 24)];
	const merged = (b0 + (b1 << 8) + (b2 << 16) + b3 * 0x1000000) >>> 0;

	cacheKeyA[slot] = wa;
	cacheKeyB[slot] = wb;
	cacheVal[slot] = merged;
	return merged;
}

/**
 * Check whether two Uint32Array views overlap in memory at different offsets.
 * Identical-offset aliasing is safe for forward word-by-word iteration.
 *
 * @param {Uint32Array} target
 * @param {Uint32Array} source
 * @returns {boolean}
 */
function hasShiftedOverlap(target, source) {
	if (target.buffer !== source.buffer) {
		return false;
	}
	if (target.byteOffset === source.byteOffset) {
		return false;
	}
	const tStart = target.byteOffset;
	const tEnd = tStart + target.byteLength;
	const sStart = source.byteOffset;
	const sEnd = sStart + source.byteLength;
	return tStart < sEnd && sStart < tEnd;
}

/**
 * Compute the logic-set union over two Uint32 bitmasks stored as `Uint32Array` words,
 * using a precomputed 256x256 byte-OR lookup table with direct-mapped 32-bit word-pair
 * memoization.
 *
 * When `a` and `b` have different word lengths, the shorter bitmask is treated as
 * zero-extended in higher words and the union spans `Math.max(a.length, b.length)` words.
 *
 * @param {Uint32Array} a - First Uint32 bitmask (array of 32-bit words).
 * @param {Uint32Array} b - Second Uint32 bitmask (array of 32-bit words).
 * @param {Uint32Array} [out] - Optional destination `Uint32Array` with length `>= Math.max(a.length, b.length)`.
 *   If omitted, a new `Uint32Array` of length `Math.max(a.length, b.length)` is allocated and returned.
 * @returns {Uint32Array} Bitwise union mask (`out` if provided, otherwise a newly allocated `Uint32Array`).
 * @throws {TypeError} If `a`, `b`, or a provided `out` is not a `Uint32Array`.
 * @throws {RangeError} If a provided `out` has length smaller than `Math.max(a.length, b.length)`.
 */
export function unionMask32Memo(a, b, out) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('unionMask32Memo: expected first argument "a" to be a Uint32Array');
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('unionMask32Memo: expected second argument "b" to be a Uint32Array');
	}

	const aLen = a.length;
	const bLen = b.length;
	const minLen = aLen < bLen ? aLen : bLen;
	const maxLen = aLen > bLen ? aLen : bLen;

	let target;
	if (out === undefined) {
		target = new Uint32Array(maxLen);
	} else {
		if (!(out instanceof Uint32Array)) {
			throw new TypeError('unionMask32Memo: expected optional third argument "out" to be a Uint32Array');
		}
		if (out.length < maxLen) {
			throw new RangeError(
				`unionMask32Memo: destination "out" length (${out.length}) must be at least ${maxLen}`
			);
		}
		target = out;
	}

	const srcA = hasShiftedOverlap(target, a) ? a.slice() : a;
	const srcB = hasShiftedOverlap(target, b) ? b.slice() : b;

	for (let i = 0; i < minLen; i++) {
		target[i] = unionWord32Memo(srcA[i], srcB[i]);
	}

	if (aLen > minLen) {
		for (let i = minLen; i < aLen; i++) {
			target[i] = srcA[i];
		}
	} else if (bLen > minLen) {
		for (let i = minLen; i < bLen; i++) {
			target[i] = srcB[i];
		}
	}

	return target;
}
