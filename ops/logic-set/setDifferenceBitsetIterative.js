/**
 * Computes the set difference `A \ B` over two non-negative arbitrary-width
 * BigInt bitsets using a straightforward iterative bit-by-bit algorithm.
 *
 * Each bit position `i >= 0` represents membership of element `i` in the set
 * (`1` for present, `0` for absent). Bit `i` is set in the returned BigInt
 * if and only if bit `i` is `1` in `a` and `0` in `b`.
 *
 * @param {bigint} a - Non-negative BigInt bitset representing set A (minuend).
 * @param {bigint} b - Non-negative BigInt bitset representing set B (subtrahend).
 * @returns {bigint} Non-negative BigInt bitset representing `A \ B`.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 * @throws {RangeError} If either `a` or `b` is negative.
 */
export function setDifferenceBitsetIterative(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected first argument "a" to be a BigInt, received ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected second argument "b" to be a BigInt, received ${typeof b}`);
  }
  if (a < 0n) {
    throw new RangeError('Expected first argument "a" to be a non-negative BigInt');
  }
  if (b < 0n) {
    throw new RangeError('Expected second argument "b" to be a non-negative BigInt');
  }

  let result = 0n;
  let remA = a;
  let remB = b;
  let bitIndex = 0n;

  while (remA > 0n) {
    if ((remA & 1n) === 1n && (remB & 1n) === 0n) {
      result |= 1n << bitIndex;
    }
    remA >>= 1n;
    remB >>= 1n;
    bitIndex += 1n;
  }

  return result;
}
