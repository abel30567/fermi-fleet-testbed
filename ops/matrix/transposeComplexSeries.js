/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} rowIndex - Row index for error reporting.
 * @param {number} colIndex - Column index for error reporting.
 * @throws {TypeError} If the entry is not an object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is not finite.
 */
function assertComplex(value, rowIndex, colIndex) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(
      `Expected complex object { re, im } at [${rowIndex}][${colIndex}]`
    );
  }
  const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(
      `Expected numeric re and im at [${rowIndex}][${colIndex}]`
    );
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(
      `Expected finite re and im at [${rowIndex}][${colIndex}]`
    );
  }
}

/**
 * Computes the matrix transpose over complex numbers represented as `{ re, im }`.
 *
 * Uses the closed-form index identity `(A^T)_{j,i} = A_{i,j}`, equivalently
 * following real/imaginary linearity `(Re(A) + i·Im(A))^T = Re(A)^T + i·Im(A)^T`
 * (non-conjugating transpose). Returns a new matrix with cloned `{ re, im }`
 * entries so the input is never mutated.
 *
 * @param {Complex[][]} matrix - Rectangular `m x n` matrix of `{ re, im }` complex numbers.
 * @returns {Complex[][]} The `n x m` transposed matrix (or `[]` for empty dimensions).
 * @throws {TypeError} If `matrix` is not a 2D array of `{ re, im }` objects with numeric parts.
 * @throws {RangeError} If rows have inconsistent lengths or any part is non-finite.
 */
export function transposeComplexSeries(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('Expected matrix to be an array of rows');
  }

  const rows = matrix.length;
  if (rows === 0) {
    return [];
  }

  let cols = -1;
  for (let i = 0; i < rows; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`Expected row ${i} to be an array`);
    }
    if (cols === -1) {
      cols = row.length;
    } else if (row.length !== cols) {
      throw new RangeError(
        `Ragged matrix: row ${i} has length ${row.length}, expected ${cols}`
      );
    }
    for (let j = 0; j < cols; j += 1) {
      assertComplex(row[j], i, j);
    }
  }

  if (cols === 0) {
    return [];
  }

  /** @type {Complex[][]} */
  const result = new Array(cols);
  for (let j = 0; j < cols; j += 1) {
    /** @type {Complex[]} */
    const outRow = new Array(rows);
    for (let i = 0; i < rows; i += 1) {
      const entry = matrix[i][j];
      outRow[i] = { re: entry.re, im: entry.im };
    }
    result[j] = outRow;
  }

  return result;
}
