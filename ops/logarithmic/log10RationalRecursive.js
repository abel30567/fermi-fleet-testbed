/**
 * @module ops/logarithmic/log10RationalRecursive
 *
 * Computes the base-10 logarithm log10(x) of a strictly positive exact rational
 * number x = { num: bigint, den: bigint }, returning an exact rational in lowest
 * terms ({ num: bigint, den: bigint } with den > 0n and gcd(|num|, den) === 1n).
 *
 * Algorithm (pure BigInt, recursive / divide-and-conquer):
 * 1. Input validation and normalization to lowest terms with den > 0n.
 *    Throws TypeError on malformed inputs and RangeError for den === 0n or x <= 0.
 * 2. Reciprocal reduction: if 0 < x < 1, uses the exact identity
 *    log10(p / q) = -log10(q / p) so the argument satisfies y >= 1.
 * 3. Recursive divide-and-conquer power-of-10 range reduction:
 *    Uses recursive exponent doubling (galloping 10^(2^s)) and recursive
 *    remainder reduction to decompose y = 10^k * m with exact integer k >= 0n
 *    and reduced rational m in [1, 10) in O(log(k)) recursive steps.
 * 4. Exact integer power detection:
 *    If m === 1/1, x is an exact integer power of 10 (the only rationals whose
 *    base-10 logarithm is rational), and the exact result { num: ±k, den: 1n }
 *    is returned immediately.
 * 5. General positive rationals:
 *    Recursively halves m by powers of 2 into [1, 2) and applies at most one
 *    adjustment by 2 and/or 4/3 to obtain r with |z| = |(r - 1) / (r + 1)| <= 5/59 < 1/11.
 *    Computes ln(m) and ln(10) = 6*atanh(1/5) + 6*atanh(1/7) + 2*atanh(1/9) via
 *    recursive binary splitting of the atanh power series:
 *      2 * atanh(u / v) = 2 * (u / v) * sum_{j=0}^{N-1} (u^2 / v^2)^j / (2j + 1)
 *    with term count N chosen via recursive doubling + binary search so that
 *    |log10RationalRecursive(x) - log10(x)| <= 10^(-precision) (default 10^-15 <= 1e-12).
 */

const DEFAULT_PRECISION_DIGITS = 15n;

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Recursive exponentiation by squaring for BigInts (exp >= 0n).
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @returns {bigint}
 */
function powBigInt(base, exp) {
  if (exp === 0n) return 1n;
  if (exp === 1n) return base;
  const half = powBigInt(base, exp >> 1n);
  const sq = half * half;
  return (exp & 1n) === 1n ? sq * base : sq;
}

/**
 * Constructs a normalized rational { num, den } in lowest terms with den > 0n
 * and zero represented as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Rational denominator cannot be zero');
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
  const g = gcdBigInt(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes an input rational object.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object with bigint { num, den } properties`);
  }
  if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
    throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`);
  }
  if (value.den === 0n) {
    throw new RangeError(`${name}.den cannot be zero`);
  }
  return makeRational(value.num, value.den);
}

/**
 * Exact rational addition a + b in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
  return makeRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

/**
 * Exact rational scaling by a BigInt integer k * r in lowest terms.
 *
 * @param {bigint} k
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function scaleRational(k, r) {
  return makeRational(k * r.num, r.den);
}

/**
 * Exact rational division a / b in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function divRational(a, b) {
  if (b.num === 0n) {
    throw new RangeError('Division by zero rational');
  }
  return makeRational(a.num * b.den, a.den * b.num);
}

/**
 * Recursive exponent doubling (galloping) to find the largest power-of-2
 * exponent `exp = 2^s` such that p / q >= 10^exp (i.e. p >= q * 10^exp).
 *
 * @param {bigint} p - Numerator (p >= 10n * q)
 * @param {bigint} q - Denominator (q > 0n)
 * @param {bigint} exp - Current power-of-2 exponent (>= 1n)
 * @param {bigint} pow10 - 10^exp
 * @returns {{ exp: bigint, pow10: bigint }}
 */
function findLargestPow10Step(p, q, exp, pow10) {
  const nextPow = pow10 * pow10;
  if (p >= q * nextPow) {
    return findLargestPow10Step(p, q, exp << 1n, nextPow);
  }
  return { exp, pow10 };
}

/**
 * Recursive divide-and-conquer range reduction by powers of 10.
 * Decomposes p / q >= 1 (with gcd(p, q) === 1n) into:
 *   p / q = 10^k * (num / den), where 1 <= num / den < 10 and gcd(num, den) === 1n.
 *
 * @param {bigint} p
 * @param {bigint} q
 * @returns {{ k: bigint, num: bigint, den: bigint }}
 */
function reduceByPowersOf10(p, q) {
  if (p < 10n * q) {
    return { k: 0n, num: p, den: q };
  }
  const { exp, pow10 } = findLargestPow10Step(p, q, 1n, 10n);
  const g = gcdBigInt(p, pow10);
  const nextP = p / g;
  const nextQ = q * (pow10 / g);
  const rest = reduceByPowersOf10(nextP, nextQ);
  return { k: exp + rest.k, num: rest.num, den: rest.den };
}

/**
 * Recursive range reduction by powers of 2.
 * Decomposes p / q in [1, 10) into 2^c2 * (num / den) with num / den in [1, 2).
 *
 * @param {bigint} p
 * @param {bigint} q
 * @returns {{ c2: bigint, num: bigint, den: bigint }}
 */
function reduceByPowersOf2(p, q) {
  if (p < 2n * q) {
    return { c2: 0n, num: p, den: q };
  }
  const evenP = (p & 1n) === 0n;
  const nextP = evenP ? p >> 1n : p;
  const nextQ = evenP ? q : q << 1n;
  const rest = reduceByPowersOf2(nextP, nextQ);
  return { c2: 1n + rest.c2, num: rest.num, den: rest.den };
}

/**
 * Converts a positive rational tolerance tol = num / den into the required
 * decimal precision digits D >= 1n such that 10^(-D) <= tol.
 *
 * @param {{ num: bigint, den: bigint }} tol
 * @returns {bigint}
 */
function toleranceToDigits(tol) {
  if (tol.num <= 0n) {
    throw new RangeError('Tolerance must be a strictly positive rational (> 0)');
  }
  if (tol.num >= tol.den) {
    return 1n;
  }
  // Reciprocal den / num > 1; decompose den / num = 10^k * m with 1 <= m < 10.
  const { k, num, den } = reduceByPowersOf10(tol.den, tol.num);
  return num === den ? k : k + 1n;
}

/**
 * Validates a decimal-digit precision value (integer number or bigint >= 1).
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {bigint}
 */
function validatePrecisionDigits(value, name) {
  if (typeof value === 'bigint') {
    if (value < 1n) {
      throw new RangeError(`${name} must be an integer >= 1`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a finite positive integer >= 1`);
    }
    return BigInt(value);
  }
  throw new TypeError(`${name} must be a positive integer (number or bigint)`);
}

/**
 * Parses and validates the optional precision/options second parameter.
 *
 * @param {unknown} options
 * @returns {bigint} Target decimal digits of accuracy (>= 1n)
 */
function parseTargetDigits(options) {
  if (options === undefined) {
    return DEFAULT_PRECISION_DIGITS;
  }
  if (typeof options === 'number' || typeof options === 'bigint') {
    return validatePrecisionDigits(options, 'precision');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      'options must be a positive integer precision, a positive rational tolerance { num, den }, or an options object { precision?, tolerance? }'
    );
  }
  if ('num' in options || 'den' in options) {
    const tol = validateRational(options, 'tolerance');
    return toleranceToDigits(tol);
  }
  const hasPrecision = options.precision !== undefined;
  const hasTolerance = options.tolerance !== undefined;
  if (!hasPrecision && !hasTolerance) {
    // Allow an empty options object `{}` to use defaults, reject unrelated shapes.
    const keys = Object.keys(options);
    for (const key of keys) {
      if (key !== 'precision' && key !== 'tolerance') {
        throw new TypeError(`Unknown option property "${key}"`);
      }
    }
    return DEFAULT_PRECISION_DIGITS;
  }
  let digits = 1n;
  if (hasPrecision) {
    digits = validatePrecisionDigits(options.precision, 'options.precision');
  }
  if (hasTolerance) {
    const tol = validateRational(options.tolerance, 'options.tolerance');
    const tolDigits = toleranceToDigits(tol);
    if (tolDigits > digits) {
      digits = tolDigits;
    }
  }
  return digits;
}

/**
 * Finds the minimal number of atanh series terms N >= 1 such that
 * q^(2N + 1) >= targetScale using recursive doubling and recursive binary search.
 *
 * @param {bigint} q - Lower bound on 1/|z| (q >= 5n)
 * @param {bigint} targetScale - 10^D
 * @returns {number}
 */
function findAtanhTermsRecursive(q, targetScale) {
  if (q * q * q >= targetScale) {
    return 1;
  }
  function gallop(n) {
    if (powBigInt(q, 2n * n + 1n) >= targetScale) {
      return n;
    }
    return gallop(n << 1n);
  }
  function bsearch(lo, hi) {
    if (lo + 1n >= hi) {
      return hi;
    }
    const mid = (lo + hi) >> 1n;
    if (powBigInt(q, 2n * mid + 1n) >= targetScale) {
      return bsearch(lo, mid);
    }
    return bsearch(mid, hi);
  }
  const hi = gallop(2n);
  return Number(bsearch(hi >> 1n, hi));
}

/**
 * Recursive binary splitting for the atanh power series sum over [lo, hi):
 *   sum_{k=lo}^{hi-1} A^(k - lo) / ((2k + 1) * B^(k - lo + 1)) = P / (Q * PB)
 * where A = u^2, B = v^2, PA = A^(hi - lo), PB = B^(hi - lo), Q = prod_{k=lo}^{hi-1} (2k + 1).
 *
 * @param {bigint} A - u^2
 * @param {bigint} B - v^2
 * @param {number} lo - Inclusive start index
 * @param {number} hi - Exclusive end index (hi > lo)
 * @returns {{ P: bigint, Q: bigint, PA: bigint, PB: bigint }}
 */
function atanhBinarySplit(A, B, lo, hi) {
  if (hi - lo === 1) {
    return {
      P: 1n,
      Q: BigInt(2 * lo + 1),
      PA: A,
      PB: B,
    };
  }
  const mid = lo + ((hi - lo) >> 1);
  const left = atanhBinarySplit(A, B, lo, mid);
  const right = atanhBinarySplit(A, B, mid, hi);
  return {
    P: left.P * right.Q * right.PB + left.PA * right.P * left.Q,
    Q: left.Q * right.Q,
    PA: left.PA * right.PA,
    PB: left.PB * right.PB,
  };
}

/**
 * Computes 2 * atanh(z) for a reduced rational z with |z| <= 1/5 using recursive
 * binary splitting of the atanh series to truncation error < 1 / targetScale.
 *
 * @param {{ num: bigint, den: bigint }} z
 * @param {bigint} targetScale - 10^D
 * @returns {{ num: bigint, den: bigint }}
 */
function twoAtanhRational(z, targetScale) {
  if (z.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const absU = z.num < 0n ? -z.num : z.num;
  const q = z.den / absU;
  const terms = findAtanhTermsRecursive(q, targetScale);
  const A = z.num * z.num;
  const B = z.den * z.den;
  const { P, Q, PB } = atanhBinarySplit(A, B, 0, terms);
  // 2 * atanh(u/v) = 2 * (u/v) * B * (P / (Q * PB)) = (2 * u * v * P) / (Q * PB)
  return makeRational(2n * z.num * z.den * P, Q * PB);
}

/**
 * Computes log10(x) for a strictly positive exact rational `x = { num, den }`.
 *
 * Detects exact integer powers of 10 (returning `{ num: k, den: 1n }` exactly).
 * For all other positive rationals, reduces the argument recursively into `[1, 10)`
 * and computes `k + ln(m) / ln(10)` via recursive binary splitting of the `atanh`
 * series over exact BigInt rationals.
 *
 * @param {{ num: bigint, den: bigint }} x - Strictly positive exact rational (x > 0).
 * @param {number | bigint | { num: bigint, den: bigint } | { precision?: number | bigint, tolerance?: { num: bigint, den: bigint } }} [options=15]
 *   Optional precision control:
 *   - Omit for default 15 decimal digits (error <= 10^-15, well below 1e-12).
 *   - Pass a positive integer (number or bigint) for target decimal digits `D` (error <= 10^-D).
 *   - Pass a positive rational `{ num, den }` for target absolute error tolerance.
 *   - Pass an options object `{ precision?, tolerance? }`.
 * @returns {{ num: bigint, den: bigint }} Exact rational in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `x` or `options` has an invalid type or structure.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or precision/tolerance is out of range.
 */
export function log10RationalRecursive(x, options) {
  const norm = validateRational(x, 'x');
  if (norm.num <= 0n) {
    throw new RangeError('log10RationalRecursive requires a strictly positive rational (x > 0)');
  }
  const targetDigits = parseTargetDigits(options);

  // Reciprocal symmetry for 0 < x < 1: log10(p / q) = -log10(q / p).
  if (norm.num < norm.den) {
    const pos = log10RationalRecursive({ num: norm.den, den: norm.num }, targetDigits);
    return { num: -pos.num, den: pos.den };
  }

  // Recursive divide-and-conquer range reduction: x = 10^k * m with m in [1, 10).
  const { k, num: mNum, den: mDen } = reduceByPowersOf10(norm.num, norm.den);

  // Exact integer power of 10: x = 10^k => log10(x) = k / 1.
  if (mNum === mDen) {
    return { num: k, den: 1n };
  }

  // Further reduce m in (1, 10) by powers of 2 into [1, 2), then adjust by 2 and/or 4/3
  // so that |z| = |(r - 1) / (r + 1)| <= 5/59 < 1/11.
  const { c2: baseC2, num: p, den: q } = reduceByPowersOf2(mNum, mDen);
  let c2 = baseC2;
  let c43 = 0n;
  let r;

  if (p === q) {
    r = { num: 1n, den: 1n };
  } else if (8n * p < 9n * q) {
    // m1 in (1, 9/8): |z| < 1/17
    r = { num: p, den: q };
  } else if (2n * p < 3n * q) {
    // m1 in [9/8, 3/2): divide by 4/3 -> r in [27/32, 9/8), |z| <= 5/59
    c43 = 1n;
    r = makeRational(3n * p, 4n * q);
  } else if (4n * p < 7n * q) {
    // m1 in [3/2, 7/4): divide by 2 and multiply by 4/3 -> r in [1, 7/6), |z| < 1/13
    c2 += 1n;
    c43 = -1n;
    r = makeRational(2n * p, 3n * q);
  } else {
    // m1 in [7/4, 2): divide by 2 -> r in [7/8, 1), |z| <= 1/15
    c2 += 1n;
    r = makeRational(p, 2n * q);
  }

  // Guard digits (+2) guarantee each component has error <= 10^(-(D+2)),
  // ensuring |ln(m)_hat - ln(m)| <= 10^(-(D+1)), |ln(10)_hat - ln(10)| <= 10^(-(D+1)),
  // and total |log10_hat - log10| < 10^(-(D+1)) < 10^(-D).
  const targetScale = powBigInt(10n, targetDigits + 2n);

  // ln(3/2) = 2*atanh(1/5), ln(4/3) = 2*atanh(1/7), ln(5/4) = 2*atanh(1/9)
  // ln(2) = ln(3/2) + ln(4/3), ln(10) = 3*ln(2) + ln(5/4) = 3*ln(3/2) + 3*ln(4/3) + ln(5/4)
  const ln32 = twoAtanhRational({ num: 1n, den: 5n }, targetScale);
  const ln43 = twoAtanhRational({ num: 1n, den: 7n }, targetScale);
  const ln54 = twoAtanhRational({ num: 1n, den: 9n }, targetScale);

  const ln10 = addRational(
    addRational(scaleRational(3n, ln32), scaleRational(3n, ln43)),
    ln54
  );

  // ln(m) = c2 * (ln32 + ln43) + c43 * ln43 + 2 * atanh((r - 1) / (r + 1))
  let lnM = addRational(scaleRational(c2, ln32), scaleRational(c2 + c43, ln43));
  if (r.num !== r.den) {
    const z = makeRational(r.num - r.den, r.num + r.den);
    lnM = addRational(lnM, twoAtanhRational(z, targetScale));
  }

  const frac = divRational(lnM, ln10);
  if (k === 0n) {
    return frac;
  }
  return addRational({ num: k, den: 1n }, frac);
}
