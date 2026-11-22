/**
 * Computes the exact dot product (inner product) of two vectors of `BigInt` values
 * using a straightforward iterative accumulation loop.
 *
 * For equal-length vectors $a = (a_0, \dots, a_{n-1})$ and $b = (b_0, \dots, b_{n-1})$
 * with $a_i, b_i \in \mathbb{Z}$, this function returns the exact integer sum:
 * $$\sum_{i=0}^{n-1} a_i \cdot b_i$$
 *
 * Because all inputs are exact integers, the result is always an exact `BigInt` with
 * arbitrary precision and no floating-point rounding or overflow. For empty vectors
 * (`[]` and `[]`), the empty sum `0n` is returned.
 *
 * Time complexity: $O(n)$ vector steps (with arbitrary-precision multiplication/addition cost).
 * Space complexity: $O(1)$ auxiliary space beyond the accumulated `BigInt` result.
 *
 * @param {readonly bigint[]} a - First input vector of `BigInt` components.
 * @param {readonly bigint[]} b - Second input vector of `BigInt` components (same length as `a`).
 * @returns {bigint} The exact `BigInt` dot product of `a` and `b` (`0n` for empty vectors).
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element in `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 *
 * @example
 * dotProductBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]); // 32n
 * dotProductBigIntIterative([], []); // 0n
 */
export function dotProductBigIntIterative(a, b) {
  if (!Array.isArray(a)) {
    throw new TypeError(`Expected first argument "a" to be an Array, got ${typeof a}`);
  }
  if (!Array.isArray(b)) {
    throw new TypeError(`Expected second argument "b" to be an Array, got ${typeof b}`);
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
    );
  }

  let sum = 0n;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i];
    const bi = b[i];
    if (typeof ai !== 'bigint') {
      throw new TypeError(`Expected bigint at a[${i}], got ${typeof ai}`);
    }
    if (typeof bi !== 'bigint') {
      throw new TypeError(`Expected bigint at b[${i}], got ${typeof bi}`);
    }
    sum += ai * bi;
  }

  return sum;
}
