/**
 * Multiplies two exact BigInt integers using a straightforward iterative
 * binary (Russian peasant / shift-and-add) algorithm.
 *
 * The algorithm determines the sign of the product up front, operates on the
 * non-negative magnitudes, and iterates over the bits of the smaller operand,
 * accumulating shifted copies of the larger operand whenever the current least
 * significant bit is set. Because the product of two integers is always an
 * exact integer, no fixed-point scaling is required and no precision is lost
 * for arbitrarily large BigInt inputs.
 *
 * Complexity:
 * - Time: O(k) bit iterations where k = bitLength(min(|a|, |b|)), with BigInt
 *   additions and shifts of size O(bitLength(|a|) + bitLength(|b|)).
 * - Space: O(bitLength(|a|) + bitLength(|b|)) for the accumulated result.
 *
 * @param {bigint} a - The multiplicand (must be a BigInt).
 * @param {bigint} b - The multiplier (must be a BigInt).
 * @returns {bigint} The exact product `a * b` as a BigInt.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 *
 * @example
 * multiplyBigIntIterative(6n, 7n); // 42n
 * multiplyBigIntIterative(-12n, 3n); // -36n
 * multiplyBigIntIterative(1n << 128n, 1n << 128n); // 1n << 256n
 */
export function multiplyBigIntIterative(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected parameter "a" to be a BigInt, received ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected parameter "b" to be a BigInt, received ${typeof b}`);
  }

  if (a === 0n || b === 0n) {
    return 0n;
  }

  const isNegative = (a < 0n) !== (b < 0n);
  let multiplicand = a < 0n ? -a : a;
  let multiplier = b < 0n ? -b : b;

  // Iterate over the operand with fewer bits to minimize loop iterations.
  if (multiplicand < multiplier) {
    const tmp = multiplicand;
    multiplicand = multiplier;
    multiplier = tmp;
  }

  let product = 0n;
  while (multiplier > 0n) {
    if ((multiplier & 1n) === 1n) {
      product += multiplicand;
    }
    multiplicand <<= 1n;
    multiplier >>= 1n;
  }

  return isNegative ? -product : product;
}
