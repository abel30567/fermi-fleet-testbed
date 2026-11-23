/**
 * High-order IEEE-754 float64 split of pi and pi/2 so that:
 *   PI_HI + PI_LO   === pi   (to ~106 bits)
 *   PIO2_HI + PIO2_LO === pi/2 (to ~106 bits)
 */
const PI_HI = Math.PI;
const PI_LO = 1.2246467991473532e-16;
const PIO2_HI = Math.PI / 2;
const PIO2_LO = 6.123233995736766e-17;

/** Maximum iterations for the arcsin Maclaurin series on |t| <= 0.5. */
const MAX_SERIES_TERMS = 64;

/** Relative convergence threshold well below float64 machine epsilon (2.22e-16). */
const CONVERGENCE_TOL = 1e-18;

/**
 * Evaluates the Maclaurin series tail of arcsin(t) - t for |t| <= 0.5:
 *
 *   arcsin(t) - t = sum_{n=1}^{infinity} [ (2n - 1)!! / ((2n)!! * (2n + 1)) ] * t^(2n + 1)
 *
 * Uses Neumaier compensated summation to prevent floating-point rounding drift.
 * Because |t| <= 0.5, t^2 <= 0.25 and consecutive terms decrease by more than
 * a factor of 4, converging to full IEEE-754 float64 precision in <= 28 terms.
 *
 * @param {number} t - Reduced argument with |t| <= 0.5.
 * @returns {number} Value of arcsin(t) - t.
 */
function arcsinTailSeries(t) {
  const t2 = t * t;
  let coeff = t;
  let sum = 0;
  let comp = 0;

  for (let n = 1; n <= MAX_SERIES_TERMS; n += 1) {
    coeff *= ((2 * n - 1) / (2 * n)) * t2;
    const term = coeff / (2 * n + 1);

    const next = sum + term;
    if (Math.abs(sum) >= Math.abs(term)) {
      comp += (sum - next) + term;
    } else {
      comp += (term - next) + sum;
    }
    sum = next;

    if (Math.abs(term) <= Math.abs(t) * CONVERGENCE_TOL) {
      break;
    }
  }

  return sum + comp;
}

/**
 * Computes the principal value of the inverse cosine (arccosine), arccos(x),
 * over IEEE-754 float64 Numbers using trigonometric range-reduction identities
 * and the Maclaurin series for arcsin, without delegating to Math.acos/asin/atan.
 *
 * Range-reduction identities (all reduced arguments satisfy |t| <= 0.5):
 * - |x| <= 0.5: arccos(x) = pi/2 - arcsin(x)
 * -  x  >  0.5: arccos(x) = 2 * arcsin(sqrt((1 - x) / 2))
 * -  x  < -0.5: arccos(x) = pi - 2 * arcsin(sqrt((1 + x) / 2))
 *
 * Domain: finite IEEE-754 float64 numbers x in [-1, 1].
 * Range:  [0, pi] radians.
 *
 * @param {number} x - Input cosine value in [-1, 1].
 * @returns {number} The principal arccosine of x in radians, in [0, pi].
 * @throws {TypeError} If x is not a number.
 * @throws {RangeError} If x is NaN, infinite, or outside [-1, 1].
 *
 * @example
 * arccosFloatSeries(1);    // 0
 * arccosFloatSeries(0.5);  // ~1.0471975511965979 (pi / 3)
 * arccosFloatSeries(0);    // ~1.5707963267948966 (pi / 2)
 * arccosFloatSeries(-1);   // ~3.141592653589793  (pi)
 */
export function arccosFloatSeries(x) {
  if (typeof x !== 'number') {
    throw new TypeError(`arccosFloatSeries expects a number, received ${typeof x}`);
  }
  if (!Number.isFinite(x)) {
    throw new RangeError(`arccosFloatSeries expects a finite number in [-1, 1], received ${x}`);
  }
  if (x < -1 || x > 1) {
    throw new RangeError(`arccosFloatSeries input ${x} is outside the valid domain [-1, 1]`);
  }

  if (x === 1) {
    return 0;
  }
  if (x === -1) {
    return PI_HI;
  }
  if (x === 0) {
    return PIO2_HI;
  }

  if (x > 0.5) {
    const t = Math.sqrt((1 - x) / 2);
    const tail = arcsinTailSeries(t);
    return 2 * (t + tail);
  }

  if (x < -0.5) {
    const t = Math.sqrt((1 + x) / 2);
    const tail = arcsinTailSeries(t);
    return PI_HI - (2 * t + (2 * tail - PI_LO));
  }

  const tail = arcsinTailSeries(x);
  return PIO2_HI - (x + (tail - PIO2_LO));
}
