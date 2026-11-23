/**
 * @fileoverview Arbitrary-precision discrete combinations C(n, k) over decimal strings.
 *
 * Computes the binomial coefficient C(n, k) = n! / (k! * (n - k)!) iteratively
 * using exact BigInt arithmetic and the multiplicative formula with symmetry
 * reduction k = min(k, n - k).
 */

const DECIMAL_PATTERN = /^(?<sign>[+-])?(?<int>\d+)(?:\.(?<frac>\d+))?$/;

/**
 * Parses and validates a non-negative integer decimal string into a BigInt.
 *
 * Accepts integer decimal strings with optional leading `+`, leading zeros,
 * surrounding whitespace, and optional all-zero fractional digits (e.g., `"10.0"`).
 * Rejects negative values, non-zero fractional parts, non-string types, and
 * malformed strings.
 *
 * @param {string} value - Decimal string representation of a non-negative integer.
 * @param {string} name - Parameter name used in error messages.
 * @returns {bigint} Parsed non-negative integer as a BigInt.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid non-negative integer decimal string.
 */
function parseNonNegativeIntegerDecimal(value, name) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a decimal string`);
  }

  const trimmed = value.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match || !match.groups) {
    throw new RangeError(`${name} must be a valid decimal string`);
  }

  const { sign, int: intPart, frac: fracPart } = match.groups;

  if (sign === '-') {
    throw new RangeError(`${name} must be a non-negative integer`);
  }

  if (fracPart !== undefined && /[^0]/.test(fracPart)) {
    throw new RangeError(`${name} must be an integer without non-zero fractional digits`);
  }

  return BigInt(intPart);
}

/**
 * Validates the decimal precision argument.
 *
 * @param {number} precision - Number of fractional digits to include in the output.
 * @returns {number} Validated non-negative integer precision.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative integer.
 */
function validatePrecision(precision) {
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a number');
  }

  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative integer');
  }

  return precision;
}

/**
 * Formats an exact BigInt integer value as a decimal string with `precision` fractional digits.
 *
 * @param {bigint} value - Exact integer value.
 * @param {number} precision - Number of trailing fractional zero digits.
 * @returns {string} Formatted decimal string.
 */
function formatDecimal(value, precision) {
  const digits = value.toString();
  if (precision === 0) {
    return digits;
  }
  return `${digits}.${'0'.repeat(precision)}`;
}

/**
 * Computes the binomial coefficient C(n, k) = n! / (k! * (n - k)!) iteratively
 * over arbitrary-precision decimal strings.
 *
 * Uses exact BigInt arithmetic with the multiplicative formula:
 * `result = prod_{i=1..r} (n - r + i) / i`, where `r = min(k, n - k)`.
 * Each intermediate product is guaranteed to be evenly divisible by `i`.
 * Returns `"0"` (formatted to `precision`) when `k > n`.
 *
 * @param {string} n - Total number of items as a non-negative integer decimal string.
 * @param {string} k - Number of chosen items as a non-negative integer decimal string.
 * @param {number} [precision=0] - Number of fractional decimal digits to format in the result.
 * @returns {string} Exact value of C(n, k) formatted as a decimal string.
 * @throws {TypeError} If `n` or `k` is not a string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is negative, fractional, or malformed, or if `precision` is negative or non-integer.
 *
 * @example
 * combinationsDecimalIterative('5', '2'); // '10'
 * combinationsDecimalIterative('10.0', '3.00', 2); // '120.00'
 * combinationsDecimalIterative('100', '50'); // '100891344545564193334812497256'
 */
export function combinationsDecimalIterative(n, k, precision = 0) {
  const nBig = parseNonNegativeIntegerDecimal(n, 'n');
  const kBig = parseNonNegativeIntegerDecimal(k, 'k');
  const prec = validatePrecision(precision);

  if (kBig > nBig) {
    return formatDecimal(0n, prec);
  }

  if (kBig === 0n || kBig === nBig) {
    return formatDecimal(1n, prec);
  }

  const nMinusK = nBig - kBig;
  const r = kBig < nMinusK ? kBig : nMinusK;

  let result = 1n;
  for (let i = 1n; i <= r; i += 1n) {
    result = (result * (nBig - r + i)) / i;
  }

  return formatDecimal(result, prec);
}
