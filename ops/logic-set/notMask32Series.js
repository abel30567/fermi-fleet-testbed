/**
 * Bitwise NOT (Boolean complement) over Uint32Array bitmask words using a
 * closed-form Boolean-ring / geometric-series complement identity.
 *
 * Mathematical basis:
 * In the Boolean ring ({0, 1}^32, XOR, AND), the multiplicative identity on an
 * active r-bit universe (0 <= r <= 32) is the finite geometric series:
 *
 *   M_r = sum_{k=0}^{r-1} 2^k = 2^r - 1
 *
 * Because every active bit of (w & M_r) satisfies w_k <= 1, subtracting it from
 * M_r incurs zero borrows at every bit position k, yielding the closed-form
 * arithmetic complement identity:
 *
 *   not_{M_r}(w) = sum_{k=0}^{r-1} (1 - w_k) * 2^k
 *                = (2^r - 1) - (w & (2^r - 1))
 *
 * For a full 32-bit word (r = 32, M_32 = 2^32 - 1 = 0xFFFFFFFF):
 *
 *   not(w) = (0xFFFFFFFF - w) >>> 0
 *
 * which equals (w ^ 0xFFFFFFFF) >>> 0 and (~w) >>> 0 over all 32-bit unsigned
 * integers, and satisfies the involution identity not(not(w)) = w.
 *
 * @param {Uint32Array} mask - Input Uint32Array of 32-bit bitmask words.
 * @param {number} [bitLength] - Optional active bit length in
 *   [0, mask.length * 32]. Defaults to mask.length * 32 (full 32-bit word
 *   complement). When provided, bits at positions >= bitLength are cleared to 0.
 * @returns {Uint32Array} A new Uint32Array of the same word length containing
 *   the bitwise complement.
 * @throws {TypeError} If `mask` is not a Uint32Array, or if `bitLength` is
 *   provided and is not a number.
 * @throws {RangeError} If `bitLength` is provided and is not an integer in
 *   [0, mask.length * 32].
 */
export function notMask32Series(mask, bitLength) {
	if (!(mask instanceof Uint32Array)) {
		throw new TypeError('Expected mask to be a Uint32Array')
	}

	const wordCount = mask.length
	const maxBits = wordCount * 32
	const FULL_WORD_MASK = 0xffffffff // sum_{k=0}^{31} 2^k = 2^32 - 1

	if (bitLength === undefined) {
		const out = new Uint32Array(wordCount)
		for (let i = 0; i < wordCount; i++) {
			out[i] = (FULL_WORD_MASK - mask[i]) >>> 0
		}
		return out
	}

	if (typeof bitLength !== 'number') {
		throw new TypeError('Expected bitLength to be a number')
	}
	if (!Number.isInteger(bitLength) || bitLength < 0 || bitLength > maxBits) {
		throw new RangeError(
			`Expected bitLength to be an integer in [0, ${maxBits}], got ${bitLength}`
		)
	}

	const out = new Uint32Array(wordCount)
	for (let i = 0; i < wordCount; i++) {
		const remaining = bitLength - i * 32
		if (remaining >= 32) {
			out[i] = (FULL_WORD_MASK - mask[i]) >>> 0
		} else if (remaining > 0) {
			// M_r = sum_{k=0}^{r-1} 2^k = 2^r - 1 for 1 <= r <= 31
			const activeMask = FULL_WORD_MASK >>> (32 - remaining)
			const maskedWord = (mask[i] & activeMask) >>> 0
			out[i] = (activeMask - maskedWord) >>> 0
		} else {
			out[i] = 0
		}
	}

	return out
}
