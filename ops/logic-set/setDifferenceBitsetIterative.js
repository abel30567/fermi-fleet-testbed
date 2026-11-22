const WORD_BITS = 64n;
const WORD_MASK = (1n << WORD_BITS) - 1n;

/**
 * Computes the set difference `A \ B` over arbitrary-width non-negative BigInt
 * bitsets using a straightforward iterative word-by-word algorithm.
 *
 * Each bitset is represented as a non-negative `BigInt` where bit `i`
 * (`(bitset >> BigInt(i)) & 1n`) is `1n` if element `i` belongs to the set and
 * `0n` otherwise. No fixed-point scaling is applied; bit positions correspond
 * directly to zero-based element indices.
 *
 * The resulting bitset has bit `i` set if and only if bit `i` is set in `a`
 * and not set in `b`.
 *
 * @param {bigint} a - Minuend bitset (`A`), must be a non-negative `BigInt` (`>= 0n`).
 * @param {bigint} b - Subtrahend bitset (`B`), must be a non-negative `BigInt` (`>= 0n`).
 * @returns {bigint} Non-negative `BigInt` bitset representing `A \ B`.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative (`< 0n`).
 */
export function setDifferenceBitsetIterative(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected bitset "a" to be a bigint, received ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected bitset "b" to be a bigint, received ${typeof b}`);
  }
  if (a < 0n) {
    throw new RangeError('Expected bitset "a" to be a non-negative bigint (>= 0n)');
  }
  if (b < 0n) {
    throw new RangeError('Expected bitset "b" to be a non-negative bigint (>= 0n)');
  }

  if (a === 0n || a === b) {
    return 0n;
  }
  if (b === 0n) {
    return a;
  }

  let result = 0n;
  let remA = a;
  let remB = b;
  let shift = 0n;

  while (remA > 0n) {
    if (remB === 0n) {
      result |= remA << shift;
      break;
    }

    const wordA = remA & WORD_MASK;
    const wordB = remB & WORD_MASK;
    const diffWord = wordA & (WORD_MASK ^ wordB);

    if (diffWord !== 0n) {
      result |= diffWord << shift;
    }

    remA >>= WORD_BITS;
    remB >>= WORD_BITS;
    shift += WORD_BITS;
  }

  return result;
}
