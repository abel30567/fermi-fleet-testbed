const DECIMAL_REGEX = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parses a decimal string into an exact normalized BigInt representation `{ coeff, exp }`
 * representing `coeff * 10^exp`.
 *
 * @param {unknown} value - Candidate decimal string.
 * @param {string} label - Descriptive label for error messages.
 * @returns {{ coeff: bigint, exp: number }}
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid decimal string or has an out-of-range exponent.
 */
function parseDecimal(value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a decimal string, got ${typeof value}`);
  }

  const match = DECIMAL_REGEX.exec(value);
  if (match === null) {
    throw new RangeError(`${label} is not a valid decimal string: "${value}"`);
  }

  const sign = match[1];
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? match[4] ?? '';
  const expPart = match[5];

  let sciExp = 0;
  if (expPart !== undefined) {
    sciExp = Number(expPart);
    if (!Number.isSafeInteger(sciExp)) {
      throw new RangeError(`${label} has an out-of-range exponent: "${value}"`);
    }
  }

  const rawDigits = intPart + fracPart;
  const trimmedLeading = rawDigits.replace(/^0+/, '');
  if (trimmedLeading.length === 0) {
    return { coeff: 0n, exp: 0 };
  }

  let end = trimmedLeading.length;
  while (end > 0 && trimmedLeading.charCodeAt(end - 1) === 48) {
    end -= 1;
  }

  const trailingZeros = trimmedLeading.length - end;
  const exp = sciExp - fracPart.length + trailingZeros;
  if (!Number.isSafeInteger(exp)) {
    throw new RangeError(`${label} has an out-of-range effective exponent: "${value}"`);
  }

  let coeff = BigInt(trimmedLeading.slice(0, end));
  if (sign === '-') {
    coeff = -coeff;
  }

  return { coeff, exp };
}

/**
 * Formats an exact scaled integer `coeff * 10^exp` as a normalized decimal string,
 * rounding half away from zero to `precision` decimal places.
 *
 * @param {bigint} coeff
 * @param {number} exp
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal(coeff, exp, precision) {
  if (coeff === 0n) {
    return '0';
  }

  const negative = coeff < 0n;
  const absCoeff = negative ? -coeff : coeff;
  const shift = exp + precision;

  if (shift >= 0) {
    if (exp >= 0) {
      const body = absCoeff.toString() + '0'.repeat(exp);
      return negative ? `-${body}` : body;
    }

    const fracDigits = -exp;
    const digits = absCoeff.toString().padStart(fracDigits + 1, '0');
    const intPart = digits.slice(0, digits.length - fracDigits);
    const fracPart = digits.slice(digits.length - fracDigits).replace(/0+$/, '');
    const body = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${body}` : body;
  }

  const drop = -shift;
  const divisor = 10n ** BigInt(drop);
  let quotient = absCoeff / divisor;
  const remainder = absCoeff % divisor;

  if (remainder * 2n >= divisor) {
    quotient += 1n;
  }

  if (quotient === 0n) {
    return '0';
  }

  if (precision === 0) {
    const body = quotient.toString();
    return negative ? `-${body}` : body;
  }

  const digits = quotient.toString().padStart(precision + 1, '0');
  const intPart = digits.slice(0, digits.length - precision);
  const fracPart = digits.slice(digits.length - precision).replace(/0+$/, '');
  const body = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${body}` : body;
}

/**
 * Computes the dot product of two equal-length vectors of arbitrary-precision decimal strings
 * using an iterative BigInt-based scaled-integer accumulation.
 *
 * Each product `a[i] * b[i]` is computed and accumulated exactly without IEEE-754 floating-point
 * precision loss. The exact sum is then rounded half away from zero to `precision` decimal places
 * and returned as a normalized decimal string (no trailing fractional zeros, never `"-0"`).
 * Empty vectors `([], [])` return `"0"`.
 *
 * @param {string[]} a - First vector of decimal strings (supports optional `+`/`-` sign,
 *   fractional notation, and scientific notation such as `"1.25e-10"`).
 * @param {string[]} b - Second vector of decimal strings with the same length as `a`.
 * @param {number} [precision=20] - Non-negative integer number of decimal places for rounding.
 * @returns {string} Normalized decimal string representation of the dot product.
 * @throws {TypeError} If `a` or `b` is not an array, if any element is not a string,
 *   or if `precision` is not a number.
 * @throws {RangeError} If `a` and `b` have different lengths, if any element is not a valid
 *   decimal string, or if `precision` is not a non-negative safe integer.
 */
export function dotProductDecimalIterative(a, b, precision = 20) {
  if (!Array.isArray(a)) {
    throw new TypeError(`Expected first argument "a" to be an array, got ${typeof a}`);
  }
  if (!Array.isArray(b)) {
    throw new TypeError(`Expected second argument "b" to be an array, got ${typeof b}`);
  }
  if (typeof precision !== 'number') {
    throw new TypeError(`Expected "precision" to be a number, got ${typeof precision}`);
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError(
      `Expected "precision" to be a non-negative safe integer, got ${precision}`
    );
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
    );
  }

  let accCoeff = 0n;
  let accExp = 0;

  for (let i = 0; i < a.length; i += 1) {
    const parsedA = parseDecimal(a[i], `a[${i}]`);
    const parsedB = parseDecimal(b[i], `b[${i}]`);

    if (parsedA.coeff === 0n || parsedB.coeff === 0n) {
      continue;
    }

    const prodCoeff = parsedA.coeff * parsedB.coeff;
    const prodExp = parsedA.exp + parsedB.exp;
    if (!Number.isSafeInteger(prodExp)) {
      throw new RangeError(`Product exponent overflow at index ${i}`);
    }

    if (accCoeff === 0n) {
      accCoeff = prodCoeff;
      accExp = prodExp;
    } else if (prodExp === accExp) {
      accCoeff += prodCoeff;
    } else if (prodExp > accExp) {
      accCoeff += prodCoeff * 10n ** BigInt(prodExp - accExp);
    } else {
      accCoeff = accCoeff * 10n ** BigInt(accExp - prodExp) + prodCoeff;
      accExp = prodExp;
    }

    if (accCoeff === 0n) {
      accExp = 0;
    }
  }

  return formatDecimal(accCoeff, accExp, precision);
}
