/**
 * Numerically robust IEEE-754 float64 arcsine implementation.
 *
 * Uses exact range reduction via the half-angle identity near |x| = 1,
 * error-free transformations (Knuth TwoSum and Dekker/Veltkamp TwoProd),
 * double-double compensated square root, and compensated Maclaurin series
 * summation with a rigorous geometric tail bound.
 *
 * Domain: [-1, 1] -> [-pi/2, pi/2]
 * - Non-number inputs throw TypeError.
 * - NaN and out-of-domain inputs (|x| > 1, including +/-Infinity) return NaN.
 * - Signed zero (+/-0) is preserved.
 */

// Double-double representation of pi / 2 (~109 bits of precision):
// PI_OVER_2_HI + PI_OVER_2_LO = pi/2 + O(1.5e-33)
const PI_OVER_2_HI = 1.5707963267948966; // Math.PI / 2
const PI_OVER_2_LO = 6.123233995736766e-17;

// Below 2^-27 (~7.45e-9), x^3 / 6 < 0.5 * ULP(x), so asin(x) rounds strictly to x.
const TINY_THRESHOLD = 2 ** -27;

// Veltkamp splitting factor 2^27 + 1 for exact IEEE-754 float64 TwoProd.
const VELTKAMP_SPLIT = 134217729;

// Convergence threshold for double-double series tail (~2^-106).
const DD_REL_TOL = 1e-32;

// Maximum series terms needed at t = 0.25 for full ~106-bit convergence.
const MAX_SERIES_TERMS = 60;

/**
 * Knuth's error-free TwoSum transformation.
 * Computes [s, err] such that s + err = a + b exactly in real arithmetic.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
  const s = a + b;
  const bb = s - a;
  const err = (a - (s - bb)) + (b - bb);
  return [s, err];
}

/**
 * Dekker/Veltkamp error-free TwoProd transformation.
 * Computes [p, err] such that p + err = a * b exactly in real arithmetic
 * (valid without overflow for |a|, |b| <= 2^995).
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProd(a, b) {
  const p = a * b;
  const ca = VELTKAMP_SPLIT * a;
  const aHi = ca - (ca - a);
  const aLo = a - aHi;
  const cb = VELTKAMP_SPLIT * b;
  const bHi = cb - (cb - b);
  const bLo = b - bHi;
  const err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
  return [p, err];
}

/**
 * Accurate double-double addition: (aHi + aLo) + (bHi + bLo).
 *
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddAdd(aHi, aLo, bHi, bLo) {
  const [sHi, sLo] = twoSum(aHi, bHi);
  const [tHi, tLo] = twoSum(aLo, bLo);
  const [cHi, cLo] = twoSum(sHi, sLo + tHi);
  return twoSum(cHi, cLo + tLo);
}

/**
 * Accurate double-double multiplication: (aHi + aLo) * (bHi + bLo).
 *
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} bHi
 * @param {number} bLo
 * @returns {[number, number]}
 */
function ddMul(aHi, aLo, bHi, bLo) {
  const [pHi, pLo] = twoProd(aHi, bHi);
  return twoSum(pHi, pLo + aHi * bLo + aLo * bHi);
}

/**
 * Accurate division of a double-double by an exact float64 scalar b != 0.
 *
 * @param {number} aHi
 * @param {number} aLo
 * @param {number} b
 * @returns {[number, number]}
 */
function ddDivScalar(aHi, aLo, b) {
  const q1 = aHi / b;
  const [pHi, pLo] = twoProd(q1, b);
  const [rHi, rLo] = twoSum(aHi, -pHi);
  const q2 = (rHi + (rLo + aLo - pLo)) / b;
  return twoSum(q1, q2);
}

// Precompute Maclaurin coefficients c_k = (2k)! / (4^k * (k!)^2 * (2k + 1))
// for k = 1..MAX_SERIES_TERMS in double-double precision via the exact recurrence
// b_0 = 1, b_k = b_{k-1} * (2k - 1) / (2k), c_k = b_k / (2k + 1).
const SERIES_C_HI = new Float64Array(MAX_SERIES_TERMS + 1);
const SERIES_C_LO = new Float64Array(MAX_SERIES_TERMS + 1);
{
  let bHi = 1;
  let bLo = 0;
  for (let k = 1; k <= MAX_SERIES_TERMS; k++) {
    [bHi, bLo] = ddMul(bHi, bLo, 2 * k - 1, 0);
    [bHi, bLo] = ddDivScalar(bHi, bLo, 2 * k);
    const [cHi, cLo] = ddDivScalar(bHi, bLo, 2 * k + 1);
    SERIES_C_HI[k] = cHi;
    SERIES_C_LO[k] = cLo;
  }
}

/**
 * Evaluates R(t) = (asin(sqrt(t)) - sqrt(t)) / sqrt(t) = sum_{k=1..inf} c_k * t^k
 * for 0 <= t <= 0.25 in double-double precision using compensated summation and
 * a geometric remainder bound.
 *
 * Since c_{k+1} < c_k for all k >= 1, the infinite tail after term k satisfies:
 *   0 < tail < (c_k * t^k) * t / (1 - t).
 *
 * @param {number} tHi
 * @param {number} tLo
 * @returns {[number, number]}
 */
function evalArcsinResidualDD(tHi, tLo) {
  let sumHi = 0;
  let sumLo = 0;
  let powHi = tHi;
  let powLo = tLo;
  const tailFactor = tHi / (1 - tHi);

  for (let k = 1; k <= MAX_SERIES_TERMS; k++) {
    const [termHi, termLo] = ddMul(SERIES_C_HI[k], SERIES_C_LO[k], powHi, powLo);
    [sumHi, sumLo] = ddAdd(sumHi, sumLo, termHi, termLo);

    if (termHi * tailFactor <= sumHi * DD_REL_TOL) {
      break;
    }

    [powHi, powLo] = ddMul(powHi, powLo, tHi, tLo);
  }

  return [sumHi, sumLo];
}

/**
 * Computes the principal arcsine of an IEEE-754 float64 number in radians,
 * returning a value in [-pi/2, pi/2].
 *
 * @param {number} x - Input value in [-1, 1].
 * @returns {number} arcsin(x) in radians, or NaN if x is NaN or |x| > 1.
 * @throws {TypeError} If x is not a JavaScript number.
 */
export function arcsinFloatStable(x) {
  if (typeof x !== 'number') {
    throw new TypeError(`arcsinFloatStable expects a number, got ${typeof x}`);
  }

  if (Number.isNaN(x) || x < -1 || x > 1) {
    return NaN;
  }

  // Preserve signed zero (+0 / -0) and exact tiny-argument behavior (including subnormals).
  const ax = Math.abs(x);
  if (ax < TINY_THRESHOLD) {
    return x;
  }

  // Exact endpoints |x| = 1.
  if (ax === 1) {
    return x < 0 ? -PI_OVER_2_HI : PI_OVER_2_HI;
  }

  let resHi;

  if (ax < 0.5) {
    // Direct evaluation: asin(ax) = ax + ax * R(ax^2), with exact t = ax^2.
    const [tHi, tLo] = twoProd(ax, ax);
    const [rHi, rLo] = evalArcsinResidualDD(tHi, tLo);
    const [xrHi, xrLo] = ddMul(ax, 0, rHi, rLo);
    [resHi] = ddAdd(ax, 0, xrHi, xrLo);
  } else {
    // Half-angle range reduction for 0.5 <= ax < 1 to avoid catastrophic
    // cancellation in 1 - x^2 near |x| = 1:
    //   asin(ax) = pi/2 - 2 * asin(sqrt((1 - ax) / 2))
    // By Sterbenz's lemma, (1 - ax) is exact in float64 for 0.5 <= ax < 1,
    // and halving is exact as well.
    const t = (1 - ax) * 0.5;

    // Double-double square root via one exact-residual Newton-Raphson step:
    // s = sqrt(t) = s0 + (t - s0^2) / (2 * s0)
    const s0 = Math.sqrt(t);
    const [sqHi, sqLo] = twoProd(s0, s0);
    const rem = (t - sqHi) - sqLo;
    const [sHi, sLo] = twoSum(s0, rem / (2 * s0));

    // Evaluate asin(s) = s + s * R(t) in double-double precision.
    const [rHi, rLo] = evalArcsinResidualDD(t, 0);
    const [srHi, srLo] = ddMul(sHi, sLo, rHi, rLo);
    const [asHi, asLo] = ddAdd(sHi, sLo, srHi, srLo);

    // Subtract 2 * asin(s) from pi/2 in double-double precision.
    [resHi] = ddAdd(PI_OVER_2_HI, PI_OVER_2_LO, -2 * asHi, -2 * asLo);
  }

  return x < 0 ? -resHi : resHi;
}
