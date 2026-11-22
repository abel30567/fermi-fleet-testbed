/**
 * Streaming/generator-based union over arbitrary-width BigInt bitsets.
 *
 * Bitset representation:
 * - Each bitset is represented as a non-negative `BigInt`, where bit `i`
 *   (corresponding to `1n << BigInt(i)`, for `i >= 0`) is `1` if element `i`
 *   is present in the set and `0` otherwise.
 * - The empty set is represented by `0n`.
 * - Arbitrary widths (e.g., thousands of bits) are supported natively via
 *   exact `BigInt` bitwise OR (`|`).
 *
 * Laziness guarantees:
 * - Consumes `bitsets` lazily one element at a time using a generator; it never
 *   materializes the input iterable into an array.
 * - Supports infinite iterables/generators and constant-count auxiliary state
 *   (only the running accumulator `BigInt`).
 * - Pulling `k` outputs pulls at most `k` items from `bitsets`.
 * - Early termination (e.g., `break` in `for...of` or `.return()`) propagates
 *   iterator cleanup to the underlying input iterator.
 *
 * @param {Iterable<bigint>} bitsets - Iterable of non-negative `BigInt` bitsets
 *   to union sequentially.
 * @param {bigint} [initial=0n] - Optional initial non-negative `BigInt` bitset
 *   accumulator (defaults to `0n`, the empty set).
 * @returns {Generator<bigint, void, undefined>} A lazy generator yielding the
 *   running cumulative union (`acc |= bitset`) after each input bitset. Yields
 *   nothing if `bitsets` is empty.
 * @throws {TypeError} If `bitsets` is not an iterable (or is a string), if
 *   `initial` is not a `BigInt`, or (lazily, on consumption) if any yielded
 *   element of `bitsets` is not a `BigInt`.
 * @throws {RangeError} If `initial` is negative, or (lazily, on consumption) if
 *   any yielded element of `bitsets` is negative.
 */
export function unionBitsetLazy(bitsets, initial = 0n) {
	if (
		bitsets == null ||
		typeof bitsets === 'string' ||
		typeof bitsets[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'bitsets must be a non-string iterable of non-negative BigInt bitsets',
		);
	}
	if (typeof initial !== 'bigint') {
		throw new TypeError('initial must be a BigInt');
	}
	if (initial < 0n) {
		throw new RangeError('initial must be a non-negative BigInt');
	}

	return unionBitsetStream(bitsets, initial);
}

/**
 * Internal generator performing lazy running union over validated bitsets.
 *
 * @param {Iterable<bigint>} bitsets
 * @param {bigint} initial
 * @returns {Generator<bigint, void, undefined>}
 */
function* unionBitsetStream(bitsets, initial) {
	let acc = initial;
	for (const bitset of bitsets) {
		if (typeof bitset !== 'bigint') {
			throw new TypeError('each bitset must be a BigInt');
		}
		if (bitset < 0n) {
			throw new RangeError('each bitset must be a non-negative BigInt');
		}
		acc |= bitset;
		yield acc;
	}
}
