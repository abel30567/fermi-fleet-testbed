/**
 * Recursively computes the bitwise NOT over the half-open word range `[lo, hi)`
 * using a divide-and-conquer split.
 *
 * @param {Uint32Array} src - Source bitmask words (read-only).
 * @param {Uint32Array} dst - Destination bitmask words.
 * @param {number} lo - Inclusive lower word index.
 * @param {number} hi - Exclusive upper word index.
 */
function invertRange(src, dst, lo, hi) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		dst[lo] = (~src[lo]) >>> 0
		return
	}
	const mid = lo + ((hi - lo) >>> 1)
	invertRange(src, dst, lo, mid)
	invertRange(src, dst, mid, hi)
}

/**
 * Computes the bitwise NOT (logical complement) of a Uint32 bitmask represented
 * as a `Uint32Array` of 32-bit unsigned words, using a recursive
 * divide-and-conquer algorithm over the word range `[0, mask.length)`.
 *
 * Each output word preserves unsigned 32-bit semantics (`(~word) >>> 0`).
 * The input array is never mutated; a new `Uint32Array` is always returned.
 *
 * Time complexity: O(n) for n words.
 * Auxiliary call-stack depth: O(log n).
 *
 * @param {Uint32Array} mask - Input Uint32 bitmask words.
 * @returns {Uint32Array} A new `Uint32Array` containing the bitwise complement of `mask`.
 * @throws {TypeError} If `mask` is not a `Uint32Array`.
 */
export function notMask32Recursive(mask) {
	if (!(mask instanceof Uint32Array)) {
		throw new TypeError('Expected mask to be a Uint32Array')
	}

	const result = new Uint32Array(mask.length)
	if (mask.length > 0) {
		invertRange(mask, result, 0, mask.length)
	}
	return result
}
