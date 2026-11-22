/**
 * @fileoverview Recursive divide-and-conquer matrix trace over IEEE-754
 * interval arithmetic with outward rounding guaranteeing mathematical enclosure.
 * @module ops/matrix/traceIntervalRecursive
 */

const f64View = new Float64Array(1);
const i64View = new BigInt64Array(f64View.buffer);

/**
 * Returns the least IEEE-754 binary64 value strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
  if (Number.isNaN(x) || x === Infinity) {
    return x;
  }
  if (x === 0) {
    return Number.MIN_VALUE;
  }
  f64View[0] = x;
  if (x > 0) {
    i64View[0] += 1n;
  } else {
    i64View[0] -= 1n;
  }
  const result = f64View[0];
  return result === 0 ? 0 : result;
}

/**
 * Returns the greatest IEEE-754 binary64 value strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
  if (Number.isNaN(x) || x === -Infinity) {
    return x;
  }
  if (x === 0) {
    return -Number.MIN_VALUE;
  }
  f64View[0] = x;
  if (x > 0) {
    i64View[0] -= 1n;
  } else {
    i64View[0] += 1n;
  }
  const result = f64View[0];
  return result === 0 ? 0 : result;
}

/**
 * Computes an IEEE-754 binary64 lower bound for the exact sum `a + b`
 * (directed rounding toward -Infinity using Knuth's TwoSum and `nextDown`).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
  if (a === -Infinity || b === -Infinity) {
    return -Infinity;
  }
  const s = a + b;
  if (s === Infinity) {
    return Number.MAX_VALUE;
  }
  if (s === -Infinity) {
    return -Infinity;
  }
  const v = s - a;
  const e = (a - (s - v)) + (b - v);
  if (!Number.isFinite(e)) {
    return nextDown(s);
  }
  if (e < 0) {
    return nextDown(s);
  }
  return s === 0 ? 0 : s;
}

/**
 * Computes an IEEE-754 binary64 upper bound for the exact sum `a + b`
 * (directed rounding toward +Infinity using Knuth's TwoSum and `nextUp`).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
  if (a === Infinity || b === Infinity) {
    return Infinity;
  }
  const s = a + b;
  if (s === -Infinity) {
    return -Number.MAX_VALUE;
  }
  if (s === Infinity) {
    return Infinity;
  }
  const v = s - a;
  const e = (a - (s - v)) + (b - v);
  if (!Number.isFinite(e)) {
    return nextUp(s);
  }
  if (e > 0) {
    return nextUp(s);
  }
  return s === 0 ? 0 : s;
}

/**
 * Adds two intervals with outward rounding to guarantee enclosure.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function addIntervals(a, b) {
  return [addDown(a[0], b[0]), addUp(a[1], b[1])];
}

/**
 * Validates that a value is a well-formed finite interval `[lo, hi]` with `lo <= hi`.
 *
 * @param {unknown} interval
 * @param {number} row
 * @param {number} col
 */
function validateInterval(interval, row, col) {
  if (!Array.isArray(interval) || interval.length !== 2) {
    throw new TypeError(
      `Invalid interval at [${row}][${col}]: expected a 2-element array [lo, hi]`
    );
  }
  const [lo, hi] = interval;
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError(
      `Invalid interval at [${row}][${col}]: endpoints must be numbers`
    );
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError(
      `Invalid interval at [${row}][${col}]: endpoints must be finite numbers`
    );
  }
  if (lo > hi) {
    throw new RangeError(
      `Invalid interval at [${row}][${col}]: lower bound (${lo}) exceeds upper bound (${hi})`
    );
  }
}

/**
 * Validates that `matrix` is a non-empty square 2D array of valid finite intervals.
 *
 * @param {unknown} matrix
 */
function validateSquareIntervalMatrix(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('Matrix must be a 2D array of [lo, hi] intervals');
  }
  const n = matrix.length;
  if (n === 0) {
    throw new RangeError('Matrix must be non-empty');
  }
  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`Row ${i} must be an array`);
    }
    if (row.length !== n) {
      throw new RangeError(
        `Matrix must be square: expected ${n} columns in row ${i}, got ${row.length}`
      );
    }
    for (let j = 0; j < n; j++) {
      validateInterval(row[j], i, j);
    }
  }
}

/**
 * Recursively computes the outward-rounded interval sum of the diagonal entries
 * `matrix[i][i]` for `i` in `[start, end)` via divide-and-conquer.
 *
 * @param {Array<Array<[number, number]>>} matrix
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {[number, number]}
 */
function sumDiagonalRange(matrix, start, end) {
  const len = end - start;
  if (len === 1) {
    const [lo, hi] = matrix[start][start];
    return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi];
  }
  const mid = start + (len >>> 1);
  const left = sumDiagonalRange(matrix, start, mid);
  const right = sumDiagonalRange(matrix, mid, end);
  return addIntervals(left, right);
}

/**
 * Computes the trace of a square interval matrix using recursive
 * divide-and-conquer summation along the main diagonal with IEEE-754 outward
 * rounding, guaranteeing that the returned `[lo, hi]` interval encloses the
 * exact mathematical trace of every point matrix contained in `matrix`.
 *
 * @param {Array<Array<[number, number]>>} matrix - Non-empty square matrix of
 *   `[lo, hi]` intervals where `lo` and `hi` are finite numbers with `lo <= hi`.
 * @returns {[number, number]} Outward-rounded `[lo, hi]` interval enclosing the trace.
 * @throws {TypeError} If `matrix`, any row, or any interval has an invalid type or shape.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains non-finite or inverted intervals.
 */
export function traceIntervalRecursive(matrix) {
  validateSquareIntervalMatrix(matrix);
  return sumDiagonalRange(matrix, 0, matrix.length);
}
