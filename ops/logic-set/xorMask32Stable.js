/**
 * Bitwise XOR over Uint32 bitmasks stored as `Uint32Array` words.
 *
 * Performs unsigned 32-bit word-wise XOR using `(a[i] ^ b[i]) >>> 0`
 * normalization to avoid JavaScript signed 32-bit integer pitfalls (e.g., bit
 * 31 sign extension on values `>= 0x80000000`). Always allocates and returns a
 * fresh `Uint32Array` so inputs are never mutated and aliased or overlapping
 * buffer views are handled safely without read-after-write hazards.
 *
 * Optionally masks out any bits at or above `bitLength` (little-endian bit
 * order within each 32-bit word: bit `k` resides at word `Math.floor(k / 32)`,
 * bit position `k % 32`).
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand (must have the same length as `a`).
 * @param {number | { bitLength?: number }} [options] - Optional bit length or options object
 *   specifying `{ bitLength }`, where `0 <= bitLength <= a.length * 32`. Bits at indices
 *   `>= bitLength` in the result are cleared to `0`.
 * @returns {Uint32Array} A newly allocated `Uint32Array` containing the unsigned XOR bitmask.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`, has a detached backing buffer,
 *   or `options` / `bitLength` has an invalid type.
 * @throws {RangeError} If `a.length !== b.length` or `bitLength` is not a safe integer
 *   within `[0, a.length * 32]`.
 */
export function xorMask32Stable(a, b, options) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('xorMask32Stable: first operand `a` must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('xorMask32Stable: second operand `b` must be a Uint32Array')
	}
	if (a.buffer?.detached) {
		throw new TypeError('xorMask32Stable: first operand `a` has a detached ArrayBuffer')
	}
	if (b.buffer?.detached) {
		throw new TypeError('xorMask32Stable: second operand `b` has a detached ArrayBuffer')
	}

	const wordCount = a.length
	if (b.length !== wordCount) {
		throw new RangeError(
			`xorMask32Stable: operand lengths must match (got ${wordCount} and ${b.length})`
		)
	}

	const maxBits = wordCount * 32
	let bitLength = maxBits

	if (options !== undefined) {
		let rawBitLength
		if (typeof options === 'number') {
			rawBitLength = options
		} else if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
			if (options.bitLength !== undefined) {
				if (typeof options.bitLength !== 'number') {
					throw new TypeError('xorMask32Stable: `options.bitLength` must be a number')
				}
				rawBitLength = options.bitLength
			}
		} else {
			throw new TypeError(
				'xorMask32Stable: `options` must be a non-negative integer bitLength or an options object'
			)
		}

		if (rawBitLength !== undefined) {
			if (!Number.isSafeInteger(rawBitLength) || rawBitLength < 0 || rawBitLength > maxBits) {
				throw new RangeError(
					`xorMask32Stable: \`bitLength\` must be an integer in [0, ${maxBits}] (got ${rawBitLength})`
				)
			}
			bitLength = rawBitLength
		}
	}

	// Fresh allocation guarantees input immutability and immunity to aliased/overlapping views.
	const out = new Uint32Array(wordCount)
	if (wordCount === 0 || bitLength === 0) {
		return out
	}

	const fullWords = Math.floor(bitLength / 32)
	const remBits = bitLength % 32

	for (let i = 0; i < fullWords; i++) {
		out[i] = (a[i] ^ b[i]) >>> 0
	}

	if (remBits > 0) {
		// Unsigned right-shift avoids signed 32-bit overflow for remBits === 31.
		const tailMask = 0xffffffff >>> (32 - remBits)
		out[fullWords] = (((a[fullWords] ^ b[fullWords]) >>> 0) & tailMask) >>> 0
	}

	return out
}
