/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes negative zero (-0) to positive zero (0).
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${label} must be a non-null complex object { re, im }`);
  }
  const { re, im } = /** @type {Record<string, unknown>} */ (value);
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(`${label}.re and ${label}.im must be numbers`);
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(`${label}.re and ${label}.im must be finite numbers`);
  }
  return { re, im };
}

/**
 * Validates that a value is a 3-element array of finite complex numbers `{ re, im }`.
 * @param {unknown} vec
 * @param {string} label
 * @returns {[Complex, Complex, Complex]}
 */
function validateComplexVector3(vec, label) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${label} must be an array of 3 complex numbers`);
  }
  if (vec.length !== 3) {
    throw new RangeError(`${label} must have length 3, received ${vec.length}`);
  }
  return [
    validateComplex(vec[0], `${label}[0]`),
    validateComplex(vec[1], `${label}[1]`),
    validateComplex(vec[2], `${label}[2]`),
  ];
}

/**
 * Evaluates the complex vector field at a 3D complex point and validates its output.
 * @param {(point: [Complex, Complex, Complex]) => [Complex, Complex, Complex]} field
 * @param {[Complex, Complex, Complex]} point
 * @returns {[Complex, Complex, Complex]}
 */
function evaluateField(field, point) {
  const result = field(point);
  return validateComplexVector3(result, 'field(point)');
}

/**
 * Computes the curl (∇ × F) of a 3D complex vector field F at a 3D complex point
 * using an iterative central finite-difference scheme with optional Richardson
 * extrapolation.
 *
 * Partial derivatives ∂F_k / ∂z_j are computed along the real direction of each
 * coordinate axis. This matches standard spatial partial derivatives for
 * complex-valued fields on R^3 (with im = 0) and complex derivatives for
 * holomorphic fields on C^3 (by the Cauchy-Riemann equations).
 *
 * For F = [F0, F1, F2] and point = [z0, z1, z2]:
 *   (∇ × F)[0] = ∂F2/∂z1 - ∂F1/∂z2
 *   (∇ × F)[1] = ∂F0/∂z2 - ∂F2/∂z0
 *   (∇ × F)[2] = ∂F1/∂z0 - ∂F0/∂z1
 *
 * @param {(point: [Complex, Complex, Complex]) => [Complex, Complex, Complex]} field
 *   3D complex vector field mapping `[z0, z1, z2]` to `[F0, F1, F2]`.
 * @param {[Complex, Complex, Complex]} point
 *   Evaluation point `[z0, z1, z2]` where each coordinate is `{ re, im }`.
 * @param {number} [h=1e-4]
 *   Initial positive finite real step size for central differences.
 * @param {number} [iterations=2]
 *   Number of iterative Richardson extrapolation levels (integer in [1, 16]).
 *   `1` performs plain central differences O(h^2); `2` performs one Richardson
 *   extrapolation step O(h^4).
 * @returns {[Complex, Complex, Complex]}
 *   The curl vector `[c0, c1, c2]` with each component as `{ re, im }`.
 * @throws {TypeError} If arguments or field outputs have invalid types.
 * @throws {RangeError} If vectors do not have length 3, values are non-finite,
 *   `h` is not positive/effective, or `iterations` is outside `[1, 16]`.
 */
export function curlComplexIterative(field, point, h = 1e-4, iterations = 2) {
  if (typeof field !== 'function') {
    throw new TypeError('field must be a function');
  }
  const basePoint = validateComplexVector3(point, 'point');

  if (typeof h !== 'number') {
    throw new TypeError('h must be a number');
  }
  if (!Number.isFinite(h) || h <= 0) {
    throw new RangeError('h must be a finite positive number');
  }

  if (typeof iterations !== 'number') {
    throw new TypeError('iterations must be a number');
  }
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 16) {
    throw new RangeError('iterations must be an integer between 1 and 16');
  }

  /** @type {Array<[Complex, Complex, Complex]>} */
  const partials = new Array(3);

  for (let axis = 0; axis < 3; axis += 1) {
    /** @type {Array<[Complex, Complex, Complex]>} */
    let prevRow = [];

    for (let level = 0; level < iterations; level += 1) {
      const step = h / (2 ** level);
      const baseRe = basePoint[axis].re;
      const plusRe = baseRe + step;
      const minusRe = baseRe - step;
      const span = plusRe - minusRe;

      if (!Number.isFinite(span) || span === 0) {
        throw new RangeError(
          `Step size h (${h}) at level ${level} is not effective for point[${axis}].re (${baseRe})`,
        );
      }

      /** @type {[Complex, Complex, Complex]} */
      const plusPoint = [
        { re: basePoint[0].re, im: basePoint[0].im },
        { re: basePoint[1].re, im: basePoint[1].im },
        { re: basePoint[2].re, im: basePoint[2].im },
      ];
      /** @type {[Complex, Complex, Complex]} */
      const minusPoint = [
        { re: basePoint[0].re, im: basePoint[0].im },
        { re: basePoint[1].re, im: basePoint[1].im },
        { re: basePoint[2].re, im: basePoint[2].im },
      ];
      plusPoint[axis].re = plusRe;
      minusPoint[axis].re = minusRe;

      const fPlus = evaluateField(field, plusPoint);
      const fMinus = evaluateField(field, minusPoint);

      /** @type {[Complex, Complex, Complex]} */
      const centralDiff = [
        { re: (fPlus[0].re - fMinus[0].re) / span, im: (fPlus[0].im - fMinus[0].im) / span },
        { re: (fPlus[1].re - fMinus[1].re) / span, im: (fPlus[1].im - fMinus[1].im) / span },
        { re: (fPlus[2].re - fMinus[2].re) / span, im: (fPlus[2].im - fMinus[2].im) / span },
      ];

      /** @type {Array<[Complex, Complex, Complex]>} */
      const currRow = [centralDiff];

      let factor = 4;
      for (let m = 1; m <= level; m += 1) {
        const denom = factor - 1;
        const currPrev = currRow[m - 1];
        const prevPrev = prevRow[m - 1];
        /** @type {[Complex, Complex, Complex]} */
        const extrapolated = [
          {
            re: (factor * currPrev[0].re - prevPrev[0].re) / denom,
            im: (factor * currPrev[0].im - prevPrev[0].im) / denom,
          },
          {
            re: (factor * currPrev[1].re - prevPrev[1].re) / denom,
            im: (factor * currPrev[1].im - prevPrev[1].im) / denom,
          },
          {
            re: (factor * currPrev[2].re - prevPrev[2].re) / denom,
            im: (factor * currPrev[2].im - prevPrev[2].im) / denom,
          },
        ];
        currRow.push(extrapolated);
        factor *= 4;
      }

      prevRow = currRow;
    }

    partials[axis] = prevRow[iterations - 1];
  }

  /** @type {Array<Complex>} */
  const curl = new Array(3);
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    // (∇ × F)_i = ∂F_k/∂z_j - ∂F_j/∂z_k
    const dFkdzj = partials[j][k];
    const dFjdzk = partials[k][j];
    const re = normalizeZero(dFkdzj.re - dFjdzk.re);
    const im = normalizeZero(dFkdzj.im - dFjdzk.im);
    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      throw new RangeError(`Computed curl[${i}] is not finite`);
    }
    curl[i] = { re, im };
  }

  return /** @type {[Complex, Complex, Complex]} */ (curl);
}
