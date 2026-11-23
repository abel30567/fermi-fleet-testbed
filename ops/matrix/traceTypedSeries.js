/**
 * Computes the trace (sum of main diagonal entries) of a square row-major
 * matrix stored in a {@link Float64Array}.
 *
 * Uses Neumaier's improved Kahan–Babuška compensated summation over the
 * diagonal series `sum_{i=0}^{n-1} matrix[i * n + i]` to minimize floating-point
 * rounding error while running in O(n) time and O(1) auxiliary space.
 *
 * @param {Float64Array} matrix - Row-major square matrix elements.
 * @param {number} [n] - Optional matrix dimension (rows and columns). When
 *   omitted, inferred as `Math.sqrt(matrix.length)`.
 * @returns {number} The matrix trace (0 for a 0x0 empty matrix).
 * @throws {TypeError} If `matrix` is not a `Float64Array` or `n` is provided
 *   and is not a number.
 * @throws {RangeError} If `matrix.length` is not a perfect square, or if `n`
 *   is not a non-negative safe integer satisfying `n * n === matrix.length`.
 */
export function traceTypedSeries(matrix, n) {
  if (!(matrix instanceof Float64Array)) {
    throw new TypeError('Expected matrix to be a Float64Array');
  }

  let size;
  if (n === undefined) {
    size = Math.round(Math.sqrt(matrix.length));
    if (size * size !== matrix.length) {
      throw new RangeError(
        `Expected a square matrix, but received Float64Array of length ${matrix.length}`
      );
    }
  } else {
    if (typeof n !== 'number') {
      throw new TypeError('Expected dimension n to be a number');
    }
    if (!Number.isSafeInteger(n) || n < 0) {
      throw new RangeError(
        `Expected dimension n to be a non-negative safe integer, received ${n}`
      );
    }
    if (n * n !== matrix.length) {
      throw new RangeError(
        `Matrix length ${matrix.length} does not match expected ${n}x${n} (${n * n})`
      );
    }
    size = n;
  }

  let sum = 0;
  let compensation = 0;
  const stride = size + 1;

  for (let i = 0, idx = 0; i < size; i += 1, idx += stride) {
    const value = matrix[idx];
    if (!Number.isFinite(value)) {
      sum += value;
      continue;
    }
    if (!Number.isFinite(sum)) {
      continue;
    }
    const next = sum + value;
    if (!Number.isFinite(next)) {
      sum = next;
      compensation = 0;
      continue;
    }
    if (Math.abs(sum) >= Math.abs(value)) {
      compensation += (sum - next) + value;
    } else {
      compensation += (value - next) + sum;
    }
    sum = next;
  }

  return Number.isFinite(sum) ? sum + compensation : sum;
}
