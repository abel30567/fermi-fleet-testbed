/**
 * Validates that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {number} index - Zero-based position in the input sequence (for error context).
 * @returns {bigint} The validated non-negative BigInt bitset.
 * @throws {TypeError} If `value` is not a BigInt.
 * @throws {RangeError} If `value` is negative.
 */
function validateBitset(value, index) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`Expected bitset at index ${index} to be a bigint, got ${value === null ? 'null' : typeof value}`
		)
	}
	if (value < 0n) {
		throw new RangeError(
			`Expected bitset at index ${index} to be a non-negative bigint, got ${value}`
		)
	}
	return value
}

/**
 * Internal generator performing lazy cumulative bitwise intersection.
 *
 * @param {Iterable<bigint>} bitsets - Validated iterable of non-negative BigInt bitsets.
 * @param {boolean} shortCircuit - Whether to stop consuming once the intersection becomes 0n.
 * @returns {Generator<bigint, void, undefined>}
 */
function* intersectionGenerator(bitsets, shortCircuit) {
	let acc = 0n
	let hasValue = false
	let index = 0

	for (const item of bitsets) {
		const bitset = validateBitset(item, index)
		index += 1

		acc = hasValue ? acc & bitset : bitset
		hasValue = true

		yield acc

		if (shortCircuit && acc === 0n) {
			return
		}
	}
}

/**
 * Lazily computes the running (cumulative) set intersection over a sequence of
 * arbitrary-width BigInt bitsets.
 *
 * **Bitset representation:**
 * Each bitset is represented as a non-negative `bigint`, where bit `k`
 * (`(bitset >> BigInt(k)) & 1n === 1n`) indicates membership of element `k`.
 * Arbitrary bit widths are supported with exact BigInt arithmetic.
 *
 * **Streaming & laziness guarantees:**
 * - Returns a standard JavaScript `Generator<bigint, void, undefined>`.
 * - Consumes `bitsets` strictly lazily, pulling at most one element per `.next()` call
 *   without materializing the input sequence.
 * - Safe to use with infinite or very large iterables/generators.
 * - Yields the cumulative intersection after each consumed bitset:
 *   `b_0`, `b_0 & b_1`, `b_0 & b_1 & b_2`, ...
 * - Yields nothing for an empty iterable (there is no finite universal bitset identity
 *   for an unbounded bitset universe).
 * - When `options.shortCircuit` is `true`, the generator stops consuming inputs and
 *   closes the upstream iterator as soon as the running intersection reaches `0n`
 *   (the absorbing element of intersection).
 * - Closing the returned generator early (e.g. via `break` or `.return()`) closes
 *   the underlying iterator via JavaScript's `for..of` protocol.
 *
 * @param {Iterable<bigint>} bitsets - Iterable sequence of non-negative BigInt bitsets.
 * @param {object} [options] - Optional configuration.
 * @param {boolean} [options.shortCircuit=false] - If `true`, terminate immediately after
 *   yielding `0n` without pulling further elements from `bitsets`.
 * @returns {Generator<bigint, void, undefined>} Generator yielding each running
 *   intersection bitset as a non-negative `bigint`.
 * @throws {TypeError} If `bitsets` is not a non-string iterable, if `options` is not a
 *   plain object / undefined, if `options.shortCircuit` is not a boolean, or (lazily)
 *   if any yielded element is not a `bigint`.
 * @throws {RangeError} Lazily if any yielded element is a negative `bigint`.
 */
export function intersectionBitsetLazy(bitsets, options = {}) {
	if (
		bitsets === null ||
		bitsets === undefined ||
		typeof bitsets === 'string' ||
		typeof bitsets[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'bitsets must be a non-string iterable of non-negative bigint bitsets'
		)
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object when provided')
	}

	const { shortCircuit = false } = options
	if (typeof shortCircuit !== 'boolean') {
		throw new TypeError('options.shortCircuit must be a boolean')
	}

	return intersectionGenerator(bitsets, shortCircuit)
}
