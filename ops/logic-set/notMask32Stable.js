/**
 * Computes a 32-bit unsigned mask with the lowest `bitCount` bits set to 1,
 * avoiding JavaScript's modulo-32 shift wraparound and signed 32-bit overflow.
 *
 * @param {number} bitCount Integer in [0, 32].
 * @returns {number} Unsigned 32-bit mask.
 */
function lowBitsMask32(bitCount) {
	if (bitCount <= 0) {
		return 0
	}
	if (bitCount >= 32) {
		return 0xffffffff
	}
	return (0xffffffff >>> (32 - bitCount)) >>> 0
}

/**
 * Computes the bitwise NOT (complement) of a bitmask stored as `Uint32Array` words.
 *
 * Numerical & bitwise robustness guarantees:
 * - Normalizes every complemented word with unsigned zero-fill right shift (`(~w) >>> 0`)
 *   to avoid signed 32-bit integer pitfalls (e.g., `~0 === -1`).
 * - Defensively immutable: allocates and returns a new `Uint32Array` without mutating
 *   the input array or sharing its underlying `ArrayBuffer`.
 * - Safely handles optional `bitLength` masking for arbitrary bit counts in
 *   `[0, words.length * 32]`, including word-aligned boundaries (`rem === 0` / `rem === 32`),
 *   zeroing all unused high bits and trailing words without shift-overflow artifacts.
 *
 * @param {Uint32Array} words Input bitmask packed as little-endian 32-bit unsigned words.
 * @param {number} [bitLength] Optional number of active bits to invert (defaults to `words.length * 32`).
 *   Bits at indices `>= bitLength` in the returned mask are cleared to 0.
 * @returns {Uint32Array} New `Uint32Array` of the same length containing the bitwise complement.
 * @throws {TypeError} If `words` is not a `Uint32Array`, or `bitLength` is provided and not a number.
 * @throws {RangeError} If `bitLength` is not an integer in `[0, words.length * 32]`.
 */
export function notMask32Stable(words, bitLength) {
	if (!(words instanceof Uint32Array)) {
		throw new TypeError('words must be a Uint32Array')
	}

	const wordCount = words.length
	const totalBits = wordCount * 32

	let activeBits = totalBits
	if (bitLength !== undefined) {
		if (typeof bitLength !== 'number') {
			throw new TypeError('bitLength must be a number when provided')
		}
		if (!Number.isInteger(bitLength) || bitLength < 0 || bitLength > totalBits) {
			throw new RangeError(
				`bitLength must be an integer in [0, ${totalBits}], received ${bitLength}`
			)
		}
		activeBits = bitLength
	}

	const result = new Uint32Array(wordCount)
	if (activeBits === 0) {
		return result
	}

	// Use floating-point division and remainder rather than `>>> 5` / `& 31`
	// so large valid bitLengths never suffer 32-bit shift truncation.
	const fullWords = Math.floor(activeBits / 32)
	const remBits = activeBits % 32

	for (let i = 0; i < fullWords; i++) {
		result[i] = (~words[i]) >>> 0
	}

	if (remBits > 0) {
		const tailMask = lowBitsMask32(remBits)
		result[fullWords] = (((~words[fullWords]) >>> 0) & tailMask) >>> 0
	}

	return result
}
