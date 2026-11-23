/**
 * Precomputed 8-bit bitwise NOT lookup table (`i -> i ^ 0xff`).
 * @type {Uint8Array}
 */
const BYTE_NOT_TABLE = Uint8Array.from({ length: 256 }, (_, i) => i ^ 0xff);

/**
 * Precomputed 2-character lowercase hexadecimal string table for byte values `0..255`.
 * @type {string[]}
 */
const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * Precomputed mask for the most-significant byte indexed by `width % 8`.
 * Index 0 corresponds to a full 8-bit byte (`0xff`), while `1..7` mask the low `rem` bits.
 * @type {Uint8Array}
 */
const TAIL_MASK_TABLE = new Uint8Array([0xff, 0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f]);

/**
 * Precomputed ASCII character code to hex nibble value (`0..15`) lookup table.
 * @type {Uint8Array}
 */
const HEX_NIBBLE = (() => {
	const table = new Uint8Array(128);
	for (let i = 0; i < 10; i++) {
		table[48 + i] = i; // '0'..'9'
	}
	for (let i = 0; i < 6; i++) {
		table[65 + i] = 10 + i; // 'A'..'F'
		table[97 + i] = 10 + i; // 'a'..'f'
	}
	return table;
})();

const MAX_CACHE_SIZE = 4096;
const MAX_MEMO_WIDTH = 4096;

/**
 * Bounded LRU memoization cache keyed by `${width}:${normalizedHex}`.
 * @type {Map<string, bigint>}
 */
const MEMO_CACHE = new Map();

/**
 * Computes the logical/set NOT (bitwise complement) of a BigInt bitset over an
 * arbitrary fixed bit-width using precomputed byte-level lookup tables and
 * bounded LRU memoization.
 *
 * Bits at positions `>= width` in `bitset` are masked off so the result always
 * lies in `[0n, (1n << BigInt(width)) - 1n]`.
 *
 * @param {bigint} bitset - Non-negative BigInt representing the input bitset.
 * @param {number} width - Non-negative safe integer specifying the bitset width in bits.
 * @returns {bigint} The bitwise complement of `bitset` masked to `width` bits.
 * @throws {TypeError} If `bitset` is not a BigInt or `width` is not a number.
 * @throws {RangeError} If `bitset` is negative or `width` is not a non-negative safe integer.
 */
export function notBitsetMemo(bitset, width) {
	if (typeof bitset !== 'bigint') {
		throw new TypeError('bitset must be a BigInt');
	}
	if (bitset < 0n) {
		throw new RangeError('bitset must be a non-negative BigInt');
	}
	if (typeof width !== 'number') {
		throw new TypeError('width must be a safe non-negative integer');
	}
	if (!Number.isSafeInteger(width) || width < 0) {
		throw new RangeError('width must be a safe non-negative integer');
	}

	if (width === 0) {
		return 0n;
	}

	if (width <= 8) {
		const mask = TAIL_MASK_TABLE[width & 7];
		return BigInt(BYTE_NOT_TABLE[Number(bitset & 0xffn)] & mask);
	}

	const numBytes = Math.ceil(width / 8);
	const hexLen = numBytes * 2;
	const rawHex = bitset.toString(16);
	const hex =
		rawHex.length > hexLen
			? rawHex.slice(rawHex.length - hexLen)
			: rawHex.length < hexLen
				? rawHex.padStart(hexLen, '0')
				: rawHex;

	const useMemo = width <= MAX_MEMO_WIDTH;
	let cacheKey = '';
	if (useMemo) {
		cacheKey = `${width}:${hex}`;
		const cached = MEMO_CACHE.get(cacheKey);
		if (cached !== undefined) {
			MEMO_CACHE.delete(cacheKey);
			MEMO_CACHE.set(cacheKey, cached);
			return cached;
		}
	}

	const topMask = TAIL_MASK_TABLE[width % 8];
	const out = new Array(numBytes);

	const b0 = (HEX_NIBBLE[hex.charCodeAt(0)] << 4) | HEX_NIBBLE[hex.charCodeAt(1)];
	out[0] = BYTE_TO_HEX[BYTE_NOT_TABLE[b0] & topMask];

	for (let i = 1; i < numBytes; i++) {
		const pos = i * 2;
		const b = (HEX_NIBBLE[hex.charCodeAt(pos)] << 4) | HEX_NIBBLE[hex.charCodeAt(pos + 1)];
		out[i] = BYTE_TO_HEX[BYTE_NOT_TABLE[b]];
	}

	const result = BigInt(`0x${out.join('')}`);

	if (useMemo) {
		if (MEMO_CACHE.size >= MAX_CACHE_SIZE) {
			MEMO_CACHE.delete(MEMO_CACHE.keys().next().value);
		}
		MEMO_CACHE.set(cacheKey, result);
	}

	return result;
}
