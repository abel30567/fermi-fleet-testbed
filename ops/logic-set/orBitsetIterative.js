const CHUNK_BITS = 32n;
const CHUNK_MASK = 0xffffffffn;

/**
 * Validates that an operand is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {void}
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative.
 */
function assertBitset(value, name) {
  if (typeof value !== 'bigint') {
    throw new TypeError(`${name} must be a non-negative bigint, received ${value === null ? 'null' : typeof value}`);
  }
  if (value < 0n) {
    throw new RangeError(`${name} must be a non-negative bigint (>= 0n)`);
  }
}

/**
 * Computes the bitwise OR (set union) of two non-negative arbitrary-width
 * BigInt bitsets using a straightforward iterative 32-bit chunk traversal.
 *
 * Each bit at index `i` (0-based from least significant bit) in the returned
 * BigInt is `1` if and only if bit `i` is `1` in `a` or in `b`.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing `a OR b`.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function orBitsetIterative(a, b) {
  assertBitset(a, 'a');
  assertBitset(b, 'b');

  let remainingA = a;
  let remainingB = b;
  let result = 0n;
  let shift = 0n;

  while (remainingA > 0n || remainingB > 0n) {
    const chunkA = Number(remainingA & CHUNK_MASK);
    const chunkB = Number(remainingB & CHUNK_MASK);
    const combined = (chunkA | chunkB) >>> 0;

    if (combined !== 0) {
      result += BigInt(combined) << shift;
    }

    remainingA >>= CHUNK_BITS;
    remainingB >>= CHUNK_BITS;
    shift += CHUNK_BITS;
  }

  return result;
}
