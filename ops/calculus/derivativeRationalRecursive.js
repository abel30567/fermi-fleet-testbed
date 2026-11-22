/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Denominator of the exact rational number (non-zero; always > 0n in outputs).
 */

/**
 * @typedef {Object} DerivativeOptions
 * @property {Rational} [step] - Initial positive rational step size h > 0 for central differences.
 *   Defaults to `{ num: 1n, den: 1024n }`, or `|x| / 16` when `0 < |x| < 1/64` to stay away from nearby poles at 0.
 * @property {Rational} [tolerance] - Non-negative rational convergence tolerance for Richardson extrapolation.
 *   Defaults to `{ num: 1n, den: 1_000_000_000_000n }` (1e-12).
 * @property {number} [maxDepth] - Maximum non-negative safe integer depth of the Richardson extrapolation table.
 *   Defaults to 10.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n });
const DEFAULT_STEP = Object.freeze({ num: 1n, den: 1024n });
const DEFAULT_TOLERANCE = Object.freeze({ num: 1n, den: 1_000_000_000_000n });
const DEFAULT_MAX_DEPTH = 10;

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function bigAbs(n) {
  return n < 0n ? -n : n;
}

/**
 * Computes the greatest common divisor of two BigInts (always non-negative).
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y !== 0n) {
    const rem = x % y;
    x = y;
    y = rem;
  }
  return x;
}

/**
 * Normalizes a rational (num / den) to lowest terms with den > 0n and zero as { num: 0n, den: 1n }.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function makeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Rational denominator must not be zero');
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes an input value as an exact rational { num: bigint, den: bigint }.
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Expected ${label} to be an object { num: bigint, den: bigint }`);
  }
  if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
    throw new TypeError(`Expected ${label}.num and ${label}.den to be bigints`);
  }
  if (value.den === 0n) {
    throw new RangeError(`${label}.den must not be zero`);
  }
  return makeRational(value.num, value.den);
}

/**
 * Exact rational addition: a + b (inputs normalized, output normalized).
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
  if (a.num === 0n) return { num: b.num, den: b.den };
  if (b.num === 0n) return { num: a.num, den: a.den };
  const g = gcd(a.den, b.den);
  const aScale = b.den / g;
  const bScale = a.den / g;
  return makeRational(a.num * aScale + b.num * bScale, bScale * b.den);
}

/**
 * Exact rational subtraction: a - b (inputs normalized, output normalized).
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratSub(a, b) {
  if (b.num === 0n) return { num: a.num, den: a.den };
  if (a.num === 0n) return { num: -b.num, den: b.den };
  const g = gcd(a.den, b.den);
  const aScale = b.den / g;
  const bScale = a.den / g;
  return makeRational(a.num * aScale - b.num * bScale, bScale * b.den);
}

/**
 * Exact rational multiplication: a * b (inputs normalized, output normalized).
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratMul(a, b) {
  if (a.num === 0n || b.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g1 = gcd(a.num, b.den);
  const g2 = gcd(b.num, a.den);
  return {
    num: (a.num / g1) * (b.num / g2),
    den: (a.den / g2) * (b.den / g1),
  };
}

/**
 * Exact rational division: a / b (inputs normalized, output normalized).
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratDiv(a, b) {
  if (b.num === 0n) {
    throw new RangeError('Division by zero in rational arithmetic');
  }
  if (a.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const invB = b.num < 0n
    ? { num: -b.den, den: -b.num }
    : { num: b.den, den: b.num };
  return ratMul(a, invB);
}

/**
 * Multiplies a normalized rational by a BigInt scalar.
 * @param {Rational} a
 * @param {bigint} k
 * @returns {Rational}
 */
function ratMulBigInt(a, k) {
  if (a.num === 0n || k === 0n) {
    return { num: 0n, den: 1n };
  }
  const g = gcd(k, a.den);
  return { num: a.num * (k / g), den: a.den / g };
}

/**
 * Divides a normalized rational by a non-zero BigInt scalar.
 * @param {Rational} a
 * @param {bigint} k
 * @returns {Rational}
 */
function ratDivBigInt(a, k) {
  if (k === 0n) {
    throw new RangeError('Division by zero in rational arithmetic');
  }
  if (a.num === 0n) {
    return { num: 0n, den: 1n };
  }
  let num = a.num;
  let div = k;
  if (div < 0n) {
    num = -num;
    div = -div;
  }
  const g = gcd(num, div);
  return { num: num / g, den: a.den * (div / g) };
}

/**
 * Absolute value of a normalized rational.
 * @param {Rational} a
 * @returns {Rational}
 */
function ratAbs(a) {
  return a.num < 0n ? { num: -a.num, den: a.den } : { num: a.num, den: a.den };
}

/**
 * Returns true if normalized rational a <= b.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {boolean}
 */
function ratLte(a, b) {
  return a.num * b.den <= b.num * a.den;
}

/**
 * Recursively differentiates polynomial coefficients over index range [start, end)
 * using divide-and-conquer splitting, computing `out[k - 1] = k * coeffs[k]`.
 * @param {Rational[]} coeffs - Normalized polynomial coefficients `[c_0, c_1, ..., c_d]`.
 * @param {Rational[]} out - Preallocated output array of length `coeffs.length - 1`.
 * @param {number} start - Inclusive start index (>= 1).
 * @param {number} end - Exclusive end index (<= coeffs.length).
 */
function differentiateRangeRecursive(coeffs, out, start, end) {
  if (end - start === 1) {
    out[start - 1] = ratMulBigInt(coeffs[start], BigInt(start));
    return;
  }
  const mid = start + ((end - start) >> 1);
  differentiateRangeRecursive(coeffs, out, start, mid);
  differentiateRangeRecursive(coeffs, out, mid, end);
}

/**
 * Recursively evaluates a polynomial over coefficient range [start, end) at exact rational `x`
 * using divide-and-conquer splitting:
 *   P_[start, end)(x) = P_[start, mid)(x) + x^(mid - start) * P_[mid, end)(x).
 * Returns both the sub-polynomial value and x^(end - start).
 * @param {Rational[]} coeffs - Normalized polynomial coefficients.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {Rational} x - Normalized rational evaluation point.
 * @returns {{ value: Rational, xPow: Rational }}
 */
function evaluatePolynomialRangeRecursive(coeffs, start, end, x) {
  const len = end - start;
  if (len === 1) {
    return { value: coeffs[start], xPow: x };
  }
  const mid = start + (len >> 1);
  const left = evaluatePolynomialRangeRecursive(coeffs, start, mid, x);
  const right = evaluatePolynomialRangeRecursive(coeffs, mid, end, x);
  return {
    value: ratAdd(left.value, ratMul(right.value, left.xPow)),
    xPow: ratMul(left.xPow, right.xPow),
  };
}

/**
 * Trims trailing zero coefficients from a polynomial array while preserving at least
 * `[{ num: 0n, den: 1n }]` for the zero polynomial.
 * @param {Rational[]} coeffs
 * @returns {Rational[]}
 */
function trimTrailingZeros(coeffs) {
  let end = coeffs.length;
  while (end > 1 && coeffs[end - 1].num === 0n) {
    end -= 1;
  }
  return end === coeffs.length ? coeffs : coeffs.slice(0, end);
}

/**
 * Computes the derivative of a polynomial represented by exact rational coefficients,
 * optionally evaluating the derivative at a given rational point `x`.
 * @param {Rational[]} rawCoeffs
 * @param {Rational | undefined} rawX
 * @returns {Rational[] | Rational}
 */
function derivativePolynomial(rawCoeffs, rawX) {
  if (rawCoeffs.length === 0) {
    throw new RangeError('Polynomial coefficient array must not be empty');
  }
  const coeffs = new Array(rawCoeffs.length);
  for (let i = 0; i < rawCoeffs.length; i += 1) {
    coeffs[i] = validateRational(rawCoeffs[i], `coefficients[${i}]`);
  }
  const hasX = rawX !== undefined;
  const x = hasX ? validateRational(rawX, 'x') : null;

  let derivCoeffs;
  if (coeffs.length === 1) {
    derivCoeffs = [{ num: ZERO.num, den: ZERO.den }];
  } else {
    const out = new Array(coeffs.length - 1);
    differentiateRangeRecursive(coeffs, out, 1, coeffs.length);
    derivCoeffs = trimTrailingZeros(out);
  }

  if (!hasX) {
    return derivCoeffs;
  }
  return evaluatePolynomialRangeRecursive(derivCoeffs, 0, derivCoeffs.length, x).value;
}

/**
 * Chooses a default initial rational step size h > 0 for Richardson extrapolation at point x.
 * Uses 1/1024 in general, or |x|/16 when 0 < |x| < 1/64 to avoid crossing zero near small points.
 * @param {Rational} x
 * @returns {Rational}
 */
function chooseDefaultStep(x) {
  if (x.num !== 0n && bigAbs(x.num) * 64n < x.den) {
    return ratDivBigInt(ratAbs(x), 16n);
  }
  return { num: DEFAULT_STEP.num, den: DEFAULT_STEP.den };
}

/**
 * Validates options for callable-function differentiation.
 * @param {unknown} rawOptions
 * @param {Rational} x
 * @returns {{ step: Rational, tolerance: Rational, maxDepth: number }}
 */
function parseDerivativeOptions(rawOptions, x) {
  if (rawOptions === undefined) {
    return {
      step: chooseDefaultStep(x),
      tolerance: { num: DEFAULT_TOLERANCE.num, den: DEFAULT_TOLERANCE.den },
      maxDepth: DEFAULT_MAX_DEPTH,
    };
  }
  if (rawOptions === null || typeof rawOptions !== 'object' || Array.isArray(rawOptions)) {
    throw new TypeError('Expected options to be a plain object');
  }

  let step;
  if (rawOptions.step === undefined) {
    step = chooseDefaultStep(x);
  } else {
    step = validateRational(rawOptions.step, 'options.step');
    if (step.num <= 0n) {
      throw new RangeError('options.step must be strictly positive');
    }
  }

  let tolerance;
  if (rawOptions.tolerance === undefined) {
    tolerance = { num: DEFAULT_TOLERANCE.num, den: DEFAULT_TOLERANCE.den };
  } else {
    tolerance = validateRational(rawOptions.tolerance, 'options.tolerance');
    if (tolerance.num < 0n) {
      throw new RangeError('options.tolerance must be non-negative');
    }
  }

  let maxDepth;
  if (rawOptions.maxDepth === undefined) {
    maxDepth = DEFAULT_MAX_DEPTH;
  } else {
    if (typeof rawOptions.maxDepth !== 'number') {
      throw new TypeError('Expected options.maxDepth to be a number');
    }
    if (!Number.isSafeInteger(rawOptions.maxDepth) || rawOptions.maxDepth < 0) {
      throw new RangeError('options.maxDepth must be a non-negative safe integer');
    }
    maxDepth = rawOptions.maxDepth;
  }

  return { step, tolerance, maxDepth };
}

/**
 * Computes the derivative of a callable rational function `fn(q) -> Rational` at exact rational `x`
 * using a recursive memoized Richardson extrapolation (Romberg/Neville) table over exact BigInt rationals.
 * @param {(q: Rational) => Rational} fn
 * @param {Rational} rawX
 * @param {DerivativeOptions} [rawOptions]
 * @returns {Rational}
 */
function derivativeCallable(fn, rawX, rawOptions) {
  const x = validateRational(rawX, 'x');
  const { step: initialStep, tolerance, maxDepth } = parseDerivativeOptions(rawOptions, x);

  /** @type {Map<number, Rational>} */
  const stepMemo = new Map();
  /** @type {Map<string, Rational>} */
  const tableMemo = new Map();

  /**
   * Recursively computes the step size h_k = h / 2^k.
   * @param {number} k
   * @returns {Rational}
   */
  function stepAt(k) {
    if (stepMemo.has(k)) {
      return stepMemo.get(k);
    }
    const h = k === 0 ? initialStep : ratDivBigInt(stepAt(k - 1), 2n);
    stepMemo.set(k, h);
    return h;
  }

  /**
   * Evaluates `fn` at rational point `q` and validates its rational return value.
   * @param {Rational} q
   * @param {string} label
   * @returns {Rational}
   */
  function evalFn(q, label) {
    return validateRational(fn(q), label);
  }

  /**
   * Recursively computes entry R(k, m) of the Richardson extrapolation table:
   *   R(k, 0) = (f(x + h_k) - f(x - h_k)) / (2 * h_k)
   *   R(k, m) = R(k, m - 1) + (R(k, m - 1) - R(k - 1, m - 1)) / (4^m - 1)
   * @param {number} k - Row index (step halving level, k >= 0).
   * @param {number} m - Column index (extrapolation order, 0 <= m <= k).
   * @returns {Rational}
   */
  function richardson(k, m) {
    const key = `${k},${m}`;
    if (tableMemo.has(key)) {
      return tableMemo.get(key);
    }
    let value;
    if (m === 0) {
      const h = stepAt(k);
      const fPlus = evalFn(ratAdd(x, h), 'fn(x + h)');
      const fMinus = evalFn(ratSub(x, h), 'fn(x - h)');
      const twoH = ratMulBigInt(h, 2n);
      value = ratDiv(ratSub(fPlus, fMinus), twoH);
    } else {
      const finer = richardson(k, m - 1);
      const coarser = richardson(k - 1, m - 1);
      const factor = 1n << (2n * BigInt(m));
      const diff = ratSub(finer, coarser);
      value = ratAdd(finer, ratDivBigInt(diff, factor - 1n));
    }
    tableMemo.set(key, value);
    return value;
  }

  /**
   * Recursively deepens the Richardson table along the diagonal R(k, k) until consecutive
   * diagonal and row approximations agree within `tolerance` or `maxDepth` is reached.
   * @param {number} k
   * @param {Rational | null} prevDiag
   * @returns {Rational}
   */
  function refine(k, prevDiag) {
    const current = richardson(k, k);
    if (k >= 1 && prevDiag !== null) {
      const diagDiff = ratAbs(ratSub(current, prevDiag));
      const rowDiff = ratAbs(ratSub(current, richardson(k, k - 1)));
      if (ratLte(diagDiff, tolerance) && ratLte(rowDiff, tolerance)) {
        return current;
      }
    }
    if (k >= maxDepth) {
      return current;
    }
    return refine(k + 1, current);
  }

  return refine(0, null);
}

/**
 * Computes the derivative over exact BigInt rationals `{ num: bigint, den: bigint }` in lowest terms
 * using recursive divide-and-conquer algorithms.
 *
 * Supports two call signatures:
 *
 * 1. **Polynomial mode**:
 *    - `derivativeRationalRecursive(coefficients)` — Given a non-empty array `[c_0, c_1, ..., c_d]`
 *      representing `P(x) = sum_{k=0}^d c_k * x^k`, computes the exact derivative polynomial `P'(x)`
 *      by recursively splitting the coefficient range `[1, d]` via divide-and-conquer. Returns an
 *      array of canonical lowest-terms rationals (trailing zeros trimmed, with `[{ num: 0n, den: 1n }]`
 *      representing the zero polynomial).
 *    - `derivativeRationalRecursive(coefficients, x)` — Computes `P'(x)` and evaluates it at exact
 *      rational `x` via recursive divide-and-conquer polynomial splitting
 *      `P_[l, r)(x) = P_[l, m)(x) + x^(m - l) * P_[m, r)(x)`.
 *
 * 2. **Callable function mode**:
 *    - `derivativeRationalRecursive(fn, x, options?)` — Given a function `fn(q) -> Rational`,
 *      computes `fn'(x)` at exact rational `x` via a recursive memoized Richardson extrapolation
 *      (Romberg/Neville) table built from central difference quotients `R(k, 0) = (f(x + h/2^k) - f(x - h/2^k)) / (2h/2^k)`
 *      and `R(k, m) = R(k, m - 1) + (R(k, m - 1) - R(k - 1, m - 1)) / (4^m - 1)`.
 *      Produces exact rational results for polynomials (degree <= 2*maxDepth + 1) and high-accuracy
 *      exact rational approximations (default error <= 1e-12) for smooth non-polynomial functions.
 *
 * All returned rationals are normalized to lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero represented as `{ num: 0n, den: 1n }`.
 *
 * @overload
 * @param {Rational[]} target - Non-empty array of polynomial coefficients `[c_0, c_1, ..., c_d]`.
 * @returns {Rational[]} Exact derivative polynomial coefficients in canonical lowest terms.
 *
 * @overload
 * @param {Rational[]} target - Non-empty array of polynomial coefficients `[c_0, c_1, ..., c_d]`.
 * @param {Rational} x - Exact rational evaluation point.
 * @returns {Rational} Exact value of `P'(x)` in lowest terms.
 *
 * @overload
 * @param {(q: Rational) => Rational} target - Callable function mapping a Rational to a Rational.
 * @param {Rational} x - Exact rational point at which to compute the derivative.
 * @param {DerivativeOptions} [options] - Optional Richardson extrapolation configuration.
 * @returns {Rational} Exact or high-accuracy rational approximation of `fn'(x)` in lowest terms.
 *
 * @param {Rational[] | ((q: Rational) => Rational)} target
 * @param {Rational} [x]
 * @param {DerivativeOptions} [options]
 * @returns {Rational[] | Rational}
 * @throws {TypeError} If `target` is neither an Array nor a function, if any rational lacks bigint
 *   `num`/`den` properties, if `options` is malformed, or if `fn` returns a non-rational value.
 * @throws {RangeError} If any rational has `den === 0n`, if a polynomial array is empty,
 *   if `options.step <= 0`, `options.tolerance < 0`, or `options.maxDepth` is not a non-negative safe integer.
 */
export function derivativeRationalRecursive(target, x, options) {
  if (Array.isArray(target)) {
    return derivativePolynomial(target, x);
  }
  if (typeof target === 'function') {
    return derivativeCallable(target, x, options);
  }
  throw new TypeError(
    'Expected first argument to be an array of rational coefficients or a function (Rational) => Rational',
  );
}
