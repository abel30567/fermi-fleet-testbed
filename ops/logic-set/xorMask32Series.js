/**
 * Computes the bitwise XOR (symmetric difference) of two Uint32Array bitmasks
 * word-by-word using a closed-form Boolean algebra identity.
 *
 * Mathematical identity (set symmetric difference / Boolean XOR):
 * For each 32-bit word representing bitsets A and B over {0, ..., 31},
 *
 *   A Δ B = (A ∪ B) \ (A ∩ B) = (A ∪ B) ∩ ¬(A ∩ B)
 *
 * In 32-bit unsigned bitwise arithmetic:
 *
 *   xor(a, b) = ((a | b) & ~(a & b)) >>> 0
 *
 * Equivalent to the disjoint-difference form ((a & ~b) | (~a & b)) >>> 0,
 * evaluated per word without mutating either input array.
 *
 * @param {Uint32Array} a - First bitmask word array.
 * @param {Uint32Array} b - Second bitmask word array of the same length as `a`.
 * @returns {Uint32Array} A new Uint32Array containing the word-wise XOR of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Uint32Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function xorMask32Series(a, b) {
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

  for (let i = 0; i < len; i++) {
    const aw = a[i];
    const bw = b[i];
    const union = aw | bw;
    const intersection = aw & bw;
    result[i] = (union & ~intersection) >>> 0;
  }

  return result;
}
