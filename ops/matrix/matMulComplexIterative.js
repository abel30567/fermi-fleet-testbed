/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a non-empty rectangular 2D matrix of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If the matrix, any row, or any entry has an invalid type.
 * @throws {RangeError} If the matrix is empty, jagged, or contains non-finite numbers.
 */
function validateComplexMatrix(matrix, name) {
  if (!Array.isArray(matrix)) {
    throw new TypeError(`${name} must be a 2D array of complex numbers`);
  }
  const rows = matrix.length;
  if (rows === 0) {
    throw new RangeError(`${name} must not be empty`);
  }

  let cols = -1;
  for (let i = 0; i < rows; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`${name}[${i}] must be an array`);
    }
    if (row.length === 0) {
      throw new RangeError(`${name}[${i}] must not be empty`);
    }
    if (cols === -1) {
      cols = row.length;
    } else if (row.length !== cols) {
      throw new RangeError(
        `${name} must be rectangular (row 0 has length ${cols}, row ${i} has length ${row.length})`
      );
    }

    for (let j = 0; j < cols; j++) {
      const cell = row[j];
      if (cell === null || typeof cell !== 'object') {
        throw new TypeError(`${name}[${i}][${j}] must be a complex number object { re, im }`);
      }
      if (typeof cell.re !== 'number' || typeof cell.im !== 'number') {
        throw new TypeError(`${name}[${i}][${j}].re and .im must be numbers`);
      }
      if (!Number.isFinite(cell.re) || !Number.isFinite(cell.im)) {
        throw new RangeError(`${name}[${i}][${j}].re and .im must be finite numbers`);
      }
    }
  }

  return { rows, cols };
}

/**
 * Multiplies two matrices of complex numbers represented as `{ re, im }` objects
 * using a straightforward iterative triple-loop algorithm.
 *
 * For an `m x k` matrix `a` and a `k x n` matrix `b`, computes the `m x n` product `c` where:
 * `c[i][j] = sum_{p=0}^{k-1} a[i][p] * b[p][j]`
 * with `(x.re + i*x.im) * (y.re + i*y.im) = (x.re*y.re - x.im*y.im) + i*(x.re*y.im + x.im*y.re)`.
 *
 * @param {Complex[][]} a - Left complex matrix of dimensions `m x k`.
 * @param {Complex[][]} b - Right complex matrix of dimensions `k x n`.
 * @returns {Complex[][]} Resulting complex matrix of dimensions `m x n`.
 * @throws {TypeError} If `a` or `b` is not a 2D array of `{ re: number, im: number }` objects.
 * @throws {RangeError} If `a` or `b` is empty, jagged, contains non-finite numbers, or has incompatible dimensions.
 */
export function matMulComplexIterative(a, b) {
  const dimA = validateComplexMatrix(a, 'a');
  const dimB = validateComplexMatrix(b, 'b');

  if (dimA.cols !== dimB.rows) {
    throw new RangeError(
      `Incompatible matrix dimensions for multiplication: ${dimA.rows}x${dimA.cols} and ${dimB.rows}x${dimB.cols}`
    );
  }

  const m = dimA.rows;
  const k = dimA.cols;
  const n = dimB.cols;

  const result = new Array(m);
  for (let i = 0; i < m; i++) {
    const rowA = a[i];
    const rowOut = new Array(n);
    for (let j = 0; j < n; j++) {
      let sumRe = 0;
      let sumIm = 0;
      for (let p = 0; p < k; p++) {
        const x = rowA[p];
        const y = b[p][j];
        sumRe += x.re * y.re - x.im * y.im;
        sumIm += x.re * y.im + x.im * y.re;
      }
      rowOut[j] = {
        re: sumRe === 0 ? 0 : sumRe,
        im: sumIm === 0 ? 0 : sumIm,
      };
    }
    result[i] = rowOut;
  }

  return result;
}
