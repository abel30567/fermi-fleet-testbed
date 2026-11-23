/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of arbitrary-precision
 * decimal strings using exact BigInt arithmetic and iterative Newton-Raphson
 * square root.
 *
 * @module ops/vector/magnitudeDecimalIterative
 */

const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parses a validated decimal string into an exact unsigned BigInt significand
 * and base-10 exponent such that `|value| = coeff * 10^exp`.
 *
 * @param {string} str - Validated decimal string.
 * @returns {{ coeff: bigint, exp: number }}
 */
function parseDecimalMagnitude(str) {
  const unsigned =
    str[0] === '+' || str[0] === '-' ? str.slice(1) : str;

  let mantissa = unsigned;
  let sciExp = 0;
  const eIdx = unsigned.search(/[eE]/);
  if (eIdx !== -1) {
    mantissa = unsigned.slice(0, eIdx);
    const expStr = unsigned.slice(eIdx + 1);
    sciExp = Number(expStr);
    if (!Number.isSafeInteger(sciExp)) {
      throw new RangeError(`Exponent out of safe integer range: "${str}"`);
    }
  }

  const dotIdx = mantissa.indexOf('.');
  let digits;
  let fracLen;
  if (dotIdx === -1) {
    digits = mantissa;
    fracLen = 0;
  } else {
    const intPart = mantissa.slice(0, dotIdx);
    const fracPart = mantissa.slice(dotIdx + 1);
    digits = intPart + fracPart;
    fracLen = fracPart.length;
  }

  const coeff = BigInt(digits);
  if (coeff === 0n) {
    return { coeff: 0n, exp: 0 };
  }

  const exp = sciExp - fracLen;
  if (!Number.isSafeInteger(exp)) {
    throw new RangeError(`Effective exponent out of safe integer range: "${str}"`);
  }
  return { coeff, exp };
}

/**
 * Computes the exact integer square root `floor(sqrt(n))` for a non-negative
 * BigInt `n` using iterative Newton-Raphson (Heron's method).
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} `floor(sqrt(n))`.
 */
function isqrtBigInt(n) {
  if (n === 0n) return 0n;
  if (n < 4n) return 1n;

  const bitLen = n.toString(2).length;
  // Initial guess 2^ceil(bitLen / 2) is strictly >= ceil(sqrt(n)),
  // guaranteeing monotonic descent to floor(sqrt(n)).
  let x = 1n << BigInt((bitLen + 1) >> 1);
  while (true) {
    const next = (x + n / x) >> 1n;
    if (next >= x) {
      return x;
    }
    x = next;
  }
}

/**
 * Formats a non-negative scaled BigInt `scaled * 10^(-precision)` as a
 * normalized decimal string (no trailing fractional zeros or trailing dot).
 *
 * @param {bigint} scaled - Non-negative integer value scaled by 10^precision.
 * @param {number} precision - Number of fractional decimal digits.
 * @returns {string}
 */
function formatScaledDecimal(scaled, precision) {
  if (scaled === 0n) return '0';
  if (precision === 0) return scaled.toString();

  const raw = scaled.toString();
  let intPart;
  let fracPart;
  if (raw.length <= precision) {
    intPart = '0';
    fracPart = '0'.repeat(precision - raw.length) + raw;
  } else {
    const split = raw.length - precision;
    intPart = raw.slice(0, split);
    fracPart = raw.slice(split);
  }

  const trimmedFrac = fracPart.replace(/0+$/, '');
  return trimmedFrac.length > 0 ? `${intPart}.${trimmedFrac}` : intPart;
}

/**
 * Computes the Euclidean vector magnitude (L2 norm)
 * `sqrt(v_0^2 + v_1^2 + ... + v_{n-1}^2)` over arbitrary-precision decimal
 * strings using BigInt arithmetic and iterative Newton-Raphson square root.
 *
 * The result is rounded half-up to at most `precision` fractional decimal
 * places and returned as a normalized decimal string (trailing fractional
 * zeros are stripped).
 *
 * @param {string[]} vector - Non-empty array of finite decimal strings
 *   (supports optional sign, decimal point, and scientific notation).
 * @param {number} [precision=20] - Non-negative integer specifying the maximum
 *   number of fractional decimal places in the result.
 * @returns {string} The vector magnitude as a normalized decimal string.
 * @throws {TypeError} If `vector` is not an array, any element is not a string,
 *   or `precision` is not a number.
 * @throws {RangeError} If `vector` is empty, any element is not a valid finite
 *   decimal string, or `precision` is not a non-negative safe integer.
 */
export function magnitudeDecimalIterative(vector, precision = 20) {
  if (!Array.isArray(vector)) {
    throw new TypeError('vector must be an array of decimal strings');
  }
  if (vector.length === 0) {
    throw new RangeError('vector must be non-empty');
  }
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a non-negative integer');
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative safe integer');
  }

  const nonZero = [];
  let minExp = Infinity;

  for (let i = 0; i < vector.length; i++) {
    const item = vector[i];
    if (typeof item !== 'string') {
      throw new TypeError(`vector[${i}] must be a decimal string`);
    }
    if (!DECIMAL_RE.test(item)) {
      throw new RangeError(`vector[${i}] is not a valid decimal string: "${item}"`);
    }
    const parsed = parseDecimalMagnitude(item);
    if (parsed.coeff !== 0n) {
      nonZero.push(parsed);
      if (parsed.exp < minExp) {
        minExp = parsed.exp;
      }
    }
  }

  if (nonZero.length === 0) {
    return '0';
  }

  // Exact sum of squares: V = sumSq * 10^(2 * minExp), so sqrt(V) = sqrt(sumSq) * 10^minExp.
  let sumSq = 0n;
  for (let i = 0; i < nonZero.length; i++) {
    const { coeff, exp } = nonZero[i];
    const sq = coeff * coeff;
    const shift = 2 * (exp - minExp);
    sumSq += shift === 0 ? sq : sq * (10n ** BigInt(shift));
  }

  // We need R = floor(sqrt(sumSq) * 10^(minExp + precision) + 0.5).
  const k = minExp + precision;
  let rounded;

  if (k >= 0) {
    const scaledN = k === 0 ? sumSq : sumSq * (10n ** BigInt(2 * k));
    const q = isqrtBigInt(scaledN);
    // sqrt(scaledN) >= q + 0.5  <=>  scaledN > q^2 + q (since scaledN is an integer).
    rounded = scaledN - q * q > q ? q + 1n : q;
  } else {
    const d = -k; // d >= 1
    // Minimum threshold for rounding up from 0 is (5 * 10^(d-1))^2 = 25 * 10^(2d-2),
    // which has exactly 2*d decimal digits. Short-circuit if sumSq is strictly smaller.
    const sumSqDigits = sumSq.toString().length;
    if (sumSqDigits < 2 * d) {
      return '0';
    }
    const scale10 = 10n ** BigInt(d);
    const scale100 = scale10 * scale10;
    const q = isqrtBigInt(sumSq / scale100);
    // Half-up threshold: sqrt(sumSq) / 10^d >= q + 0.5  <=>  sumSq >= (q * 10^d + 5 * 10^(d-1))^2.
    const halfStep = 5n * (10n ** BigInt(d - 1));
    const threshold = q * scale10 + halfStep;
    rounded = sumSq >= threshold * threshold ? q + 1n : q;
  }

  return formatScaledDecimal(rounded, precision);
}
