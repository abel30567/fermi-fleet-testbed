/**
 * @fileoverview Numerical divergence of a vector field over IEEE-754 float64
 * Numbers using a recursive divide-and-conquer implementation.
 *
 * Computes:
 *   div(F)(x) = sum_{i=0}^{n-1} dF_i / dx_i
 *
 * The implementation uses two layers of recursion:
 * 1. Divide-and-conquer pairwise summation over coordinate index ranges
 *    `[lo, hi)` by recursively bisecting at `mid = lo + Math.floor((hi - lo) / 2)`.
 * 2. Recursive Richardson extrapolation (step-halving on central differences)
 *    for each partial derivative `dF_i / dx_i`.
 */

const DEFAULT_BASE_STEP = 1e-3;
const DEFAULT_MAX_DEPTH = 5;
const MAX_ALLOWED_DEPTH = 20;
const DEFAULT_TOLERANCE = 1e-10;

/**
 * Validates that a vector is an Array of finite float64 numbers with an
 * optional expected length.
 *
 * @param {unknown} vec - Value to validate.
 * @param {string} label - Descriptive label for error messages.
 * @param {number} [expectedLength] - Required dimension if known.
 */
function validateVector(vec, label, expectedLength) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${label} must be an array of finite numbers`);
  }
  if (vec.length === 0) {
    throw new RangeError(`${label} must be a non-empty array`);
  }
  if (expectedLength !== undefined && vec.length !== expectedLength) {
    throw new RangeError(
      `${label} length (${vec.length}) must match point dimension (${expectedLength})`,
    );
  }
  for (let i = 0; i < vec.length; i += 1) {
    const val = vec[i];
    if (typeof val !== 'number') {
      throw new TypeError(`${label}[${i}] must be a number`);
    }
    if (!Number.isFinite(val)) {
      throw new RangeError(`${label}[${i}] must be a finite number`);
    }
  }
}

/**
 * Validates and normalizes the optional configuration object.
 *
 * @param {object} [options]
 * @returns {{ step: number | undefined, maxDepth: number, tolerance: number }}
 */
function parseOptions(options) {
  if (options === undefined) {
    return {
      step: undefined,
      maxDepth: DEFAULT_MAX_DEPTH,
      tolerance: DEFAULT_TOLERANCE,
    };
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  const {
    step,
    maxDepth = DEFAULT_MAX_DEPTH,
    tolerance = DEFAULT_TOLERANCE,
  } = options;

  if (step !== undefined) {
    if (typeof step !== 'number') {
      throw new TypeError('options.step must be a number');
    }
    if (!Number.isFinite(step) || step <= 0) {
      throw new RangeError('options.step must be a finite positive number');
    }
  }

  if (typeof maxDepth !== 'number' || !Number.isInteger(maxDepth)) {
    throw new TypeError('options.maxDepth must be an integer');
  }
  if (maxDepth < 1 || maxDepth > MAX_ALLOWED_DEPTH) {
    throw new RangeError(
      `options.maxDepth must be an integer between 1 and ${MAX_ALLOWED_DEPTH}`,
    );
  }

  if (typeof tolerance !== 'number') {
    throw new TypeError('options.tolerance must be a number');
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError('options.tolerance must be a finite non-negative number');
  }

  return { step, maxDepth, tolerance };
}

/**
 * Recursively constructs the next Richardson extrapolation row from the
 * previous row and the current central-difference value.
 *
 * For central differences (error expansion in even powers of h), column `col`
 * combines estimates with factor `4^col - 1`.
 *
 * @param {number[]} prevRow - Extrapolation row from the previous step size.
 * @param {number} currVal - Value at column `col - 1` of the new row.
 * @param {number} col - 1-based column index to compute next.
 * @returns {number[]} Remaining suffix of the new extrapolation row.
 */
function buildRichardsonRow(prevRow, currVal, col) {
  if (col > prevRow.length) {
    return [currVal];
  }
  const factor = 4 ** col - 1;
  const nextVal = currVal + (currVal - prevRow[col - 1]) / factor;
  return [currVal, ...buildRichardsonRow(prevRow, nextVal, col + 1)];
}

/**
 * Computes the numerical divergence `sum_i dF_i/dx_i` of a vector field
 * `field(point) -> number[]` at `point` over IEEE-754 float64 Numbers using
 * recursive coordinate bisection and recursive Richardson extrapolation.
 *
 * @param {(point: number[]) => number[]} field
 *   Vector field mapping an n-dimensional point to an n-dimensional vector.
 * @param {number[]} point
 *   Non-empty array of finite float64 coordinates where divergence is evaluated.
 * @param {object} [options]
 *   Optional numerical differentiation parameters.
 * @param {number} [options.step]
 *   Initial finite-difference step size (positive finite number). Defaults to
 *   `1e-3 * Math.max(1, Math.abs(point[i]))` per coordinate.
 * @param {number} [options.maxDepth=5]
 *   Maximum recursive Richardson step-halving depth (integer in [1, 20]).
 * @param {number} [options.tolerance=1e-10]
 *   Relative/absolute convergence tolerance for Richardson extrapolation.
 * @returns {number} Numerical divergence of `field` at `point`.
 */
export function divergenceFloatRecursive(field, point, options) {
  if (typeof field !== 'function') {
    throw new TypeError('field must be a function');
  }
  validateVector(point, 'point');
  const { step, maxDepth, tolerance } = parseOptions(options);

  const dim = point.length;
  const basePoint = point.slice();

  // Validate field output shape and finiteness at the evaluation point.
  const baseOutput = field(basePoint.slice());
  validateVector(baseOutput, 'field(point)', dim);

  /**
   * Evaluates the central difference `(F_i(x + h e_i) - F_i(x - h e_i)) / dx`
   * using the exact float64 difference `dx = (x_i + h) - (x_i - h)`.
   *
   * @param {number} index - Coordinate index `i`.
   * @param {number} h - Step size.
   * @returns {number | null} Central difference estimate, or `null` if `h` underflows ULP.
   */
  function centralDifference(index, h) {
    const xPlus = basePoint.slice();
    const xMinus = basePoint.slice();
    xPlus[index] = basePoint[index] + h;
    xMinus[index] = basePoint[index] - h;

    const dx = xPlus[index] - xMinus[index];
    if (dx === 0 || !Number.isFinite(dx)) {
      return null;
    }

    const fPlus = field(xPlus);
    validateVector(fPlus, 'field(point + h*e_i)', dim);
    const fMinus = field(xMinus);
    validateVector(fMinus, 'field(point - h*e_i)', dim);

    return (fPlus[index] - fMinus[index]) / dx;
  }

  /**
   * Recursively refines the partial derivative `dF_i / dx_i` via Richardson
   * extrapolation with step halving.
   *
   * @param {number} index - Coordinate index `i`.
   * @param {number} depth - Current recursion depth (1..maxDepth).
   * @param {number} h - Step size for this level.
   * @param {number[]} prevRow - Richardson row from `depth - 1`.
   * @param {number} bestEst - Best derivative estimate observed so far.
   * @param {number} bestErr - Smallest error estimate observed so far.
   * @returns {number} Refined partial derivative estimate.
   */
  function refinePartial(index, depth, h, prevRow, bestEst, bestErr) {
    if (depth > maxDepth) {
      return bestEst;
    }

    const d0 = centralDifference(index, h);
    if (d0 === null) {
      return bestEst;
    }

    const row = buildRichardsonRow(prevRow, d0, 1);
    const est = row[row.length - 1];
    const prevTop = prevRow[prevRow.length - 1];
    const err = Math.abs(est - prevTop);

    const nextBestEst = err <= bestErr ? est : bestEst;
    const nextBestErr = err <= bestErr ? err : bestErr;

    const threshold = tolerance * Math.max(1, Math.abs(est));
    if (err <= threshold) {
      return est;
    }

    // Stop early if floating-point roundoff begins degrading accuracy.
    if (err > bestErr * 2) {
      return bestEst;
    }

    return refinePartial(index, depth + 1, h / 2, row, nextBestEst, nextBestErr);
  }

  /**
   * Computes `dF_i / dx_i` at `basePoint`.
   *
   * @param {number} index - Coordinate index `i`.
   * @returns {number} Partial derivative estimate.
   */
  function partialDerivative(index) {
    const h0 =
      step !== undefined
        ? step
        : DEFAULT_BASE_STEP * Math.max(1, Math.abs(basePoint[index]));

    const d0 = centralDifference(index, h0);
    if (d0 === null) {
      throw new RangeError(
        `options.step (${h0}) is too small relative to point[${index}] (${basePoint[index]})`,
      );
    }

    return refinePartial(index, 1, h0 / 2, [d0], d0, Infinity);
  }

  /**
   * Divide-and-conquer recursive pairwise sum of partial derivatives over
   * coordinate indices `[lo, hi)`.
   *
   * @param {number} lo - Inclusive start index.
   * @param {number} hi - Exclusive end index.
   * @returns {number} Sum of `dF_i / dx_i` for `i in [lo, hi)`.
   */
  function sumRange(lo, hi) {
    if (hi - lo === 1) {
      return partialDerivative(lo);
    }
    const mid = lo + Math.floor((hi - lo) / 2);
    return sumRange(lo, mid) + sumRange(mid, hi);
  }

  const total = sumRange(0, dim);
  return total === 0 ? 0 : total;
}
