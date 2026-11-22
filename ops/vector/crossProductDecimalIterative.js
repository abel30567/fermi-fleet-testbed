/**
 * @fileoverview Iterative 3D vector cross product over arbitrary-precision decimal strings.
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parses a decimal string into a normalized BigInt coefficient and base-10 exponent
 * representing `coeff * 10^exp`.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} label - Parameter label for descriptive error messages.
 * @returns {{ coeff: bigint, exp: number }} Normalized decimal representation.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid decimal string or has an unsafe exponent.
 */
function parseDecimal(value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a decimal string`);
  }
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`${label} is not a valid decimal string: "${value}"`);
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? match[4] ?? '';
  const expPart = match[5] !== undefined ? Number(match[5]) : 0;

  if (!Number.isSafeInteger(expPart)) {
    throw new RangeError(`${label} has an exponent outside safe integer range: "${value}"`);
  }

  const rawDigits = intPart + fracPart;
  const firstNonZero = rawDigits.search(/[1-9]/);
  if (firstNonZero === -1) {
    return { coeff: 0n, exp: 0 };
  }

  let lastNonZero = rawDigits.length - 1;
  while (lastNonZero > firstNonZero && rawDigits.charCodeAt(lastNonZero) === 48) {
    lastNonZero -= 1;
  }

  const significantDigits = rawDigits.slice(firstNonZero, lastNonZero + 1);
  const trailingZeros = rawDigits.length - 1 - lastNonZero;
  const exp = expPart - fracPart.length + trailingZeros;

  if (!Number.isSafeInteger(exp)) {
    throw new RangeError(`${label} has an effective exponent outside safe integer range: "${value}"`);
  }

  return {
    coeff: sign * BigInt(significantDigits),
    exp,
  };
}

/**
 * Validates and parses a 3D vector of decimal strings.
 *
 * @param {string[]} vector - 3-element array of decimal strings.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Array<{ coeff: bigint, exp: number }>} Parsed 3-element vector.
 * @throws {TypeError} If `vector` is not an array or contains a non-string element.
 * @throws {RangeError} If `vector` does not have length 3 or contains an invalid decimal string.
 */
function parseVector3(vector, name) {
  if (!Array.isArray(vector)) {
    throw new TypeError(`${name} must be an array of 3 decimal strings`);
  }
  if (vector.length !== 3) {
    throw new RangeError(`${name} must have length 3 (received ${vector.length})`);
  }

  const parsed = new Array(3);
  for (let idx = 0; idx < 3; idx += 1) {
    parsed[idx] = parseDecimal(vector[idx], `${name}[${idx}]`);
  }
  return parsed;
}

/**
 * Computes exact multiplication of two arbitrary-precision decimals.
 *
 * @param {{ coeff: bigint, exp: number }} x
 * @param {{ coeff: bigint, exp: number }} y
 * @returns {{ coeff: bigint, exp: number }}
 */
function mulDecimal(x, y) {
  if (x.coeff === 0n || y.coeff === 0n) {
    return { coeff: 0n, exp: 0 };
  }
  return {
    coeff: x.coeff * y.coeff,
    exp: x.exp + y.exp,
  };
}

/**
 * Computes exact subtraction `x - y` of two arbitrary-precision decimals.
 *
 * @param {{ coeff: bigint, exp: number }} x
 * @param {{ coeff: bigint, exp: number }} y
 * @returns {{ coeff: bigint, exp: number }}
 */
function subDecimal(x, y) {
  if (x.coeff === 0n) {
    return y.coeff === 0n ? { coeff: 0n, exp: 0 } : { coeff: -y.coeff, exp: y.exp };
  }
  if (y.coeff === 0n) {
    return { coeff: x.coeff, exp: x.exp };
  }

  const minExp = Math.min(x.exp, y.exp);
  const shiftX = x.exp - minExp;
  const shiftY = y.exp - minExp;

  const alignedX = shiftX === 0 ? x.coeff : x.coeff * (10n ** BigInt(shiftX));
  const alignedY = shiftY === 0 ? y.coeff : y.coeff * (10n ** BigInt(shiftY));
  const diff = alignedX - alignedY;

  if (diff === 0n) {
    return { coeff: 0n, exp: 0 };
  }
  return { coeff: diff, exp: minExp };
}

/**
 * Rounds (half away from zero) and formats a decimal value to at most `precision`
 * fractional digits as a normalized decimal string (no trailing fractional zeros,
 * no `-0`).
 *
 * @param {{ coeff: bigint, exp: number }} value - Exact decimal value.
 * @param {number} precision - Non-negative integer number of decimal places.
 * @returns {string} Normalized decimal string.
 */
function formatDecimal(value, precision) {
  if (value.coeff === 0n) {
    return '0';
  }

  const negative = value.coeff < 0n;
  let absCoeff = negative ? -value.coeff : value.coeff;
  let exp = value.exp;

  if (exp < -precision) {
    const dropDigits = -precision - exp;
    const divisor = 10n ** BigInt(dropDigits);
    let quotient = absCoeff / divisor;
    const remainder = absCoeff % divisor;
    if (remainder * 2n >= divisor) {
      quotient += 1n;
    }
    if (quotient === 0n) {
      return '0';
    }
    absCoeff = quotient;
    exp = -precision;
  }

  const signPrefix = negative ? '-' : '';

  if (exp >= 0) {
    return signPrefix + absCoeff.toString() + '0'.repeat(exp);
  }

  const fracDigits = -exp;
  const digits = absCoeff.toString();

  let intPart;
  let fracPart;
  if (digits.length <= fracDigits) {
    intPart = '0';
    fracPart = digits.padStart(fracDigits, '0');
  } else {
    intPart = digits.slice(0, digits.length - fracDigits);
    fracPart = digits.slice(digits.length - fracDigits);
  }

  let trimmedLen = fracPart.length;
  while (trimmedLen > 0 && fracPart.charCodeAt(trimmedLen - 1) === 48) {
    trimmedLen -= 1;
  }

  if (trimmedLen === 0) {
    return signPrefix + intPart;
  }

  return `${signPrefix}${intPart}.${fracPart.slice(0, trimmedLen)}`;
}

/**
 * Computes the 3D vector cross product `a × b` over arbitrary-precision decimal strings
 * using an iterative loop over the 3 cyclic index triples with exact BigInt arithmetic.
 *
 * Each component is computed as:
 * - `(a × b)[0] = a[1] * b[2] - a[2] * b[1]`
 * - `(a × b)[1] = a[2] * b[0] - a[0] * b[2]`
 * - `(a × b)[2] = a[0] * b[1] - a[1] * b[0]`
 *
 * Exact arithmetic is performed in full precision before rounding each component
 * (half away from zero) to at most `precision` fractional digits and normalizing
 * the decimal string output (stripping trailing fractional zeros and eliminating `-0`).
 *
 * @param {string[]} a - First 3D vector as a 3-element array of decimal strings.
 * @param {string[]} b - Second 3D vector as a 3-element array of decimal strings.
 * @param {number} [precision=20] - Non-negative integer specifying the maximum number
 *   of fractional decimal digits for rounding each output component.
 * @returns {string[]} Resulting 3D cross product vector as a 3-element array of
 *   normalized decimal strings.
 * @throws {TypeError} If `a` or `b` is not an array, if any vector element is not a
 *   string, or if `precision` is not a number.
 * @throws {RangeError} If `a` or `b` does not have length 3, if any element is not a
 *   valid decimal string, or if `precision` is not a non-negative safe integer.
 */
export function crossProductDecimalIterative(a, b, precision = 20) {
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a non-negative integer');
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative safe integer');
  }

  const vecA = parseVector3(a, 'a');
  const vecB = parseVector3(b, 'b');

  const result = new Array(3);
  for (let k = 0; k < 3; k += 1) {
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    const prod1 = mulDecimal(vecA[i], vecB[j]);
    const prod2 = mulDecimal(vecA[j], vecB[i]);
    const diff = subDecimal(prod1, prod2);
    result[k] = formatDecimal(diff, precision);
  }

  return result;
}
