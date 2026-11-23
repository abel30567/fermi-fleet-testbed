/**
 * Computes the bitwise set intersection of two or more Uint32Array bitmasks
 * using the closed-form additive-XOR identity:
 *
 *   x & y = ((x + y) - ((x ^ y) >>> 0)) / 2
 *
 * This identity follows directly from exact binary addition,
 * `x + y = (x ^ y) + 2 * (x & y)`. Because every Uint32 word lies in
 * `[0, 2^32 - 1]`, the sum `x + y <= 2^33 - 2` remains well below
 * `Number.MAX_SAFE_INTEGER` (`2^53 - 1`), so the arithmetic is exact for all
 * 32-bit unsigned bit patterns including the most significant bit (`0x80000000`).
 *
 * @param {Uint32Array} a - First bitmask word array.
 * @param {Uint32Array} b - Second bitmask word array (must match `a.length`).
 * @param {...Uint32Array} rest - Optional additional bitmask word arrays (each must match `a.length`).
 * @returns {Uint32Array} A new Uint32Array containing the word-wise set intersection.
 * @throws {TypeError} If fewer than two masks are provided or any argument is not a Uint32Array.
 * @throws {RangeError} If any mask length differs from `a.length`.
 */
export function intersectionMask32Series(a, b, ...rest) {
  if (!(a instanceof Uint32Array)) {
    throw new TypeError('First argument "a" must be a Uint32Array');
  }
  if (!(b instanceof Uint32Array)) {
    throw new TypeError('Second argument "b" must be a Uint32Array');
  }

  const len = a.length;
  if (b.length !== len) {
    throw new RangeError(
      `Bitmask length mismatch: expected ${len} words, received ${b.length} words for argument "b"`
    );
  }

  for (let m = 0; m < rest.length; m++) {
    const mask = rest[m];
    if (!(mask instanceof Uint32Array)) {
      throw new TypeError(`Argument at index ${m + 2} must be a Uint32Array`);
    }
    if (mask.length !== len) {
      throw new RangeError(
        `Bitmask length mismatch: expected ${len} words, received ${mask.length} words at argument index ${m + 2}`
      );
    }
  }

  const out = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    let acc = ((x + y) - ((x ^ y) >>> 0)) / 2;

    for (let m = 0; m < rest.length && acc !== 0; m++) {
      const z = rest[m][i];
      acc = ((acc + z) - ((acc ^ z) >>> 0)) / 2;
    }

    out[i] = acc;
  }

  return out;
}
