/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} label - Descriptive label for error messages.
 * @throws {TypeError} If the value is not a non-null non-array object or if `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertComplex(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object with numeric { re, im } properties`);
  }
  if (typeof value.re !== 'number' || typeof value.im !== 'number') {
    throw new TypeError(`${label}.re and ${label}.im must be numbers`);
  }
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
    throw new RangeError(`${label}.re and ${label}.im must be finite numbers`);
  }
}

/**
 * Computes the element-wise sum of two vectors of complex numbers `{ re, im }`
 * using a straightforward iterative implementation.
 *
 * Does not mutate either input vector or its elements.
 *
 * @param {Array<{ re: number, im: number }>} a - First vector of complex numbers.
 * @param {Array<{ re: number, im: number }>} b - Second vector of complex numbers.
 * @returns {Array<{ re: number, im: number }>} A new vector containing the element-wise complex sums.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a valid `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any `re` or `im` component is non-finite (`NaN`, `±Infinity`).
 */
export function vectorAddComplexIterative(a, b) {
  if (!Array.isArray(a)) {
    throw new TypeError('First argument "a" must be an Array');
  }
  if (!Array.isArray(b)) {
    throw new TypeError('Second argument "b" must be an Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Vector lengths must match: received ${a.length} and ${b.length}`
    );
  }

  const n = a.length;
  const result = new Array(n);

  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    assertComplex(ai, `a[${i}]`);
    assertComplex(bi, `b[${i}]`);
    result[i] = {
      re: ai.re + bi.re,
      im: ai.im + bi.im,
    };
  }

  return result;
}
