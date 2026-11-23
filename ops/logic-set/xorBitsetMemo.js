/**
 * Precomputed 2x2 single-bit XOR truth table.
 * @type {readonly (readonly number[])[]}
 */
const BIT_XOR = [
	[0, 1],
	[1, 0],
]

/**
 * Precomputed 4-bit (nibble) XOR lookup table indexed by `(x << 4) | y`.
 * @type {Uint8Array}
 */
const NIBBLE_XOR_TABLE = new Uint8Array(16 * 16)
for (let x = 0; x < 16; x++) {
	for (let y = 0; y < 16; y++) {
		let out = 0
		for (let bit = 0; bit < 4; bit++) {
			out |= BIT_XOR[(x >> bit) & 1][(y >> bit) & 1] << bit
		}
		NIBBLE_XOR_TABLE[(x << 4) | y] = out
	}
}

/**
 * Precomputed 8-bit (byte) XOR lookup table indexed by `(x << 8) | y`.
 * Built hierarchically from `NIBBLE_XOR_TABLE`.
 * @type {Uint8Array}
 */
const BYTE_XOR_TABLE = new Uint8Array(256 * 256)
for (let x = 0; x < 256; x++) {
	const xHi = x >> 4
	const xLo = x & 0x0f
	const rowOffset = x << 8
	for (let y = 0; y < 256; y++) {
		const hi = NIBBLE_XOR_TABLE[(xHi << 4) | (y >> 4)]
		const lo = NIBBLE_XOR_TABLE[(xLo << 4) | (y & 0x0f)]
		BYTE_XOR_TABLE[rowOffset | y] = (hi << 4) | lo
	}
}

/**
 * Precomputed byte-to-two-character-hex lookup table.
 * @type {string[]}
 */
const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) =>
	i.toString(16).padStart(2, '0'),
)

/**
 * Precomputed ASCII character code to hex nibble value lookup table.
 * @type {Uint8Array}
 */
const HEX_CHAR_TO_VAL = new Uint8Array(128)
for (let i = 0; i <= 9; i++) {
	HEX_CHAR_TO_VAL[48 + i] = i
}
for (let i = 0; i < 6; i++) {
	HEX_CHAR_TO_VAL[97 + i] = 10 + i // 'a'-'f'
	HEX_CHAR_TO_VAL[65 + i] = 10 + i // 'A'-'F'
}

/** Maximum number of canonicalized `(lo, hi)` pairs retained in the memo cache. */
const MAX_MEMO_ENTRIES = 4096

/**
 * Bounded LRU memoization cache mapping canonical `"loHex:hiHex"` keys to XOR results.
 * @type {Map<string, bigint>}
 */
const memoCache = new Map()

/**
 * Validates that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a BigInt.
 * @throws {RangeError} If `value` is negative.
 */
function assertBitset(value, name) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`Expected ${name} to be a BigInt, received ${typeof value}`)
	}
	if (value < 0n) {
		throw new RangeError(`Expected ${name} to be a non-negative BigInt bitset`)
	}
}

/**
 * Computes the bitwise XOR (logic-set symmetric difference) of two arbitrary-width
 * non-negative BigInt bitsets using a precomputed byte-level lookup table and
 * bounded LRU memoization.
 *
 * Each bit index `i >= 0` in the returned BigInt is `1` if and only if bit `i`
 * is set in exactly one of `a` or `b`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing `a XOR b`.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 * @throws {RangeError} If either `a` or `b` is negative.
 */
export function xorBitsetMemo(a, b) {
	assertBitset(a, 'a')
	assertBitset(b, 'b')

	if (a === b) return 0n
	if (a === 0n) return b
	if (b === 0n) return a

	// Canonicalize operand order since XOR is commutative so (a, b) and (b, a) share cache entries.
	const lo = a < b ? a : b
	const hi = a < b ? b : a

	let loHex = lo.toString(16)
	let hiHex = hi.toString(16)

	const cacheKey = `${loHex}:${hiHex}`
	const cached = memoCache.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU recency.
		memoCache.delete(cacheKey)
		memoCache.set(cacheKey, cached)
		return cached
	}

	// Align both hex strings to even lengths so every two characters form one byte.
	if ((loHex.length & 1) === 1) loHex = `0${loHex}`
	if ((hiHex.length & 1) === 1) hiHex = `0${hiHex}`

	// Since lo < hi, hiHex.length >= loHex.length and their difference is even.
	const prefixLen = hiHex.length - loHex.length
	const byteCount = loHex.length >> 1
	const outHexParts = new Array(byteCount + (prefixLen > 0 ? 1 : 0))
	let partIdx = 0

	if (prefixLen > 0) {
		// High bytes present only in `hi` XOR with 0 and remain unchanged.
		outHexParts[partIdx++] = hiHex.slice(0, prefixLen)
	}

	for (let i = 0; i < loHex.length; i += 2) {
		const hiOffset = prefixLen + i
		const byteHi =
			(HEX_CHAR_TO_VAL[hiHex.charCodeAt(hiOffset)] << 4) |
			HEX_CHAR_TO_VAL[hiHex.charCodeAt(hiOffset + 1)]
		const byteLo =
			(HEX_CHAR_TO_VAL[loHex.charCodeAt(i)] << 4) |
			HEX_CHAR_TO_VAL[loHex.charCodeAt(i + 1)]
		outHexParts[partIdx++] = BYTE_TO_HEX[BYTE_XOR_TABLE[(byteHi << 8) | byteLo]]
	}

	const result = BigInt(`0x${outHexParts.join('')}`)

	if (memoCache.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(cacheKey, result)

	return result
}
