/**
 * Computes the exact BigInt determinant of a non-empty n×n BigInt matrix.
 *
 * Uses exact closed-form formulas for 1×1, 2×2, and 3×3 matrices, and the
 * fraction-free Bareiss algorithm with row pivoting for n ≥ 4. Because every
 * intermediate division in Bareiss elimination is exact by Sylvester's
 * determinant identity, all arithmetic stays in exact BigInt with zero
 * rounding error and without mutating the input matrix.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Non-empty n×n 2D array of BigInt values.
 * @returns {bigint} The exact determinant of `matrix`.
 * @throws {TypeError} If `matrix` is not a 2D array or contains any non-BigInt entry.
 * @throws {RangeError} If `matrix` is empty or not square.
 */
export function determinantBigIntSeries(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of BigInt values');
  }

  const n = matrix.length;
  if (n === 0) {
    throw new RangeError('matrix must be non-empty');
  }

  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`matrix row ${i} must be an array`);
    }
    if (row.length !== n) {
      throw new RangeError(
        `matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
      );
    }
    for (let j = 0; j < n; j++) {
      if (typeof row[j] !== 'bigint') {
        throw new TypeError(
          `matrix entry at [${i}][${j}] must be a BigInt, got ${typeof row[j]}`
        );
      }
    }
  }

  if (n === 1) {
    return matrix[0][0];
  }

  if (n === 2) {
    return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  }

  if (n === 3) {
    const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
    return (
      a * (e * i - f * h) -
      b * (d * i - f * g) +
      c * (d * h - e * g)
    );
  }

  // Copy into a mutable working matrix to avoid mutating the caller's input.
  const a = Array.from(matrix, (row) => row.slice());

  let sign = 1n;
  let prevPivot = 1n;

  for (let k = 0; k < n - 1; k++) {
    let pivotRow = k;
    while (pivotRow < n && a[pivotRow][k] === 0n) {
      pivotRow++;
    }

    if (pivotRow === n) {
      return 0n;
    }

    if (pivotRow !== k) {
      const tmp = a[k];
      a[k] = a[pivotRow];
      a[pivotRow] = tmp;
      sign = -sign;
    }

    const pivot = a[k][k];
    for (let i = k + 1; i < n; i++) {
      const aik = a[i][k];
      for (let j = k + 1; j < n; j++) {
        a[i][j] = (a[i][j] * pivot - aik * a[k][j]) / prevPivot;
      }
    }

    prevPivot = pivot;
  }

  return sign * a[n - 1][n - 1];
}
