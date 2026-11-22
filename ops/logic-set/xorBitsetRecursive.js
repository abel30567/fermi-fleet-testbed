/**
 * Computes the bitwise XOR of two arbitrary-width non-negative BigInt bitsets
 * using a recursive divide-and-conquer split on bit-width.
 *
 * At each recursive step, both operands are split around the midpoint bit
 * position `mid = width >> 1n` into high and low halves, XORed recursively
 * down to the 1-bit base case, and recombined via `(hi << mid) + lo`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Bitwise XOR of `a` and `b` as a non-negative BigInt.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function xorBitsetRecursive(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected first argument "a" to be a bigint, received ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected second argument "b" to be a bigint, received ${typeof b}`);
  }
  if (a < 0n) {
    throw new RangeError('Expected first argument "a" to be a non-negative bigint');
  }
  if (b < 0n) {
    throw new RangeError('Expected second argument "b" to be a non-negative bigint');
  }

  if (a === 0n) {
    return b;
  }
  if (b === 0n) {
    return a;
  }

  const maxOperand = a > b ? a : b;
  const width = BigInt(maxOperand.toString(2).length);
  return xorDivideAndConquer(a, b, width);
}

/**
 * Recursive divide-and-conquer helper operating on two non-negative BigInts
 * bounded by `width` bits.
 *
 * @param {bigint} a - Non-negative BigInt with at most `width` bits.
 * @param {bigint} b - Non-negative BigInt with at most `width` bits.
 * @param {bigint} width - Bit-width upper bound for `a` and `b` (`width >= 1n`).
 * @returns {bigint} Bitwise XOR of `a` and `b`.
 */
function xorDivideAndConquer(a, b, width) {
  if (a === 0n) {
    return b;
  }
  if (b === 0n) {
    return a;
  }
  if (width <= 1n) {
    // Base case: 1-bit XOR over {0n, 1n}
    return a === b ? 0n : 1n;
  }

  const mid = width >> 1n;
  const aHi = a >> mid;
  const aLo = a - (aHi << mid);
  const bHi = b >> mid;
  const bLo = b - (bHi << mid);

  const hi = xorDivideAndConquer(aHi, bHi, width - mid);
  const lo = xorDivideAndConquer(aLo, bLo, mid);

  return (hi << mid) + lo;
}
