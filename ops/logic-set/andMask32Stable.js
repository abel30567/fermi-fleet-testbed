/**
 * Computes the bitwise AND of two Uint32 bitmasks represented as `Uint32Array` words.
 *
 * Uses explicit unsigned 32-bit normalization (`>>> 0`) to avoid signed 32-bit
 * JavaScript bitwise pitfalls (e.g., high bit `0x80000000` becoming negative).
 * Allocates a fresh `Uint32Array` backed by an independent `ArrayBuffer`, guaranteeing
 * defensive immutability even when inputs are identical or share overlapping buffers.
 *
 * @param {Uint32Array} a - First bitmask word array (little-endian word order: word `i` holds bits `[32*i, 32*i + 31]`).
 * @param {Uint32Array} b - Second bitmask word array; must have the same length as `a`.
 * @param {number | { bitLength?: number }} [bitLengthOrOptions] - Optional bit length (or options object with `bitLength`)
 *   used to clamp trailing bits at or beyond `bitLength` to zero. Must be an integer in `[0, a.length * 32]`.
 * @returns {Uint32Array} A new `Uint32Array` containing the unsigned 32-bit bitwise AND result.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`, has a detached `ArrayBuffer`, or `bitLengthOrOptions` is invalid.
 * @throws {RangeError} If `a.length !== b.length` or `bitLength` is outside `[0, a.length * 32]`.
 */
export function andMask32Stable(a, b, bitLengthOrOptions) {
	validateUint32Array(a, 'a')
	validateUint32Array(b, 'b')

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Bitmask length mismatch: received ${len} and ${b.length} words`,
		)
	}

	const totalBits = len * 32
	const bitLength = resolveBitLength(bitLengthOrOptions, totalBits)

	const out = new Uint32Array(len)
	if (len === 0 || bitLength === 0) {
		return out
	}

	const fullWords = Math.floor(bitLength / 32)
	const remBits = bitLength - fullWords * 32

	for (let i = 0; i < fullWords; i += 1) {
		out[i] = ((a[i] >>> 0) & (b[i] >>> 0)) >>> 0
	}

	if (remBits > 0) {
		// Unsigned right shift avoids signed 32-bit overflow when remBits is 31.
		const tailMask = (0xffffffff >>> (32 - remBits)) >>> 0
		out[fullWords] =
			(((a[fullWords] >>> 0) & (b[fullWords] >>> 0)) & tailMask) >>> 0
	}

	return out
}

/**
 * Validates that a value is a live `Uint32Array`.
 *
 * @param {unknown} value
 * @param {string} name
 */
function validateUint32Array(value, name) {
	if (!(value instanceof Uint32Array)) {
		throw new TypeError(`Expected ${name} to be a Uint32Array`)
	}
	if (value.buffer.detached) {
		throw new TypeError(`Input ${name} has a detached ArrayBuffer`)
	}
}

/**
 * Resolves and validates an optional `bitLength` parameter.
 *
 * @param {number | { bitLength?: number } | undefined} bitLengthOrOptions
 * @param {number} totalBits
 * @returns {number}
 */
function resolveBitLength(bitLengthOrOptions, totalBits) {
	if (bitLengthOrOptions === undefined) {
		return totalBits
	}

	let bitLength
	if (typeof bitLengthOrOptions === 'number') {
		bitLength = bitLengthOrOptions
	} else if (
		typeof bitLengthOrOptions === 'object' &&
		bitLengthOrOptions !== null &&
		!Array.isArray(bitLengthOrOptions)
	) {
		if (bitLengthOrOptions.bitLength === undefined) {
			return totalBits
		}
		bitLength = bitLengthOrOptions.bitLength
	} else {
		throw new TypeError(
			'Expected optional third argument to be an integer bitLength or an options object { bitLength }',
		)
	}

	if (typeof bitLength !== 'number' || !Number.isInteger(bitLength)) {
		throw new TypeError('bitLength must be an integer')
	}

	if (bitLength < 0 || bitLength > totalBits) {
		throw new RangeError(
			`bitLength (${bitLength}) must be between 0 and ${totalBits}`,
		)
	}

	return bitLength
}
