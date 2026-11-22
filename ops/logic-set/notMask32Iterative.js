/**
 * Computes the bitwise NOT (logical complement) of a Uint32Array bitmask
 * iteratively word-by-word.
 *
 * Each 32-bit unsigned word `a[i]` is inverted via `(~a[i]) >>> 0`, producing
 * a new `Uint32Array` of the same length without mutating the input.
 *
 * @param {Uint32Array} a - Input 32-bit word bitmask.
 * @returns {Uint32Array} A new Uint32Array containing the bitwise complement of `a`.
 * @throws {TypeError} If `a` is not a Uint32Array instance.
 */
export function notMask32Iterative(a) {
	if (!(a instanceof Uint32Array)) {
		throw new TypeError('Expected input to be a Uint32Array')
	}

	const len = a.length
	const result = new Uint32Array(len)

	for (let i = 0; i < len; i++) {
		result[i] = (~a[i]) >>> 0
	}

	return result
}
