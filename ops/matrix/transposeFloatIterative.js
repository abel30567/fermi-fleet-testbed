/**
 * Computes the transpose of a 2D matrix of IEEE-754 float64 numbers using a
 * straightforward iterative nested-loop algorithm.
 *
 * Given an `m × n` matrix `M`, returns a newly allocated `n × m` matrix `T`
 * such that `T[j][i] === M[i][j]` (preserving exact IEEE-754 bit values
 * including `NaN`, `±Infinity`, and `-0`) without mutating the input matrix.
 *
 * Time complexity: O(m * n)
 * Space complexity: O(m * n)
 *
 * @param {number[][]} matrix - A non-empty, rectangular 2D array of IEEE-754 float64 numbers.
 * @returns {number[][]} A new 2D array representing the transposed matrix.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array,
 *   or any element is not a primitive `number`.
 * @throws {RangeError} If `matrix` has zero rows, zero columns, or ragged rows
 *   with inconsistent lengths.
 *
 * @example
 * transposeFloatIterative([
 *   [1.5, 2.5, 3.5],
 *   [4.5, 5.5, 6.5],
 * ]);
 * // => [
 * //   [1.5, 4.5],
 * //   [2.5, 5.5],
 * //   [3.5, 6.5],
 * // ]
 */
export function transposeFloatIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('Expected matrix to be a 2D array of numbers.');
  }

  const rows = matrix.length;
  if (rows === 0) {
    throw new RangeError('Matrix must have at least one row.');
  }

  for (let i = 0; i < rows; i += 1) {
    if (!Array.isArray(matrix[i])) {
      throw new TypeError(`Expected row ${i} to be an array.`);
    }
  }

  const cols = matrix[0].length;
  if (cols === 0) {
    throw new RangeError('Matrix must have at least one column.');
  }

  for (let i = 1; i < rows; i += 1) {
    if (matrix[i].length !== cols) {
      throw new RangeError(
        `Ragged matrix: row ${i} has length ${matrix[i].length}, expected ${cols}.`,
      );
    }
  }

  for (let i = 0; i < rows; i += 1) {
    const row = matrix[i];
    for (let j = 0; j < cols; j += 1) {
      if (typeof row[j] !== 'number') {
        throw new TypeError(
          `Expected number at position [${i}][${j}], received ${typeof row[j]}.`,
        );
      }
    }
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
