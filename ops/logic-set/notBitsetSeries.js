/**
 * Computes the bitwise logical complement (set complement) of a non-negative
 * arbitrary-width BigInt bitset using a closed-form geometric series identity.
 *
 * Mathematical derivation:
 * For a universe of width `w >= 0`, the universal bitset mask is the finite
 * geometric series:
 *   U_w = sum_{k=0}^{w-1} 2^k = 2^w - 1
 *
 * Writing `bitset = sum_{k>=0} a_k * 2^k` with `a_k in {0, 1}`, its projection
 * onto the `w`-bit universe is `bitset mod 2^w = sum_{k=0}^{w-1} a_k * 2^k`.
 * Therefore, the bit-plane complement series is:
 *   not_w(bitset) = sum_{k=0}^{w-1} (1 - a_k) * 2^k
 *                 = (2^w - 1) - (bitset mod 2^w)
 *
 * If `width` is omitted (`undefined`), it defaults to the minimal bit length
 * `min { w >= 0 : bitset < 2^w }`, which is `0n` for `0n` and
 * `floor(log2(bitset)) + 1` for `bitset > 0n`.
 *
 * @param {bigint} bitset - Non-negative BigInt representing the input bitset.
 * @param {number | bigint} [width] - Optional non-negative bit width (safe integer
 *   or BigInt). Defaults to the minimal bit length of `bitset`.
 * @returns {bigint} Non-negative BigInt representing the `width`-bit complement
 *   of `bitset`, strictly in `[0n, 2^width - 1]` (or `0n` when `width === 0`).
 * @throws {TypeError} If `bitset` is not a BigInt, or if `width` is provided
 *   and is neither a number nor a BigInt.
 * @throws {RangeError} If `bitset` is negative, or if `width` is negative,
 *   non-integer, non-finite, or an unsafe JavaScript number.
 */
export function notBitsetSeries(bitset, width) {
	if (typeof bitset !== 'bigint') {
		throw new TypeError('bitset must be a BigInt')
	}
	if (bitset < 0n) {
		throw new RangeError('bitset must be a non-negative BigInt')
	}

	let w
	if (width === undefined) {
		w = bitset === 0n ? 0n : BigInt(bitset.toString(2).length)
	} else if (typeof width === 'bigint') {
		if (width < 0n) {
			throw new RangeError('width must be a non-negative integer')
		}
		w = width
	} else if (typeof width === 'number') {
		if (!Number.isSafeInteger(width) || width < 0) {
			throw new RangeError('width must be a non-negative safe integer')
		}
		w = BigInt(width)
	} else {
		throw new TypeError('width must be a non-negative safe integer or BigInt')
	}

	if (w === 0n) {
		return 0n
	}

	// Closed-form geometric series identity:
	// sum_{k=0}^{w-1} (1 - a_k) * 2^k = (2^w - 1) - (bitset mod 2^w)
	const modulus = 2n ** w
	const universalMask = modulus - 1n
	const reduced = bitset < modulus ? bitset : bitset % modulus
	return universalMask - reduced
}
