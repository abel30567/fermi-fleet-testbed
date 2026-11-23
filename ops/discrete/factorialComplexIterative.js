/**
 * Computes the factorial of a complex number `z = { re, im }`, defined via
 * Euler's Gamma function as `z! = Gamma(z + 1)`.
 *
 * Uses a straightforward iterative product for non-negative integers and an
 * iterative Lanczos approximation (g = 7, n = 9) evaluated in log-space for
 * general complex inputs, combined with Euler's reflection formula for
 * `Re(z) < -0.5`.
 *
 * @param {{ re: number, im: number }} z - Complex input `{ re, im }` with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Complex result `{ re, im }` equal to `z!`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is non-finite (`NaN`, `±Infinity`), or if `z` is a negative integer (pole of `Gamma(z + 1)`).
 */

const LANCZOS_G = 7;
const LANCZOS_COEFFS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

const HALF_LOG_TWO_PI = 0.5 * Math.log(2 * Math.PI);
const LOG_PI = Math.log(Math.PI);
const LOG_TWO = Math.log(2);

/**
 * Normalizes `-0` to `0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Complex multiplication: a * b.
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function cMul(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

/**
 * Complex natural logarithm (principal branch): ln(z).
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function cLog(z) {
  return {
    re: Math.log(Math.hypot(z.re, z.im)),
    im: Math.atan2(z.im, z.re),
  };
}

/**
 * Complex exponential: exp(z).
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function cExp(z) {
  const r = Math.exp(z.re);
  const c = Math.cos(z.im);
  const s = Math.sin(z.im);
  return {
    re: normalizeZero(r === 0 ? 0 : r * c),
    im: normalizeZero(r === 0 ? 0 : r * s),
  };
}

/**
 * Iterative Lanczos approximation for real `ln(Gamma(w))` with `w >= 0.5`.
 * @param {number} w
 * @returns {number}
 */
function lanczosLogGammaReal(w) {
  const u = w - 1;
  let sum = LANCZOS_COEFFS[0];
  for (let k = 1; k < LANCZOS_COEFFS.length; k++) {
    sum += LANCZOS_COEFFS[k] / (u + k);
  }
  const t = u + LANCZOS_G + 0.5;
  return HALF_LOG_TWO_PI + (u + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Iterative Lanczos approximation for complex `ln(Gamma(w))` with `Re(w) >= 0.5`.
 * @param {{ re: number, im: number }} w
 * @returns {{ re: number, im: number }}
 */
function lanczosLogGammaComplex(w) {
  const uRe = w.re - 1;
  const uIm = w.im;

  let sumRe = LANCZOS_COEFFS[0];
  let sumIm = 0;

  for (let k = 1; k < LANCZOS_COEFFS.length; k++) {
    const dRe = uRe + k;
    const dIm = uIm;
    const denom = dRe * dRe + dIm * dIm;
    const coeff = LANCZOS_COEFFS[k];
    sumRe += (coeff * dRe) / denom;
    sumIm -= (coeff * dIm) / denom;
  }

  const t = { re: uRe + LANCZOS_G + 0.5, im: uIm };
  const logT = cLog(t);
  const powerTerm = cMul({ re: uRe + 0.5, im: uIm }, logT);
  const logSum = cLog({ re: sumRe, im: sumIm });

  return {
    re: HALF_LOG_TWO_PI + powerTerm.re - t.re + logSum.re,
    im: powerTerm.im - t.im + logSum.im,
  };
}

/**
 * Computes `ln(sin(pi * w))` (up to an integer multiple of `2 * pi * i`)
 * for complex `w` away from real integers, avoiding overflow for large `|Im(w)|`.
 * @param {{ re: number, im: number }} w
 * @returns {{ re: number, im: number }}
 */
function lnSinPiComplex(w) {
  const n = Math.round(w.re);
  const f = w.re - n;
  const a = Math.PI * f;
  const b = Math.PI * w.im;
  const isOdd = Math.abs(n % 2) === 1;

  if (Math.abs(b) <= 20) {
    let sinA;
    let cosA;
    if (f === 0) {
      sinA = 0;
      cosA = 1;
    } else if (Math.abs(f) === 0.5) {
      sinA = f > 0 ? 1 : -1;
      cosA = 0;
    } else {
      sinA = Math.sin(a);
      cosA = Math.cos(a);
    }

    let re = sinA * Math.cosh(b);
    let im = cosA * Math.sinh(b);
    if (isOdd) {
      re = -re;
      im = -im;
    }
    return cLog({ re, im });
  }

  // Asymptotic branch for |b| > 20 prevents cosh/sinh overflow.
  // sin(a + i*b) = (i/2) * exp(b - i*a) * (1 - exp(-2b + 2i*a))   for b > 0
  //              = (-i/2) * exp(-b + i*a) * (1 - exp(2b - 2i*a))  for b < 0
  const absB = Math.abs(b);
  const signB = b > 0 ? 1 : -1;
  const corrMag = Math.exp(-2 * absB);
  const corrAngle = 2 * signB * a;
  const corrLog = cLog({
    re: 1 - corrMag * Math.cos(corrAngle),
    im: -corrMag * Math.sin(corrAngle),
  });

  const re = absB - LOG_TWO + corrLog.re;
  let im = signB * (Math.PI / 2 - a) + corrLog.im;
  if (isOdd) {
    im += Math.PI;
  }
  return { re, im };
}

/**
 * Evaluates `z! = Gamma(z + 1)` for a complex number `z = { re, im }`.
 *
 * @param {{ re: number, im: number }} z - Complex number `{ re, im }`.
 * @returns {{ re: number, im: number }} Complex factorial `{ re, im }`.
 */
export function factorialComplexIterative(z) {
  if (z === null || typeof z !== 'object') {
    throw new TypeError('Expected complex input z to be an object { re, im }');
  }
  if (typeof z.re !== 'number' || typeof z.im !== 'number') {
    throw new TypeError('Expected z.re and z.im to be numbers');
  }
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
    throw new RangeError('Expected z.re and z.im to be finite numbers');
  }

  const re = z.re;
  const im = z.im;

  if (im === 0) {
    if (Number.isInteger(re)) {
      if (re < 0) {
        throw new RangeError(
          `Complex factorial has a pole at negative integer z = ${re}`
        );
      }
      // Straightforward iterative factorial for non-negative integers.
      let acc = 1;
      for (let k = 2; k <= re; k++) {
        acc *= k;
        if (!Number.isFinite(acc)) {
          break;
        }
      }
      return { re: acc, im: 0 };
    }

    const w = re + 1;
    if (w >= 0.5) {
      return { re: Math.exp(lanczosLogGammaReal(w)), im: 0 };
    }

    // Real Euler reflection formula: Gamma(w) = pi / (sin(pi * w) * Gamma(1 - w))
    const n = Math.round(w);
    const f = w - n;
    let sinPiW = Math.abs(f) === 0.5 ? (f > 0 ? 1 : -1) : Math.sin(Math.PI * f);
    if (Math.abs(n % 2) === 1) {
      sinPiW = -sinPiW;
    }
    const sign = sinPiW < 0 ? -1 : 1;
    const logAbs = LOG_PI - Math.log(Math.abs(sinPiW)) - lanczosLogGammaReal(1 - w);
    return { re: normalizeZero(sign * Math.exp(logAbs)), im: 0 };
  }

  // General complex case: z! = Gamma(w) where w = z + 1.
  const w = { re: re + 1, im };
  if (w.re >= 0.5) {
    return cExp(lanczosLogGammaComplex(w));
  }

  // Complex Euler reflection formula in log-space:
  // ln(Gamma(w)) = ln(pi) - ln(sin(pi * w)) - ln(Gamma(1 - w))
  const lnSin = lnSinPiComplex(w);
  const lnGammaReflected = lanczosLogGammaComplex({ re: 1 - w.re, im: -w.im });
  return cExp({
    re: LOG_PI - lnSin.re - lnGammaReflected.re,
    im: -lnSin.im - lnGammaReflected.im,
  });
}
