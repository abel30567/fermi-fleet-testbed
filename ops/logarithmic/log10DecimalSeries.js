/**
 * Arbitrary-precision base-10 logarithm over positive decimal strings.
 *
 * Uses BigInt fixed-point decimal arithmetic with:
 * 1. Exact decimal exponent range reduction: `x = m * 10^k` with `m in [1, 10)`.
 * 2. Exact fast path for integer powers of 10 (`m === 1`).
 * 3. Square-root argument reduction (`ln(y) = 2^r * ln(y^(1/2^r))`) into `[1, 1.01]`.
 * 4. The inverse hyperbolic tangent (`artanh`) series:
 *    `ln(u) = 2 * sum_{j=0}^\infty ((u - 1) / (u + 1))^(2j + 1) / (2j + 1)`.
 * 5. `log10(x) = k + ln(m) / ln(10)` rounded half-to-even to `precision` fractional digits.
 *
 * @module ops/logarithmic/log10DecimalSeries
 */

const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Compute floor(sqrt(n)) for a non-negative BigInt `n` using Newton's method.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} Integer square root of `n`.
 */
function bigintSqrt(n) {
  if (n < 2n) {
    return n;
  }
  const hexLen = n.toString(16).length;
  let x = 1n << BigInt(hexLen * 2);
  while (true) {
    const next = (x + n / x) >> 1n;
    if (next >= x) {
      return x;
    }
    x = next;
  }
}

/**
 * Divide two non-negative BigInts with round-half-to-even.
 *
 * @param {bigint} numerator - Non-negative dividend.
 * @param {bigint} denominator - Positive divisor.
 * @returns {bigint} Rounded quotient.
 */
function divRoundHalfToEven(numerator, denominator) {
  const q = numerator / denominator;
  const r = numerator % denominator;
  const twiceR = r * 2n;
  if (twiceR > denominator || (twiceR === denominator && (q & 1n) === 1n)) {
    return q + 1n;
  }
  return q;
}

/**
 * Compute scaled natural logarithm `floor(ln(y / scale) * scale)` for `y >= scale`.
 *
 * Reduces `y / scale` into `[1, 1.01]` via repeated square roots, then evaluates
 * `2 * artanh((u - 1) / (u + 1))` using exact numerator/denominator powers.
 *
 * @param {bigint} y - Fixed-point value `>= scale`.
 * @param {bigint} scale - Fixed-point scaling factor (`10^workDigits`).
 * @returns {bigint} Scaled natural logarithm.
 */
function lnFixed(y, scale) {
  if (y === scale) {
    return 0n;
  }

  const threshold = scale + scale / 100n;
  let r = 0;
  let reduced = y;
  while (reduced > threshold) {
    reduced = bigintSqrt(reduced * scale);
    r += 1;
  }

  const num = reduced - scale;
  const den = reduced + scale;
  const z2Num = num * num;
  const z2Den = den * den;

  let term = (num * scale) / den;
  let sum = term;
  let k = 1n;

  while (term !== 0n) {
    term = (term * z2Num) / z2Den;
    if (term === 0n) {
      break;
    }
    const contrib = term / (2n * k + 1n);
    if (contrib === 0n) {
      break;
    }
    sum += contrib;
    k += 1n;
  }

  return (sum * 2n) << BigInt(r);
}

/**
 * Parse and validate a strictly positive decimal string into normalized
 * significant digits (with no leading/trailing zeros) and base-10 exponent `k`
 * such that `value = m * 10^k` with `m = BigInt(digits) / 10^(digits.length - 1) in [1, 10)`.
 *
 * @param {string} value - Positive decimal string.
 * @returns {{ digits: string, exp10: bigint }} Normalized mantissa digits and exponent.
 */
function parsePositiveDecimal(value) {
  if (typeof value !== 'string') {
    throw new TypeError('value must be a decimal string');
  }

  const trimmed = value.trim();
  const match = DECIMAL_RE.exec(trimmed);
  if (!match) {
    throw new RangeError(`Invalid decimal string: "${value}"`);
  }

  const [, sign, intPart = '', fracAfterInt = '', fracOnly = '', expPart = '0'] = match;
  if (sign === '-') {
    throw new RangeError('value must be strictly greater than 0');
  }

  const fracPart = fracOnly || fracAfterInt;
  const rawDigits = intPart + fracPart;
  const strippedLeading = rawDigits.replace(/^0+/, '');
  if (strippedLeading.length === 0) {
    throw new RangeError('value must be strictly greater than 0');
  }

  const digits = strippedLeading.replace(/0+$/, '');
  const trailingZeros = strippedLeading.length - digits.length;
  const exp = BigInt(expPart) - BigInt(fracPart.length) + BigInt(trailingZeros);
  const exp10 = exp + BigInt(digits.length - 1);

  return { digits, exp10 };
}

/**
 * Compute the base-10 logarithm of a strictly positive arbitrary-precision
 * decimal string using decimal exponent range reduction and the `artanh` series.
 *
 * Exact powers of 10 return exact integer strings (e.g. `"100"` -> `"2"`,
 * `"0.001"` -> `"-3"`). Non-exact values are rounded half-to-even to `precision`
 * fractional decimal places with trailing fractional zeros trimmed.
 *
 * @param {string} value - Strictly positive decimal string (supports optional `+`, `.`, and `e`/`E` exponent).
 * @param {number} [precision=30] - Number of fractional decimal digits of precision (positive safe integer).
 * @returns {string} Decimal string representation of `log10(value)`.
 * @throws {TypeError} If `value` is not a string or `precision` is not a number.
 * @throws {RangeError} If `value` is not a valid decimal string `> 0`, or `precision` is not a positive safe integer.
 */
export function log10DecimalSeries(value, precision = 30) {
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a positive integer');
  }
  if (!Number.isSafeInteger(precision) || precision < 1) {
    throw new RangeError('precision must be a positive safe integer >= 1');
  }

  const { digits, exp10 } = parsePositiveDecimal(value);

  // Exact integer power of 10: m === 1 => log10(10^k) = k
  if (digits === '1') {
    return exp10.toString();
  }

  // Working precision with guard digits to absorb sqrt reduction and series truncation error
  const guardDigits = 24 + Math.ceil(Math.log10(precision + 10)) * 2;
  const workDigits = precision + guardDigits;
  const scale = 10n ** BigInt(workDigits);

  // Convert normalized mantissa m = BigInt(digits) / 10^(digits.length - 1) to fixed-point M = m * scale
  const fracLen = digits.length - 1;
  let mantissaScaled;
  if (fracLen <= workDigits) {
    mantissaScaled = BigInt(digits) * (10n ** BigInt(workDigits - fracLen));
  } else {
    mantissaScaled = divRoundHalfToEven(BigInt(digits), 10n ** BigInt(fracLen - workDigits));
  }

  // Compute ln(m) and ln(10), then frac = ln(m) / ln(10) in fixed-point
  const lnM = lnFixed(mantissaScaled, scale);
  const ln10 = lnFixed(10n * scale, scale);
  const fracScaled = divRoundHalfToEven(lnM * scale, ln10);

  // Combine exact integer exponent k with fractional part: total = k + ln(m) / ln(10)
  const totalScaled = exp10 * scale + fracScaled;
  const negative = totalScaled < 0n;
  const absTotal = negative ? -totalScaled : totalScaled;

  // Round from workDigits down to precision fractional digits
  const drop = 10n ** BigInt(guardDigits);
  const rounded = divRoundHalfToEven(absTotal, drop);

  if (rounded === 0n) {
    return '0';
  }

  const outScale = 10n ** BigInt(precision);
  const intPart = rounded / outScale;
  const fracPart = rounded % outScale;
  const sign = negative ? '-' : '';

  if (fracPart === 0n) {
    return `${sign}${intPart}`;
  }

  const fracStr = fracPart.toString().padStart(precision, '0').replace(/0+$/, '');
  return `${sign}${intPart}.${fracStr}`;
}
