/**
 * Computes the gradient vector of a multivariable scalar field over
 * arbitrary-precision decimal strings using BigInt-based central finite
 * differences combined with iterative Richardson extrapolation.
 *
 * For a scalar field `f: R^n -> R` evaluated at `point = [x_0, ..., x_{n-1}]`,
 * each partial derivative `∂f/∂x_i` is computed iteratively by halving the
 * step size `h_k = h_0 / 2^k` (represented as exact terminating decimals) and
 * building the Richardson extrapolation table:
 *
 *   R(k, 0) = (f(x + h_k * e_i) - f(x - h_k * e_i)) / (2 * h_k)
 *   R(k, j) = R(k, j - 1) + (R(k, j - 1) - R(k - 1, j - 1)) / (4^j - 1)
 *
 * Extrapolation continues iteratively until consecutive estimates agree within
 * the convergence tolerance, a noise-floor safeguard triggers, or `maxLevels`
 * is reached. All core arithmetic uses exact `BigInt` scaled integers with
 * zero floating-point precision loss and zero external dependencies.
 *
 * Output values are rounded to `precision` decimal places using
 * round-half-away-from-zero and normalized (no trailing fractional zeros,
 * no leading `+`, and never `"-0"`).
 *
 * @param {(coords: string[], workPrecision: number) => string} fn
 *   Scalar field callback accepting an array of normalized decimal coordinate
 *   strings and a recommended working decimal precision (`workPrecision`), and
 *   returning the scalar function value as a decimal string.
 * @param {string[]} point
 *   Non-empty array of decimal strings `[x_0, x_1, ...]` specifying the
 *   evaluation point. Accepts optional leading `+`/`-`, integer or fractional
 *   forms, and optional scientific notation (e.g. `"-1.25e-4"`).
 * @param {number} [precision=20]
 *   Non-negative safe integer specifying the number of decimal places to round
 *   each gradient component to.
 * @param {object} [options={}]
 *   Optional configuration object:
 * @param {string} [options.initialStep]
 *   Positive decimal string for the initial central-difference step size `h_0`.
 *   Defaults to `10^(-stepExp)` where `stepExp = max(4, min(8, ceil(precision / 6) + 2))`.
 * @param {number} [options.maxLevels]
 *   Integer in `[1, 100]` specifying the maximum number of Richardson
 *   extrapolation levels per partial derivative.
 *   Defaults to `max(12, min(30, ceil(precision / 3) + 8))`.
 * @param {string} [options.tolerance]
 *   Positive decimal string specifying the convergence threshold between
 *   successive Richardson estimates. Defaults to `10^(-(precision + 6))`.
 * @param {number} [options.workPrecision]
 *   Non-negative safe integer overriding the working precision passed to `fn`.
 *   Defaults to an automatically sized precision that accounts for `precision`,
 *   guard digits, and step-size cancellation.
 * @returns {string[]}
 *   Array of normalized decimal strings `[∂f/∂x_0, ∂f/∂x_1, ...]` of the same
 *   length as `point`, each rounded to `precision` decimal places.
 * @throws {TypeError}
 *   If `fn` is not a function, `point` is not an array, any coordinate or
 *   `fn` return value is not a string, `precision` is not a number, or
 *   `options` / option fields have invalid types.
 * @throws {RangeError}
 *   If `point` is empty, any decimal string is malformed or out of exponent
 *   range, `precision` is negative or not a safe integer, or any option value
 *   is out of its valid domain.
 */

const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_EXPONENT_ABS = 1_000_000;
const MAX_ALLOWED_LEVELS = 100;

/**
 * Returns `10n ** BigInt(n)` for a non-negative integer `n`.
 * @param {number} n
 * @returns {bigint}
 */
function pow10(n) {
  return 10n ** BigInt(n);
}

/**
 * Absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
  return x < 0n ? -x : x;
}

/**
 * Divides two BigInts with round-half-away-from-zero semantics.
 * Never produces `-0n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRoundHalfAway(num, den) {
  if (den === 0n) {
    throw new RangeError('Division by zero in arbitrary-precision arithmetic');
  }
  let n = num;
  let d = den;
  let negative = false;
  if (n < 0n) {
    negative = !negative;
    n = -n;
  }
  if (d < 0n) {
    negative = !negative;
    d = -d;
  }
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative && rounded !== 0n ? -rounded : rounded;
}

/**
 * Parses a decimal string (including optional scientific notation) into an
 * exact `{ value: bigint, scale: number }` representing `value * 10^(-scale)`
 * with `scale >= 0` minimized.
 * @param {unknown} str
 * @param {string} label
 * @returns {{ value: bigint, scale: number }}
 */
function parseDecimal(str, label) {
  if (typeof str !== 'string') {
    throw new TypeError(`${label} must be a decimal string`);
  }
  const match = DECIMAL_REGEX.exec(str);
  if (!match) {
    throw new RangeError(`${label} is not a valid decimal string: "${str}"`);
  }
  const [, sign, intDigits, fracDigitsAfterInt, fracDigitsOnly, expStr] = match;
  const intPart = intDigits ?? '';
  const fracPart = fracDigitsAfterInt ?? fracDigitsOnly ?? '';
  const rawDigits = intPart + fracPart;

  let exp = 0;
  if (expStr !== undefined) {
    exp = Number(expStr);
    if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT_ABS) {
      throw new RangeError(`${label} exponent is out of supported range: "${str}"`);
    }
  }

  const strippedLeading = rawDigits.replace(/^0+/, '');
  if (strippedLeading.length === 0) {
    return { value: 0n, scale: 0 };
  }

  const netExp = exp - fracPart.length;
  if (Math.abs(netExp) > MAX_EXPONENT_ABS) {
    throw new RangeError(`${label} effective scale is out of supported range: "${str}"`);
  }

  let value;
  let scale;
  if (netExp >= 0) {
    value = BigInt(strippedLeading) * pow10(netExp);
    scale = 0;
  } else {
    const targetScale = -netExp;
    let trailingZeros = 0;
    for (let i = strippedLeading.length - 1; i >= 0 && trailingZeros < targetScale; i--) {
      if (strippedLeading[i] === '0') {
        trailingZeros++;
      } else {
        break;
      }
    }
    const sigDigits = trailingZeros > 0
      ? strippedLeading.slice(0, strippedLeading.length - trailingZeros)
      : strippedLeading;
    value = BigInt(sigDigits);
    scale = targetScale - trailingZeros;
  }

  if (sign === '-' && value !== 0n) {
    value = -value;
  }

  return { value, scale };
}

/**
 * Exact addition of two `{ value, scale }` decimals.
 * @param {{ value: bigint, scale: number }} a
 * @param {{ value: bigint, scale: number }} b
 * @returns {{ value: bigint, scale: number }}
 */
function addDec(a, b) {
  if (a.scale === b.scale) {
    return { value: a.value + b.value, scale: a.scale };
  }
  if (a.scale > b.scale) {
    return {
      value: a.value + b.value * pow10(a.scale - b.scale),
      scale: a.scale,
    };
  }
  return {
    value: a.value * pow10(b.scale - a.scale) + b.value,
    scale: b.scale,
  };
}

/**
 * Exact subtraction `a - b` of two `{ value, scale }` decimals.
 * @param {{ value: bigint, scale: number }} a
 * @param {{ value: bigint, scale: number }} b
 * @returns {{ value: bigint, scale: number }}
 */
function subDec(a, b) {
  return addDec(a, { value: -b.value, scale: b.scale });
}

/**
 * Exact halving `h / 2` of a `{ value, scale }` decimal (terminating in base 10).
 * @param {{ value: bigint, scale: number }} h
 * @returns {{ value: bigint, scale: number }}
 */
function halveDec(h) {
  if ((h.value & 1n) === 0n) {
    return { value: h.value >> 1n, scale: h.scale };
  }
  return { value: h.value * 5n, scale: h.scale + 1 };
}

/**
 * Returns `floor(log10(dec))` for a strictly positive `{ value, scale }` decimal.
 * @param {{ value: bigint, scale: number }} dec
 * @returns {number}
 */
function floorLog10Positive(dec) {
  const digits = dec.value.toString().length;
  return digits - 1 - dec.scale;
}

/**
 * Rounds `value * 10^(-scale)` to `precision` decimal places using
 * round-half-away-from-zero and formats as a clean normalized decimal string.
 * @param {bigint} value
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function formatScaledRounded(value, scale, precision) {
  let scaled;
  if (scale > precision) {
    scaled = divRoundHalfAway(value, pow10(scale - precision));
  } else if (scale < precision) {
    scaled = value * pow10(precision - scale);
  } else {
    scaled = value;
  }

  if (scaled === 0n) {
    return '0';
  }

  const negative = scaled < 0n;
  const absStr = (negative ? -scaled : scaled).toString();
  const signPrefix = negative ? '-' : '';

  if (precision === 0) {
    return signPrefix + absStr;
  }

  let intPart;
  let fracPart;
  if (absStr.length <= precision) {
    intPart = '0';
    fracPart = absStr.padStart(precision, '0');
  } else {
    const splitIdx = absStr.length - precision;
    intPart = absStr.slice(0, splitIdx);
    fracPart = absStr.slice(splitIdx);
  }

  fracPart = fracPart.replace(/0+$/, '');
  if (fracPart.length === 0) {
    return signPrefix + intPart;
  }
  return `${signPrefix}${intPart}.${fracPart}`;
}

/**
 * Formats `{ value, scale }` losslessly as a normalized decimal string.
 * @param {{ value: bigint, scale: number }} dec
 * @returns {string}
 */
function formatExactDec(dec) {
  return formatScaledRounded(dec.value, dec.scale, dec.scale);
}

/**
 * Computes `(diff / (2 * step))` rounded to `targetScale` decimal places as a BigInt.
 * @param {{ value: bigint, scale: number }} diff
 * @param {{ value: bigint, scale: number }} step
 * @param {number} targetScale
 * @returns {bigint}
 */
function centralDifferenceScaled(diff, step, targetScale) {
  if (diff.value === 0n) {
    return 0n;
  }
  const expShift = targetScale + step.scale - diff.scale;
  const twoH = 2n * step.value;
  if (expShift >= 0) {
    return divRoundHalfAway(diff.value * pow10(expShift), twoH);
  }
  return divRoundHalfAway(diff.value, twoH * pow10(-expShift));
}

export function gradientDecimalIterative(fn, point, precision = 20, options = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }
  if (!Array.isArray(point)) {
    throw new TypeError('point must be an array of decimal strings');
  }
  if (point.length === 0) {
    throw new RangeError('point must be a non-empty array');
  }
  if (typeof precision !== 'number') {
    throw new TypeError('precision must be a non-negative integer');
  }
  if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
    throw new RangeError('precision must be a non-negative safe integer');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  const parsedPoint = new Array(point.length);
  const baseCoords = new Array(point.length);
  for (let i = 0; i < point.length; i++) {
    parsedPoint[i] = parseDecimal(point[i], `point[${i}]`);
    baseCoords[i] = formatExactDec(parsedPoint[i]);
  }

  let initialStepDec;
  if (options.initialStep !== undefined) {
    initialStepDec = parseDecimal(options.initialStep, 'options.initialStep');
    if (initialStepDec.value <= 0n) {
      throw new RangeError('options.initialStep must be positive');
    }
  } else {
    const defaultStepExp = Math.max(4, Math.min(8, Math.ceil(precision / 6) + 2));
    initialStepDec = { value: 1n, scale: defaultStepExp };
  }

  let maxLevels;
  if (options.maxLevels !== undefined) {
    if (typeof options.maxLevels !== 'number') {
      throw new TypeError('options.maxLevels must be a positive integer');
    }
    if (
      !Number.isInteger(options.maxLevels) ||
      options.maxLevels < 1 ||
      options.maxLevels > MAX_ALLOWED_LEVELS
    ) {
      throw new RangeError(`options.maxLevels must be an integer between 1 and ${MAX_ALLOWED_LEVELS}`);
    }
    maxLevels = options.maxLevels;
  } else {
    maxLevels = Math.max(12, Math.min(30, Math.ceil(precision / 3) + 8));
  }

  let tolDec;
  if (options.tolerance !== undefined) {
    tolDec = parseDecimal(options.tolerance, 'options.tolerance');
    if (tolDec.value <= 0n) {
      throw new RangeError('options.tolerance must be positive');
    }
  } else {
    tolDec = { value: 1n, scale: precision + 6 };
  }

  const stepCancelDigits = Math.max(0, -floorLog10Positive(initialStepDec));
  const halvingDigits = Math.ceil(maxLevels * 0.31);
  const guardDigits = 10;

  let workPrecision;
  if (options.workPrecision !== undefined) {
    if (typeof options.workPrecision !== 'number') {
      throw new TypeError('options.workPrecision must be a non-negative integer');
    }
    if (
      !Number.isInteger(options.workPrecision) ||
      options.workPrecision < 0 ||
      !Number.isSafeInteger(options.workPrecision)
    ) {
      throw new RangeError('options.workPrecision must be a non-negative safe integer');
    }
    workPrecision = options.workPrecision;
  } else {
    workPrecision = precision + guardDigits + stepCancelDigits + halvingDigits + 4;
  }

  const internalScale = Math.max(
    workPrecision + 8,
    tolDec.scale + 4,
    precision + guardDigits + 4
  );
  const tolScaled = tolDec.value * pow10(internalScale - tolDec.scale);

  const gradient = new Array(point.length);

  for (let dim = 0; dim < point.length; dim++) {
    const coord = parsedPoint[dim];
    let step = initialStepDec;

    const evalCentralDiff = (h) => {
      const coordsPlus = baseCoords.slice();
      coordsPlus[dim] = formatExactDec(addDec(coord, h));
      const fPlus = parseDecimal(fn(coordsPlus, workPrecision), 'fn return value');

      const coordsMinus = baseCoords.slice();
      coordsMinus[dim] = formatExactDec(subDec(coord, h));
      const fMinus = parseDecimal(fn(coordsMinus, workPrecision), 'fn return value');

      const diff = subDec(fPlus, fMinus);
      return centralDifferenceScaled(diff, h, internalScale);
    };

    const r00 = evalCentralDiff(step);
    let bestVal = r00;
    let bestErr = null;
    let prevRow = [r00];

    for (let k = 1; k < maxLevels; k++) {
      step = halveDec(step);
      const currRow = new Array(k + 1);
      currRow[0] = evalCentralDiff(step);

      let rowBestErr = null;
      let powerOf4 = 1n;

      for (let j = 1; j <= k; j++) {
        powerOf4 *= 4n;
        const denom = powerOf4 - 1n;
        const delta = currRow[j - 1] - prevRow[j - 1];
        currRow[j] = currRow[j - 1] + divRoundHalfAway(delta, denom);

        const errPrevDiag = absBigInt(currRow[j] - prevRow[j - 1]);
        const errPrevCol = absBigInt(currRow[j] - currRow[j - 1]);
        const err = errPrevDiag > errPrevCol ? errPrevDiag : errPrevCol;

        if (bestErr === null || err <= bestErr) {
          bestErr = err;
          bestVal = currRow[j];
        }
        if (rowBestErr === null || err < rowBestErr) {
          rowBestErr = err;
        }
      }

      if (bestErr !== null && bestErr <= tolScaled) {
        break;
      }

      if (k >= 2 && bestErr !== null) {
        const diagDiff = absBigInt(currRow[k] - prevRow[k - 1]);
        if (diagDiff > bestErr * 2n && rowBestErr !== null && rowBestErr > bestErr * 2n) {
          break;
        }
      }

      prevRow = currRow;
    }

    gradient[dim] = formatScaledRounded(bestVal, internalScale, precision);
  }

  return gradient;
}
