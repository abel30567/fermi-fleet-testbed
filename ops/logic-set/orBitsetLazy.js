/**
 * Validates that a value is a non-negative BigInt representing an arbitrary-width bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {string} label - Descriptive label used in error messages.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative (`< 0n`).
 */
function validateBitset(value, label) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`${label} must be a BigInt, received ${typeof value}`)
	}
	if (value < 0n) {
		throw new RangeError(`${label} must be a non-negative BigInt bitset`)
	}
}

/**
 * Lazily computes the running bitwise OR (set union) over a sequence of
 * arbitrary-width non-negative BigInt bitsets.
 *
 * Representation:
 * - Each bitset is a non-negative `bigint` of arbitrary bit width, where bit `k`
 *   (`(bitset >> BigInt(k)) & 1n === 1n`) denotes membership of element `k` and
 *   `0n` represents the empty set (identity element of bitwise OR).
 *
 * Laziness guarantees:
 * - Top-level arguments (`bitsets` iterability and `initial`) are validated eagerly
 *   when `orBitsetLazy` is called.
 * - The returned generator does not invoke `bitsets[Symbol.iterator]()` or pull any
 *   elements until the consumer requests values (e.g., via `.next()` or `for...of`).
 * - Elements are consumed strictly one at a time without materializing the input
 *   sequence, supporting arbitrarily large or infinite iterables in O(1) element
 *   buffering (memory proportional only to the bit width of the running union).
 * - Early termination by the consumer (`break` or `.return()`) closes the underlying
 *   iterator via `for...of` protocol finalization.
 *
 * @param {Iterable<bigint>} bitsets - Iterable sequence of non-negative BigInt bitsets.
 * @param {bigint} [initial=0n] - Optional initial non-negative BigInt accumulator.
 * @returns {Generator<bigint, void, undefined>} Generator yielding the cumulative
 *   bitwise OR (`acc |= next`) after each consumed element. Yields nothing if
 *   `bitsets` is empty.
 * @throws {TypeError} If `bitsets` is not a non-string iterable, if `initial` is not
 *   a `bigint`, or (lazily during iteration) if any yielded element is not a `bigint`.
 * @throws {RangeError} If `initial` is negative, or (lazily during iteration) if any
 *   yielded element is negative.
 */
export function orBitsetLazy(bitsets, initial = 0n) {
	if (
		bitsets === null ||
		bitsets === undefined ||
		typeof bitsets === 'string' ||
		typeof bitsets[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('bitsets must be an iterable of non-negative BigInt bitsets')
	}
	validateBitset(initial, 'initial')

	return (function* streamOr() {
		let acc = initial
		for (const bitset of bitsets) {
			validateBitset(bitset, 'bitset element')
			acc |= bitset
			yield acc
		}
	})()
}
