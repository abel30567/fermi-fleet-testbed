/**
 * Computes the bitwise exclusive OR (symmetric set difference) of two arbitrary-width
 * non-negative BigInt bitsets using the closed-form summation of the bit-plane XOR series.
 *
 * Algorithm:
 * For non-negative integers `a = sum_{k >= 0} a_k * 2^k` and `b = sum_{k >= 0} b_k * 2^k`
 * with binary digits `a_k, b_k in {0, 1}`, each bit plane satisfies the polynomial identity
 * `a_k XOR b_k = a_k + b_k - 2 * a_k * b_k`. Summing across all bit planes weighted by `2^k`
 * yields the exact closed-form identity:
 *
 *   xor(a, b) = sum_{k >= 0} (a_k + b_k - 2 * a_k * b_k) * 2^k
 *             = (a + b) - 2 * (a & b)
 *
 * Because BigInt arithmetic has arbitrary precision and `a, b >= 0n`, there is no overflow
 * and no carry/borrow interference in the resulting bit representation.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing the symmetric difference (a XOR b).
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative (`< 0n`).
 */
export function xorBitsetSeries(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected 'a' to be a BigInt, received ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected 'b' to be a BigInt, received ${typeof b}`);
  }
  if (a < 0n) {
    throw new RangeError(`Expected 'a' to be a non-negative BigInt bitset, received ${a}`);
  }
  if (b < 0n) {
    throw new RangeError(`Expected 'b' to be a non-negative BigInt bitset, received ${b}`);
  }

  return (a + b) - 2n * (a & b);
}
