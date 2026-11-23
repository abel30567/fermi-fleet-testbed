/**
 * Veltkamp splitting constant (2^27 + 1) for exact IEEE 754 binary64 TwoProd.
 * @type {number}
 */
const VELTKAMP_SPLIT = 134217729;

/**
 * Safe magnitude threshold below which Veltkamp splitting and TwoProd
 * intermediate products cannot overflow IEEE 754 binary64 (~1.797e308).
 * @type {number}
 */
const SPLIT_SAFE_LIMIT = 1e290;
const PROD_SAFE_LIMIT = 1e300;

/**
 * Computes the exact rounding error `e` of `a * b = p + e` using Veltkamp
 * splitting and Dekker's TwoProd error-free transformation.
 *
 * @param {number} a - First finite factor.
 * @param {number} b - Second finite factor.
 * @param {number} p - IEEE 754 product `a * b`.
 * @returns {number} Rounding error `e` such that `p + e === a * b` in exact arithmetic.
 */
function twoProdError(a, b, p) {
  if (
    Math.abs(a) >= SPLIT_SAFE_LIMIT ||
    Math.abs(b) >= SPLIT_SAFE_LIMIT ||
    Math.abs(p) >= PROD_SAFE_LIMIT
  ) {
    return 0;
  }

  const ca = VELTKAMP_SPLIT * a;
  const aHi = ca - (ca - a);
  const aLo = a - aHi;

  const cb = VELTKAMP_SPLIT * b;
  const bHi = cb - (cb - b);
  const bLo = b - bHi;

  return ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
}

/**
 * Computes the dot product of two equal-length `Float64Array` vectors using
 * the Ogita–Rump–Oishi `Dot2` compensated series summation algorithm
 * (Dekker's TwoProd error-free product transformation paired with
 * Kahan–Babuška–Neumaier FastTwoSum error-free series accumulation).
 *
 * For inputs `a` and `b` of length `n`, evaluates:
 *   `sum_{i=0}^{n-1} a[i] * b[i]`
 * with double-double-like intermediate accuracy for well- and moderately
 * ill-conditioned series, while preserving standard IEEE 754 propagation for
 * `NaN` and `±Infinity`. Returns `0` for empty `Float64Array` inputs.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector (must have the same length as `a`).
 * @returns {number} Scalar dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function dotProductTypedSeries(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('Expected first argument "a" to be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Expected second argument "b" to be a Float64Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
    );
  }

  const len = a.length;
  if (len === 0) {
    return 0;
  }

  let sum = 0;
  let corr = 0;

  for (let i = 0; i < len; i += 1) {
    const ai = a[i];
    const bi = b[i];
    const p = ai * bi;
    const t = sum + p;

    if (Number.isFinite(t)) {
      const sErr = Math.abs(sum) >= Math.abs(p)
        ? (sum - t) + p
        : (p - t) + sum;
      const pErr = twoProdError(ai, bi, p);
      sum = t;
      corr += sErr + pErr;
    } else {
      sum = t;
      corr = 0;
    }
  }

  const result = sum + corr;
  return result === 0 ? 0 : result;
}
