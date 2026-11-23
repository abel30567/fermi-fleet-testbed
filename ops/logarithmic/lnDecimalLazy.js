/**
 * @fileoverview Arbitrary-precision decimal natural logarithm (`ln`) using
 * pure BigInt fixed-point arithmetic and lazy generator-based streaming.
 *
 * Algorithm:
 * 1. Parse each positive decimal string exactly into normalized scientific
 *    form `x = m * 10^k` with `1 <= m < 10` and integer `k`.
 * 2. Use range reduction `ln(x) = ln(m) + k * ln(10)`.
 * 3. Compute `ln(m)` via repeated fixed-point square roots (`m_r = m^(1/2^r)`)
 *    followed by the rapidly converging hyperbolic arctangent series:
 *    `ln(u) = 2 * atanh((u - 1) / (u + 1)) = 2 * sum_{j>=0} y^(2j+1) / (2j+1)`,
 *    then multiply by `2^r`.
 * 4. Compute `ln(10)` via Machin-like reciprocal `atanh` identities:
 *    `ln(10) = 46 * atanh(1/31) + 34 * atanh(1/49) + 20 * atanh(1/161)`,
 *    cached per working precision for the lifetime of the stream.
 *
 * Zero dependencies, pure ESM (Node 20+).
 */

const DECIMAL_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

/**
 * Compute floor(sqrt(n)) for a non-negative BigInt using Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
  if (n < 2n) return n;
  const hexLen = n.toString(16).length;
  let x = 1n << BigInt(hexLen * 2);
  while (true) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/**
 * Compute `atanh(1 / p)` scaled by `scale` (`10^workDigits`) for integer `p > 1`.
 *
 * @param {bigint} p
 * @param {bigint} scale
 * @returns {bigint}
 */
function atanhRecip(p, scale) {
  const p2 = p * p;
  let power = scale / p;
  let sum = power;
  let denom = 3n;
  while (power !== 0n) {
    power /= p2;
    const term = power / denom;
    if (term === 0n) break;
    sum += term;
    denom += 2n;
  }
  return sum;
}

/**
 * Compute `ln(10)` scaled by `scale` using Machin-like `atanh` identities:
 * `ln(10) = 46 * atanh(1/31) + 34 * atanh(1/49) + 20 * atanh(1/161)`.
 *
 * @param {bigint} scale
 * @returns {bigint}
 */
function computeLn10(scale) {
  return (
    46n * atanhRecip(31n, scale) +
    34n * atanhRecip(49n, scale) +
    20n * atanhRecip(161n, scale)
  );
}

/**
 * Parse and validate a strictly positive decimal string into normalized form:
 * `value = (BigInt(digits) * 10^-(digits.length - 1)) * 10^exp10`,
 * so the normalized mantissa lies in `[1, 10)`.
 *
 * @param {unknown} raw
 * @returns {{ digits: string, exp10: bigint }}
 */
function parsePositiveDecimal(raw) {
  if (typeof raw !== 'string') {
    throw new TypeError(`Expected a decimal string, received ${raw === null ? 'null' : typeof raw}`);
  }
  const trimmed = raw.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new RangeError(`Invalid decimal string: "${raw}"`);
  }

  let body = trimmed;
  let isNegative = false;
  if (body[0] === '-') {
    isNegative = true;
    body = body.slice(1);
  } else if (body[0] === '+') {
    body = body.slice(1);
  }

  const eIndex = body.search(/[eE]/);
  const coeffStr = eIndex === -1 ? body : body.slice(0, eIndex);
  const expPart = eIndex === -1 ? '0' : body.slice(eIndex + 1);

  const dotIndex = coeffStr.indexOf('.');
  const intPart = dotIndex === -1 ? coeffStr : coeffStr.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? '' : coeffStr.slice(dotIndex + 1);

  const combined = intPart + fracPart;
  const firstNonZero = combined.search(/[1-9]/);
  if (firstNonZero === -1) {
    throw new RangeError(`Natural logarithm requires a strictly positive input (> 0), received "${raw}"`);
  }
  if (isNegative) {
    throw new RangeError(`Natural logarithm requires a strictly positive input (> 0), received "${raw}"`);
  }

  // Strip leading and trailing zeros from significant digits.
  let lastNonZero = combined.length - 1;
  while (lastNonZero > firstNonZero && combined[lastNonZero] === '0') {
    lastNonZero--;
  }

  const digits = combined.slice(firstNonZero, lastNonZero + 1);
  const trailingZeros = combined.length - 1 - lastNonZero;
  const rawExp10 = BigInt(expPart) - BigInt(fracPart.length) + BigInt(trailingZeros);
  const exp10 = rawExp10 + BigInt(digits.length - 1);

  return { digits, exp10 };
}

/**
 * Convert normalized significant digits (representing `m` in `[1, 10)`)
 * into fixed-point `round(m * 10^workDigits)`.
 *
 * @param {string} digits
 * @param {number} workDigits
 * @returns {bigint}
 */
function mantissaToFixed(digits, workDigits) {
  const shift = workDigits - (digits.length - 1);
  if (shift >= 0) {
    return BigInt(digits) * (10n ** BigInt(shift));
  }
  const keepLen = workDigits + 1;
  let scaled = BigInt(digits.slice(0, keepLen));
  if (digits[keepLen] >= '5') {
    scaled += 1n;
  }
  return scaled;
}

/**
 * Compute `ln(m)` scaled by `scale = 10^workDigits` for `U = round(m * scale)`
 * with `1 <= m <= 10`, using `sqrtSteps` repeated square roots + `atanh` series.
 *
 * @param {bigint} uFixed
 * @param {bigint} scale
 * @param {number} sqrtSteps
 * @returns {bigint}
 */
function fixedLnMantissa(uFixed, scale, sqrtSteps) {
  if (uFixed === scale) return 0n;

  let u = uFixed;
  for (let i = 0; i < sqrtSteps; i++) {
    u = isqrt(u * scale);
  }

  const y = ((u - scale) * scale) / (u + scale);
  if (y === 0n) return 0n;

  const y2 = (y * y) / scale;
  let sum = y;
  let term = y;
  let denom = 3n;

  while (term !== 0n) {
    term = (term * y2) / scale;
    const contrib = term / denom;
    if (contrib === 0n) break;
    sum += contrib;
    denom += 2n;
  }

  return sum << BigInt(sqrtSteps + 1);
}

/**
 * Format a non-negative integer `scaled` representing `scaled * 10^-precision`
 * with optional minus sign, normalizing negative zero to positive zero.
 *
 * @param {bigint} scaled
 * @param {boolean} isNegative
 * @param {number} precision
 * @returns {string}
 */
function formatFixed(scaled, isNegative, precision) {
  const neg = isNegative && scaled !== 0n;
  const sign = neg ? '-' : '';
  if (precision === 0) {
    return sign + scaled.toString();
  }
  const str = scaled.toString().padStart(precision + 1, '0');
  const splitIdx = str.length - precision;
  return `${sign}${str.slice(0, splitIdx)}.${str.slice(splitIdx)}`;
}

/**
 * Compute `ln(x)` as a decimal string rounded to `precision` fractional digits.
 *
 * @param {string} raw
 * @param {number} precision
 * @param {Map<number, { scale: bigint, ln10: bigint }>} ln10Cache
 * @returns {string}
 */
function computeLnDecimal(raw, precision, ln10Cache) {
  const { digits, exp10 } = parsePositiveDecimal(raw);

  // Exact identity: ln(1) = 0
  if (digits === '1' && exp10 === 0n) {
    return formatFixed(0n, false, precision);
  }

  const kAbs = exp10 < 0n ? -exp10 : exp10;
  const kDigits = exp10 === 0n ? 0 : kAbs.toString().length;

  let extraGuard = 16;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sqrtSteps = Math.min(32, Math.max(10, Math.ceil(Math.sqrt(precision + kDigits + extraGuard) * 1.5)));
    const sqrtGuard = Math.ceil((sqrtSteps + 1) * 0.302) + 8;
    const guard = extraGuard + kDigits + sqrtGuard;
    const workDigits = precision + guard;

    let cached = ln10Cache.get(workDigits);
    let scale;
    if (cached) {
      scale = cached.scale;
    } else {
      scale = 10n ** BigInt(workDigits);
    }

    const uFixed = mantissaToFixed(digits, workDigits);
    let total = fixedLnMantissa(uFixed, scale, sqrtSteps);

    if (exp10 !== 0n) {
      if (!cached) {
        cached = { scale, ln10: computeLn10(scale) };
        ln10Cache.set(workDigits, cached);
      }
      total += exp10 * cached.ln10;
    }

    const factor = 10n ** BigInt(guard);
    const half = factor / 2n;
    const isNegative = total < 0n;
    const absTotal = isNegative ? -total : total;
    const remainder = absTotal % factor;
    const distFromHalf = remainder >= half ? remainder - half : half - remainder;

    // Guard against near-halfway rounding ambiguity (Table-Maker's Dilemma).
    if (attempt < 2 && distFromHalf < factor / 10000n) {
      extraGuard *= 2;
      continue;
    }

    const rounded = (absTotal + half) / factor;
    return formatFixed(rounded, isNegative, precision);
  }
}

/**
 * Internal lazy generator yielding `ln(x)` for each element pulled from `source`.
 *
 * @param {Iterable<string>} source
 * @param {number} precision
 * @returns {Generator<string, void, undefined>}
 */
function* lnGenerator(source, precision) {
  /** @type {Map<number, { scale: bigint, ln10: bigint }>} */
  const ln10Cache = new Map();
  for (const item of source) {
    yield computeLnDecimal(item, precision, ln10Cache);
  }
}

/**
 * Lazily compute the natural logarithm (`ln`) over arbitrary-precision positive
 * decimal strings with configurable fractional decimal precision.
 *
 * Consumes iterable sequences lazily one element at a time via a generator
 * (supports infinite iterables, early termination, and lazy per-item evaluation).
 * Passing a single decimal string is treated as a one-element sequence rather
 * than iterating over individual characters.
 *
 * @param {Iterable<string> | string} inputs - An iterable sequence of strictly
 *   positive decimal strings (supports standard and scientific notation), or a
 *   single decimal string.
 * @param {number} [precision=20] - Non-negative integer specifying the number
 *   of digits after the decimal point in each yielded result.
 * @returns {Generator<string, void, undefined>} A generator yielding decimal
 *   string representations of `ln(x)` rounded to `precision` decimal places.
 * @throws {TypeError} If `inputs` is not a string or iterable, `precision` is
 *   not a number, or a yielded element is not a string.
 * @throws {RangeError} If `precision` is not a non-negative integer, or a
 *   yielded element is not a valid strictly positive (`> 0`) decimal string.
 */
export function lnDecimalLazy(inputs, precision = 20) {
  if (typeof precision !== 'number') {
    throw new TypeError(`precision must be a number, received ${precision === null ? 'null' : typeof precision}`);
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError(`precision must be a non-negative safe integer, received ${precision}`);
  }

  let source;
  if (typeof inputs === 'string') {
    source = [inputs];
  } else if (inputs !== null && inputs !== undefined && typeof inputs[Symbol.iterator] === 'function') {
    source = inputs;
  } else {
    throw new TypeError('inputs must be an iterable of decimal strings or a decimal string');
  }

  return lnGenerator(source, precision);
}
