/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Candidate complex number entry.
 * @param {number} rowIndex - Row index for diagnostic error messages.
 * @param {number} colIndex - Column index for diagnostic error messages.
 * @throws {TypeError} If the entry is not a non-null plain-like object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexEntry(value, rowIndex, colIndex) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      `Expected complex object { re, im } at [${rowIndex}][${colIndex}]`
    );
  }
  const { re, im } = /** @type {Record<string, unknown>} */ (value);
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(
      `Expected numeric re and im properties at [${rowIndex}][${colIndex}]`
    );
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(
      `Expected finite re and im values at [${rowIndex}][${colIndex}]`
    );
  }
}

/**
 * Computes the transpose of a matrix of complex numbers `{ re, im }` using a
 * straightforward iterative nested-loop implementation.
 *
 * Note: This computes the ordinary matrix transpose `A^T` (preserving each
 * entry's imaginary part), not the conjugate (Hermitian) transpose `A^H`.
 * Every entry in the returned matrix is a freshly allocated `{ re, im }` object.
 *
 * @param {ReadonlyArray<ReadonlyArray<Complex>>} matrix - Input `m x n` complex matrix.
 * @returns {Complex[][]} The transposed `n x m` complex matrix (or `[]` if `m === 0` or `n === 0`).
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry lacks numeric `re`/`im`.
 * @throws {RangeError} If rows have inconsistent lengths or any `re`/`im` value is non-finite.
 */
export function transposeComplexIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('Expected matrix to be an array of rows');
  }

  const rowCount = matrix.length;
  if (rowCount === 0) {
    return [];
  }

  if (!(0 in matrix) || !Array.isArray(matrix[0])) {
    throw new TypeError('Expected row 0 to be an array');
  }
  const colCount = matrix[0].length;

  for (let i = 0; i < rowCount; i++) {
    if (!(i in matrix) || !Array.isArray(matrix[i])) {
      throw new TypeError(`Expected row ${i} to be an array`);
    }
    const row = matrix[i];
    if (row.length !== colCount) {
      throw new RangeError(
        `Expected rectangular matrix: row ${i} has length ${row.length}, expected ${colCount}`
      );
    }
    for (let j = 0; j < colCount; j++) {
      if (!(j in row)) {
        throw new TypeError(`Missing sparse entry at [${i}][${j}]`);
      }
      validateComplexEntry(row[j], i, j);
    }
  }

  if (colCount === 0) {
    return [];
  }

  /** @type {Complex[][]} */
  const result = new Array(colCount);
  for (let j = 0; j < colCount; j++) {
    /** @type {Complex[]} */
    const outRow = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      const cell = matrix[i][j];
      outRow[i] = { re: cell.re, im: cell.im };
    }
    result[j] = outRow;
  }

  return result;
}
