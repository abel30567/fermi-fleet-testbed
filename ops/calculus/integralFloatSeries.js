/**
 * Computes the definite integral of a real-valued function over IEEE-754
 * float64 Numbers using Romberg integration (Richardson extrapolation of
 * composite trapezoidal sums based on the Euler-Maclaurin asymptotic series),
 * combined with Neumaier compensated summation for near-float64 accuracy.
 *
 * @param {(x: number) => number} f - Continuous integrand function returning a finite number.
 * @param {number} a - Finite lower limit of integration.
 * @param {number} b - Finite upper limit of integration.
 * @param {object} [options] - Optional integration controls.
 * @param {number} [options.subdivisions] - Positive even integer specifying the base subdivision count for composite Simpson / Romberg refinement.
 * @param {number} [options.tolerance=1e-13] - Positive finite relative/absolute convergence tolerance.
 * @param {number} [options.maxIterations=16] - Positive integer (1..24) limiting Romberg refinement levels.
 * @returns {number} Approximate definite integral of f from a to b.
 * @throws {TypeError} If f is not a function, a/b are not numbers, or options/fields have invalid types.
 * @throws {RangeError} If a/b are non-finite, option values are out of range, or f returns a non-finite value.
 */
export function integralFloatSeries(f, a, b, options) {
  if (typeof f !== 'function') {
    throw new TypeError('Expected integrand f to be a function');
  }
  if (typeof a !== 'number') {
    throw new TypeError('Expected lower bound a to be a number');
  }
  if (typeof b !== 'number') {
    throw new TypeError('Expected upper bound b to be a number');
  }
  if (!Number.isFinite(a)) {
    throw new RangeError('Expected lower bound a to be finite');
  }
  if (!Number.isFinite(b)) {
    throw new RangeError('Expected upper bound b to be finite');
  }

  let subdivisions;
  let tolerance = 1e-13;
  let maxIterations;

  if (options !== undefined) {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new TypeError('Expected options to be a plain object');
    }

    if (options.subdivisions !== undefined) {
      if (typeof options.subdivisions !== 'number') {
        throw new TypeError('Expected options.subdivisions to be a number');
      }
      if (
        !Number.isSafeInteger(options.subdivisions) ||
        options.subdivisions <= 0 ||
        options.subdivisions % 2 !== 0
      ) {
        throw new RangeError('Expected options.subdivisions to be a positive even integer');
      }
      subdivisions = options.subdivisions;
    }

    if (options.tolerance !== undefined) {
      if (typeof options.tolerance !== 'number') {
        throw new TypeError('Expected options.tolerance to be a number');
      }
      if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
        throw new RangeError('Expected options.tolerance to be a positive finite number');
      }
      tolerance = options.tolerance;
    }

    if (options.maxIterations !== undefined) {
      if (typeof options.maxIterations !== 'number') {
        throw new TypeError('Expected options.maxIterations to be a number');
      }
      if (
        !Number.isSafeInteger(options.maxIterations) ||
        options.maxIterations < 1 ||
        options.maxIterations > 24
      ) {
        throw new RangeError('Expected options.maxIterations to be an integer between 1 and 24');
      }
      maxIterations = options.maxIterations;
    }
  }

  if (a === b) {
    return 0;
  }

  const sign = a < b ? 1 : -1;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;

  const basePanels = subdivisions !== undefined ? subdivisions / 2 : 1;
  const defaultMaxIterations =
    subdivisions !== undefined
      ? Math.min(16, Math.max(4, Math.floor(Math.log2(Math.max(16, 262144 / basePanels)))))
      : 16;
  const maxDepth = maxIterations ?? defaultMaxIterations;
  const minDepth = Math.min(subdivisions !== undefined ? 2 : 4, maxDepth);

  let value;
  if (!Number.isFinite(hi - lo)) {
    // Both lo and hi are finite, so lo < 0 < hi when hi - lo overflows.
    const left = rombergIntegrate(f, lo, 0, basePanels, tolerance, minDepth, maxDepth);
    const right = rombergIntegrate(f, 0, hi, basePanels, tolerance, minDepth, maxDepth);
    value = left + right;
  } else {
    value = rombergIntegrate(f, lo, hi, basePanels, tolerance, minDepth, maxDepth);
  }

  const signed = sign * value;
  return signed === 0 ? 0 : signed;
}

/**
 * Evaluates the integrand and validates that it produces a finite float64 number.
 *
 * @param {(x: number) => number} f
 * @param {number} x
 * @returns {number}
 */
function evalIntegrand(f, x) {
  const y = f(x);
  if (typeof y !== 'number' || !Number.isFinite(y)) {
    throw new RangeError(`Integrand returned a non-finite value at x=${x}`);
  }
  return y;
}

/**
 * Romberg integration over [lo, hi] where hi - lo is positive and finite.
 *
 * @param {(x: number) => number} f
 * @param {number} lo
 * @param {number} hi
 * @param {number} basePanels
 * @param {number} tolerance
 * @param {number} minDepth
 * @param {number} maxDepth
 * @returns {number}
 */
function rombergIntegrate(f, lo, hi, basePanels, tolerance, minDepth, maxDepth) {
  const span = hi - lo;
  let panels = basePanels;
  let h = span / panels;

  // Level 0: composite trapezoidal rule with basePanels subdivisions.
  let interiorSum = 0;
  let interiorComp = 0;
  for (let i = 1; i < panels; i += 1) {
    const y = evalIntegrand(f, lo + i * h);
    const t = interiorSum + y;
    if (Math.abs(interiorSum) >= Math.abs(y)) {
      interiorComp += (interiorSum - t) + y;
    } else {
      interiorComp += (y - t) + interiorSum;
    }
    interiorSum = t;
  }

  const endAvg = 0.5 * (evalIntegrand(f, lo) + evalIntegrand(f, hi));
  let prevRow = [h * (endAvg + (interiorSum + interiorComp))];

  for (let k = 1; k <= maxDepth; k += 1) {
    const prevPanels = panels;
    panels *= 2;
    h *= 0.5;

    // Evaluate newly introduced odd midpoints with Neumaier compensated summation.
    let midSum = 0;
    let midComp = 0;
    for (let i = 0; i < prevPanels; i += 1) {
      const y = evalIntegrand(f, lo + (2 * i + 1) * h);
      const t = midSum + y;
      if (Math.abs(midSum) >= Math.abs(y)) {
        midComp += (midSum - t) + y;
      } else {
        midComp += (y - t) + midSum;
      }
      midSum = t;
    }

    const currRow = new Array(k + 1);
    currRow[0] = 0.5 * prevRow[0] + h * (midSum + midComp);

    // Richardson extrapolation eliminating h^2, h^4, ..., h^(2k) Euler-Maclaurin terms.
    let factor = 4;
    for (let j = 1; j <= k; j += 1) {
      currRow[j] = currRow[j - 1] + (currRow[j - 1] - prevRow[j - 1]) / (factor - 1);
      factor *= 4;
    }

    const estimate = currRow[k];
    if (k >= minDepth) {
      const diagDiff = Math.abs(estimate - prevRow[k - 1]);
      const rowDiff = Math.abs(estimate - currRow[k - 1]);
      const scale = Math.max(1, Math.abs(estimate));
      if (Math.max(diagDiff, rowDiff) <= tolerance * scale) {
        return estimate;
      }
    }

    prevRow = currRow;
  }

  return prevRow[prevRow.length - 1];
}
