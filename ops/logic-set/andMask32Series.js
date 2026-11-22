/**
 * Computes the bitwise AND of two Uint32Array bitmasks word-by-word using the
 * closed-form binary-series / Boolean-ring carry identity.
 *
 * Mathematical identity:
 * Representing each 32-bit unsigned word by its binary series expansion
 *   a = sum_{k=0}^{31} a_k 2^k,   b = sum_{k=0}^{31} b_k 2^k   (a_k, b_k in {0, 1}),
 * the lifted Boolean-ring identity at each bit position k is
 *   a_k + b_k = (a_k XOR b_k) + 2 * (a_k AND b_k).
 * Multiplying by 2^k and summing over k = 0..31 yields the closed-form identity
 *   a AND b = (a + b - (a XOR b)) / 2.
 *
 * Since 0 <= a + b <= 2 * (2^32 - 1) = 2^33 - 2 < Number.MAX_SAFE_INTEGER (2^53 - 1),
 * the intermediate integer arithmetic is exact in IEEE-754 double precision, with
 * (a ^ b) >>> 0 normalizing the bitwise XOR to an unsigned 32-bit integer.
 *
 * @param {Uint32Array} a - First Uint32 bitmask.
 * @param {Uint32Array} b - Second Uint32 bitmask of the same length as `a`.
 * @returns {Uint32Array} A new Uint32Array containing the word-wise bitwise AND of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of Uint32Array.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function andMask32Series(a, b) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('Expected first argument "a" to be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Expected second argument "b" to be a Uint32Array');
  }
  const len = a.length;
  if (len !== b.length) {
    throw new RangeError(
      `Uint32Array length mismatch: expected equal lengths, got ${len} and ${b.length}`
    );
  }

  const out = new Uint32Array(len);
  for (let i = 0; i < len; i += 1) {
    const aw = a[i];
    const bw = b[i];
    const xorWord = (aw ^ bw) >>> 0;
    out[i] = (aw + bw - xorWord) / 2;
  }
  return out;
}
