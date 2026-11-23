/**
 * Precomputed 2x2 truth table for single-bit logical OR.
 * @type {readonly (readonly number[])[]}
 */
const BIT_OR = [
	[0, 1],
	[1, 1],
]

/**
 * Precomputed 256x256 lookup table for byte-wise OR, indexed by `(byteA << 8) + byteB`.
 * @type {Uint8Array}
 */
const BYTE_OR_TABLE = new Uint8Array(256 * 256)
for (let a = 0; a < 256; a++) {
	const rowOffset = a << 8
	for (let b = 0; b < 256; b++) {
		let acc = 0
		for (let bit = 0; bit < 8; bit++) {
			const bitA = (a >> bit) & 1
			const bitB = (b >> bit) & 1
			acc += BIT_OR[bitA][bitB] << bit
		}
		BYTE_OR_TABLE[rowOffset + b] = acc
	}
}

/**
 * Precomputed lookup table mapping a byte value (0..255) to its 2-character lowercase hex string.
 * @type {string[]}
 */
const BYTE_TO_HEX = new Array(256)
for (let i = 0; i < 256; i++) {
	BYTE_TO_HEX[i] = i.toString(16).padStart(2, '0')
}

/**
 * Precomputed lookup table mapping ASCII hex character codes to 4-bit nibble values (0..15).
 * @type {Uint8Array}
 */
const HEX_TO_NIBBLE = new Uint8Array(128)
for (let c = 48; c <= 57; c++) HEX_TO_NIBBLE[c] = c - 48 // '0'..'9'
for (let c = 65; c <= 70; c++) HEX_TO_NIBBLE[c] = c - 55 // 'A'..'F'
for (let c = 97; c <= 102; c++) HEX_TO_NIBBLE[c] = c - 87 // 'a'..'f'

const MEMO_MAX_ENTRIES = 4096
const MEMO_MAX_HEX_LEN = 2048

/**
 * Bounded memoization cache keyed by canonical commutative hex pair.
 * @type {Map<string, bigint>}
 */
const memoCache = new Map()

/**
 * Converts a non-negative BigInt to an even-length lowercase hexadecimal string.
 * @param {bigint} value
 * @returns {string}
 */
function toEvenHex(value) {
	const hex = value.toString(16)
	return hex.length % 2 === 1 ? '0' + hex : hex
}

/**
 * Computes the bitwise logical OR (set union) of two arbitrary-width BigInt bitsets
 * using a precomputed byte-pair lookup table and bounded commutative memoization.
 *
 * Each bit at index `i >= 0` represents membership of element `i` in the set.
 * Both operands must be non-negative BigInts.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} The BigInt bitset representing the union (`a OR b`).
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 * @throws {RangeError} If either `a` or `b` is negative.
 */
export function orBitsetMemo(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, got ${typeof b}`)
	}
	if (a < 0n) {
		throw new RangeError('Expected first argument "a" to be a non-negative bigint bitset')
	}
	if (b < 0n) {
		throw new RangeError('Expected second argument "b" to be a non-negative bigint bitset')
	}

	// Fast paths for identity, idempotence, and single-byte direct table lookup.
	if (a === 0n) return b
	if (b === 0n) return a
	if (a === b) return a
	if (a < 256n && b < 256n) {
		return BigInt(BYTE_OR_TABLE[(Number(a) << 8) + Number(b)])
	}

	const hexA = toEvenHex(a)
	const hexB = toEvenHex(b)

	const cacheable = hexA.length <= MEMO_MAX_HEX_LEN && hexB.length <= MEMO_MAX_HEX_LEN
	let cacheKey = ''
	if (cacheable) {
		cacheKey = a < b ? `${hexA}|${hexB}` : `${hexB}|${hexA}`
		const cached = memoCache.get(cacheKey)
		if (cached !== undefined) {
			return cached
		}
	}

	let hi = hexA
	let lo = hexB
	if (hi.length < lo.length) {
		hi = hexB
		lo = hexA
	}

	const offset = hi.length - lo.length
	const byteCount = lo.length >> 1
	const outBytes = new Array(byteCount)

	for (let i = 0, j = 0; i < lo.length; i += 2, j++) {
		const byteHi =
			(HEX_TO_NIBBLE[hi.charCodeAt(offset + i)] << 4) +
			HEX_TO_NIBBLE[hi.charCodeAt(offset + i + 1)]
		const byteLo =
			(HEX_TO_NIBBLE[lo.charCodeAt(i)] << 4) +
			HEX_TO_NIBBLE[lo.charCodeAt(i + 1)]
		outBytes[j] = BYTE_TO_HEX[BYTE_OR_TABLE[(byteHi << 8) + byteLo]]
	}

	const prefix = offset > 0 ? hi.slice(0, offset) : ''
	const result = BigInt('0x' + prefix + outBytes.join(''))

	if (cacheable) {
		if (memoCache.size >= MEMO_MAX_ENTRIES) {
			const oldestKey = memoCache.keys().next().value
			memoCache.delete(oldestKey)
		}
		memoCache.set(cacheKey, result)
	}

	return result
}
