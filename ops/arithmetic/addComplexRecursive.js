/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Value to validate.
 * @param {number} index - Zero-based position in the input sequence.
 * @returns {Complex} A clean `{ re, im }` complex object.
 * @throws {TypeError} If `value` is not a plain complex-like object or `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, index) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Expected complex number object { re, im } at index ${index}`);
  }
  const { re, im } = value;
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(`Complex components "re" and "im" must be numbers at index ${index}`);
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(`Complex components "re" and "im" must be finite numbers at index ${index}`);
  }
  return { re, im };
}

/**
 * Recursively sums a contiguous slice `[start, end)` of complex numbers
 * using a divide-and-conquer (pairwise) recursion with O(log n) stack depth.
 *
 * @param {readonly unknown[]} items - Sequence of complex numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Complex} Sum of the slice.
 */
function sumRange(items, start, end) {
  const length = end - start;
  if (length === 0) {
    return { re: 0, im: 0 };
  }
  if (length === 1) {
    return validateComplex(items[start], start);
  }
  const mid = start + (length >>> 1);
  const left = sumRange(items, start, mid);
  const right = sumRange(items, mid, end);
  return {
    re: left.re + right.re,
    im: left.im + right.im,
  };
}

/**
 * Adds complex numbers represented as `{ re, im }` using a recursive
 * divide-and-conquer (pairwise summation) implementation.
 *
 * Accepts either a single array of complex numbers or one or more complex
 * number arguments. An empty array returns the additive identity `{ re: 0, im: 0 }`.
 *
 * @param {readonly Complex[] | Complex} first - Array of complex numbers, or the first complex summand.
 * @param {...Complex} rest - Additional complex summands when called variadically.
 * @returns {Complex} The complex sum `{ re, im }`.
 * @throws {TypeError} If called with no arguments or any element is not a valid `{ re, im }` object.
 * @throws {RangeError} If any component `re` or `im` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function addComplexRecursive(...args) {
  if (args.length === 0) {
    throw new TypeError(
      'addComplexRecursive requires an array of complex numbers or at least one complex number argument'
    );
  }
  const items = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return sumRange(items, 0, items.length);
}
