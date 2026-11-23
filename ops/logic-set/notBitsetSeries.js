/**
 * Computes the bitwise NOT (set complement) of an arbitrary-width BigInt bitset
 * using the closed-form geometric series identity.
 *
 * For a universe of `width` bits `{0, 1, ..., width - 1}`, the full-set mask is
 * the finite geometric series:
 *
 *     U(w) = sum_{k=0}^{w-1} 2^k = 2^w - 1
 *
 * Because each bit b_k of `bits` is in {0, 1}, subtracting `bits` from `U(w)`
 * performs a borrow-free complement across all bit positions simultaneously:
 *
 *     NOT_w(bits) = sum_{k=0}^{w-1} (1 - b_k) * 2^k = (2^w - 1) - bits
 *
 * @param {bigint} bits - Non-negative BigInt bitset within `[0n, 2^width - 1]`.
 * @param {number | bigint} width - Non-negative integer bit width of the universe.
 * @returns {bigint} The `width`-bit complement of `bits`.
 * @throws {TypeError} If `bits` is not a BigInt, or `width` is neither a number nor a BigInt.
 * @throws {RangeError} If `bits` is negative, `width` is negative or not a safe integer,
 *   or `bits` has bits set at or above `width` (`bits >= 2^width`).
 */
export function notBitsetSeries(bits, width) {
	if (typeof bits !== 'bigint') {
		throw new TypeError(`Expected "bits" to be a bigint, got ${typeof bits}`)
	}
	if (bits < 0n) {
		throw new RangeError('Expected "bits" to be a non-negative bigint')
	}

	let w
	if (typeof width === 'bigint') {
		if (width < 0n) {
			throw new RangeError('Expected "width" to be a non-negative integer')
		}
		w = width
	} else if (typeof width === 'number') {
		if (!Number.isSafeInteger(width) || width < 0) {
			throw new RangeError('Expected "width" to be a non-negative safe integer')
		}
		w = BigInt(width)
	} else {
		throw new TypeError(`Expected "width" to be a number or bigint, got ${typeof width}`)
	}

	// Closed-form sum of the geometric series sum_{k=0}^{w-1} 2^k = 2^w - 1.
	const universe = (1n << w) - 1n

	if (bits > universe) {
		throw new RangeError(
			`Bitset value exceeds the ${w}-bit universe [0, 2^${w} - 1]`,
		)
	}

	// Borrow-free series identity: sum (1 - b_k) * 2^k = (2^w - 1) - bits.
	return universe - bits
}
