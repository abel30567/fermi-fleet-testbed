const UINT32_MAX = 2 ** 32 - 1

/**
 * Computes the bitwise NOT (logical complement) of Uint32 bitmasks stored in a
 * `Uint32Array`, using the closed-form finite geometric series complement identity:
 *
 *   NOT_32(w) = sum_{k=0}^{31} (1 - b_k) * 2^k = (2^32 - 1) - w
 *
 * When `bitLength` is provided, only the first `bitLength` bits (LSB-first within
 * each 32-bit word) are complemented using the partial geometric series identity
 * `NOT_r(w) = (2^r - 1) - (w mod 2^r)` on the trailing partial word, and all bits
 * at index >= `bitLength` are set to `0`.
 *
 * Does not mutate the input `Uint32Array`.
 *
 * @param {Uint32Array} words - Input bitmask words.
 * @param {number} [bitLength] - Optional active bit count in `[0, words.length * 32]`.
 * @returns {Uint32Array} New `Uint32Array` of the same length containing the complemented bitmasks.
 * @throws {TypeError} If `words` is not a `Uint32Array` (or has a detached buffer), or if `bitLength` is not a number when provided.
 * @throws {RangeError} If `bitLength` is not an integer in `[0, words.length * 32]`.
 */
export function notMask32Series(words, bitLength) {
	if (!(words instanceof Uint32Array)) {
		throw new TypeError('words must be a Uint32Array')
	}
	if (words.buffer.detached) {
		throw new TypeError('words must not be backed by a detached ArrayBuffer')
	}

	const wordCount = words.length
	const maxBits = wordCount * 32

	let activeBits = maxBits
	if (bitLength !== undefined) {
		if (typeof bitLength !== 'number') {
			throw new TypeError('bitLength must be a number when provided')
		}
		if (!Number.isSafeInteger(bitLength) || bitLength < 0 || bitLength > maxBits) {
			throw new RangeError(`bitLength must be an integer in [0, ${maxBits}]`)
		}
		activeBits = bitLength
	}

	const out = new Uint32Array(wordCount)
	const fullWords = Math.floor(activeBits / 32)
	const remBits = activeBits - fullWords * 32

	for (let i = 0; i < fullWords; i++) {
		out[i] = UINT32_MAX - words[i]
	}

	if (remBits > 0) {
		const modulus = 2 ** remBits
		const partialMask = modulus - 1
		out[fullWords] = partialMask - (words[fullWords] % modulus)
	}

	return out
}
