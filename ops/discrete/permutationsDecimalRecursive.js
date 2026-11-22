/**
 * Arbitrary-precision permutations P(n, k) over decimal strings using a
 * recursive divide-and-conquer product tree.
 *
 * @module ops/discrete/permutationsDecimalRecursive
 */

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/**
 * Parses and validates a non-negative integer decimal string into a BigInt.
 *
 * Accepts canonical integer strings (e.g. `"10"`, `"0"`, `"+42"`) as well as
 * decimal strings whose fractional digits are all zeros (e.g. `"3.00"`).
 * Rejects non-strings, malformed decimal strings, negative values, and
 * non-integer fractional values.
 *
 * @param {string} value - Decimal string representation of a non-negative integer.
 * @param {string} paramName - Parameter name for descriptive error messages.
 * @returns {bigint} Parsed non-negative BigInt value.
 * @throws {TypeError} If `value` is not a string or is not a valid decimal string.
 * @throws {RangeError} If `value` is negative or has a non-zero fractional part.
 */
function parseNonNegativeIntegerDecimal(value, paramName) {
  if (typeof value !== 'string') {
    throw new TypeError(`${paramName} must be a decimal string`);
  }

  const trimmed = value.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new TypeError(`${paramName} must be a valid decimal string, received "${value}"`);
  }

  const [, sign, intPart, fracPart] = match;

  if (sign === '-') {
    throw new RangeError(`${paramName} must be a non-negative integer, received "${value}"`);
  }

  if (fracPart !== undefined && /[1-9]/.test(fracPart)) {
    throw new RangeError(`${paramName} must be an integer, received "${value}"`);
  }

  return BigInt(intPart);
}

/**
 * Validates the decimal precision parameter.
 *
 * @param {number} precision - Number of fractional decimal digits to include.
 * @returns {number} Validated non-negative safe integer precision.
 * @throws {TypeError} If `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative safe integer.
 */
function validatePrecision(precision) {
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a number');
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError(`precision must be a non-negative safe integer, received ${precision}`);
  }
  return precision;
}

/**
 * Recursively computes the product of all integers in the inclusive range
 * `[low, high]` using a balanced divide-and-conquer binary product tree.
 *
 * Splitting the range at the midpoint keeps multiplicand bit-lengths balanced
 * at every level of recursion, avoiding the quadratic cost of linear
 * accumulation for large BigInt products while maintaining O(log(high - low))
 * call-stack depth.
 *
 * @param {bigint} low - Inclusive lower bound of the integer range.
 * @param {bigint} high - Inclusive upper bound of the integer range.
 * @returns {bigint} Exact product `low * (low + 1n) * ... * high`.
 */
function rangeProduct(low, high) {
  if (low > high) {
    return 1n;
  }
  if (low === high) {
    return low;
  }
  if (high - low === 1n) {
    return low * high;
  }
  const mid = low + ((high - low) >> 1n);
  return rangeProduct(low, mid) * rangeProduct(mid + 1n, high);
}

/**
 * Formats a non-negative BigInt as a fixed-point decimal string with the
 * requested number of fractional digits.
 *
 * @param {bigint} value - Non-negative integer value to format.
 * @param {number} precision - Number of decimal places after the decimal point.
 * @returns {string} Formatted decimal string.
 */
function formatDecimalInteger(value, precision) {
  const digits = value.toString(10);
  if (precision === 0) {
    return digits;
  }
  return `${digits}.${'0'.repeat(precision)}`;
}

/**
 * Computes the number of k-permutations of n distinct items,
 * `P(n, k) = n! / (n - k)!`, over arbitrary-precision decimal strings.
 *
 * Uses native `BigInt` arithmetic and a recursive divide-and-conquer falling
 * factorial product tree `rangeProduct(n - k + 1, n)`. Returns `"0"` (formatted
 * to `precision` decimal places) when `k > n`, and `"1"` (formatted to
 * `precision` decimal places) when `k === 0`.
 *
 * @param {string} n - Non-negative integer decimal string (e.g. `"10"`, `"10.00"`).
 * @param {string} k - Non-negative integer decimal string (e.g. `"4"`, `"4.00"`).
 * @param {number} [precision=0] - Non-negative integer number of decimal places in the output.
 * @returns {string} Exact value of `P(n, k)` formatted to `precision` decimal places.
 * @throws {TypeError} If `n` or `k` is not a valid decimal string, or `precision` is not a number.
 * @throws {RangeError} If `n` or `k` is negative or fractional, or `precision` is invalid.
 */
export function permutationsDecimalRecursive(n, k, precision = 0) {
  const nVal = parseNonNegativeIntegerDecimal(n, 'n');
  const kVal = parseNonNegativeIntegerDecimal(k, 'k');
  const prec = validatePrecision(precision);

  if (kVal === 0n) {
    return formatDecimalInteger(1n, prec);
  }
  if (kVal > nVal) {
    return formatDecimalInteger(0n, prec);
  }

  const result = rangeProduct(nVal - kVal + 1n, nVal);
  return formatDecimalInteger(result, prec);
}
