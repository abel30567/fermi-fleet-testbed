/**
 * Computes the bitwise OR (set union) of two Uint32Array bitmasks iteratively,
 * word-by-word, returning a new Uint32Array without mutating the inputs.
 *
 * Each 32-bit word `i` of the result satisfies `result[i] = (a[i] | b[i]) >>> 0`.
 *
 * @param {Uint32Array} a - First Uint32 bitmask.
 * @param {Uint32Array} b - Second Uint32 bitmask (must have the same length as `a`).
 * @returns {Uint32Array} A new Uint32Array containing the word-wise bitwise OR of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function orMask32Iterative(a, b) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('Expected first argument "a" to be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Expected second argument "b" to be a Uint32Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Bitmask lengths must match: received ${a.length} and ${b.length}`
    );
  }

  const length = a.length;
  const result = new Uint32Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = (a[i] | b[i]) >>> 0;
  }

  return result;
}
