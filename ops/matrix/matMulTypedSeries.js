/**
 * Validates that a dimension argument is a positive safe integer.
 *
 * @param {unknown} value - Dimension value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is not a positive safe integer.
 */
function assertPositiveInt(value, name) {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number`);
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

/**
 * Computes the matrix product `C = A * B` for row-major `Float64Array` matrices
 * using the closed-form inner-product definition:
 *
 *   `C[i, j] = sum_{k=0}^{colsA - 1} A[i, k] * B[k, j]`
 *
 * When `rowsA`, `colsA`, and `colsB` are all omitted (`undefined`), both inputs
 * are treated as square `n x n` matrices where `a.length === b.length === n * n`
 * for a positive integer `n`.
 *
 * @param {Float64Array} a - Row-major left matrix of shape `rowsA x colsA`.
 * @param {Float64Array} b - Row-major right matrix of shape `colsA x colsB`.
 * @param {number} [rowsA] - Number of rows in `a` (and `C`).
 * @param {number} [colsA] - Number of columns in `a` and rows in `b`.
 * @param {number} [colsB] - Number of columns in `b` (and `C`).
 * @returns {Float64Array} Row-major product matrix `C` of length `rowsA * colsB`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if provided dimensions are not numbers.
 * @throws {RangeError} If dimensions are non-positive, non-integer, cannot be inferred as square,
 *   or do not match the lengths of `a` and `b`.
 */
export function matMulTypedSeries(a, b, rowsA, colsA, colsB) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('a must be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('b must be a Float64Array');
  }

  let m = rowsA;
  let kDim = colsA;
  let n = colsB;

  if (m === undefined && kDim === undefined && n === undefined) {
    if (a.length === 0 || b.length === 0) {
      throw new RangeError('Cannot infer dimensions for empty Float64Array inputs');
    }
    if (a.length !== b.length) {
      throw new RangeError(
        `Cannot infer square dimensions: a.length (${a.length}) !== b.length (${b.length})`
      );
    }
    const side = Math.round(Math.sqrt(a.length));
    if (side <= 0 || side * side !== a.length) {
      throw new RangeError(
        `Cannot infer square dimensions: length (${a.length}) is not a positive perfect square`
      );
    }
    m = side;
    kDim = side;
    n = side;
  } else {
    assertPositiveInt(m, 'rowsA');
    assertPositiveInt(kDim, 'colsA');
    assertPositiveInt(n, 'colsB');

    const expectedA = m * kDim;
    const expectedB = kDim * n;
    if (a.length !== expectedA) {
      throw new RangeError(
        `Dimension mismatch for a: expected length ${expectedA} (${m}x${kDim}), got ${a.length}`
      );
    }
    if (b.length !== expectedB) {
      throw new RangeError(
        `Dimension mismatch for b: expected length ${expectedB} (${kDim}x${n}), got ${b.length}`
      );
    }
  }

  const out = new Float64Array(m * n);

  for (let i = 0; i < m; i++) {
    const rowOffsetA = i * kDim;
    const rowOffsetC = i * n;
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < kDim; k++) {
        sum += a[rowOffsetA + k] * b[k * n + j];
      }
      out[rowOffsetC + j] = sum;
    }
  }

  return out;
}
