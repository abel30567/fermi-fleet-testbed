/**
 * Arbitrary-precision decimal string multiplication with configurable precision
 * and numerically robust exact scaling and round-half-to-even semantics.
 *
 * @module ops/arithmetic/multiplyDecimalStable
 */

const DECIMAL_PATTERN = /^\s*([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?\s*$/;

/**
 * Safety bound on rendered output digit count to prevent unbounded memory allocation
 * when formatting extreme exponents into fixed-point decimal strings.
 */
const MAX_OUTPUT_DIGITS = 1_000_000n;

/**
 * Parse a decimal string into an exact normalized base-10 representation:
 * value = sign * mantissa * 10^exponent.
 *
 * @param {string} value - Input decimal string.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ sign: 1 | -1, mantissa: bigint, exponent: bigint }}
 */
function parseDecimal(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a decimal string`);
  }

  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`${name} is not a valid decimal string: "${value}"`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? match[4] ?? '';
  const expPart = match[5];

  const rawDigits = intPart + fracPart;

  let start = 0;
  while (start < rawDigits.length && rawDigits.charCodeAt(start) === 48) {
    start++;
  }

  if (start === rawDigits.length) {
    return { sign: 1, mantissa: 0n, exponent: 0n };
  }

  let end = rawDigits.length - 1;
  while (end > start && rawDigits.charCodeAt(end) === 48) {
    end--;
  }

  const trailingZeros = BigInt(rawDigits.length - 1 - end);
  const significantDigits = rawDigits.slice(start, end + 1);
  const sciExponent = expPart !== undefined ? BigInt(expPart) : 0n;
  const exponent = sciExponent - BigInt(fracPart.length) + trailingZeros;

  return {
    sign,
    mantissa: BigInt(significantDigits),
    exponent,
  };
}

/**
 * Check if any digit in `str` starting at `offset` is non-zero.
 *
 * @param {string} str
 * @param {number} offset
 * @returns {boolean}
 */
function hasNonZeroTail(str, offset) {
  for (let i = offset; i < str.length; i++) {
    if (str.charCodeAt(i) !== 48) {
      return true;
    }
  }
  return false;
}

/**
 * Round a positive exact decimal `(digits, exponent)` to `precision` fractional
 * decimal places using exact IEEE-754 round-half-to-even (banker's rounding).
 * Guarantees an absolute rounding error strictly <= 0.5 * 10^(-precision).
 *
 * @param {string} digits - Positive integer digit string with no leading zeros.
 * @param {bigint} exponent - Base-10 exponent.
 * @param {bigint} precision - Non-negative number of fractional decimal places.
 * @returns {{ digits: string, exponent: bigint } | null} Null if rounded to zero.
 */
function roundHalfToEven(digits, exponent, precision) {
  const shift = -(exponent + precision);
  if (shift <= 0n) {
    return { digits, exponent };
  }

  const len = BigInt(digits.length);

  // Strictly less than 0.1 * ULP -> guaranteed to round to 0 without huge allocations.
  if (shift > len) {
    return null;
  }

  if (shift === len) {
    const first = digits.charCodeAt(0);
    if (first > 53) { // > '5'
      return { digits: '1', exponent: -precision };
    }
    if (first < 53) { // < '5'
      return null;
    }
    // first === '5': integer part is 0 (even), so round up only if strictly > 0.5.
    if (hasNonZeroTail(digits, 1)) {
      return { digits: '1', exponent: -precision };
    }
    return null;
  }

  // 0 < shift < len
  const keepLen = Number(len - shift);
  const roundChar = digits.charCodeAt(keepLen);
  let roundUp = false;

  if (roundChar > 53) {
    roundUp = true;
  } else if (roundChar === 53) {
    if (hasNonZeroTail(digits, keepLen + 1)) {
      roundUp = true;
    } else {
      // Exact tie: round up iff the last kept digit is odd.
      const lastKeptDigit = digits.charCodeAt(keepLen - 1) - 48;
      roundUp = (lastKeptDigit & 1) === 1;
    }
  }

  const head = digits.slice(0, keepLen);
  const rounded = roundUp ? BigInt(head) + 1n : BigInt(head);
  if (rounded === 0n) {
    return null;
  }

  return { digits: rounded.toString(), exponent: -precision };
}

/**
 * Format a non-zero scaled decimal `(sign, digits, exponent)` as a canonical
 * fixed-point decimal string (no trailing fractional zeros, no negative zero).
 *
 * @param {1 | -1} sign
 * @param {string} digits - Non-zero digit string with no leading zeros.
 * @param {bigint} exponent
 * @returns {string}
 */
function formatDecimal(sign, digits, exponent) {
  let end = digits.length - 1;
  while (end > 0 && digits.charCodeAt(end) === 48) {
    end--;
  }

  const trimmedZeros = BigInt(digits.length - 1 - end);
  const cleanDigits = trimmedZeros > 0n ? digits.slice(0, end + 1) : digits;
  const cleanExp = exponent + trimmedZeros;
  const prefix = sign < 0 ? '-' : '';

  if (cleanExp >= 0n) {
    const totalDigits = BigInt(cleanDigits.length) + cleanExp;
    if (totalDigits > MAX_OUTPUT_DIGITS) {
      throw new RangeError(
        `Result requires ${totalDigits} digits, exceeding the maximum of ${MAX_OUTPUT_DIGITS}`
      );
    }
    return prefix + cleanDigits + '0'.repeat(Number(cleanExp));
  }

  const fracLen = -cleanExp;
  const len = BigInt(cleanDigits.length);

  if (len > fracLen) {
    if (len > MAX_OUTPUT_DIGITS) {
      throw new RangeError(
        `Result requires ${len} digits, exceeding the maximum of ${MAX_OUTPUT_DIGITS}`
      );
    }
    const splitIdx = Number(len - fracLen);
    return prefix + cleanDigits.slice(0, splitIdx) + '.' + cleanDigits.slice(splitIdx);
  }

  const totalDigits = fracLen + 1n;
  if (totalDigits > MAX_OUTPUT_DIGITS) {
    throw new RangeError(
      `Result requires ${totalDigits} digits, exceeding the maximum of ${MAX_OUTPUT_DIGITS}`
    );
  }

  const leadingZeros = Number(fracLen - len);
  return prefix + '0.' + '0'.repeat(leadingZeros) + cleanDigits;
}

/**
 * Multiply two arbitrary-precision decimal strings with optional fixed decimal precision.
 *
 * Parses both operands into exact normalized scaled `BigInt` representations
 * (`sign * mantissa * 10^exponent`), avoiding IEEE-754 floating-point representation
 * errors, intermediate rounding, and exponent overflow/underflow. When `precision` is
 * specified, rounds the exact product once using round-half-to-even (banker's rounding),
 * ensuring an absolute error bound of at most `0.5 * 10^(-precision)`.
 *
 * @param {string} a - First decimal string (supports optional sign, decimal point, and scientific notation).
 * @param {string} b - Second decimal string (supports optional sign, decimal point, and scientific notation).
 * @param {number} [precision] - Optional non-negative safe integer specifying the maximum number
 *   of fractional decimal places to retain. When omitted, returns the exact product.
 * @returns {string} Canonical decimal string representation of `a * b` (trailing fractional zeros
 *   stripped; zero is always formatted as `"0"`).
 * @throws {TypeError} If `a` or `b` is not a string, or if `precision` is provided and not a number.
 * @throws {RangeError} If `a` or `b` is not a valid decimal string, if `precision` is not a
 *   non-negative safe integer, or if the formatted result exceeds the digit safety limit.
 */
export function multiplyDecimalStable(a, b, precision) {
  const parsedA = parseDecimal(a, 'a');
  const parsedB = parseDecimal(b, 'b');

  if (precision !== undefined) {
    if (typeof precision !== 'number') {
      throw new TypeError('precision must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(precision) || precision < 0) {
      throw new RangeError('precision must be a non-negative safe integer');
    }
  }

  if (parsedA.mantissa === 0n || parsedB.mantissa === 0n) {
    return '0';
  }

  const sign = parsedA.sign === parsedB.sign ? 1 : -1;
  const productMantissa = parsedA.mantissa * parsedB.mantissa;
  const productExponent = parsedA.exponent + parsedB.exponent;
  const productDigits = productMantissa.toString();

  if (precision === undefined) {
    return formatDecimal(sign, productDigits, productExponent);
  }

  const rounded = roundHalfToEven(productDigits, productExponent, BigInt(precision));
  if (rounded === null) {
    return '0';
  }

  return formatDecimal(sign, rounded.digits, rounded.exponent);
}
