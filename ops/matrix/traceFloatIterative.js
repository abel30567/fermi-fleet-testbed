/**
 * Computes the trace (sum of main diagonal entries) of a square matrix
 * over IEEE-754 float64 numbers using a straightforward iterative loop.
 *
 * @param {number[][]} matrix - A square `n x n` 2D array of finite float64 numbers.
 * @returns {number} The sum of the main diagonal entries (`0` for an empty `0 x 0` matrix).
 * @throws {TypeError} If `matrix` is not a 2D array of numbers.
 * @throws {RangeError} If `matrix` is not square or contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function traceFloatIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of finite numbers');
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
      const value = row[j];
      if (typeof value !== 'number') {
        throw new TypeError(
          `matrix[${i}][${j}] must be a number, got ${typeof value}`
        );
      }
      if (!Number.isFinite(value)) {
        throw new RangeError(
          `matrix[${i}][${j}] must be a finite float64 number, got ${value}`
        );
      }
    }
  }

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += matrix[i][i];
  }
  return sum;
}
