/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {number} rowIndex
 * @param {number} colIndex
 */
function assertComplexNumber(value, rowIndex, colIndex) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      `matrix[${rowIndex}][${colIndex}] must be a complex number object { re, im }`
    );
  }
  const { re, im } = value;
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(
      `matrix[${rowIndex}][${colIndex}] must have numeric re and im properties`
    );
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(
      `matrix[${rowIndex}][${colIndex}] must have finite re and im values`
    );
  }
}

/**
 * Computes the trace of a square matrix of complex numbers represented as `{ re, im }`
 * using a straightforward iterative summation along the main diagonal.
 *
 * For an `n x n` complex matrix `A`, returns `sum_{i=0}^{n-1} A[i][i]`.
 * For the `0 x 0` empty matrix `[]`, returns `{ re: 0, im: 0 }`.
 *
 * @param {Array<Array<{ re: number, im: number }>>} matrix - Square 2D array of complex numbers.
 * @returns {{ re: number, im: number }} The complex trace `{ re, im }`.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not a valid `{ re, im }` object.
 * @throws {RangeError} If `matrix` is not square or any entry contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function traceComplexIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of complex numbers');
  }

  const n = matrix.length;
  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`matrix[${i}] must be an array`);
    }
    if (row.length !== n) {
      throw new RangeError(
        `matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
      );
    }
    for (let j = 0; j < n; j++) {
      assertComplexNumber(row[j], i, j);
    }
  }

  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const diag = matrix[i][i];
    re += diag.re;
    im += diag.im;
  }

  return {
    re: re === 0 ? 0 : re,
    im: im === 0 ? 0 : im,
  };
}
