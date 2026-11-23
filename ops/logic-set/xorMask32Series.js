/**
 * Validate that a value is a live (non-detached) Uint32Array.
 *
 * @param {unknown} value - Candidate value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `value` is not a Uint32Array or its buffer is detached.
 */
function assertUint32Array(value, name) {
	if (
		!ArrayBuffer.isView(value) ||
		Object.prototype.toString.call(value) !== '[object Uint32Array]'
	) {
		throw new TypeError(`${name} must be a Uint32Array`)
	}
	if (value.buffer.detached) {
		throw new TypeError(`${name} must not have a detached ArrayBuffer`)
	}
}

/**
 * Compute the bitwise XOR (symmetric difference) of two Uint32Array bitmasks
 * word-by-word using the closed-form binary series identity:
 *
 *   x XOR y = sum_{k=0}^{31} (x_k + y_k - 2 * x_k * y_k) * 2^k
 *           = (x + y) - 2 * ((x & y) >>> 0)
 *
 * Because x, y in [0, 2^32 - 1], both (x + y) and 2 * ((x & y) >>> 0) lie in
 * [0, 2^33 - 2], which is exact in IEEE-754 double precision without carries
 * between bit positions.
 *
 * Does not mutate either input array and returns a newly allocated Uint32Array.
 *
 * @param {Uint32Array} a - First bitmask of 32-bit unsigned words.
 * @param {Uint32Array} b - Second bitmask of 32-bit unsigned words (same length as `a`).
 * @returns {Uint32Array} New Uint32Array containing the word-wise XOR of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a live Uint32Array.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function xorMask32Series(a, b) {
	assertUint32Array(a, 'a')
	assertUint32Array(b, 'b')

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Bitmask lengths must match (received ${len} and ${b.length})`
		)
	}

	const out = new Uint32Array(len)
	for (let i = 0; i < len; i++) {
		const x = a[i]
		const y = b[i]
		// Closed-form series identity: sum_{k=0}^{31} (x_k + y_k - 2*x_k*y_k) * 2^k
		// Unsigned coercion on (x & y) prevents sign-extension of bit 31.
		const both = (x & y) >>> 0
		out[i] = x + y - 2 * both
	}
	return out
}
