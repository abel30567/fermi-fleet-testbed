/**
 * @module ops/powers-roots/sqrtDecimalStable
 *
 * Arbitrary-precision square root over decimal strings using exact power-of-10
 * scaling, bit-length-guided Newton-Heron integer square root, verified exact
 * remainder error bounds, and exact round-half-to-even tie breaking without
 * intermediate floating-point truncation or double rounding.
 */

const DECIMAL_PATTERN = /^[+-]?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Computes the bit length of a positive BigInt.
 *
 * @param {bigint} n - Positive BigInt.
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
  const hex = n.toString(16);
  const firstNibble = parseInt(hex[0], 16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(firstNibble));
}

/**
 * Computes the exact integer square root `floor(sqrt(n))` for a non-negative BigInt `n`.
 *
 * Uses an upper-bounded initial approximation derived from the top 52 bits
 * scaled by an even power of two, followed by monotonically decreasing
 * Newton-Heron iterations and an explicit error-bound verification.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Exact `floor(sqrt(n))`.
 */
function isqrt(n) {
  if (n === 0n) {
    return 0n;
  }
  if (n < 4n) {
    return 1n;
  }

  const bits = bitLength(n);
  let x;
  if (bits <= 52) {
    // Guaranteed >= floor(sqrt(n)) even across IEEE-754 rounding boundaries.
    x = BigInt(Math.floor(Math.sqrt(Number(n)))) + 1n;
  } else {
    // Scale down by an even bit shift so the leading 51-52 bits fit exactly in a Number.
    const evenShift = (bits - 52 + 1) & ~1;
    const top = Number(n >> BigInt(evenShift));
    x = (BigInt(Math.floor(Math.sqrt(top))) + 2n) << BigInt(evenShift >> 1);
  }

  // Monotonically non-increasing integer Newton-Heron convergence to floor(sqrt(n)).
  while (true) {
    const next = (x + n / x) >> 1n;
    if (next >= x) {
      break;
    }
    x = next;
  }

  return x;
}

/**
 * Parses and normalizes a decimal string into exact `{ isZero, digits, digitCount, exponent }`
 * such that `value = digits * 10^exponent` with no leading or trailing zeros in `digits`.
 *
 * @param {string} input - Arbitrary-precision decimal string.
 * @returns {{ isZero: boolean, digits: bigint, digitCount: number, exponent: bigint }}
 */
function parseDecimal(input) {
  if (typeof input !== 'string') {
    throw new TypeError('value must be a decimal string');
  }

  const trimmed = input.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError(`Invalid decimal string: "${input}"`);
  }

  const isNegative = trimmed.startsWith('-');
  const intPart = match[1] ?? '';
  const fracPart = match[2] ?? match[3] ?? '';
  const expPart = match[4];

  let exp = 0n;
  if (expPart !== undefined) {
    exp = BigInt(expPart);
  }

  const rawDigits = intPart + fracPart;
  const strippedLeading = rawDigits.replace(/^0+/, '');

  if (strippedLeading.length === 0) {
    return { isZero: true, digits: 0n, digitCount: 0, exponent: 0n };
  }

  if (isNegative) {
    throw new RangeError('Cannot compute square root of a negative number');
  }

  let end = strippedLeading.length - 1;
  while (end > 0 && strippedLeading.charCodeAt(end) === 48) {
    end -= 1;
  }
  const trailingZeros = strippedLeading.length - 1 - end;
  const sigDigits = strippedLeading.slice(0, end + 1);
  const exponent = exp - BigInt(fracPart.length) + BigInt(trailingZeros);

  return {
    isZero: false,
    digits: BigInt(sigDigits),
    digitCount: sigDigits.length,
    exponent,
  };
}

/**
 * Formats a scaled non-negative integer `scaledValue` representing
 * `scaledValue * 10^(-precision)` into a canonical decimal string without
 * insignificant trailing fractional zeros.
 *
 * @param {bigint} scaledValue - Non-negative integer scaled by `10^precision`.
 * @param {number} precision - Non-negative number of fractional digits.
 * @returns {string} Canonical decimal string.
 */
function formatScaledDecimal(scaledValue, precision) {
  if (scaledValue === 0n) {
    return '0';
  }
  if (precision === 0) {
    return scaledValue.toString();
  }

  const digits = scaledValue.toString();
  let intPart;
  let fracPart;

  if (digits.length <= precision) {
    intPart = '0';
    fracPart = '0'.repeat(precision - digits.length) + digits;
  } else {
    const split = digits.length - precision;
    intPart = digits.slice(0, split);
    fracPart = digits.slice(split);
  }

  const trimmedFrac = fracPart.replace(/0+$/, '');
  return trimmedFrac.length === 0 ? intPart : `${intPart}.${trimmedFrac}`;
}

/**
 * Computes the square root of a non-negative arbitrary-precision decimal string
 * rounded half-to-even to the specified number of fractional decimal places.
 *
 * Numerical robustness guarantees:
 * - Zero floating-point truncation of inputs or intermediate products.
 * - Exact power-of-10 scaling handles arbitrarily small or large magnitudes
 *   without IEEE-754 underflow/overflow.
 * - Verified exact remainder bounds (`0 <= whole - q^2 <= 2q`) eliminate
 *   double-rounding error and resolve exact half-ULP ties cleanly.
 *
 * @param {string} value - Non-negative decimal string (supports standard and scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of fractional decimal digits.
 * @returns {string} Canonical decimal string of `sqrt(value)` rounded half-to-even to `precision` decimal places.
 * @throws {TypeError} If `value` is not a string or `precision` is not a number.
 * @throws {RangeError} If `value` is malformed or negative, or `precision` is not a non-negative safe integer.
 */
export function sqrtDecimalStable(value, precision = 20) {
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a number');
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative safe integer');
  }

  const parsed = parseDecimal(value);
  if (parsed.isZero) {
    return '0';
  }

  const { digits, digitCount, exponent } = parsed;
  // We need round(sqrt(digits * 10^exponent) * 10^precision)
  //       = round(sqrt(digits * 10^(exponent + 2 * precision))).
  const shift = exponent + 2n * BigInt(precision);

  let rounded;

  if (shift >= 0n) {
    const scaled = digits * (10n ** shift);
    const q = isqrt(scaled);
    const rem = scaled - q * q;

    // Exact error-bound invariant: q^2 <= scaled < (q + 1)^2 <=> 0 <= rem <= 2q.
    if (rem < 0n || rem > 2n * q) {
      throw new Error('Internal invariant violation in integer square root');
    }

    // Compare sqrt(scaled) vs q + 1/2:
    // 4 * scaled ? (2q + 1)^2 <=> 4 * rem ? 4q + 1 <=> rem > q (strict tie impossible for integer scaled).
    rounded = rem > q ? q + 1n : q;
  } else {
    const k = -shift;

    // Fast path for extreme underflow: if k > digitCount, then
    // value * 10^(2*precision) < 0.1, so sqrt(value) * 10^precision < sqrt(0.1) < 0.5.
    if (k > BigInt(digitCount)) {
      return '0';
    }

    const denom = 10n ** k;
    const whole = digits / denom;
    const frac = digits % denom;
    const q = isqrt(whole);
    const rem = whole - q * q;

    if (rem < 0n || rem > 2n * q) {
      throw new Error('Internal invariant violation in integer square root');
    }

    // Compare sqrt(whole + frac / denom) vs q + 1/2:
    // 4 * (rem * denom + frac) ? (4q + 1) * denom.
    if (rem > q) {
      rounded = q + 1n;
    } else if (rem < q) {
      rounded = q;
    } else {
      const fourFrac = 4n * frac;
      if (fourFrac > denom) {
        rounded = q + 1n;
      } else if (fourFrac < denom) {
        rounded = q;
      } else {
        // Exact halfway tie (q + 1/2): round half to even.
        rounded = (q & 1n) === 1n ? q + 1n : q;
      }
    }
  }

  return formatScaledDecimal(rounded, precision);
}
