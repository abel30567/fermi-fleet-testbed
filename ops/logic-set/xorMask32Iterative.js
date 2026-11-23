/**
 * Computes the bitwise XOR of two `Uint32Array` bitmasks using a
 * straightforward iterative loop over 32-bit unsigned words.
 *
 * Neither input array is mutated; a newly allocated `Uint32Array` of the same
 * length is always returned.
 *
 * @param {Uint32Array} a - First 32-bit word bitmask.
 * @param {Uint32Array} b - Second 32-bit word bitmask (must have the same length as `a`).
 * @returns {Uint32Array} A new `Uint32Array` where `result[i] = (a[i] ^ b[i]) >>> 0`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function xorMask32Iterative(a, b) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('First argument "a" must be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Second argument "b" must be a Uint32Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Bitmask length mismatch: expected equal lengths, got ${a.length} and ${b.length}`,
    );
  }

  const length = a.length;
  const result = new Uint32Array(length);

  for (let i = 0; i < length; i += 1) {
    result[i] = (a[i] ^ b[i]) >>> 0;
  }

  return result;
}
