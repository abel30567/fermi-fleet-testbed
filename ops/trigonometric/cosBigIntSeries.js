/**
 * @fileoverview Exact BigInt fixed-point cosine via Machin's formula and Maclaurin series.
 */

const SCALE_DIGITS = 18;
const SCALE = 10n ** 18n;
const BASE_WORK_DIGITS = 40;
const RANGE_GUARD_DIGITS = 8;
const MIDPOINT_EPSILON = 1000n;

/**
 * Cached highest-precision scaled value of π (`floor(π * 10^digits + 0.5)`).
 * @type {{ digits: number, value: bigint }}
 */
let piCache = { digits: 0, value: 0n };

/**
 * Round `numerator / divisor` to the nearest integer (half away from zero).
 * Assumes `divisor > 0n`.
 *
 * @param {bigint} numerator
 * @param {bigint} divisor
 * @returns {bigint}
 */
function divRound(numerator, divisor) {
  const half = divisor / 2n;
  if (numerator >= 0n) {
    return (numerator + half) / divisor;
  }
  return -((-numerator + half) / divisor);
}

/**
 * Compute `atan(1 / m) * scale` using the alternating Taylor series:
 * `atan(1/m) = Σ_{k=0}^∞ (-1)^k / ((2k + 1) * m^(2k + 1))`.
 *
 * @param {bigint} m - Positive integer denominator (`m >= 2n`).
 * @param {bigint} scale - Power-of-10 fixed-point scale.
 * @returns {bigint}
 */
function atanReciprocalScaled(m, scale) {
  const m2 = m * m;
  let power = scale / m;
  let sum = power;
  let k = 1n;

  while (power > 0n) {
    power /= m2;
    const term = power / (2n * k + 1n);
    if (term === 0n) {
      break;
    }
    if ((k & 1n) === 1n) {
      sum -= term;
    } else {
      sum += term;
    }
    k += 1n;
  }

  return sum;
}

/**
 * Compute `π * 10^digits` rounded to the nearest BigInt using Machin's formula:
 * `π / 4 = 4 * atan(1/5) - atan(1/239)`, i.e. `π = 16 * atan(1/5) - 4 * atan(1/239)`.
 * Results are cached monotonically so repeated calls reuse prior precision.
 *
 * @param {number} digits - Number of fractional decimal digits required (`>= 1`).
 * @returns {bigint}
 */
function getPiScaled(digits) {
  if (piCache.digits >= digits) {
    if (piCache.digits === digits) {
      return piCache.value;
    }
    const shift = 10n ** BigInt(piCache.digits - digits);
    return divRound(piCache.value, shift);
  }

  // Extra internal guard digits so series truncation error is negligible.
  const extraGuard = Math.max(12, Math.ceil(Math.log10(digits + 10)) + 8);
  const internalScale = 10n ** BigInt(digits + extraGuard);
  const piInternal =
    16n * atanReciprocalScaled(5n, internalScale) -
    4n * atanReciprocalScaled(239n, internalScale);

  const shift = 10n ** BigInt(extraGuard);
  const piRounded = divRound(piInternal, shift);

  piCache = { digits, value: piRounded };
  return piRounded;
}

/**
 * Evaluate `cos(u) * workScale` for `0 <= u <= (π/2) * workScale` via the
 * alternating Maclaurin series:
 * `cos(u) = Σ_{k=0}^∞ (-1)^k * u^(2k) / (2k)!`.
 *
 * @param {bigint} u - Reduced angle in `[0, π/2]` scaled by `workScale`.
 * @param {bigint} workScale - Power-of-10 working scale.
 * @returns {bigint}
 */
function cosMaclaurinScaled(u, workScale) {
  if (u === 0n) {
    return workScale;
  }

  const u2 = u * u;
  const workScale2 = workScale * workScale;
  let term = workScale;
  let sum = workScale;
  let k = 1n;

  while (true) {
    const denom = workScale2 * (2n * k - 1n) * (2n * k);
    term = (term * u2) / denom;
    if (term === 0n) {
      break;
    }
    if ((k & 1n) === 1n) {
      sum -= term;
    } else {
      sum += term;
    }
    k += 1n;
  }

  return sum;
}

/**
 * Compute `cos(x)` for an exact BigInt radian argument `x`, returning a
 * fixed-point BigInt scaled by `10n ** 18n` (`round(cos(x) * 10^18)`).
 *
 * Algorithm & Identities:
 * 1. Exact zero shortcut: `cos(0) = 1` (`10n ** 18n`).
 * 2. Even symmetry: `cos(-x) = cos(x)`, reducing to `|x| > 0`.
 * 3. High-precision `π` via Machin's formula:
 *    `π/4 = 4·atan(1/5) - atan(1/239)`, computed with `digits(|x|) + workDigits + 8`
 *    fractional digits so range reduction loses no precision even for huge `|x|`.
 * 4. Periodicity reduction modulo `2π` into `[-π, π]`:
 *    `k = floor((|x| + π) / (2π))`, `r = |x| - 2πk`, then `u = |r| ∈ [0, π]`.
 * 5. Quadrant reflection: for `u > π/2`, `cos(u) = -cos(π - u)`, reducing `u`
 *    into `[0, π/2]`.
 * 6. Maclaurin series evaluation:
 *    `cos(u) = Σ_{k=0}^∞ (-1)^k u^(2k) / (2k)!` at working precision, rounded
 *    to `10^18` (with automatic precision retry if near a rounding midpoint).
 *
 * @param {bigint} x - Exact integer angle in radians.
 * @returns {bigint} Fixed-point cosine `round(cos(x) * 10^18)`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function cosBigIntSeries(x) {
  if (typeof x !== 'bigint') {
    throw new TypeError(`Expected x to be a BigInt, got ${typeof x}`);
  }

  if (x === 0n) {
    return SCALE;
  }

  const absX = x < 0n ? -x : x;
  const xDigits = absX.toString().length;

  let workDigits = BASE_WORK_DIGITS;

  while (true) {
    const piDigits = xDigits + workDigits + RANGE_GUARD_DIGITS;
    const piHigh = getPiScaled(piDigits);
    const twoPiHigh = 2n * piHigh;
    const highScale = 10n ** BigInt(piDigits);

    // Reduce |x| modulo 2π into [-π, π] at high precision.
    const xHigh = absX * highScale;
    const k = (xHigh + piHigh) / twoPiHigh;
    const rHigh = xHigh - k * twoPiHigh;

    // Even symmetry: cos(-r) = cos(r) => uHigh in [0, π].
    let uHigh = rHigh < 0n ? -rHigh : rHigh;

    // Quadrant symmetry: cos(π - u) = -cos(u) => uHigh in [0, π/2].
    const halfPiHigh = piHigh / 2n;
    let sign = 1n;
    if (uHigh > halfPiHigh) {
      sign = -1n;
      uHigh = piHigh - uHigh;
    }

    // Scale reduced angle down to working precision 10^workDigits.
    const highToWorkShift = 10n ** BigInt(piDigits - workDigits);
    const uWork = divRound(uHigh, highToWorkShift);
    const workScale = 10n ** BigInt(workDigits);

    const cosWork = cosMaclaurinScaled(uWork, workScale);
    const downShift = 10n ** BigInt(workDigits - SCALE_DIGITS);
    const halfDown = downShift / 2n;
    const rem = cosWork % downShift;
    const distFromHalf = rem >= halfDown ? rem - halfDown : halfDown - rem;

    // Guard against table-maker's dilemma near half-integers.
    if (distFromHalf <= MIDPOINT_EPSILON) {
      workDigits += 24;
      continue;
    }

    const roundedMag = (cosWork + halfDown) / downShift;
    return sign < 0n ? -roundedMag : roundedMag;
  }
}
