/**
 * Precomputed 256-entry lookup table for bitwise NOT of a single unsigned byte.
 * `BYTE_NOT_TABLE[b] === (~b) & 0xff` for all `0 <= b <= 255`.
 * @type {Uint8Array}
 */
const BYTE_NOT_TABLE = Uint8Array.from({ length: 256 }, (_, byte) => (~byte) & 0xff)

/**
 * Precomputed 33-entry lookup table of low-bit masks for 32-bit unsigned words.
 * `TAIL_MASK_TABLE[k]` has its lowest `k` bits set to 1 and the remaining `32 - k` bits set to 0.
 * @type {Uint32Array}
 */
const TAIL_MASK_TABLE = Uint32Array.from({ length: 33 }, (_, bits) =>
	bits === 0 ? 0 : (0xffffffff >>> (32 - bits)) >>> 0,
)

/**
 * Maximum number of 32-bit word inversions retained in the memoization cache.
 * @type {number}
 */
const MAX_WORD_CACHE_SIZE = 4096

/**
 * Bounded word-level memoization cache mapping an unsigned 32-bit word
 * to its bitwise NOT computed via `BYTE_NOT_TABLE`.
 * @type {Map<number, number>}
 */
const wordNotCache = new Map()

/**
 * Invert a single 32-bit unsigned integer word using the precomputed byte table
 * with bounded memoization.
 *
 * @param {number} word - Unsigned 32-bit integer word.
 * @returns {number} Unsigned 32-bit bitwise complement of `word`.
 */
function invertWordMemo(word) {
	const cached = wordNotCache.get(word)
	if (cached !== undefined) {
		return cached
	}

	const b0 = BYTE_NOT_TABLE[word & 0xff]
	const b1 = BYTE_NOT_TABLE[(word >>> 8) & 0xff]
	const b2 = BYTE_NOT_TABLE[(word >>> 16) & 0xff]
	const b3 = BYTE_NOT_TABLE[(word >>> 24) & 0xff]
	const inverted = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0

	if (wordNotCache.size >= MAX_WORD_CACHE_SIZE) {
		wordNotCache.clear()
	}
	wordNotCache.set(word, inverted)

	return inverted
}

/**
 * Compute the bitwise NOT (logical set complement) over a Uint32 bitmask stored
 * in a `Uint32Array`, using a precomputed byte-inversion lookup table, a
 * precomputed tail-mask table, and bounded word-level memoization.
 *
 * Returns a newly allocated `Uint32Array` of the same length without mutating
 * the input `mask`. When `bitLength` is provided, only bits in `[0, bitLength)`
 * are complemented and all higher bits (including trailing words) are cleared to 0.
 *
 * @param {Uint32Array} mask - Source bitmask words (each word holds 32 unsigned bits, LSB first).
 * @param {number} [bitLength] - Optional logical universe size in bits (`0 <= bitLength <= mask.length * 32`).
 *   Defaults to `mask.length * 32` (complement all bits in every word).
 * @returns {Uint32Array} A new `Uint32Array` containing the complemented bitmask.
 * @throws {TypeError} If `mask` is not a `Uint32Array`, its buffer is detached,
 *   or `bitLength` is defined and not a number.
 * @throws {RangeError} If `bitLength` is not a safe integer in `[0, mask.length * 32]`.
 */
export function notMask32Memo(mask, bitLength) {
	if (!(mask instanceof Uint32Array)) {
		throw new TypeError('mask must be a Uint32Array')
	}
	if (mask.buffer.detached) {
		throw new TypeError('mask buffer must not be detached')
	}

	const wordCount = mask.length
	const maxBits = wordCount * 32
	let effectiveBits = maxBits

	if (bitLength !== undefined) {
		if (typeof bitLength !== 'number') {
			throw new TypeError('bitLength must be a number when provided')
		}
		if (!Number.isSafeInteger(bitLength) || bitLength < 0 || bitLength > maxBits) {
			throw new RangeError(`bitLength must be an integer between 0 and ${maxBits}`)
		}
		effectiveBits = bitLength === 0 ? 0 : bitLength
	}

	const result = new Uint32Array(wordCount)
	if (effectiveBits === 0) {
		return result
	}

	const fullWords = Math.floor(effectiveBits / 32)
	const tailBits = effectiveBits % 32

	for (let i = 0; i < fullWords; i++) {
		result[i] = invertWordMemo(mask[i])
	}

	if (tailBits > 0) {
		result[fullWords] = (invertWordMemo(mask[fullWords]) & TAIL_MASK_TABLE[tailBits]) >>> 0
	}

	return result
}
