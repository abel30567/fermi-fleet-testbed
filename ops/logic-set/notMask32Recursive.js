/**
 * Computes the bitwise NOT (set complement) of a Uint32 bitmask stored as a
 * {@link Uint32Array} of 32-bit words, using a recursive divide-and-conquer
 * traversal over the word range.
 *
 * When `bitLength` is omitted, all `mask.length * 32` bits are inverted.
 * When `bitLength` is provided, only bit positions `[0, bitLength)` are
 * inverted and all bits at positions `>= bitLength` are cleared to `0`.
 *
 * @param {Uint32Array} mask - Source bitmask words (not mutated).
 * @param {number} [bitLength] - Optional bit universe size in `[0, mask.length * 32]`.
 * @returns {Uint32Array} A new Uint32Array containing the complemented bitmask.
 * @throws {TypeError} If `mask` is not a Uint32Array, or `bitLength` is provided and not an integer.
 * @throws {RangeError} If `bitLength` is negative or exceeds `mask.length * 32`.
 */
export function notMask32Recursive(mask, bitLength) {
	if (!(mask instanceof Uint32Array)) {
		throw new TypeError('Expected mask to be a Uint32Array')
	}

	const wordCount = mask.length
	const maxBits = wordCount * 32

	let fullWords = wordCount
	let tailMask = 0

	if (bitLength !== undefined) {
		if (typeof bitLength !== 'number' || !Number.isInteger(bitLength)) {
			throw new TypeError('Expected bitLength to be an integer')
		}
		if (bitLength < 0 || bitLength > maxBits) {
			throw new RangeError(`Expected bitLength in [0, ${maxBits}], got ${bitLength}`)
		}
		fullWords = Math.floor(bitLength / 32)
		const rem = bitLength % 32
		tailMask = rem === 0 ? 0 : 0xffffffff >>> (32 - rem)
	}

	const result = new Uint32Array(wordCount)
	if (wordCount === 0) {
		return result
	}

	const activeWords = tailMask === 0 ? fullWords : fullWords + 1

	const invertRange = (start, end) => {
		const span = end - start
		if (span <= 0) {
			return
		}
		if (span === 1) {
			if (start < fullWords) {
				result[start] = (~mask[start]) >>> 0
			} else if (start === fullWords && tailMask !== 0) {
				result[start] = ((~mask[start]) & tailMask) >>> 0
			}
			return
		}
		const mid = start + (span >>> 1)
		invertRange(start, mid)
		invertRange(mid, end)
	}

	invertRange(0, activeWords)
	return result
}
