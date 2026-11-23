/**
 * Validates that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {string} label - Descriptive label used in error messages.
 * @returns {bigint} The validated non-negative BigInt bitset.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative.
 */
function assertNonNegativeBigInt(value, label) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`${label} must be a BigInt, received ${value === null ? 'null' : typeof value}`)
	}
	if (value < 0n) {
		throw new RangeError(`${label} must be a non-negative BigInt, received ${value}`)
	}
	return value
}

/**
 * Internal generator performing the lazy cumulative bitwise union.
 *
 * @param {Iterable<bigint>} bitsets
 * @param {bigint} initial
 * @returns {Generator<bigint, bigint, void>}
 */
function* unionBitsetGenerator(bitsets, initial) {
	let acc = initial
	let index = 0
	for (const bitset of bitsets) {
		const valid = assertNonNegativeBigInt(bitset, `bitsets[${index}]`)
		acc |= valid
		index += 1
		yield acc
	}
	return acc
}

/**
 * Lazily computes the running set union over an iterable of arbitrary-width
 * non-negative BigInt bitsets.
 *
 * Each bit at position `k` (`(bitset >> BigInt(k)) & 1n === 1n`) represents
 * membership of element `k` in the set. Input elements are pulled on demand
 * from `bitsets` as the returned generator is iterated, supporting single-pass
 * iterators, infinite sequences, and early termination without consuming
 * remaining inputs.
 *
 * Top-level arguments (`bitsets` iterability and `initial`) are validated
 * synchronously on call; individual bitset elements are validated lazily as
 * they are consumed.
 *
 * @param {Iterable<bigint>} bitsets - Iterable sequence of non-negative BigInt bitsets.
 * @param {bigint} [initial=0n] - Optional starting accumulator bitset (non-negative BigInt).
 * @returns {Generator<bigint, bigint, void>} Generator yielding the cumulative
 *   union after each consumed bitset, and returning the final union upon completion.
 * @throws {TypeError} If `bitsets` is not an iterable (or is a string), if `initial`
 *   is not a `bigint`, or (lazily during iteration) if any element is not a `bigint`.
 * @throws {RangeError} If `initial` is negative or (lazily during iteration) if any
 *   element is a negative `bigint`.
 */
export function unionBitsetLazy(bitsets, initial = 0n) {
	if (
		bitsets === null ||
		bitsets === undefined ||
		typeof bitsets === 'string' ||
		typeof bitsets[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('bitsets must be an iterable of non-negative BigInt bitsets')
	}
	const start = assertNonNegativeBigInt(initial, 'initial')
	return unionBitsetGenerator(bitsets, start)
}
