/**
 * Computes the natural logarithm (ln) of a strictly positive arbitrary-precision
 * decimal string using straightforward iterative argument reduction (powers of 2
 * and repeated square roots) followed by an iterative atanh series over scaled
 * BigInt arithmetic.
 *
 * Mathematical identities used:
 * 1. Decimal normalization (for values outside [0.5, 10)):
 *    x = d * 10^k  (1 <= d < 10)  =>  ln(x) = ln(d) + k * ln(10)
 * 2. Power-of-2 reduction into [0.75, 1.5]:
 *    u = x / 2^p  =>  ln(x) = ln(u) + p * ln(2)
 * 3. Repeated square-root reduction until |v - 1| <= threshold:
 *    v = u^(1 / 2^r)  =>  ln(u) = 2^r * ln(v)
 * 4. Iterative atanh power series:
 *    y = (v - 1) / (v + 1)
 *    ln(v) = 2 * sum_{k=0..inf} y^(2k + 1) / (2k + 1)
 *
 * @param {string} value - Strictly positive decimal string (supports optional
 *   leading whitespace, optional `+` sign, decimal point, and `e`/`E` exponent).
 * @param {number} [precision=20] - Non-negative integer specifying the number of
 *   digits after the decimal point in the returned fixed-point string (rounded
 *   half-away-from-zero).
 * @returns {string} The natural logarithm formatted as a fixed-point decimal
 *   string with `precision` fractional digits.
 * @throws {TypeError} If `value` is not a string or `precision` is not a safe integer.
 * @throws {SyntaxError} If `value` is not a valid decimal string.
 * @throws {RangeError} If `value <= 0` or `precision < 0`.
 */
export function lnDecimalIterative(value, precision = 20) {
  validatePrecision(precision);
  const { digits, exp10 } = parsePositiveDecimal(value);

  // Exact ln(1) = 0
  if (digits === "1" && exp10 === 0n) {
    return formatZero(precision);
  }

  // Scientific notation exponent: x = d * 10^sciExp with d in [1, 10)
  const sciExp = exp10 + BigInt(digits.length - 1);

  // Keep values in [0.5, 10) directly without splitting out powers of 10
  const useDirect = sciExp === 0n || (sciExp === -1n && digits[0] >= "5");
  const k = useDirect ? 0n : sciExp;

  // Choose adaptive square-root reduction threshold 10^-targetDigits
  const targetDigits = Math.min(
    12,
    Math.max(3, Math.floor(Math.sqrt(precision) / 2) + 2)
  );
  const absK = k < 0n ? -k : k;
  const extraKDigits = absK === 0n ? 0 : absK.toString().length;

  // Guard digits absorb 2^r amplification (~targetDigits), k * ln(10) scaling
  // (~extraKDigits), and series / rounding ulp accumulation.
  const guardDigits = targetDigits + extraKDigits + 16;
  const workDigits = precision + guardDigits;
  const scale = 10n ** BigInt(workDigits);
  const sqrtThreshold = 10n ** BigInt(workDigits - targetDigits);

  // Lazily cached scaled ln(2) for this invocation
  let cachedLn2 = null;
  const getLn2 = () => {
    if (cachedLn2 === null) {
      cachedLn2 = lnNearOneScaled(2n * scale, scale, sqrtThreshold);
    }
    return cachedLn2;
  };

  let resultScaled;
  if (useDirect) {
    const scaledX = scaleDecimalToBigInt(digits, exp10, workDigits);
    resultScaled = lnPositiveScaled(scaledX, scale, sqrtThreshold, getLn2);
  } else {
    // d = digits * 10^(-(digits.length - 1)) in [1, 10)
    const dExp10 = -BigInt(digits.length - 1);
    const scaledD = scaleDecimalToBigInt(digits, dExp10, workDigits);
    const lnD =
      scaledD === scale
        ? 0n
        : lnPositiveScaled(scaledD, scale, sqrtThreshold, getLn2);
    const ln10 = lnPositiveScaled(10n * scale, scale, sqrtThreshold, getLn2);
    resultScaled = lnD + k * ln10;
  }

  return roundAndFormat(resultScaled, guardDigits, precision);
}

/**
 * Validates the `precision` argument.
 * @param {unknown} precision
 */
function validatePrecision(precision) {
  if (typeof precision !== "number" || !Number.isSafeInteger(precision)) {
    throw new TypeError("precision must be a non-negative safe integer");
  }
  if (precision < 0) {
    throw new RangeError("precision must be a non-negative integer");
  }
}

/**
 * Parses and validates a strictly positive decimal string into canonical
 * `{ digits, exp10 }` such that `value = BigInt(digits) * 10^exp10` with no
 * leading or trailing zeros in `digits`.
 *
 * @param {unknown} value
 * @returns {{ digits: string, exp10: bigint }}
 */
function parsePositiveDecimal(value) {
  if (typeof value !== "string") {
    throw new TypeError("value must be a decimal string");
  }
  const trimmed = value.trim();
  const match =
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(trimmed);
  if (!match) {
    throw new SyntaxError(`Invalid decimal string: "${value}"`);
  }

  const sign = match[1];
  const intPart = match[2] ?? "";
  const fracPart = match[3] ?? match[4] ?? "";
  const rawExpPart = match[5] ?? "0";
  const expPart = rawExpPart.startsWith("+") ? rawExpPart.slice(1) : rawExpPart;

  const combined = intPart + fracPart;
  const firstNonZero = combined.search(/[1-9]/);
  if (firstNonZero === -1) {
    throw new RangeError("Natural logarithm is undefined for zero");
  }
  if (sign === "-") {
    throw new RangeError("Natural logarithm is undefined for negative numbers");
  }

  let lastNonZero = combined.length - 1;
  while (lastNonZero > firstNonZero && combined[lastNonZero] === "0") {
    lastNonZero--;
  }

  const digits = combined.slice(firstNonZero, lastNonZero + 1);
  const trailingZeros = BigInt(combined.length - 1 - lastNonZero);
  const exp10 = BigInt(expPart) - BigInt(fracPart.length) + trailingZeros;

  return { digits, exp10 };
}

/**
 * Converts `BigInt(digits) * 10^exp10` into a scaled BigInt rounded to nearest
 * `10^-workDigits`.
 *
 * @param {string} digits
 * @param {bigint} exp10
 * @param {number} workDigits
 * @returns {bigint}
 */
function scaleDecimalToBigInt(digits, exp10, workDigits) {
  const shift = exp10 + BigInt(workDigits);
  const mantissa = BigInt(digits);
  if (shift >= 0n) {
    return mantissa * 10n ** shift;
  }
  const divisor = 10n ** -shift;
  return (mantissa + (divisor >> 1n)) / divisor;
}

/**
 * Computes scaled `ln(u)` for a scaled positive `u` (expected in [0.5, 10]) by
 * iteratively reducing by powers of 2 into [0.75, 1.5], then invoking
 * `lnNearOneScaled`.
 *
 * @param {bigint} uScaled
 * @param {bigint} scale
 * @param {bigint} sqrtThreshold
 * @param {() => bigint} getLn2
 * @returns {bigint}
 */
function lnPositiveScaled(uScaled, scale, sqrtThreshold, getLn2) {
  if (uScaled === scale) {
    return 0n;
  }

  const upper = (3n * scale) >> 1n; // 1.5 * scale
  const lower = (3n * scale) >> 2n; // 0.75 * scale

  let reduced = uScaled;
  let pow2 = 0n;

  while (reduced >= upper) {
    reduced = (reduced + 1n) >> 1n;
    pow2 += 1n;
  }
  while (reduced < lower) {
    reduced <<= 1n;
    pow2 -= 1n;
  }

  const lnReduced = lnNearOneScaled(reduced, scale, sqrtThreshold);
  if (pow2 === 0n) {
    return lnReduced;
  }
  return lnReduced + pow2 * getLn2();
}

/**
 * Computes scaled `ln(v)` for a scaled `v` near 1 (e.g. [0.75, 2]) using
 * iterative square-root argument reduction followed by the iterative atanh
 * series: `ln(w) = 2 * sum_{k=0..} y^(2k+1)/(2k+1)` where `y = (w - 1)/(w + 1)`.
 *
 * @param {bigint} vScaled
 * @param {bigint} scale
 * @param {bigint} sqrtThreshold
 * @returns {bigint}
 */
function lnNearOneScaled(vScaled, scale, sqrtThreshold) {
  if (vScaled === scale) {
    return 0n;
  }

  let current = vScaled;
  let rootCount = 0n;

  while (true) {
    const diff = current >= scale ? current - scale : scale - current;
    if (diff <= sqrtThreshold) {
      break;
    }
    current = bigIntSqrt(current * scale);
    rootCount += 1n;
  }

  const lnCurrent = lnAtanhSeriesScaled(current, scale);
  return lnCurrent << rootCount;
}

/**
 * Evaluates `ln(w) = 2 * atanh((w - 1) / (w + 1))` using the iterative odd-power
 * Taylor series over scaled BigInt arithmetic.
 *
 * @param {bigint} wScaled
 * @param {bigint} scale
 * @returns {bigint}
 */
function lnAtanhSeriesScaled(wScaled, scale) {
  const numerator = wScaled - scale;
  if (numerator === 0n) {
    return 0n;
  }
  const denominator = wScaled + scale;

  const y = (numerator * scale) / denominator;
  const y2 = (y * y) / scale;

  let sum = 0n;
  let power = y;
  let divisor = 1n;

  while (power !== 0n) {
    const term = power / divisor;
    if (term === 0n) {
      break;
    }
    sum += term;
    power = (power * y2) / scale;
    divisor += 2n;
  }

  return sum * 2n;
}

/**
 * Computes `floor(sqrt(n))` for a non-negative BigInt using Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function bigIntSqrt(n) {
  if (n < 0n) {
    throw new RangeError("Square root of negative BigInt");
  }
  if (n < 2n) {
    return n;
  }
  const bitLen = n.toString(2).length;
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
 * Formats zero with the requested number of fractional digits.
 *
 * @param {number} precision
 * @returns {string}
 */
function formatZero(precision) {
  return precision === 0 ? "0" : `0.${"0".repeat(precision)}`;
}

/**
 * Rounds a scaled BigInt value (dropping `guardDigits`) half-away-from-zero and
 * formats it as a fixed-point decimal string with `precision` fractional digits.
 *
 * @param {bigint} scaledValue
 * @param {number} guardDigits
 * @param {number} precision
 * @returns {string}
 */
function roundAndFormat(scaledValue, guardDigits, precision) {
  const isNegative = scaledValue < 0n;
  const absVal = isNegative ? -scaledValue : scaledValue;
  const divisor = 10n ** BigInt(guardDigits);
  const half = divisor >> 1n;
  const rounded = (absVal + half) / divisor;

  if (rounded === 0n) {
    return formatZero(precision);
  }

  const sign = isNegative ? "-" : "";
  if (precision === 0) {
    return `${sign}${rounded.toString()}`;
  }

  const digits = rounded.toString().padStart(precision + 1, "0");
  const splitIdx = digits.length - precision;
  return `${sign}${digits.slice(0, splitIdx)}.${digits.slice(splitIdx)}`;
}
