/**
 * Validates that a value is a finite complex number represented as `{ re, im }`.
 *
 * @param {*} value - Value to validate.
 * @param {string} label - Descriptive label for error messages.
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, label) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${label} must be a complex number object { re, im }`);
  }
  const { re, im } = value;
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(`${label} must have numeric re and im properties`);
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(`${label} must have finite re and im values`);
  }
  return { re, im };
}

/**
 * Normalizes negative zero (-0) to positive zero (0).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Builds a fresh copy of `basePoint` with coordinate `index` shifted by `(dRe, dIm)`.
 *
 * @param {Array<{ re: number, im: number }>} basePoint
 * @param {number} index
 * @param {number} dRe
 * @param {number} dIm
 * @returns {Array<{ re: number, im: number }>}
 */
function buildPerturbedPoint(basePoint, index, dRe, dIm) {
  const n = basePoint.length;
  const copy = new Array(n);
  for (let j = 0; j < n; j += 1) {
    const c = basePoint[j];
    if (j === index) {
      copy[j] = { re: c.re + dRe, im: c.im + dIm };
    } else {
      copy[j] = { re: c.re, im: c.im };
    }
  }
  return copy;
}

/**
 * Evaluates the `index`-th component of a complex vector field at `samplePoint`.
 *
 * @param {Function|Array<Function>} field
 * @param {boolean} isComponentArray
 * @param {Array<{ re: number, im: number }>} samplePoint
 * @param {number} index
 * @param {number} dim
 * @returns {{ re: number, im: number }}
 */
function evaluateComponent(field, isComponentArray, samplePoint, index, dim) {
  if (isComponentArray) {
    const val = field[index](samplePoint);
    return validateComplex(val, `field[${index}] return value`);
  }

  const vec = field(samplePoint);
  if (!Array.isArray(vec)) {
    throw new TypeError('field must return an array of complex numbers { re, im }');
  }
  if (vec.length !== dim) {
    throw new RangeError(
      `field return vector length (${vec.length}) must match point dimension (${dim})`
    );
  }
  for (let j = 0; j < dim; j += 1) {
    validateComplex(vec[j], `field return value[${j}]`);
  }
  return { re: vec[index].re, im: vec[index].im };
}

/**
 * Computes the numerical divergence of a complex vector field at a complex point
 * using a straightforward iterative central-difference Wirtinger derivative:
 *
 *   div(F)(z) = sum_{i=0}^{n-1} dF_i / dz_i
 *
 * where each complex partial derivative uses the Wirtinger operator:
 *
 *   dF_i / dz_i = (1 / 2) * (dF_i / dx_i - i * dF_i / dy_i)
 *
 * This matches the standard complex derivative for all holomorphic vector fields
 * and also yields the exact Wirtinger divergence for non-holomorphic smooth fields.
 *
 * @param {((point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>) | Array<(point: Array<{ re: number, im: number }>) => { re: number, im: number }>} field
 *   Vector field as either a function mapping `point` to a complex vector of the same
 *   dimension, or an array of scalar component functions `[F_0, ..., F_{n-1}]`.
 * @param {Array<{ re: number, im: number }>} point
 *   Non-empty array of finite complex coordinates `{ re, im }`.
 * @param {number} [h=1e-6]
 *   Positive finite step size for central finite differences.
 * @returns {{ re: number, im: number }} The divergence of `field` at `point`.
 */
export function divergenceComplexIterative(field, point, h = 1e-6) {
  const isFn = typeof field === 'function';
  const isComponentArray = Array.isArray(field);

  if (!isFn && !isComponentArray) {
    throw new TypeError('field must be a function or an array of component functions');
  }
  if (isComponentArray) {
    for (let i = 0; i < field.length; i += 1) {
      if (typeof field[i] !== 'function') {
        throw new TypeError(`field[${i}] must be a function`);
      }
    }
  }

  if (!Array.isArray(point)) {
    throw new TypeError('point must be an array of complex numbers { re, im }');
  }
  const n = point.length;
  if (n === 0) {
    throw new RangeError('point must be a non-empty array');
  }

  const basePoint = new Array(n);
  for (let i = 0; i < n; i += 1) {
    basePoint[i] = validateComplex(point[i], `point[${i}]`);
  }

  if (isComponentArray && field.length !== n) {
    throw new RangeError(
      `field component count (${field.length}) must match point dimension (${n})`
    );
  }

  if (typeof h !== 'number') {
    throw new TypeError('h must be a number');
  }
  if (!Number.isFinite(h) || h <= 0) {
    throw new RangeError('h must be a finite positive number');
  }

  const twoH = 2 * h;
  let sumRe = 0;
  let sumIm = 0;

  for (let i = 0; i < n; i += 1) {
    const fPlusX = evaluateComponent(
      field,
      isComponentArray,
      buildPerturbedPoint(basePoint, i, h, 0),
      i,
      n
    );
    const fMinusX = evaluateComponent(
      field,
      isComponentArray,
      buildPerturbedPoint(basePoint, i, -h, 0),
      i,
      n
    );
    const fPlusY = evaluateComponent(
      field,
      isComponentArray,
      buildPerturbedPoint(basePoint, i, 0, h),
      i,
      n
    );
    const fMinusY = evaluateComponent(
      field,
      isComponentArray,
      buildPerturbedPoint(basePoint, i, 0, -h),
      i,
      n
    );

    const dxRe = (fPlusX.re - fMinusX.re) / twoH;
    const dxIm = (fPlusX.im - fMinusX.im) / twoH;
    const dyRe = (fPlusY.re - fMinusY.re) / twoH;
    const dyIm = (fPlusY.im - fMinusY.im) / twoH;

    // dF_i / dz_i = 0.5 * (dF_i / dx_i - i * dF_i / dy_i)
    //             = 0.5 * ((dxRe + dyIm) + i * (dxIm - dyRe))
    const partialRe = 0.5 * (dxRe + dyIm);
    const partialIm = 0.5 * (dxIm - dyRe);

    sumRe += partialRe;
    sumIm += partialIm;
  }

  if (!Number.isFinite(sumRe) || !Number.isFinite(sumIm)) {
    throw new RangeError('divergence evaluation resulted in a non-finite value');
  }

  return {
    re: normalizeZero(sumRe),
    im: normalizeZero(sumIm),
  };
}
