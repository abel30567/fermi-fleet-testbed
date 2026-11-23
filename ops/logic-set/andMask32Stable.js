/**
 * Computes the bitwise AND of two unsigned 32-bit bitmasks stored as `Uint32Array` words.
 *
 * Each output word is computed directly in 32-bit integer arithmetic with explicit
 * unsigned coercion (`(a[i] & b[i]) >>> 0`), guaranteeing exact bit-level semantics
 * across all 32 bit positions—including bit 31 (`0x80000000`)—with zero floating-point
 * rounding, zero sign-extension artifacts, and O(n) time and space complexity.
 *
 * Neither input array is mutated, and overlapping views (subarrays sharing an
 * underlying `ArrayBuffer`) or aliased references (`a === b`) are handled safely
 * by writing into a freshly allocated `Uint32Array`.
 *
 * @param {Uint32Array} a - First bitmask word array.
 * @param {Uint32Array} b - Second bitmask word array (must have the same length as `a`).
 * @returns {Uint32Array} A new `Uint32Array` of length `a.length` where `out[i] = (a[i] & b[i]) >>> 0`.
 * @throws {TypeError} If `a` or `b` is not a `Uint32Array`, or is backed by a detached `ArrayBuffer`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function andMask32Stable(a, b) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('andMask32Stable: first argument must be a Uint32Array')
	}
	if (!(b instanceof Uint32Array)) {
		throw new TypeError('andMask32Stable: second argument must be a Uint32Array')
	}
	if (a.buffer.detached) {
		throw new TypeError('andMask32Stable: first argument is backed by a detached ArrayBuffer')
	}
	if (b.buffer.detached) {
		throw new TypeError('andMask32Stable: second argument is backed by a detached ArrayBuffer')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`andMask32Stable: input Uint32Arrays must have equal length (got ${len} and ${b.length})`
		)
	}

	const out = new Uint32Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = (a[i] & b[i]) >>> 0
	}
	return out
}
