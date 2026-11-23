/**
 * Computes the transpose of a 2D matrix of exact BigInt integers using a
 * straightforward iterative implementation.
 *
 * For an m x n matrix A, returns an n x m matrix B such that B[j][i] === A[i][j].
 * Does not mutate the input matrix.
 *
 * @param {bigint[][]} matrix - Rectangular 2D array of BigInt values (non-empty).
 * @returns {bigint[][]} The transposed n x m matrix of BigInt values.
 * @throws {TypeError} If `matrix` is not a 2D array of BigInt values.
 * @throws {RangeError} If `matrix` is empty, has empty rows, or is ragged (non-rectangular).
 */
export function transposeBigIntIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of BigInt values');
  }
  const rows = matrix.length;
  if (rows === 0) {
    throw new RangeError('matrix must not be empty');
  }

  let cols = -1;
  for (let i = 0; i < rows; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`matrix[${i}] must be an array of BigInt values`);
    }
    if (row.length === 0) {
      throw new RangeError('matrix rows must not be empty');
    }
    if (cols === -1) {
      cols = row.length;
    } else if (row.length !== cols) {
      throw new RangeError('matrix must be rectangular (all rows must have equal length)');
    }
    for (let j = 0; j < cols; j++) {
      if (typeof row[j] !== 'bigint') {
        throw new TypeError(`matrix[${i}][${j}] must be a BigInt`);
      }
    }
  }

  const result = new Array(cols);
  for (let j = 0; j < cols; j++) {
    const outRow = new Array(rows);
    for (let i = 0; i < rows; i++) {
      outRow[i] = matrix[i][j];
    }
    result[j] = outRow;
  }
  return result;
}
