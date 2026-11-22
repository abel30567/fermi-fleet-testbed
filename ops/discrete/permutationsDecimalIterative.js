/**
 * @fileoverview Iterative arbitrary-precision permutations P(n, k) over decimal strings.
 */

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_MATERIALIZED_EXPONENT = 100000n;

/**
 * Parses an arbitrary-precision decimal string into an exact non-negative BigInt integer.
 *
 * Accepts integer strings, decimal strings with zero fractional parts (e.g. "10.0", "5."),
 * optional leading signs ("+10", "-0", "-0.0"), and scientific notation (e.g. "1.5e1")
 * when the value is an exact non-negative integer.
 *
 * @param {string} value - Decimal string representing a non-negative integer.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {bigint} Exact non-negative integer value.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid decimal string, is negative, or is not an integer.
 */
function parseNonNegativeIntegerDecimal(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a decimal string`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new RangeError(`${name} must be a valid decimal string`);
  }

  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError(`${name} is not a valid decimal string: "${value}"`);
  }

  const isNegative = match[1] === '-';
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? match[4] ?? '';
  const expStr = match[5];

  const digits = (intPart + fracPart).replace(/^0+/, '');
  if (digits.length === 0) {
    return 0n;
  }

  if (isNegative) {
    throw new RangeError(`${name} must be a non-negative integer, received "${value}"`);
  }

  const significantDigits = digits.replace(/0+$/, '');
  const trailingZeros = digits.length - significantDigits.length;

  let exp = BigInt(trailingZeros) - BigInt(fracPart.length);
  if (expStr !== undefined) {
    exp += BigInt(expStr);
  }

  if (exp < 0n) {
    throw new RangeError(`${name} must be an exact integer, received "${value}"`);
  }

  if (exp > MAX_MATERIALIZED_EXPONENT) {
    throw new RangeError(`${name} exponent is too large to materialize safely: "${value}"`);
  }

  return BigInt(significantDigits + '0'.repeat(Number(exp)));
}

/**
 * Validates the `precision` parameter.
 *
 * @param {number} precision - Non-negative integer number of fractional decimal places.
 * @returns {number} Validated precision.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative integer.
 */
function validatePrecision(precision) {
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a non-negative integer');
  }
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative integer');
  }
  return precision;
}

/**
 * Formats an exact non-negative BigInt integer as a clean decimal string with `precision`
 * fractional digits (`precision = 0` produces a plain integer string).
 *
 * @param {bigint} value - Non-negative BigInt result.
 * @param {number} precision - Number of fractional digits to format.
 * @returns {string} Formatted decimal string.
 */
function formatExactInteger(value, precision) {
  const intStr = value.toString();
  if (precision === 0) {
    return intStr;
  }
  return `${intStr}.${'0'.repeat(precision)}`;
}

/**
 * Computes the number of k-permutations of n distinct elements,
 * `P(n, k) = n! / (n - k)! = n * (n - 1) * ... * (n - k + 1)`,
 * using a straightforward iterative BigInt loop over arbitrary-precision decimal strings.
 *
 * By standard discrete mathematics convention:
 * - `P(n, 0) = 1` for all integers `n >= 0` (including `P(0, 0) = 1`).
 * - `P(n, k) = 0` when `k > n`.
 *
 * Precision handling:
 * - Because `P(n, k)` is always an exact non-negative integer, `precision = 0` (default)
 *   returns the exact integer decimal string (e.g. `"60"`).
 * - When `precision > 0`, the exact integer result is formatted with `precision` trailing
 *   fractional zeros (e.g. `precision = 2` produces `"60.00"`).
 *
 * @param {string} n - Non-negative integer decimal string (total number of elements).
 * @param {string} k - Non-negative integer decimal string (number of selected elements).
 * @param {number} [precision=0] - Non-negative integer number of fractional decimal places.
 * @returns {string} Exact decimal string representation of `P(n, k)`.
 * @throws {TypeError} If `n` or `k` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is not a valid non-negative integer decimal string,
 *   or `precision` is not a non-negative integer.
 */
export function permutationsDecimalIterative(n, k, precision = 0) {
  const nBig = parseNonNegativeIntegerDecimal(n, 'n');
  const kBig = parseNonNegativeIntegerDecimal(k, 'k');
  const prec = validatePrecision(precision);

  if (kBig === 0n) {
    return formatExactInteger(1n, prec);
  }

  if (kBig > nBig) {
    return formatExactInteger(0n, prec);
  }

  let result = 1n;
  for (let i = 0n; i < kBig; i += 1n) {
    result *= nBig - i;
  }

  return formatExactInteger(result, prec);
}
