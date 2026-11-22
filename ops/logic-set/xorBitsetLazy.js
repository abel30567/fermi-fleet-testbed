/**
 * Validates that a value is a non-negative BigInt representing an arbitrary-width bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {string} label - Parameter or element label used in error messages.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative (`< 0n`).
 */
function validateBitset(value, label) {
  if (typeof value !== 'bigint') {
    throw new TypeError(`${label} must be a BigInt, received ${typeof value}`);
  }
  if (value < 0n) {
    throw new RangeError(`${label} must be a non-negative BigInt bitset`);
  }
}

/**
 * Internal generator performing lazy cumulative XOR over validated BigInt bitsets.
 *
 * @param {Iterable<bigint>} bitsets
 * @param {bigint} initial
 * @returns {Generator<bigint, void, undefined>}
 */
function* xorBitsetStream(bitsets, initial) {
  let acc = initial;
  let index = 0;

  for (const bitset of bitsets) {
    validateBitset(bitset, `bitsets[${index}]`);
    acc ^= bitset;
    index += 1;
    yield acc;
  }
}

/**
 * Lazily streams the running bitwise XOR (symmetric difference) over a sequence
 * of arbitrary-width BigInt bitsets.
 *
 * Representation:
 * - Each bitset is a non-negative `bigint` where bit `k` (`(bitset >> BigInt(k)) & 1n === 1n`)
 *   indicates membership of element `k` (`k >= 0`).
 * - Because non-negative BigInts have an unbounded number of zero-extended leading bits,
 *   arbitrary bit positions are supported without width truncation, and every yielded
 *   result is guaranteed to be a non-negative `bigint`.
 *
 * Laziness guarantees:
 * - Top-level arguments (`bitsets` iterability and `initial`) are validated eagerly when
 *   `xorBitsetLazy` is invoked, without invoking `bitsets[Symbol.iterator]()`.
 * - Elements of `bitsets` are pulled strictly one at a time on each `.next()` call,
 *   allowing consumption of arbitrarily large or infinite sequences in O(1) extra iterator
 *   overhead (O(width) bitset state).
 * - Early termination (e.g., `break` in `for...of` or `.return()`) closes the underlying
 *   iterator without consuming further elements.
 *
 * @param {Iterable<bigint>} bitsets - Iterable of non-negative BigInt bitsets to XOR sequentially.
 * @param {bigint} [initial=0n] - Optional non-negative BigInt seed bitset (defaults to `0n`, the XOR identity).
 * @returns {Generator<bigint, void, undefined>} Generator yielding the cumulative XOR bitset after each consumed input bitset.
 * @throws {TypeError} If `bitsets` is not a non-string iterable, if `initial` is not a `bigint`,
 *   or (lazily during iteration) if an element of `bitsets` is not a `bigint`.
 * @throws {RangeError} If `initial` is negative, or (lazily during iteration) if an element
 *   of `bitsets` is negative.
 */
export function xorBitsetLazy(bitsets, initial = 0n) {
  if (
    bitsets === null ||
    bitsets === undefined ||
    typeof bitsets === 'string' ||
    bitsets instanceof String ||
    typeof bitsets[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError('bitsets must be a non-string iterable of non-negative BigInt bitsets');
  }

  validateBitset(initial, 'initial');

  return xorBitsetStream(bitsets, initial);
}
