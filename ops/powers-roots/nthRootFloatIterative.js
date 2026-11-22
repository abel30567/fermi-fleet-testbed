/**
 * @fileoverview Iterative n-th root implementation over IEEE-754 float64 Numbers.
 */

const MAX_ITERATIONS = 100;
const MIN_NORMAL_FLOAT64 = 2.2250738585072014e-308;
const SUBNORMAL_SCALE = 2 ** 54;

const floatBuf = new ArrayBuffer(8);
const floatView = new Float64Array(floatBuf);
const uintView = new BigUint64Array(floatBuf);

/**
 * Decomposes a positive finite float64 value into `mantissa * 2^exp`
 * with `mantissa` in `[1, 2)` and integer `exp` in `[-1074, 1023]`.
 *
 * @param {number} value - Positive finite non-zero float64 number.
 * @returns {{ mantissa: number, exp: number }} Exact binary decomposition.
 */
function frexp2(value) {
  let v = value;
  let expOffset = 0;

  if (v < MIN_NORMAL_FLOAT64) {
    v *= SUBNORMAL_SCALE;
    expOffset = -54;
  }

  floatView[0] = v;
  const bits = uintView[0];
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const exp = rawExp - 1023 + expOffset;

  uintView[0] = (bits & 0x000fffffffffffffn) | 0x3ff0000000000000n;
  const mantissa = floatView[0];

  return { mantissa, exp };
}

/**
 * Computes `base` raised to a non-negative safe integer `exp` iteratively
 * via exponentiation by squaring.
 *
 * @param {number} base - Finite float64 base.
 * @param {number} exp - Non-negative safe integer exponent.
 * @returns {number} `base^exp`.
 */
function powInt(base, exp) {
  let result = 1;
  let factor = base;
  let e = exp;

  while (e > 0) {
    if (e % 2 === 1) {
      result *= factor;
    }
    e = Math.floor(e / 2);
    if (e > 0) {
      factor *= factor;
    }
  }

  return result;
}

/**
 * Computes the positive real `k`-th root of a positive finite number `absX`
 * using exponent scaling and Newton-Raphson iteration:
 * `y_{j+1} = ((k - 1) * y_j + s / y_j^(k - 1)) / k = y_j + (s / y_j^(k - 1) - y_j) / k`.
 *
 * @param {number} absX - Positive finite number (`absX > 0`, `absX !== 1`).
 * @param {number} k - Positive safe integer root degree (`k >= 2`).
 * @returns {number} Positive real `k`-th root of `absX`.
 */
function positiveNthRoot(absX, k) {
  const { mantissa, exp } = frexp2(absX);

  // Split exp = q * k + rem using truncation toward zero so |rem| < k.
  // Whenever q !== 0, |rem| <= 536, keeping scaledX strictly normal.
  const q = Math.trunc(exp / k);
  const rem = exp - q * k;
  const scaledX = q === 0 ? absX : mantissa * (2 ** rem);

  // Safe initial guess approximating 2^((rem + log2(mantissa)) / k) in (0.5, 2).
  const t = (rem + (mantissa - 1)) / k;
  const u = t * Math.LN2;
  let y = 1 + u * (1 + u * (0.5 + u * (1 / 6 + u * (1 / 24 + u / 120))));

  // Split (k - 1) into two halves so y^a and y^b stay well inside float64 range
  // even when scaledX is near Number.MAX_VALUE or Number.MIN_VALUE.
  const a = Math.floor((k - 1) / 2);
  const b = (k - 1) - a;

  let prevY = NaN;
  for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
    const term = (scaledX / powInt(y, a)) / powInt(y, b);
    const delta = (term - y) / k;
    const nextY = y + delta;

    if (nextY === y || nextY === prevY) {
      y = nextY;
      break;
    }

    prevY = y;
    y = nextY;
  }

  return q === 0 ? y : y * (2 ** q);
}

/**
 * Computes the real `n`-th root of `x` (`x^(1/n)`) over IEEE-754 float64 Numbers
 * using a straightforward iterative Newton-Raphson method with power-of-two scaling.
 *
 * Supports positive and negative non-zero safe integer degrees `n`, negative radicands `x`
 * when `n` is odd, signed zeros, infinities, and the full float64 dynamic range
 * (including subnormals and values near `Number.MAX_VALUE`).
 *
 * @param {number} x - Radicand (IEEE-754 float64 Number).
 * @param {number} n - Non-zero safe integer root degree (`n !== 0`).
 * @returns {number} Real `n`-th root of `x`, or `NaN` if `x` is `NaN`.
 * @throws {TypeError} If `x` or `n` is not a JavaScript `number`.
 * @throws {RangeError} If `n` is zero, non-integer, non-finite, or outside safe integer range.
 * @throws {RangeError} If `x < 0` and `n` is even (no real root).
 * @throws {RangeError} If `x === 0` and `n < 0` (division by zero).
 */
export function nthRootFloatIterative(x, n) {
  if (typeof x !== 'number') {
    throw new TypeError(`Expected x to be a number, got ${typeof x}`);
  }
  if (typeof n !== 'number') {
    throw new TypeError(`Expected n to be a number, got ${typeof n}`);
  }
  if (!Number.isSafeInteger(n) || n === 0) {
    throw new RangeError(`Expected n to be a non-zero safe integer, got ${n}`);
  }

  if (Number.isNaN(x)) {
    return NaN;
  }

  const isEven = n % 2 === 0;
  if (x < 0 && isEven) {
    throw new RangeError(`Cannot compute an even root (n=${n}) of a negative number (${x})`);
  }

  if (x === 0) {
    if (n < 0) {
      throw new RangeError(`Cannot compute a negative root (n=${n}) of zero`);
    }
    return Object.is(x, -0) && !isEven ? -0 : 0;
  }

  if (!Number.isFinite(x)) {
    if (n > 0) {
      return x;
    }
    return x < 0 ? -0 : 0;
  }

  const negative = x < 0;
  const absX = negative ? -x : x;
  const k = Math.abs(n);

  if (k === 1) {
    return n > 0 ? x : 1 / x;
  }

  if (absX === 1) {
    return negative ? -1 : 1;
  }

  const root = positiveNthRoot(absX, k);
  const magnitude = n > 0 ? root : 1 / root;
  return negative ? -magnitude : magnitude;
}
