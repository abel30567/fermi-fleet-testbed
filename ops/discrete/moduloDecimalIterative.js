/**
 * Maximum supported decimal exponent magnitude to prevent excessive memory allocation.
 */
const MAX_EXPONENT = 1_000_000;

/**
 * Matches valid decimal strings with optional sign, integer/fractional parts,
 * and optional scientific notation exponent.
 */
const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parses and validates a decimal string into an exact normalized BigInt representation:
 * `value = sign * digits / 10^scale`, where `digits >= 0n` and `scale >= 0`.
 *
 * @param {string} raw - The decimal string to parse.
 * @param {string} name - Parameter name used in error messages.
 * @returns {{ sign: 1 | -1, digits: bigint, scale: number }} Parsed decimal representation.
 * @throws {TypeError} If `raw` is not a string.
 * @throws {RangeError} If `raw` is not a valid decimal string or its exponent exceeds safe bounds.
 */
function parseDecimalString(raw, name) {
  if (typeof raw !== 'string') {
    throw new TypeError(`Parameter "${name}" must be a decimal string, received ${typeof raw}`);
  }

  const trimmed = raw.trim();
  const match = DECIMAL_REGEX.exec(trimmed);
  if (!match) {
    throw new RangeError(`Parameter "${name}" is not a valid decimal string: "${raw}"`);
  }

  const [, signStr, intPart = '', fracPart = '', leadingFracPart = '', expStr] = match;
  const sign = signStr === '-' ? -1 : 1;
  const effectiveFrac = fracPart || leadingFracPart;

  // Strip leading zeros to normalize digits and detect zero.
  let combined = (intPart + effectiveFrac).replace(/^0+/, '');
  if (combined.length === 0) {
    return { sign: 1, digits: 0n, scale: 0 };
  }

  // Strip trailing zeros to minimize working scale.
  const withoutTrailing = combined.replace(/0+$/, '');
  const trailingZeros = combined.length - withoutTrailing.length;
  combined = withoutTrailing;

  let exp = 0;
  if (expStr !== undefined) {
    const parsedExp = Number(expStr);
    if (!Number.isSafeInteger(parsedExp) || Math.abs(parsedExp) > MAX_EXPONENT) {
      throw new RangeError(`Parameter "${name}" has an exponent out of supported range: "${raw}"`);
    }
    exp = parsedExp;
  }

  const power10 = exp - effectiveFrac.length + trailingZeros;
  if (Math.abs(power10) > MAX_EXPONENT) {
    throw new RangeError(`Parameter "${name}" has an effective scale out of supported range: "${raw}"`);
  }

  if (power10 >= 0) {
    return {
      sign,
      digits: BigInt(combined + '0'.repeat(power10)),
      scale: 0,
    };
  }

  return {
    sign,
    digits: BigInt(combined),
    scale: -power10,
  };
}

/**
 * Computes `dividend mod divisor` for non-negative BigInts (`divisor > 0n`)
 * using iterative binary long division (shift-and-subtract) in O(log(dividend / divisor)) steps.
 *
 * @param {bigint} dividend - Non-negative integer dividend.
 * @param {bigint} divisor - Strictly positive integer divisor.
 * @returns {bigint} Exact integer remainder `r` satisfying `0n <= r < divisor`.
 */
function bigIntRemainderIterative(dividend, divisor) {
  if (dividend < divisor) {
    return dividend;
  }

  // Phase 1: Scale divisor upward by powers of 2 until the next doubling would exceed dividend.
  let shifted = divisor;
  let shift = 0;
  while ((shifted << 1n) <= dividend) {
    shifted <<= 1n;
    shift += 1;
  }

  // Phase 2: Iteratively subtract aligned shifted divisors from most-significant bit down to 0.
  let remainder = dividend;
  while (shift >= 0) {
    if (remainder >= shifted) {
      remainder -= shifted;
    }
    shifted >>= 1n;
    shift -= 1;
  }

  return remainder;
}

/**
 * Formats a scaled BigInt (`sign * value / 10^scale`) as a normalized decimal string,
 * rounding half away from zero to at most `precision` fractional digits and stripping
 * redundant trailing zeros (never producing "-0").
 *
 * @param {1 | -1} sign - Sign of the value.
 * @param {bigint} value - Non-negative scaled integer magnitude.
 * @param {number} scale - Current decimal scale (`>= 0`).
 * @param {number} precision - Maximum fractional digits in the output (`>= 0`).
 * @returns {string} Normalized decimal string.
 */
function formatScaledDecimal(sign, value, scale, precision) {
  if (value === 0n) {
    return '0';
  }

  let scaledValue = value;
  let targetScale = scale;

  if (scale > precision) {
    const drop = scale - precision;
    const factor = 10n ** BigInt(drop);
    const half = factor >> 1n; // Exact half since 10^drop is even for drop >= 1.
    scaledValue = (scaledValue + half) / factor;
    targetScale = precision;

    if (scaledValue === 0n) {
      return '0';
    }
  }

  const prefix = sign < 0 ? '-' : '';
  const digits = scaledValue.toString();

  if (targetScale === 0) {
    return prefix + digits;
  }

  let intPart;
  let fracPart;
  if (digits.length <= targetScale) {
    intPart = '0';
    fracPart = '0'.repeat(targetScale - digits.length) + digits;
  } else {
    const splitIndex = digits.length - targetScale;
    intPart = digits.slice(0, splitIndex);
    fracPart = digits.slice(splitIndex);
  }

  fracPart = fracPart.replace(/0+$/, '');
  if (fracPart.length === 0) {
    return prefix + intPart;
  }

  return `${prefix}${intPart}.${fracPart}`;
}

/**
 * Computes the discrete remainder `a mod b` over arbitrary-precision decimal strings
 * using an iterative BigInt binary long-division algorithm on scaled integers.
 *
 * **Remainder Semantics (Truncated Division):**
 * Uses standard JavaScript / IEEE-754 truncated remainder semantics:
 * `r = a - trunc(a / b) * b`, where `trunc` rounds the quotient toward zero.
 * Consequently:
 * - `a = q * b + r` for integer `q = trunc(a / b)`
 * - `|r| < |b|`
 * - When `r !== 0`, `r` carries the sign of the dividend `a` (matching JS `%` and `BigInt %`)
 * - Zero remainder is always normalized to `"0"` (never `"-0"`)
 *
 * **Precision Handling:**
 * The exact remainder is computed first at `max(scale(a), scale(b))` without floating-point
 * error. If the exact remainder has more than `precision` fractional digits, it is rounded
 * half-away-from-zero to `precision` fractional digits. Trailing fractional zeros are stripped.
 *
 * @param {string} a - Dividend as an arbitrary-precision decimal string (supports signs and scientific notation).
 * @param {string} b - Non-zero divisor as an arbitrary-precision decimal string (supports signs and scientific notation).
 * @param {number} [precision=20] - Maximum number of fractional digits in the returned decimal string (non-negative integer).
 * @returns {string} The normalized decimal string representation of `a mod b`.
 * @throws {TypeError} If `a` or `b` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, `b` equals zero,
 *   `precision` is negative or not a safe integer, or the decimal scale exceeds safe bounds.
 */
export function moduloDecimalIterative(a, b, precision = 20) {
  const parsedA = parseDecimalString(a, 'a');
  const parsedB = parseDecimalString(b, 'b');

  if (typeof precision !== 'number') {
    throw new TypeError(`Parameter "precision" must be a number, received ${typeof precision}`);
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError(`Parameter "precision" must be a non-negative safe integer, received ${precision}`);
  }

  if (parsedB.digits === 0n) {
    throw new RangeError('Division by zero: parameter "b" must be non-zero');
  }

  if (parsedA.digits === 0n) {
    return '0';
  }

  const commonScale = Math.max(parsedA.scale, parsedB.scale);
  const scaleDiffA = commonScale - parsedA.scale;
  const scaleDiffB = commonScale - parsedB.scale;

  const scaledA = scaleDiffA === 0 ? parsedA.digits : parsedA.digits * (10n ** BigInt(scaleDiffA));
  const scaledB = scaleDiffB === 0 ? parsedB.digits : parsedB.digits * (10n ** BigInt(scaleDiffB));

  const remainderDigits = bigIntRemainderIterative(scaledA, scaledB);

  return formatScaledDecimal(parsedA.sign, remainderDigits, commonScale, precision);
}
