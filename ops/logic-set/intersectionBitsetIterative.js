/**
 * Computes the set intersection of one or more arbitrary-width non-negative
 * BigInt bitsets using a straightforward iterative implementation.
 *
 * Each bitset is represented as a non-negative `BigInt`, where bit `k`
 * (`((bitset >> BigInt(k)) & 1n) === 1n`) indicates membership of element `k`
 * in the set. Arbitrary bit widths are supported without truncation or fixed
 * word-size limits.
 *
 * Accepts either variadic BigInt arguments (`intersectionBitsetIterative(a, b, ...)`)
 * or a single array of BigInt bitsets (`intersectionBitsetIterative([a, b, ...])`).
 *
 * All inputs are validated before computing the intersection, ensuring invalid
 * trailing elements are never silently skipped when an intermediate result reaches `0n`.
 *
 * @param {...(bigint | bigint[])} bitsets - One or more non-negative BigInt bitsets,
 *   passed either as variadic arguments or as a single array of non-negative BigInts.
 * @returns {bigint} A non-negative BigInt bitset containing only the bits set in
 *   every input bitset.
 * @throws {RangeError} If no bitsets are provided (no arguments or an empty array),
 *   or if any bitset is a negative BigInt.
 * @throws {TypeError} If any bitset is not a primitive `bigint`.
 */
export function intersectionBitsetIterative(...bitsets) {
	const list =
		bitsets.length === 1 && Array.isArray(bitsets[0]) ? bitsets[0] : bitsets

	if (list.length === 0) {
		throw new RangeError(
			'intersectionBitsetIterative requires at least one bitset',
		)
	}

	for (let i = 0; i < list.length; i++) {
		const value = list[i]
		if (typeof value !== 'bigint') {
			const actualType = value === null ? 'null' : typeof value
			throw new TypeError(
				`Bitset at index ${i} must be a BigInt, received ${actualType}`,
			)
		}
		if (value < 0n) {
			throw new RangeError(
				`Bitset at index ${i} must be a non-negative BigInt`,
			)
		}
	}

	let result = list[0]
	for (let i = 1; i < list.length; i++) {
		result &= list[i]
		if (result === 0n) {
			break
		}
	}

	return result
}
