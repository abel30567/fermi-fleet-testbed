/**
 * Validates that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Descriptive label for error messages.
 * @throws {TypeError} If `value` is not a primitive `bigint`.
 * @throws {RangeError} If `value` is a negative `bigint`.
 */
function assertBitset(value, label) {
  if (typeof value !== 'bigint') {
    throw new TypeError(
      `Expected ${label} to be a BigInt bitset, received ${value === null ? 'null' : typeof value}`
    );
  }
  if (value < 0n) {
    throw new RangeError(
      `Expected ${label} to be a non-negative BigInt bitset, received ${value}n`
    );
  }
}

/**
 * Internal generator performing lazy streaming XOR over BigInt bitsets.
 *
 * @param {Iterable<bigint>} bitsets - Iterable of non-negative BigInt bitsets.
 * @param {bigint} initial - Initial non-negative BigInt bitset accumulator.
 * @returns {Generator<bigint, bigint, void>} Running XOR bitset generator.
 */
function* streamXorBitsets(bitsets, initial) {
  let acc = initial;
  let index = 0;

  for (const bitset of bitsets) {
    assertBitset(bitset, `bitsets[${index}]`);
    acc ^= bitset;
    index += 1;
    yield acc;
  }

  return acc;
}

/**
 * Lazily computes the running bitwise XOR (symmetric difference) over an
 * iterable of arbitrary-width non-negative BigInt bitsets.
 *
 * Each step pulls strictly one bitset from `bitsets`, validates that it is a
 * non-negative `bigint`, updates the running accumulator (`acc ^= bitset`),
 * and yields the updated bitset. When the input iterable is exhausted, the
 * generator's return value is the final accumulated XOR bitset (or
 * `options.initial` if `bitsets` is empty).
 *
 * Top-level arguments (`bitsets`, `options`, `options.initial`) are validated
 * synchronously when `xorBitsetLazy` is called; iteration over `bitsets` and
 * per-element validation happen lazily as values are pulled from the returned
 * generator. Early termination (e.g., `break` or `.return()`) closes the
 * underlying iterator cleanly.
 *
 * @param {Iterable<bigint>} bitsets - Non-string iterable yielding non-negative
 *   BigInt bitsets of arbitrary width (e.g., Array, Set, BigUint64Array, or
 *   lazy/infinite generator).
 * @param {object} [options] - Optional configuration object.
 * @param {bigint} [options.initial=0n] - Initial non-negative BigInt bitset
 *   accumulator (defaults to `0n`, the XOR identity).
 * @returns {Generator<bigint, bigint, void>} A lazy generator yielding the
 *   cumulative XOR bitset after each consumed input bitset and returning the
 *   final XOR bitset upon completion.
 * @throws {TypeError} If `bitsets` is not a non-string iterable, if `options`
 *   is not a plain object, if `options.initial` is not a `bigint`, or (lazily)
 *   if any yielded element is not a `bigint`.
 * @throws {RangeError} If `options.initial` is negative or (lazily) if any
 *   yielded element is negative.
 */
export function xorBitsetLazy(bitsets, options = {}) {
  if (
    bitsets === null ||
    bitsets === undefined ||
    typeof bitsets === 'string' ||
    typeof bitsets[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError(
      'Expected bitsets to be a non-string iterable of non-negative BigInt values'
    );
  }

  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Expected options to be a plain object when provided');
  }

  const { initial = 0n } = options;
  assertBitset(initial, 'options.initial');

  return streamXorBitsets(bitsets, initial);
}
