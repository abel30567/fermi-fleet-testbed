/**
 * Computes the exact dot product of two BigInt vectors using a straightforward
 * iterative loop.
 *
 * For integer vectors `a` and `b` of equal length `n`, returns
 * `sum_{i=0}^{n-1} (a[i] * b[i])` as an exact `bigint`. For empty vectors,
 * returns `0n`.
 *
 * @param {readonly bigint[]} a - First vector of BigInt elements.
 * @param {readonly bigint[]} b - Second vector of BigInt elements.
 * @returns {bigint} Exact BigInt dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` have different lengths.
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
      `Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`,
    );
  }

  let sum = 0n;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (typeof ai !== 'bigint') {
      throw new TypeError(`Expected a[${i}] to be a bigint, got ${typeof ai}`);
    }
    if (typeof bi !== 'bigint') {
      throw new TypeError(`Expected b[${i}] to be a bigint, got ${typeof bi}`);
    }
    sum += ai * bi;
  }

  return sum;
}
