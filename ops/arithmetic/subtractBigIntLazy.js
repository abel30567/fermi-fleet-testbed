/**
 * Lazily computes running differences over an iterable of exact BigInt values.
 *
 * Consumes the input iterable one element at a time via a generator, yielding
 * the running difference after each element:
 * - For an empty iterable, yields nothing.
 * - For `[v0]`, yields `v0`.
 * - For `[v0, v1, v2, ...]`, yields `v0`, `v0 - v1`, `v0 - v1 - v2`, ...
 *
 * Because BigInt subtraction is exact and linear, this works identically for
 * arbitrary-precision integers and fixed-point BigInts scaled by `10^18`.
 *
 * @param {Iterable<bigint>} values - Iterable of BigInt values to subtract lazily.
 * @returns {Generator<bigint, void, unknown>} Generator yielding each running BigInt difference.
 * @throws {TypeError} If `values` is not a valid iterable (or is a string), or when an element is not a `bigint`.
 */
export function subtractBigIntLazy(values) {
  if (
    values === null ||
    values === undefined ||
    typeof values === 'string' ||
    typeof values[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError('subtractBigIntLazy expects an iterable of BigInt values');
  }

  return subtractBigIntGenerator(values);
}

/**
 * Internal generator that consumes `values` lazily and yields running differences.
 *
 * @param {Iterable<bigint>} values
 * @returns {Generator<bigint, void, unknown>}
 */
function* subtractBigIntGenerator(values) {
  let hasFirst = false;
  let running = 0n;
  let index = 0;

  for (const value of values) {
    if (typeof value !== 'bigint') {
      const actual = value === null ? 'null' : typeof value;
      throw new TypeError(
        `subtractBigIntLazy expected a BigInt at index ${index}, received ${actual}`
      );
    }

    if (!hasFirst) {
      running = value;
      hasFirst = true;
    } else {
      running -= value;
    }

    index += 1;
    yield running;
  }
}
