const CHUNK_BITS = 32n;

/**
 * Computes the bitwise AND of two validated non-negative BigInt bitsets
 * iteratively in 32-bit unsigned chunks.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt representing `a AND b`.
 */
function andTwoBitsetsIterative(a, b) {
  let x = a;
  let y = b;
  const chunks = [];

  while (x > 0n && y > 0n) {
    const wordA = Number(BigInt.asUintN(32, x));
    const wordB = Number(BigInt.asUintN(32, y));
    chunks.push((wordA & wordB) >>> 0);
    x >>= CHUNK_BITS;
    y >>= CHUNK_BITS;
  }

  let result = 0n;
  for (let i = chunks.length - 1; i >= 0; i--) {
    result = (result << CHUNK_BITS) + BigInt(chunks[i]);
  }
  return result;
}

/**
 * Computes the bitwise AND (set intersection) over one or more arbitrary-width
 * non-negative BigInt bitsets using a straightforward iterative chunk-by-chunk
 * algorithm (32-bit unsigned words).
 *
 * Each bit position `k >= 0` in the returned BigInt is `1` if and only if bit `k`
 * is `1` in every input bitset. No fixed bit-width scaling applies; bitsets may
 * have arbitrary non-negative widths and differing lengths (missing higher bits
 * are implicitly `0`).
 *
 * All arguments are strictly validated up front before any short-circuiting on `0n`.
 *
 * @param {...bigint} bitsets - One or more non-negative BigInt bitsets to intersect.
 * @returns {bigint} Non-negative BigInt bitset representing the bitwise AND of all inputs.
 * @throws {RangeError} If no arguments are provided, or if any argument is a negative BigInt.
 * @throws {TypeError} If any argument is not a `bigint`.
 */
export function andBitsetIterative(...bitsets) {
  if (bitsets.length === 0) {
    throw new RangeError('andBitsetIterative requires at least one BigInt bitset');
  }

  for (let i = 0; i < bitsets.length; i++) {
    const value = bitsets[i];
    if (typeof value !== 'bigint') {
      throw new TypeError(
        `Argument at index ${i} must be a BigInt, received ${value === null ? 'null' : typeof value}`
      );
    }
    if (value < 0n) {
      throw new RangeError(
        `Argument at index ${i} must be a non-negative BigInt bitset, received ${value}`
      );
    }
  }

  let acc = bitsets[0];
  for (let i = 1; i < bitsets.length; i++) {
    if (acc === 0n) {
      return 0n;
    }
    acc = andTwoBitsetsIterative(acc, bitsets[i]);
  }

  return acc;
}
