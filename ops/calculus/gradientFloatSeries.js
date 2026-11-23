/**
 * @fileoverview Numerical gradient of a scalar field over IEEE-754 float64
 * numbers using a Taylor-series 5-point central difference stencil.
 *
 * For each coordinate axis i, expanding f(x + t e_i) in a Taylor series around
 * t = 0 and eliminating the O(h^2) error term yields the fourth-order accurate
 * 5-point central stencil:
 *
 *   df/dx_i(x) = (8 * (f(x + h e_i) - f(x - h e_i))
 *                 - (f(x + 2h e_i) - f(x - 2h e_i))) / (12 * h) + O(h^4)
 *
 * Zero external dependencies. ESM / Node 20+.
 */

/**
 * Default relative step size for the 5-point central stencil in IEEE-754
 * float64 arithmetic.
 *
 * Balancing O(h^4) truncation error against O(eps / h) roundoff error gives an
 * optimal scale near eps^(1/5) (~7.4e-4). Using the exact binary fraction
 * 2^-12 (~2.44140625e-4) avoids decimal-to-binary representation error while
 * keeping truncation error small even for rapidly varying smooth fields.
 */
const DEFAULT_RELATIVE_STEP = 2 ** -12;

/**
 * Evaluates the scalar field and validates that it returns a finite float64.
 *
 * @param {(vec: number[]) => number} f - Scalar field function.
 * @param {number[]} vec - Evaluation coordinates.
 * @returns {number} Finite float64 scalar value.
 */
function evaluateScalarField(f, vec) {
  const value = f(vec);
  if (typeof value !== 'number') {
    throw new TypeError(`Scalar field f must return a number, got ${typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`Scalar field f must return a finite number, got ${value}`);
  }
  return value;
}

/**
 * Computes the gradient vector of a scalar field `f` at `point` using a
 * Taylor-series 5-point central difference stencil along each coordinate axis.
 *
 * Does not mutate `point`.
 *
 * @param {(vec: number[]) => number} f - Differentiable scalar field accepting a
 *   coordinate array of length `point.length` and returning a finite float64.
 * @param {readonly number[]} point - Non-empty array of finite float64
 *   coordinates at which to evaluate the gradient.
 * @param {number} [h] - Optional positive finite step size. When omitted, a
 *   scale-aware step `2^-12 * max(1, |point[i]|)` is used for each axis `i`.
 * @returns {number[]} Gradient vector of length `point.length` containing the
 *   estimated partial derivatives [df/dx_0, ..., df/dx_{n-1}].
 * @throws {TypeError} If `f` is not a function, `point` is not an array of
 *   numbers, `h` (when provided) is not a number, or `f` returns a non-number.
 * @throws {RangeError} If `point` is empty, contains non-finite numbers, `h`
 *   is not positive and finite, or `f` returns a non-finite value.
 */
export function gradientFloatSeries(f, point, h) {
  if (typeof f !== 'function') {
    throw new TypeError('f must be a function');
  }
  if (!Array.isArray(point)) {
    throw new TypeError('point must be an array');
  }
  const n = point.length;
  if (n === 0) {
    throw new RangeError('point must be a non-empty array');
  }

  const base = new Array(n);
  for (let i = 0; i < n; i++) {
    const coord = point[i];
    if (typeof coord !== 'number') {
      throw new TypeError(`point[${i}] must be a number`);
    }
    if (!Number.isFinite(coord)) {
      throw new RangeError(`point[${i}] must be a finite number`);
    }
    base[i] = coord;
  }

  if (h !== undefined) {
    if (typeof h !== 'number') {
      throw new TypeError('h must be a number when provided');
    }
    if (!Number.isFinite(h) || h <= 0) {
      throw new RangeError('h must be a positive finite number');
    }
  }

  const grad = new Array(n);

  for (let i = 0; i < n; i++) {
    const xi = base[i];
    const step = h !== undefined ? h : DEFAULT_RELATIVE_STEP * Math.max(1, Math.abs(xi));
    const twoStep = 2 * step;

    const pPlus1 = base.slice();
    pPlus1[i] = xi + step;
    const fPlus1 = evaluateScalarField(f, pPlus1);

    const pMinus1 = base.slice();
    pMinus1[i] = xi - step;
    const fMinus1 = evaluateScalarField(f, pMinus1);

    const pPlus2 = base.slice();
    pPlus2[i] = xi + twoStep;
    const fPlus2 = evaluateScalarField(f, pPlus2);

    const pMinus2 = base.slice();
    pMinus2[i] = xi - twoStep;
    const fMinus2 = evaluateScalarField(f, pMinus2);

    const partial = (8 * (fPlus1 - fMinus1) - (fPlus2 - fMinus2)) / (12 * step);
    if (!Number.isFinite(partial)) {
      throw new RangeError(`Computed partial derivative at index ${i} is not finite`);
    }
    grad[i] = partial === 0 ? 0 : partial;
  }

  return grad;
}
