/**
 * Computes the bitwise AND (set intersection) of two 32-bit unsigned bitmasks
 * iteratively word-by-word.
 *
 * Each element of the input {@link Uint32Array} represents 32 consecutive bit
 * positions in little-endian word order (bit `k` resides at word `k >>> 5`,
 * bit offset `k & 31`). Neither input array is mutated.
 *
 * @param {Uint32Array} a - First bitmask operand.
 * @param {Uint32Array} b - Second bitmask operand (must have the same length as `a`).
 * @returns {Uint32Array} A new `Uint32Array` containing `(a[i] & b[i]) >>> 0` for each word `i`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function andMask32Iterative(a, b) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('First argument "a" must be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Second argument "b" must be a Uint32Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Bitmask lengths must match: received ${a.length} and ${b.length}`
    );
  }

  const len = a.length;
  const result = new Uint32Array(len);

  for (let i = 0; i < len; i += 1) {
    result[i] = (a[i] & b[i]) >>> 0;
  }

  return result;
}
