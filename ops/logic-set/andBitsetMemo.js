/**
 * Bitwise AND (set intersection) over arbitrary-width non-negative BigInt bitsets,
 * implemented using a precomputed 256x256 byte lookup table and a bounded LRU memoization cache.
 *
 * @module ops/logic-set/andBitsetMemo
 */

/** @type {readonly [readonly [0, 0], readonly [0, 1]]} */
const BIT_AND_TRUTH = Object.freeze([
	Object.freeze([0, 0]),
	Object.freeze([0, 1]),
]);

/**
 * Precomputed 256x256 byte-wise AND table indexed by `(byteA << 8) | byteB`.
 * Constructed from the 2x2 bit truth table at module load.
 * @type {Uint8Array}
 */
const BYTE_AND_TABLE = new Uint8Array(256 * 256);
for (let x = 0; x < 256; x++) {
	for (let y = 0; y < 256; y++) {
		let acc = 0;
		for (let bit = 0; bit < 8; bit++) {
			const bx = (x >> bit) & 1;
			const by = (y >> bit) & 1;
			acc |= BIT_AND_TRUTH[bx][by] << bit;
		}
		BYTE_AND_TABLE[(x << 8) | y] = acc;
	}
}

/**
 * Precomputed two-character lowercase hex representations for byte values 0..255.
 * @type {string[]}
 */
const HEX_BYTES = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * Precomputed ASCII charCode -> nibble value (0..15) table for lowercase hex digits.
 * @type {Uint8Array}
 */
const HEX_NIBBLE = new Uint8Array(128);
for (let i = 0; i < 10; i++) {
	HEX_NIBBLE[48 + i] = i;
}
for (let i = 0; i < 6; i++) {
	HEX_NIBBLE[97 + i] = 10 + i;
}

/** Maximum number of canonical operand pairs stored in the memoization cache. */
const MAX_MEMO_ENTRIES = 4096;

/** Maximum hex length per operand eligible for memoization (4096 hex digits = 16,384 bits). */
const MAX_MEMO_HEX_LEN = 4096;

/**
 * Bounded LRU memoization cache keyed by canonical ordered hex pair `"lo:hi"`.
 * @type {Map<string, bigint>}
 */
const memoCache = new Map();

/**
 * Validate that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Candidate bitset operand.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative.
 */
function assertBitset(value, name) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`${name} must be a BigInt bitset, received ${typeof value}`);
	}
	if (value < 0n) {
		throw new RangeError(`${name} must be a non-negative BigInt bitset`);
	}
}

/**
 * Compute the bitwise AND (logic-set intersection) of two arbitrary-width
 * non-negative BigInt bitsets using a precomputed byte lookup table and
 * commutative LRU memoization.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset containing bits set in both `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function andBitsetMemo(a, b) {
	assertBitset(a, 'a');
	assertBitset(b, 'b');

	// Algebraic fast paths
	if (a === 0n || b === 0n) {
		return 0n;
	}
	if (a === b) {
		return a;
	}

	const ha = a.toString(16);
	const hb = b.toString(16);

	const shouldMemoize = ha.length <= MAX_MEMO_HEX_LEN && hb.length <= MAX_MEMO_HEX_LEN;
	let cacheKey = '';
	if (shouldMemoize) {
		cacheKey = a <= b ? `${ha}:${hb}` : `${hb}:${ha}`;
		const cached = memoCache.get(cacheKey);
		if (cached !== undefined) {
			// Refresh LRU recency
			memoCache.delete(cacheKey);
			memoCache.set(cacheKey, cached);
			return cached;
		}
	}

	const commonLen = Math.min(ha.length, hb.length);
	const offsetA = ha.length - commonLen;
	const offsetB = hb.length - commonLen;

	const parts = [];
	let i = 0;

	// Handle leading odd nibble if common hex length is odd
	if ((commonLen & 1) === 1) {
		const na = HEX_NIBBLE[ha.charCodeAt(offsetA)];
		const nb = HEX_NIBBLE[hb.charCodeAt(offsetB)];
		const outNibble = BYTE_AND_TABLE[(na << 8) | nb];
		parts.push(HEX_BYTES[outNibble][1]);
		i = 1;
	}

	// Process remaining aligned byte pairs via the precomputed 256x256 lookup table
	for (; i < commonLen; i += 2) {
		const byteA =
			(HEX_NIBBLE[ha.charCodeAt(offsetA + i)] << 4) |
			HEX_NIBBLE[ha.charCodeAt(offsetA + i + 1)];
		const byteB =
			(HEX_NIBBLE[hb.charCodeAt(offsetB + i)] << 4) |
			HEX_NIBBLE[hb.charCodeAt(offsetB + i + 1)];
		const outByte = BYTE_AND_TABLE[(byteA << 8) | byteB];
		parts.push(HEX_BYTES[outByte]);
	}

	const result = BigInt(`0x${parts.join('')}`);

	if (shouldMemoize) {
		if (memoCache.size >= MAX_MEMO_ENTRIES) {
			const oldestKey = memoCache.keys().next().value;
			memoCache.delete(oldestKey);
		}
		memoCache.set(cacheKey, result);
	}

	return result;
}
