/**
 * Computes the bitwise NOT (logical complement) over a `Uint32Array` of 32-bit
 * bitmask words without mutating the input array.
 *
 * Numeric robustness details:
 * - Every complemented word is normalized to an unsigned 32-bit integer via
 *   `>>> 0`, preventing signed 32-bit interpretation of bit 31 (`0x80000000`).
 * - When `bitLength` is provided, word/bit coordinates are computed with
 *   `Math.floor(bitLength / 32)` and `bitLength % 32` instead of 32-bit bitwise
 *   shifts, avoiding 32-bit integer overflow on large bit lengths.
 * - The partial-word tail mask is constructed as `0xffffffff >>> (32 - remBits)`
 *   for `1 <= remBits <= 31`, avoiding signed overflow at `1 << 31`.
 *
 * @param {Uint32Array} words - Input bitmask stored as little-endian 32-bit unsigned words.
 * @param {number} [bitLength] - Optional active bit count in `[0, words.length * 32]`.
 *   When provided, all bits at indices `>= bitLength` in the result are cleared to `0`.
 *   When omitted (`undefined`), all `words.length * 32` bits are complemented.
 * @returns {Uint32Array} A newly allocated `Uint32Array` of length `words.length`
 *   containing the bitwise complement.
 * @throws {TypeError} If `words` is not a `Uint32Array`, or if `bitLength` is
 *   provided and is not a `number`.
 * @throws {RangeError} If `bitLength` is not a safe non-negative integer within
 *   `[0, words.length * 32]`.
 */
export function notMask32Stable(words, bitLength) {
  if (!(words instanceof Uint32Array)) {
    throw new TypeError('words must be a Uint32Array');
  }

  const wordCount = words.length;
  const maxBits = wordCount * 32;

  if (bitLength !== undefined) {
    if (typeof bitLength !== 'number') {
      throw new TypeError('bitLength must be a number when provided');
    }
    if (!Number.isSafeInteger(bitLength) || bitLength < 0 || bitLength > maxBits) {
      throw new RangeError(
        `bitLength must be a safe integer in [0, ${maxBits}], received ${bitLength}`
      );
    }
  }

  const result = new Uint32Array(wordCount);

  if (wordCount === 0) {
    return result;
  }

  if (bitLength === undefined) {
    for (let i = 0; i < wordCount; i += 1) {
      result[i] = (~words[i]) >>> 0;
    }
    return result;
  }

  const fullWords = Math.floor(bitLength / 32);
  const remBits = bitLength % 32;

  for (let i = 0; i < fullWords; i += 1) {
    result[i] = (~words[i]) >>> 0;
  }

  if (remBits > 0) {
    const tailMask = 0xffffffff >>> (32 - remBits);
    result[fullWords] = ((~words[fullWords]) & tailMask) >>> 0;
  }

  // Remaining words beyond bitLength stay 0 (Uint32Array is zero-initialized).
  return result;
}
