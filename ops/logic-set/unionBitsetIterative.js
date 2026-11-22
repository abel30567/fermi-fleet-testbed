/**
 * Computes the set union of zero, one, two, or multiple arbitrary-width
 * non-negative BigInt bitsets using a straightforward iterative loop.
 *
 * Each bitset is represented as a non-negative `BigInt`, where bit `i`
 * (`(bitset >> BigInt(i)) & 1n`) is `1n` if element `i` belongs to the set
 * and `0n` otherwise. Because `BigInt` values have arbitrary precision, bitsets
 * of any width are supported without 32-bit or 53-bit truncation.
 *
 * Calling conventions:
 * - Variadic: `unionBitsetIterative(a, b, ...)`
 * - Single array of bitsets: `unionBitsetIterative([a, b, ...])`
 * - Empty input (`unionBitsetIterative()` or `unionBitsetIterative([])`) returns
 *   the identity element `0n` (the empty set).
 *
 * @param {...(bigint | readonly bigint[])} bitsets - Non-negative `BigInt`
 *   bitsets passed as variadic arguments, or a single array of non-negative
 *   `BigInt` bitsets.
 * @returns {bigint} The arbitrary-width non-negative `BigInt` bitset
 *   representing the union of all input bitsets.
 * @throws {TypeError} If any argument (or element of a single array argument)
 *   is not a `bigint`.
 * @throws {RangeError} If any bitset is negative (`< 0n`).
 */
export function unionBitsetIterative(...bitsets) {
	const items =
		bitsets.length === 1 && Array.isArray(bitsets[0]) ? bitsets[0] : bitsets

	let result = 0n

	for (let i = 0; i < items.length; i++) {
		if (!(i in items)) {
			throw new TypeError(
				`Expected a non-negative BigInt bitset at index ${i}, received empty array slot`
			)
		}

		const bitset = items[i]

		if (typeof bitset !== 'bigint') {
			throw new TypeError(
				`Expected a BigInt bitset at index ${i}, received ${
					bitset === null ? 'null' : typeof bitset
				}`
			)
		}

		if (bitset < 0n) {
			throw new RangeError(
				`Expected a non-negative BigInt bitset at index ${i}, received ${bitset}n`
			)
		}

		result |= bitset
	}

	return result
}
