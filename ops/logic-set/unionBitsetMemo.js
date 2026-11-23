/**
 * @fileoverview Arbitrary-width BigInt bitset union implemented via a
 * precomputed 8-bit byte-pair lookup table and bounded commutative memoization.
 */

const BIT_UNION = [
	[0, 1],
	[1, 1],
]

/**
 * Precomputed 256x256 lookup table for the bitwise union of two 8-bit lanes.
 * Entry `(byteA << 8) + byteB` holds the union of `byteA` and `byteB`.
 */
const BYTE_UNION_TABLE = new Uint8Array(65536)
for (let a = 0; a < 256; a++) {
	const rowOffset = a << 8
	for (let b = 0; b < 256; b++) {
		let merged = 0
		for (let bit = 0; bit < 8; bit++) {
			const bitA = (a >> bit) & 1
			const bitB = (b >> bit) & 1
			if (BIT_UNION[bitA][bitB] === 1) {
				merged += 1 << bit
			}
		}
		BYTE_UNION_TABLE[rowOffset + b] = merged
	}
}

/**
 * Precomputed lookup table mapping byte values `0..255` to two-digit lowercase hex strings.
 */
const BYTE_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

/**
 * Precomputed ASCII lookup table mapping hex character codes to their nibble value (`0..15`).
 */
const HEX_VAL = new Int8Array(128).fill(-1)
for (let i = 0; i < 10; i++) {
	HEX_VAL[48 + i] = i
}
for (let i = 0; i < 6; i++) {
	HEX_VAL[97 + i] = 10 + i
	HEX_VAL[65 + i] = 10 + i
}

const MAX_CACHE_ENTRIES = 4096

/** @type {Map<bigint, Map<bigint, bigint>>} */
const memoCache = new Map()

/** @type {Array<[bigint, bigint] | undefined>} */
const evictionRing = new Array(MAX_CACHE_ENTRIES)
let ringPos = 0
let cacheSize = 0

/**
 * Looks up a canonicalized `(lo, hi)` pair in the bounded memoization cache.
 *
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint | undefined}
 */
function cacheGet(lo, hi) {
	const inner = memoCache.get(lo)
	return inner === undefined ? undefined : inner.get(hi)
}

/**
 * Stores a canonicalized `(lo, hi) -> value` mapping in the bounded FIFO cache.
 *
 * @param {bigint} lo
 * @param {bigint} hi
 * @param {bigint} value
 */
function cacheSet(lo, hi, value) {
	if (cacheSize >= MAX_CACHE_ENTRIES) {
		const evicted = evictionRing[ringPos]
		if (evicted !== undefined) {
			const [evLo, evHi] = evicted
			const inner = memoCache.get(evLo)
			if (inner !== undefined) {
				inner.delete(evHi)
				if (inner.size === 0) {
					memoCache.delete(evLo)
				}
			}
			cacheSize--
		}
	}

	let inner = memoCache.get(lo)
	if (inner === undefined) {
		inner = new Map()
		memoCache.set(lo, inner)
	}
	inner.set(hi, value)
	evictionRing[ringPos] = [lo, hi]
	ringPos = (ringPos + 1) % MAX_CACHE_ENTRIES
	cacheSize++
}

/**
 * Computes the union of two non-negative BigInt bitsets byte-by-byte using the
 * precomputed 8-bit union lookup table.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function computeTableUnion(a, b) {
	let aHex = a.toString(16)
	let bHex = b.toString(16)
	if ((aHex.length & 1) === 1) aHex = '0' + aHex
	if ((bHex.length & 1) === 1) bHex = '0' + bHex

	const aBytes = aHex.length >> 1
	const bBytes = bHex.length >> 1
	const maxBytes = aBytes > bBytes ? aBytes : bBytes
	const aOffset = maxBytes - aBytes
	const bOffset = maxBytes - bBytes

	const outHex = new Array(maxBytes)
	for (let i = 0; i < maxBytes; i++) {
		let byteA = 0
		if (i >= aOffset) {
			const posA = (i - aOffset) << 1
			byteA = (HEX_VAL[aHex.charCodeAt(posA)] << 4) + HEX_VAL[aHex.charCodeAt(posA + 1)]
		}
		let byteB = 0
		if (i >= bOffset) {
			const posB = (i - bOffset) << 1
			byteB = (HEX_VAL[bHex.charCodeAt(posB)] << 4) + HEX_VAL[bHex.charCodeAt(posB + 1)]
		}
		outHex[i] = BYTE_TO_HEX[BYTE_UNION_TABLE[(byteA << 8) + byteB]]
	}

	return BigInt('0x' + outHex.join(''))
}

/**
 * Computes the set union of two arbitrary-width non-negative BigInt bitsets
 * using a precomputed byte-pair lookup table and bounded commutative memoization.
 *
 * Bit `k` (`(bitset >> BigInt(k)) & 1n === 1n`) represents membership of element `k`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing the union `a ∪ b`.
 * @throws {TypeError} If either argument is not a `bigint`.
 * @throws {RangeError} If either argument is negative.
 */
export function unionBitsetMemo(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument to be a bigint, got ${typeof b}`)
	}
	if (a < 0n) {
		throw new RangeError('First bitset must be a non-negative bigint')
	}
	if (b < 0n) {
		throw new RangeError('Second bitset must be a non-negative bigint')
	}

	if (a === 0n) return b
	if (b === 0n) return a
	if (a === b) return a

	if (a < 256n && b < 256n) {
		return BigInt(BYTE_UNION_TABLE[(Number(a) << 8) + Number(b)])
	}

	const lo = a < b ? a : b
	const hi = a < b ? b : a

	const cached = cacheGet(lo, hi)
	if (cached !== undefined) {
		return cached
	}

	const result = computeTableUnion(lo, hi)
	cacheSet(lo, hi, result)
	return result
}
