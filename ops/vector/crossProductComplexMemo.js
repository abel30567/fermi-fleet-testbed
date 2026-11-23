/**
 * @fileoverview Table-driven, memoized 3D cross product over complex vectors.
 *
 * Each 3D complex vector is represented as a length-3 array of `{ re, im }`
 * objects with finite numeric real and imaginary parts.
 *
 * The algebraic (bilinear) complex cross product is defined component-wise by
 * the Levi-Civita tensor ε_{kij}:
 *   (a × b)_k = Σ_{i,j} ε_{kij} · a_i · b_j
 * i.e.:
 *   [a1*b2 - a2*b1, a2*b0 - a0*b2, a0*b1 - a1*b0]
 */

/**
 * @typedef {Object} Complex
 * @property {number} re Real part (must be a finite number).
 * @property {number} im Imaginary part (must be a finite number).
 */

/**
 * Precomputed non-zero Levi-Civita index table for 3D cross product.
 * Each tuple `[outIdx, aIdx, bIdx, sign]` represents `sign * a[aIdx] * b[bIdx]`
 * contributing to component `outIdx`.
 *
 * @type {readonly (readonly [number, number, number, 1 | -1])[]}
 */
const LEVI_CIVITA_TABLE = Object.freeze([
  Object.freeze([0, 1, 2, 1]),
  Object.freeze([0, 2, 1, -1]),
  Object.freeze([1, 2, 0, 1]),
  Object.freeze([1, 0, 2, -1]),
  Object.freeze([2, 0, 1, 1]),
  Object.freeze([2, 1, 0, -1]),
]);

/** Maximum number of memoized input pairs retained in the LRU cache. */
const MAX_CACHE_SIZE = 1024;

/** @type {Map<string, readonly Complex[]>} */
const memoCache = new Map();

/**
 * Normalizes `-0` to `+0` so cache keys and output values are canonical.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Validates that `vec` is a length-3 array of valid `{ re, im }` complex numbers.
 *
 * @param {unknown} vec
 * @param {string} name Parameter name for error messages.
 * @throws {TypeError} If `vec` is not an array or contains invalid complex elements.
 * @throws {RangeError} If `vec` does not have length 3 or contains non-finite numbers.
 */
function validateComplexVector3(vec, name) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${name} must be an array of length 3`);
  }
  if (vec.length !== 3) {
    throw new RangeError(`${name} must have length 3, got ${vec.length}`);
  }
  for (let i = 0; i < 3; i++) {
    const el = vec[i];
    if (el === null || typeof el !== 'object') {
      throw new TypeError(`${name}[${i}] must be a complex object { re, im }`);
    }
    if (typeof el.re !== 'number' || typeof el.im !== 'number') {
      throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`);
    }
    if (!Number.isFinite(el.re) || !Number.isFinite(el.im)) {
      throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`);
    }
  }
}

/**
 * Builds a canonical lossless string cache key for a pair of 3D complex vectors.
 *
 * @param {readonly Complex[]} a
 * @param {readonly Complex[]} b
 * @returns {string}
 */
function buildCacheKey(a, b) {
  return (
    `${normalizeZero(a[0].re)},${normalizeZero(a[0].im)},` +
    `${normalizeZero(a[1].re)},${normalizeZero(a[1].im)},` +
    `${normalizeZero(a[2].re)},${normalizeZero(a[2].im)}|` +
    `${normalizeZero(b[0].re)},${normalizeZero(b[0].im)},` +
    `${normalizeZero(b[1].re)},${normalizeZero(b[1].im)},` +
    `${normalizeZero(b[2].re)},${normalizeZero(b[2].im)}`
  );
}

/**
 * Returns a fresh shallow-cloned array of fresh `{ re, im }` complex objects.
 *
 * @param {readonly Complex[]} vec
 * @returns {Complex[]}
 */
function cloneVector3(vec) {
  return [
    { re: vec[0].re, im: vec[0].im },
    { re: vec[1].re, im: vec[1].im },
    { re: vec[2].re, im: vec[2].im },
  ];
}

/**
 * Computes the 3D complex cross product `a × b` using a precomputed Levi-Civita
 * index table and bounded LRU Map memoization.
 *
 * Formula:
 *   `[a1*b2 - a2*b1, a2*b0 - a0*b2, a0*b1 - a1*b0]`
 * where complex multiplication is `(x.re*y.re - x.im*y.im) + i(x.re*y.im + x.im*y.re)`.
 *
 * Always returns a freshly allocated length-3 array of `{ re, im }` objects so
 * caller mutations cannot corrupt the internal cache.
 *
 * @param {readonly Complex[]} a First 3D complex vector (length 3).
 * @param {readonly Complex[]} b Second 3D complex vector (length 3).
 * @returns {Complex[]} The 3D complex cross product `a × b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid complex elements.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite values.
 */
export function crossProductComplexMemo(a, b) {
  validateComplexVector3(a, 'a');
  validateComplexVector3(b, 'b');

  const key = buildCacheKey(a, b);
  const cached = memoCache.get(key);
  if (cached !== undefined) {
    // Refresh LRU recency
    memoCache.delete(key);
    memoCache.set(key, cached);
    return cloneVector3(cached);
  }

  const outRe = [0, 0, 0];
  const outIm = [0, 0, 0];

  for (let t = 0; t < LEVI_CIVITA_TABLE.length; t++) {
    const [k, i, j, sign] = LEVI_CIVITA_TABLE[t];
    const ai = a[i];
    const bj = b[j];
    const prodRe = ai.re * bj.re - ai.im * bj.im;
    const prodIm = ai.re * bj.im + ai.im * bj.re;
    outRe[k] += sign * prodRe;
    outIm[k] += sign * prodIm;
  }

  const stored = Object.freeze([
    Object.freeze({ re: normalizeZero(outRe[0]), im: normalizeZero(outIm[0]) }),
    Object.freeze({ re: normalizeZero(outRe[1]), im: normalizeZero(outIm[1]) }),
    Object.freeze({ re: normalizeZero(outRe[2]), im: normalizeZero(outIm[2]) }),
  ]);

  if (memoCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memoCache.keys().next().value;
    memoCache.delete(oldestKey);
  }
  memoCache.set(key, stored);

  return cloneVector3(stored);
}
