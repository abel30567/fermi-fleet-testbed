/**
 * Computes the bitwise set intersection of two `Uint32Array` bitmasks
 * iteratively, word by word.
 *
 * Each element `i` of a `Uint32Array` represents 32 bit flags (indices
 * `32 * i` through `32 * i + 31`). Words at indices beyond the length of the
 * shorter bitmask are implicitly `0`, so the intersection cannot have any set
 * bits at word index `>= Math.min(a.length, b.length)`. Accordingly, the
 * returned `Uint32Array` has length `Math.min(a.length, b.length)`.
 *
 * Neither input array is mutated; a newly allocated `Uint32Array` is always
 * returned.
 *
 * @param {Uint32Array} a - First 32-bit word bitmask.
 * @param {Uint32Array} b - Second 32-bit word bitmask.
 * @returns {Uint32Array} New `Uint32Array` of length `Math.min(a.length, b.length)`
 *   containing the bitwise AND of corresponding 32-bit words.
 * @throws {TypeError} If either `a` or `b` is not a `Uint32Array`.
 */
export function intersectionMask32Iterative(a, b) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('First argument "a" must be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Second argument "b" must be a Uint32Array');
  }

  const len = a.length < b.length ? a.length : b.length;
  const result = new Uint32Array(len);

  for (let i = 0; i < len; i += 1) {
    result[i] = (a[i] & b[i]) >>> 0;
  }

  return result;
}
