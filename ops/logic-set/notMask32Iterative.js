/**
 * Computes the bitwise NOT of a Uint32Array bitmask using a straightforward iterative loop.
 *
 * Each 32-bit unsigned word is complemented via `(~word) >>> 0` and written to a newly
 * allocated `Uint32Array` of identical length, leaving the input unmodified.
 *
 * @param {Uint32Array} mask - Input bitmask represented as a `Uint32Array` of 32-bit words.
 * @returns {Uint32Array} A new `Uint32Array` containing the bitwise complement of each word.
 * @throws {TypeError} If `mask` is not a `Uint32Array` or its underlying buffer is detached.
 */
export function notMask32Iterative(mask) {
	if (!(mask instanceof Uint32Array)) {
		throw new TypeError('Expected mask to be a Uint32Array');
	}
	if (mask.buffer.detached) {
		throw new TypeError('Expected mask to be backed by an attached ArrayBuffer');
	}

	const length = mask.length;
	const result = new Uint32Array(length);
	for (let i = 0; i < length; i += 1) {
		result[i] = (~mask[i]) >>> 0;
	}
	return result;
}
