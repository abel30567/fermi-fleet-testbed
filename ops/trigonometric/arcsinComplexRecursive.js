/**
 * Recursive / divide-and-conquer implementation of the complex inverse sine
 * (principal value of arcsin(z)) for complex numbers represented as `{ re, im }`.
 *
 * Algorithm:
 *   Uses recursive half-angle argument reduction derived from the exact
 *   trigonometric identity:
 *     arcsin(z) = 2 * arcsin(z / sqrt(2 * (1 + sqrt(1 - z^2))))
 *   On the principal strip Re(w) in [-pi/2, pi/2], Re(cos(w)) = Re(sqrt(1 - z^2)) >= 0
 *   everywhere, so 1 + sqrt(1 - z^2) stays strictly in the right half-plane
 *   (Re >= 1) with no cancellation. Each recursive step reduces |z| by at least
 *   a factor of 1/sqrt(2) (and takes a square root of |z| when |z| is large),
 *   reaching the base-case disk |z| <= 0.05 in at most ~16 recursive steps for
 *   any finite IEEE 754 double-precision input.
 *
 *   In the base case (|z| <= 0.05), arcsin(z) = z * P(z^2) is evaluated via
 *   a recursive Horner evaluation of the Maclaurin polynomial through degree 17,
 *   achieving full double-precision accuracy.
 *
 *   To avoid catastrophic cancellation near z = +-1 and along the imaginary
 *   axis, sqrt(1 - z^2) is factored as sqrt(1 - z) * sqrt(1 + z) with the exact
 *   imaginary-part relation u * v = -x * y when Re(sqrt(1 - z^2)) dominates.
 *   For |z| > 1e50, inputs are scaled by max(|re|, |im|) to prevent overflow
 *   all the way up to Number.MAX_VALUE.
 *
 * Branch cut conventions:
 *   - Principal strip: Re(arcsin(z)) in [-pi/2, pi/2].
 *   - Branch cuts along (-Infinity, -1) and (1, +Infinity) on the real axis.
 *   - On the branch cuts (|re| > 1, im = 0), values are continuous from the
 *     upper half-plane (im -> 0+):
 *       arcsin(x + 0i) = sign(x) * (pi / 2) + i * arccosh(|x|)
 *     matching C99/IEEE 754 casin(x + 0i) and Python cmath.asin.
 *   - Negative zero (-0) components are normalized to 0.
 */

// Base-case radius threshold for switching from half-angle reduction to series.
const BASE_RADIUS_SQ = 0.05 * 0.05;

// Below this squared modulus, |z^2 / 6| < 1e-18 << Number.EPSILON, so arcsin(z) = z.
const TINY_RADIUS_SQ = 1e-17;

// Scale threshold to prevent intermediate overflow in 1 +- z for huge |z|.
const LARGE_SCALE_THRESHOLD = 1e50;

// Exact Maclaurin coefficients for arcsin(z) = z * sum_{n=0}^8 c_n * (z^2)^n,
// where c_0 = 1 and c_n = c_{n-1} * (2n - 1)^2 / (2n * (2n + 1)).
const SERIES_COEFFS = [
  1,
  1 / 6,
  3 / 40,
  5 / 112,
  35 / 1152,
  63 / 2816,
  231 / 13312,
  143 / 10240,
  6435 / 557056,
];

/**
 * Normalizes -0 to 0 while leaving all other numbers unchanged.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Principal complex square root of (a + i*b) with Re >= 0, overflow-safe.
 * When `negImagOnCut` is true and a < 0, b === 0, takes the lower-half-plane
 * branch -i * sqrt(-a) (used for sqrt(1 - z) along the cut x > 1, y = +0).
 *
 * @param {number} a
 * @param {number} b
 * @param {boolean} negImagOnCut
 * @returns {{ re: number, im: number }}
 */
function complexSqrt(a, b, negImagOnCut) {
  if (a === 0 && b === 0) {
    return { re: 0, im: 0 };
  }
  const r = Math.hypot(a, b);
  if (a >= 0) {
    const u = Math.sqrt(0.5 * r + 0.5 * a);
    const v = (0.5 * b) / u;
    return { re: u, im: v };
  }
  const vMag = Math.sqrt(0.5 * r - 0.5 * a);
  const sign = b < 0 || (b === 0 && negImagOnCut) ? -1 : 1;
  const u = (0.5 * Math.abs(b)) / vMag;
  return { re: u, im: sign * vMag };
}

/**
 * Overflow-safe complex division (a + i*b) / (c + i*d) via Smith's algorithm.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {{ re: number, im: number }}
 */
function complexDiv(a, b, c, d) {
  if (Math.abs(c) >= Math.abs(d)) {
    const t = d / c;
    const denom = c + d * t;
    return {
      re: (a + b * t) / denom,
      im: (b - a * t) / denom,
    };
  }
  const t = c / d;
  const denom = d + c * t;
  return {
    re: (a * t + b) / denom,
    im: (b * t - a) / denom,
  };
}

/**
 * Computes sqrt(1 - z^2) with Re >= 0, free of cancellation near z = +-1 and
 * along the imaginary axis, matching the upper half-plane limit on branch cuts.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{ re: number, im: number }}
 */
function sqrtOneMinusZ2(x, y) {
  const s1 = complexSqrt(1 - x, -y, y === 0 && x > 1);
  const s2 = complexSqrt(1 + x, y, false);

  // s1.re * s2.re >= 0 and -s1.im * s2.im >= 0 always (zero cancellation).
  const u = s1.re * s2.re - s1.im * s2.im;
  const vDirect = s1.re * s2.im + s1.im * s2.re;

  // When u > |vDirect|, use 2*u*v = -2*x*y => v = -x*y / u for full precision.
  const v = u > Math.abs(vDirect) ? (-x * y) / u : vDirect;
  return { re: u, im: v };
}

/**
 * Computes one half-angle reduction step z_half = z / sqrt(2 * (1 + sqrt(1 - z^2))).
 * Uses scaled arithmetic when max(|x|, |y|) > LARGE_SCALE_THRESHOLD to avoid overflow.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{ re: number, im: number }}
 */
function halfAngleStep(x, y) {
  const s = Math.max(Math.abs(x), Math.abs(y));
  if (s > LARGE_SCALE_THRESHOLD) {
    const invS = 1 / s;
    const xh = x / s;
    const yh = y / s;

    const s1 = complexSqrt(invS - xh, -yh, y === 0 && x > 1);
    const s2 = complexSqrt(invS + xh, yh, false);

    const u = s1.re * s2.re - s1.im * s2.im;
    const vDirect = s1.re * s2.im + s1.im * s2.re;
    const v = u > Math.abs(vDirect) ? (-xh * yh) / u : vDirect;

    const denom = complexSqrt(2 * (invS + u), 2 * v, false);
    const q = complexDiv(xh, yh, denom.re, denom.im);
    const scale = Math.sqrt(s);
    return { re: q.re * scale, im: q.im * scale };
  }

  const root = sqrtOneMinusZ2(x, y);
  const denom = complexSqrt(2 * (1 + root.re), 2 * root.im, false);
  return complexDiv(x, y, denom.re, denom.im);
}

/**
 * Recursively evaluates the Maclaurin polynomial P(w) = sum_{n=idx}^8 c_n * w^(n-idx)
 * using Horner's method.
 *
 * @param {{ re: number, im: number }} w
 * @param {number} idx
 * @returns {{ re: number, im: number }}
 */
function evalSeriesHornerRecursive(w, idx) {
  const c = SERIES_COEFFS[idx];
  if (idx === SERIES_COEFFS.length - 1) {
    return { re: c, im: 0 };
  }
  const tail = evalSeriesHornerRecursive(w, idx + 1);
  return {
    re: c + (w.re * tail.re - w.im * tail.im),
    im: w.re * tail.im + w.im * tail.re,
  };
}

/**
 * Recursive core for arcsin(x + i*y) using divide-and-conquer half-angle reduction.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{ re: number, im: number }}
 */
function arcsinRecursiveCore(x, y) {
  const magSq = x * x + y * y;

  if (magSq <= TINY_RADIUS_SQ) {
    return { re: x, im: y };
  }

  if (magSq <= BASE_RADIUS_SQ) {
    const w = { re: x * x - y * y, im: 2 * x * y };
    const p = evalSeriesHornerRecursive(w, 0);
    return {
      re: x * p.re - y * p.im,
      im: x * p.im + y * p.re,
    };
  }

  const zHalf = halfAngleStep(x, y);
  const halfAngle = arcsinRecursiveCore(zHalf.re, zHalf.im);
  return {
    re: 2 * halfAngle.re,
    im: 2 * halfAngle.im,
  };
}

/**
 * Computes the principal value of the complex inverse sine arcsin(z) using a
 * recursive half-angle divide-and-conquer algorithm with a recursive Horner
 * Maclaurin series base case.
 *
 * @param {{ re: number, im: number }} z - Complex input with finite real parts `re` and `im`.
 * @returns {{ re: number, im: number }} Principal value of arcsin(z) with Re in [-pi/2, pi/2].
 * @throws {TypeError} If `z` is not a non-null non-array object or if `z.re` / `z.im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is NaN or infinite.
 */
export function arcsinComplexRecursive(z) {
  if (typeof z !== 'object' || z === null || Array.isArray(z)) {
    throw new TypeError('Expected complex number object { re, im }');
  }
  if (typeof z.re !== 'number' || typeof z.im !== 'number') {
    throw new TypeError('Complex number components re and im must be numbers');
  }
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
    throw new RangeError('Complex number components re and im must be finite numbers');
  }

  const x = normalizeZero(z.re);
  const y = normalizeZero(z.im);

  const result = arcsinRecursiveCore(x, y);
  return {
    re: normalizeZero(result.re),
    im: normalizeZero(result.im),
  };
}
