/**
 * Multiplies two exact BigInt integers using the binary polynomial expansion series.
 *
 * Algorithm / Identity:
 * Any non-negative integer `y` has a unique binary representation
 * `y = Σ_{k >= 0} y_k · 2^k` with `y_k ∈ {0, 1}`. By distributivity of integer
 * multiplication over addition, the product of two non-negative integers `x` and `y`
 * satisfies the exact finite binary series identity:
 *
 *   x · y = Σ_{k >= 0} y_k · (x << k)
 *
 * Sign handling extracts the exact result sign `neg = (a < 0n) !== (b < 0n)` and
 * operates on the exact non-negative magnitudes `|a|` and `|b|`. To minimize the
 * number of series terms, the smaller magnitude is chosen as the binary-decomposed
 * multiplier. The implementation uses only exact bitwise shifts, masking, and
 * addition—no floating-point arithmetic or native `*` operator—guaranteeing exactness
 * for arbitrarily large BigInts.
 *
 * @param {bigint} a - The first exact BigInt factor.
 * @param {bigint} b - The second exact BigInt factor.
 * @returns {bigint} The exact product `a · b` as a BigInt.
 * @throws {TypeError} If either `a` or `b` is not of type `bigint`.
 */
export function multiplyBigIntSeries(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected first argument "a" to be a bigint, received ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected second argument "b" to be a bigint, received ${typeof b}`);
  }

  if (a === 0n || b === 0n) {
    return 0n;
  }

  const isNegative = (a < 0n) !== (b < 0n);
  let multiplicand = a < 0n ? -a : a;
  let multiplier = b < 0n ? -b : b;

  // Decompose the smaller magnitude to minimize the number of series terms.
  if (multiplier > multiplicand) {
    const temp = multiplicand;
    multiplicand = multiplier;
    multiplier = temp;
  }

  let product = 0n;
  let shiftedTerm = multiplicand;

  while (multiplier > 0n) {
    if ((multiplier & 1n) === 1n) {
      product += shiftedTerm;
    }
    multiplier >>= 1n;
    if (multiplier > 0n) {
      shiftedTerm <<= 1n;
    }
  }

  return isNegative ? -product : product;
}
