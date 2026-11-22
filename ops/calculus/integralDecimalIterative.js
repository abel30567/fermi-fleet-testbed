const DECIMAL_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_ABS_EXPONENT = 100000;
const DEFAULT_PRECISION = 20;
const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_MIN_ITERATIONS = 3;

/**
 * Computes 10^n as a BigInt for non-negative integer n.
 * @param {number} n
 * @returns {bigint}
 */
function pow10(n) {
  return 10n ** BigInt(n);
}

/**
 * Divides a BigInt numerator by a positive BigInt denominator using
 * round-half-to-even (banker's rounding).
 *
 * @param {bigint} num
 * @param {bigint} den - Must be > 0n.
 * @returns {bigint}
 */
function divRoundHalfEven(num, den) {
  if (num === 0n) {
    return 0n;
  }
  const negative = num < 0n;
  const absNum = negative ? -num : num;
  let q = absNum / den;
  const r = absNum % den;
  const twiceR = r * 2n;
  if (twiceR > den || (twiceR === den && (q & 1n) === 1n)) {
    q += 1n;
  }
  return negative ? -q : q;
}

/**
 * Parses a decimal string (supporting optional leading sign and scientific notation)
 * into an exact scaled BigInt representation: value * 10^(-scale) with scale >= 0.
 *
 * @param {unknown} raw
 * @param {string} label
 * @returns {{ value: bigint, scale: number }}
 */
function parseDecimal(raw, label) {
  if (typeof raw !== "string") {
    throw new TypeError(`${label} must be a decimal string`);
  }
  if (!DECIMAL_REGEX.test(raw)) {
    throw new RangeError(`${label} is not a valid decimal string: "${raw}"`);
  }

  let str = raw;
  let negative = false;
  if (str[0] === "-") {
    negative = true;
    str = str.slice(1);
  } else if (str[0] === "+") {
    str = str.slice(1);
  }

  let exp = 0;
  const expIdx = str.search(/[eE]/);
  if (expIdx !== -1) {
    const expStr = str.slice(expIdx + 1);
    exp = Number(expStr);
    if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_ABS_EXPONENT) {
      throw new RangeError(`${label} exponent out of supported range: "${raw}"`);
    }
    str = str.slice(0, expIdx);
  }

  const dotIdx = str.indexOf(".");
  let digits;
  let fracLen = 0;
  if (dotIdx !== -1) {
    const intPart = str.slice(0, dotIdx);
    const fracPart = str.slice(dotIdx + 1);
    digits = intPart + fracPart;
    fracLen = fracPart.length;
  } else {
    digits = str;
  }

  let value = BigInt(digits);
  if (value === 0n) {
    return { value: 0n, scale: 0 };
  }

  let scale = fracLen - exp;
  if (scale < 0) {
    value *= pow10(-scale);
    scale = 0;
  }

  if (negative) {
    value = -value;
  }

  return { value, scale };
}

/**
 * Rescales a fixed-point BigInt from `fromScale` decimal places to `toScale` decimal places
 * using round-half-to-even when reducing scale.
 *
 * @param {bigint} value
 * @param {number} fromScale
 * @param {number} toScale
 * @returns {bigint}
 */
function rescale(value, fromScale, toScale) {
  if (value === 0n || fromScale === toScale) {
    return value;
  }
  if (toScale > fromScale) {
    return value * pow10(toScale - fromScale);
  }
  return divRoundHalfEven(value, pow10(fromScale - toScale));
}

/**
 * Formats a scaled BigInt (value * 10^(-scale)) into a normalized decimal string
 * with no trailing fractional zeros and no "-0".
 *
 * @param {bigint} value
 * @param {number} scale
 * @returns {string}
 */
function formatFixed(value, scale) {
  if (value === 0n) {
    return "0";
  }
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const sign = negative ? "-" : "";

  if (scale === 0) {
    return sign + digits;
  }

  let intPart;
  let fracPart;
  if (digits.length <= scale) {
    intPart = "0";
    fracPart = digits.padStart(scale, "0");
  } else {
    const split = digits.length - scale;
    intPart = digits.slice(0, split);
    fracPart = digits.slice(split);
  }

  let end = fracPart.length;
  while (end > 0 && fracPart.charCodeAt(end - 1) === 48) {
    end -= 1;
  }
  if (end === 0) {
    return sign + intPart;
  }
  return `${sign}${intPart}.${fracPart.slice(0, end)}`;
}

/**
 * Validates and normalizes the options object.
 *
 * @param {unknown} options
 * @param {number} precision
 * @returns {{ maxIterations: number, minIterations: number, guardDigits: number }}
 */
function parseOptions(options, precision) {
  if (options === undefined) {
    return {
      maxIterations: DEFAULT_MAX_ITERATIONS,
      minIterations: DEFAULT_MIN_ITERATIONS,
      guardDigits: Math.max(10, Math.ceil(precision / 4) + 8),
    };
  }
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("options must be a plain object");
  }

  const maxIterations =
    options.maxIterations === undefined ? DEFAULT_MAX_ITERATIONS : options.maxIterations;

  if (typeof maxIterations !== "number") {
    throw new TypeError("options.maxIterations must be a number");
  }
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError("options.maxIterations must be a positive integer");
  }

  const minIterations =
    options.minIterations === undefined
      ? Math.min(DEFAULT_MIN_ITERATIONS, maxIterations)
      : options.minIterations;
  const guardDigits =
    options.guardDigits === undefined
      ? Math.max(10, Math.ceil(precision / 4) + 8)
      : options.guardDigits;

  if (typeof minIterations !== "number") {
    throw new TypeError("options.minIterations must be a number");
  }
  if (!Number.isInteger(minIterations) || minIterations < 1 || minIterations > maxIterations) {
    throw new RangeError(
      "options.minIterations must be a positive integer <= options.maxIterations"
    );
  }

  if (typeof guardDigits !== "number") {
    throw new TypeError("options.guardDigits must be a number");
  }
  if (!Number.isInteger(guardDigits) || guardDigits < 0) {
    throw new RangeError("options.guardDigits must be a non-negative integer");
  }

  return { maxIterations, minIterations, guardDigits };
}

/**
 * Computes the definite integral of a decimal-string function `fn` over `[a, b]`
 * using iterative arbitrary-precision Romberg integration (iterative composite
 * trapezoidal refinement paired with Richardson extrapolation) over BigInt
 * fixed-point arithmetic.
 *
 * Sample nodes `x = a + (2i - 1) * (b - a) / 2^k` are computed exactly as terminating
 * decimal strings at each refinement level `k` (since division by `2^k` is exact in
 * base 10), avoiding node-rounding drift across arbitrary interval widths.
 *
 * Rounding uses round-half-to-even; output is normalized with no trailing fractional
 * zeros and no `"-0"`.
 *
 * @param {(xStr: string, workPrecision: number) => string} fn
 *   Integrand function receiving an exact decimal string `xStr` and an integer
 *   `workPrecision` (recommended fractional digits to compute) and returning a
 *   valid decimal string.
 * @param {string} a - Lower bound of integration as a decimal string.
 * @param {string} b - Upper bound of integration as a decimal string.
 * @param {number} [precision=20] - Non-negative integer number of decimal places
 *   for the returned result.
 * @param {object} [options={}] - Optional convergence configuration.
 * @param {number} [options.maxIterations=20] - Maximum Romberg refinement levels
 *   (evaluates up to `2^maxIterations + 1` points).
 * @param {number} [options.minIterations=3] - Minimum Romberg refinement levels
 *   before checking convergence (`1 <= minIterations <= maxIterations`).
 * @param {number} [options.guardDigits] - Extra internal decimal digits beyond
 *   `precision` (defaults to `Math.max(10, Math.ceil(precision / 4) + 8)`).
 * @returns {string} Normalized decimal string representing the definite integral
 *   rounded to `precision` decimal places. Returns `"0"` when `a === b`, and the
 *   negated integral when `a > b`.
 * @throws {TypeError} If `fn` is not a function, `a`/`b` or `fn`'s return value is
 *   not a string, `precision` is not a number, or `options` has invalid types.
 * @throws {RangeError} If `a`/`b` or `fn`'s return value is not a valid decimal
 *   string, `precision` or option values are out of range, or Romberg integration
 *   does not converge within `options.maxIterations`.
 */
export function integralDecimalIterative(fn, a, b, precision = DEFAULT_PRECISION, options = undefined) {
  if (typeof fn !== "function") {
    throw new TypeError("fn must be a function");
  }

  const parsedA = parseDecimal(a, "a");
  const parsedB = parseDecimal(b, "b");

  if (typeof precision !== "number") {
    throw new TypeError("precision must be a number");
  }
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError("precision must be a non-negative integer");
  }

  const { maxIterations, minIterations, guardDigits } = parseOptions(options, precision);

  // Align bounds a and b onto a common exact decimal scale s0.
  const s0 = Math.max(parsedA.scale, parsedB.scale);
  let a0 = rescale(parsedA.value, parsedA.scale, s0);
  let b0 = rescale(parsedB.value, parsedB.scale, s0);

  if (a0 === b0) {
    return "0";
  }

  let negate = false;
  if (a0 > b0) {
    const tmp = a0;
    a0 = b0;
    b0 = tmp;
    negate = true;
  }

  const delta = b0 - a0; // > 0n, represents (b - a) * 10^s0
  const spanIntDigits = Math.max(0, delta.toString().length - s0);

  const workScale = precision + guardDigits;
  const fnWorkScale = workScale + spanIntDigits;

  // Convergence tolerance in workScale units: require agreement to at least
  // min(guardDigits, 6) digits past the requested precision (or 0n if guardDigits === 0).
  const tolShift = Math.max(0, guardDigits - 6);
  const tolerance = guardDigits === 0 ? 0n : pow10(tolShift);

  /**
   * Evaluates fn at xStr and converts the returned decimal string to fnWorkScale fixed-point.
   * @param {string} xStr
   * @returns {bigint}
   */
  const evalAt = (xStr) => {
    const yRaw = fn(xStr, fnWorkScale);
    const parsedY = parseDecimal(yRaw, "fn(x)");
    return rescale(parsedY.value, parsedY.scale, fnWorkScale);
  };

  // Level k = 0: single trapezoid over [a, b].
  const yA = evalAt(formatFixed(a0, s0));
  const yB = evalAt(formatFixed(b0, s0));

  let hDenom = pow10(spanIntDigits + s0);
  let prevRow = [divRoundHalfEven((yA + yB) * delta, 2n * hDenom)];

  let aScaled = a0;
  let hExact = delta;
  let xScale = s0;
  let converged = false;
  let best = prevRow[0];

  for (let k = 1; k <= maxIterations; k += 1) {
    // Halve step size exactly in base 10: h_k = (b - a) / 2^k = (delta * 5^k) * 10^-(s0 + k).
    aScaled *= 10n;
    hExact *= 5n;
    xScale += 1;
    hDenom *= 10n;

    const midpointCount = 1n << BigInt(k - 1);
    const step = hExact * 2n;
    let xNum = aScaled + hExact;
    let sumY = 0n;

    for (let i = 0n; i < midpointCount; i += 1n) {
      sumY += evalAt(formatFixed(xNum, xScale));
      xNum += step;
    }

    const trapTerm = divRoundHalfEven(sumY * hExact, hDenom);
    const currRow = new Array(k + 1);
    currRow[0] = divRoundHalfEven(prevRow[0], 2n) + trapTerm;

    // Richardson extrapolation across the current row.
    let factor = 4n;
    for (let j = 1; j <= k; j += 1) {
      const diff = currRow[j - 1] - prevRow[j - 1];
      currRow[j] = currRow[j - 1] + divRoundHalfEven(diff, factor - 1n);
      factor *= 4n;
    }

    best = currRow[k];

    if (k >= minIterations) {
      const diagDiff = best >= prevRow[k - 1] ? best - prevRow[k - 1] : prevRow[k - 1] - best;
      const rowDiff = best >= currRow[k - 1] ? best - currRow[k - 1] : currRow[k - 1] - best;
      if (diagDiff <= tolerance && rowDiff <= tolerance) {
        converged = true;
        break;
      }
    }

    prevRow = currRow;
  }

  if (!converged) {
    throw new RangeError(
      `integralDecimalIterative failed to converge within ${maxIterations} iterations`
    );
  }

  let result = rescale(best, workScale, precision);
  if (negate && result !== 0n) {
    result = -result;
  }

  return formatFixed(result, precision);
}
