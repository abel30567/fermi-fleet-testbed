/**
 * Computes the discrete product of an array of complex numbers using a
 * straightforward iterative algorithm.
 *
 * Each complex number is represented as an object `{ re, im }` with finite
 * numeric real (`re`) and imaginary (`im`) parts. The product of an empty
 * array is the multiplicative identity `{ re: 1, im: 0 }`.
 *
 * @param {Array<{ re: number, im: number }>} values - Sequence of complex numbers to multiply.
 * @returns {{ re: number, im: number }} The resulting complex product.
 * @throws {TypeError} If `values` is not an array, or any element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any element has non-finite (`NaN`, `Infinity`, `-Infinity`) `re` or `im` values.
 */
export function productComplexIterative(values) {
  if (!Array.isArray(values)) {
    throw new TypeError('values must be an array of complex numbers { re, im }');
  }

  let re = 1;
  let im = 0;

  for (let i = 0; i < values.length; i++) {
    const z = values[i];
    if (z === null || typeof z !== 'object' || Array.isArray(z)) {
      throw new TypeError(
        `Element at index ${i} must be an object with numeric re and im properties`
      );
    }

    const { re: zRe, im: zIm } = z;
    if (typeof zRe !== 'number' || typeof zIm !== 'number') {
      throw new TypeError(
        `Element at index ${i} must have numeric re and im properties`
      );
    }

    if (!Number.isFinite(zRe) || !Number.isFinite(zIm)) {
      throw new RangeError(
        `Element at index ${i} must have finite re and im values`
      );
    }

    const nextRe = re * zRe - im * zIm;
    const nextIm = re * zIm + im * zRe;
    re = nextRe;
    im = nextIm;
  }

  return {
    re: re === 0 ? 0 : re,
    im: im === 0 ? 0 : im,
  };
}
