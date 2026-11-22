/**
 * Computes the bitwise OR of two 32-bit unsigned word bitmasks (`Uint32Array`)
 * in a numerically and structurally robust manner.
 *
 * Key guarantees:
 * - Unsigned 32-bit normalization (`>>> 0`) on every word to avoid JavaScript's
 *   signed 32-bit bitwise pitfalls (e.g., `0x80000000` becoming `-2147483648`).
 * - Defensive immutability: inputs are never mutated, and the returned
 *   `Uint32Array` always owns a freshly allocated `ArrayBuffer`, making
 *   identical or overlapping/aliased `subarray` views completely safe.
 * - Optional trailing-bit masking via `options.bitLength` so unused high bits
 *   beyond `bitLength` are deterministically cleared to `0`.
 *
 * @param {Uint32Array} a - First bitmask represented as little-endian 32-bit unsigned words.
 * @param {Uint32Array} b - Second bitmask represented as little-endian 32-bit unsigned words; must match `a.length`.
 * @param {{ bitLength?: number }} [options] - Optional configuration.
 * @param {number} [options.bitLength] - Optional active bit count in `[0, a.length * 32]`.
 *   Bits at indices `>= bitLength` are cleared to `0` in the returned mask.
 * @returns {Uint32Array} A newly allocated `Uint32Array` of length `a.length` containing `(a | b)` with optional tail masking.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`, uses a detached buffer, or `options`/`options.bitLength` has an invalid type.
 * @throws {RangeError} If `a.length !== b.length` or `options.bitLength` is outside `[0, a.length * 32]`.
 */
export function orMask32Stable(a, b, options = undefined) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('First operand `a` must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('Second operand `b` must be a Uint32Array')
	}
	if (a.buffer.detached === true || b.buffer.detached === true) {
		throw new TypeError('Input Uint32Array buffers must not be detached')
	}

	const wordCount = a.length
	if (b.length !== wordCount) {
		throw new RangeError(
			`Bitmask word lengths must match (received ${wordCount} and ${b.length})`
		)
	}

	let bitLength
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('`options` must be a plain object when provided')
		}
		if (options.bitLength !== undefined) {
			if (typeof options.bitLength !== 'number' || !Number.isFinite(options.bitLength)) {
				throw new TypeError('`options.bitLength` must be a finite integer')
			}
			if (!Number.isSafeInteger(options.bitLength)) {
				throw new RangeError('`options.bitLength` must be a safe integer')
			}
			const maxBits = wordCount * 32
			if (options.bitLength < 0 || options.bitLength > maxBits) {
				throw new RangeError(
					`\`options.bitLength\` must be in [0, ${maxBits}] (received ${options.bitLength})`
				)
			}
			bitLength = options.bitLength
		}
	}

	const result = new Uint32Array(wordCount)
	if (wordCount === 0) {
		return result
	}

	if (bitLength === undefined) {
		for (let i = 0; i < wordCount; i++) {
			const wa = a[i] >>> 0
			const wb = b[i] >>> 0
			result[i] = (wa | wb) >>> 0
		}
		return result
	}

	const fullWords = Math.floor(bitLength / 32)
	const remBits = bitLength % 32

	for (let i = 0; i < fullWords; i++) {
		const wa = a[i] >>> 0
		const wb = b[i] >>> 0
		result[i] = (wa | wb) >>> 0
	}

	if (remBits > 0) {
		// Safe unsigned mask for remBits in [1, 31], avoiding signed 1 << 31 pitfalls.
		const tailMask = (0xffffffff >>> (32 - remBits)) >>> 0
		const wa = a[fullWords] >>> 0
		const wb = b[fullWords] >>> 0
		result[fullWords] = (((wa | wb) >>> 0) & tailMask) >>> 0
	}

	// Remaining words at indices >= fullWords + (remBits > 0 ? 1 : 0) stay 0.
	return result
}
