/**
 * Fixed-point scale factor (10^18) for the returned tangent value.
 * @type {bigint}
 */
const SCALE = 10n ** 18n;

/**
 * Number of decimal fractional digits in SCALE.
 * @type {number}
 */
const SCALE_DIGITS = 18;

/**
 * Threshold factor 10^34 used to verify that range-reduction error amplified
 * by sec^2(u) remains far below 1 ULP at 10^18 scale.
 * @type {bigint}
 */
const POLE_SAFETY_FACTOR = 10n ** 34n;

/**
 * Threshold factor 10^12 used to detect near half-integer ties during final
 * rounding and trigger higher precision (resolving the table-maker's dilemma).
 * @type {bigint}
 */
const TIE_SAFETY_FACTOR = 10n ** 12n;

/**
 * Module-level cache for the highest-precision pi computed so far.
 * @type {{ digits: number, value: bigint }}
 */
let cachedPi = { digits: 0, value: 0n };

/**
 * Rounds the non-negative rational `numerator / denominator` to the nearest BigInt
 * (ties rounded away from zero).
 *
 * @param {bigint} numerator - Non-negative numerator.
 * @param {bigint} denominator - Strictly positive denominator.
 * @returns {bigint} Nearest BigInt to `numerator / denominator`.
 */
function divRoundNearest(numerator, denominator) {
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * Computes `atan(1 / m) * scale` using the alternating Taylor series:
 *   atan(1 / m) = sum_{j=0}^\infty (-1)^j / ((2j + 1) * m^(2j + 1)).
 *
 * @param {bigint} m - Integer reciprocal argument (`m >= 2n`).
 * @param {bigint} scale - Scaling factor `10n ** BigInt(digits)`.
 * @returns {bigint} Fixed-point approximation of `atan(1 / m) * scale`.
 */
function atanReciprocal(m, scale) {
  const m2 = m * m;
  let power = scale / m;
  let sum = power;
  let k = 1n;
  let sign = -1n;

  while (power !== 0n) {
    power /= m2;
    k += 2n;
    const term = power / k;
    if (term === 0n) {
      break;
    }
    sum += sign * term;
    sign = -sign;
  }

  return sum;
}

/**
 * Computes `pi * 10^digits` using Machin's formula:
 *   pi / 4 = 4 * atan(1/5) - atan(1/239)
 *   pi     = 16 * atan(1/5) - 4 * atan(1/239)
 * with extra guard digits so the returned integer is accurate to within ±1 ULP.
 *
 * @param {number} digits - Number of fractional decimal digits desired.
 * @returns {bigint} Fixed-point approximation of `pi * 10^digits`.
 */
function getPiScaled(digits) {
  if (cachedPi.digits === digits) {
    return cachedPi.value;
  }
  if (cachedPi.digits > digits) {
    const diffScale = 10n ** BigInt(cachedPi.digits - digits);
    return divRoundNearest(cachedPi.value, diffScale);
  }

  const guard = Math.max(12, Math.ceil(Math.log10(digits + 100)) + 10);
  const workScale = 10n ** BigInt(digits + guard);
  const piWork = 16n * atanReciprocal(5n, workScale) - 4n * atanReciprocal(239n, workScale);
  const guardScale = 10n ** BigInt(guard);
  const piScaled = divRoundNearest(piWork, guardScale);

  cachedPi = { digits, value: piScaled };
  return piScaled;
}

/**
 * Evaluates `sin(w)` and `cos(w)` simultaneously via their Maclaurin series:
 *   sin(w) = w - w^3/3! + w^5/5! - ...
 *   cos(w) = 1 - w^2/2! + w^4/4! - ...
 * for `0 <= w <= pi/4`, scaled by `one = 10^workDigits`.
 *
 * @param {bigint} w - Non-negative reduced angle scaled by `one`.
 * @param {bigint} one - Fixed-point unit `10n ** BigInt(workDigits)`.
 * @returns {{ sinVal: bigint, cosVal: bigint }} Scaled sine and cosine values.
 */
function sinCosSeries(w, one) {
  let sinVal = w;
  let cosVal = one;
  let term = w;
  let n = 1n;
  let sign = -1n;

  while (true) {
    n += 1n;
    term = (term * w) / (one * n);
    if (term === 0n) {
      break;
    }
    cosVal += sign * term;

    n += 1n;
    term = (term * w) / (one * n);
    if (term === 0n) {
      break;
    }
    sinVal += sign * term;

    sign = -sign;
  }

  return { sinVal, cosVal };
}

/**
 * Computes `tan(x)` for an exact BigInt integer `x` (in radians), returning a
 * fixed-point BigInt scaled by `10^18` (representing `round(tan(x) * 10^18)`).
 *
 * Algorithm & Mathematical Identities:
 * 1. Exact base case and odd symmetry:
 *      tan(0) = 0,   tan(-x) = -tan(x).
 * 2. High-precision pi via Machin's formula:
 *      pi = 16 * atan(1/5) - 4 * atan(1/239)
 *    evaluated with BigInt arctan series and sufficient guard digits for `|x|`.
 * 3. Range reduction modulo `pi` into `(-pi/2, pi/2)` using periodicity:
 *      tan(x) = tan(x - k * pi),   k = round(x / pi),
 *    followed by odd symmetry to map to `u = |x - k * pi| in [0, pi/2)`.
 * 4. Adaptive precision verification:
 *    Because `d(tan u)/du = sec^2(u) ~ 1 / (pi/2 - u)^2`, if `u` lies near the
 *    pole `pi/2` (or if the rounded result lies near a half-integer tie), the
 *    working precision is automatically increased until full 10^18 accuracy is
 *    guaranteed.
 * 5. Maclaurin series evaluation on `[0, pi/4]`:
 *    - If `u <= pi/4`, evaluate `tan(u) = sin(u) / cos(u)`.
 *    - If `u > pi/4`, set `v = pi/2 - u in (0, pi/4)` and use the co-function
 *      identity `tan(u) = cot(v) = cos(v) / sin(v)` to guarantee fast series
 *      convergence and avoid cancellation near `pi/2`.
 *
 * @param {bigint} x - Exact integer angle in radians.
 * @returns {bigint} Fixed-point BigInt representing `round(tan(x) * 10^18)`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function tanBigIntSeries(x) {
  if (typeof x !== 'bigint') {
    throw new TypeError(`Expected x to be a bigint, received ${x === null ? 'null' : typeof x}`);
  }

  if (x === 0n) {
    return 0n;
  }

  const inputNegative = x < 0n;
  const absX = inputNegative ? -x : x;
  const xDigits = absX.toString().length;

  let precision = SCALE_DIGITS + xDigits + 24;

  while (true) {
    const scaleP = 10n ** BigInt(precision);
    const piP = getPiScaled(precision);
    const xScaled = absX * scaleP;

    // Nearest integer multiple k of pi so r = x - k*pi lies in [-pi/2, pi/2].
    const k = divRoundNearest(xScaled, piP);
    const r = xScaled - k * piP;

    const rNegative = r < 0n;
    const u = rNegative ? -r : r;
    const halfPi = piP / 2n;
    const distToPole = halfPi - u;

    // Ensure range-reduction error amplified by sec^2(u) is negligible at 10^18 scale.
    if (distToPole <= 0n || distToPole * distToPole <= POLE_SAFETY_FACTOR * (k + 1n) * scaleP) {
      precision += Math.max(30, xDigits);
      continue;
    }

    const quarterPi = piP / 4n;
    const seriesGuard = 10;
    const guardMul = 10n ** BigInt(seriesGuard);
    const one = scaleP * guardMul;

    let numerator;
    let denominator;

    if (u <= quarterPi) {
      const { sinVal, cosVal } = sinCosSeries(u * guardMul, one);
      numerator = sinVal;
      denominator = cosVal;
    } else {
      // tan(u) = cot(pi/2 - u) = cos(v) / sin(v), with v in (0, pi/4)
      const v = halfPi - u;
      const { sinVal, cosVal } = sinCosSeries(v * guardMul, one);
      numerator = cosVal;
      denominator = sinVal;
    }

    // Scale to 10^18 and verify we are not near a half-integer rounding tie.
    const scaledNum = numerator * SCALE;
    const quotient = scaledNum / denominator;
    const remainder = scaledNum % denominator;
    const twiceRem = 2n * remainder;
    const tieGap = twiceRem >= denominator ? twiceRem - denominator : denominator - twiceRem;

    if (tieGap * TIE_SAFETY_FACTOR < denominator) {
      precision += 30;
      continue;
    }

    const magnitude = twiceRem >= denominator ? quotient + 1n : quotient;
    const isNegative = inputNegative !== rNegative;

    return isNegative && magnitude !== 0n ? -magnitude : magnitude;
  }
}
