/**
 * Transposes a 2D matrix of exact BigInt values using a straightforward iterative algorithm.
 *
 * Matrix transposition maps every entry `A[i][j]` of an `m × n` matrix to
 * `A^T[j][i]` in the resulting `n × m` matrix. Because transposition performs no
 * division or rounding, it is exact for both raw BigInt integers and fixed-point
 * BigInt values scaled by `SCALE = 10n ** 18n` (preserving every entry verbatim).
 *
 * Empty input conventions:
 * - An empty matrix `[]` (`0 × 0`) transposes to `[]`.
 * - A matrix with `m > 0` empty rows (`m × 0`, e.g. `[[], []]`) transposes to `[]`.
 *
 * Does not mutate the input matrix.
 *
 * @param {bigint[][]} matrix - Rectangular 2D array of BigInt values (`m × n`).
 * @returns {bigint[][]} The transposed `n × m` 2D array of BigInt values.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a `bigint`.
 * @throws {RangeError} If rows do not all have the same length (jagged matrix).
 */
export function transposeBigIntIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of BigInt values');
  }

  const rows = matrix.length;
  if (rows === 0) {
    return [];
  }

  if (!Array.isArray(matrix[0])) {
    throw new TypeError('Row 0 must be an array of BigInt values');
  }

  const cols = matrix[0].length;

  for (let i = 0; i < rows; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`Row ${i} must be an array of BigInt values`);
    }
    if (row.length !== cols) {
      throw new RangeError(
        `Matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
      );
    }
    for (let j = 0; j < cols; j += 1) {
      if (typeof row[j] !== 'bigint') {
        throw new TypeError(
          `Element at [${i}][${j}] must be a bigint, got ${typeof row[j]}`,
        );
      }
    }
  }

  if (cols === 0) {
    return [];
  }

  const result = new Array(cols);
  for (let j = 0; j < cols; j += 1) {
    const transposedRow = new Array(rows);
    for (let i = 0; i < rows; i += 1) {
      transposedRow[i] = matrix[i][j];
    }
    result[j] = transposedRow;
  }

  return result;
}
