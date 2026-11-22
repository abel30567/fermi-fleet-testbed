/**
 * Exact-rational natural logarithm using recursive argument reduction and
 * recursive binary splitting of the atanh series.
 *
 * Representation:
 *   An exact rational is an object `{ num: bigint, den: bigint }` normalized in
 *   lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`, and zero represented
 *   as `{ num: 0n, den: 1n }`.
 *
 * Algorithm:
 *   1. Validate and normalize the positive rational `x = p / q > 0`.
 *      If `x === 1`, return `{ num: 0n, den: 1n }` immediately.
 *   2. Recursively reduce `x` into `2^e * m` with `m in [2/3, 4/3)` using
 *      divide-and-conquer exponential bit-shift doubling (`O(log |e|)` recursion
 *      depth), so that `|y| = |(m - 1) / (m + 1)| <= 1/5`.
 *   3. Evaluate `ln(m) = 2 * y * sum_{k=0}^{N-1} (y^2)^k / (2k + 1)` via
 *      recursive binary splitting over exact BigInt integers, selecting `N`
 *      through an exact BigInt remainder bound so that `|error| <= tolerance`.
 *   4. When `e !== 0n`, compute `ln(2) = 2 * ln(4/3) + ln(9/8)` using the same
 *      recursive binary splitting with error budget scaled by `|e|` so that
 *      `|e * ln(2) + ln(m) - ln(x)| <= tolerance` holds rigorously.
 */

const DEFAULT_TOLERANCE = Object.freeze({ num: 1n, den: 10n ** 15n });

/**
 * Return the absolute value of a BigInt.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
  return n < 0n ? -n : n;
}

/**
 * Compute the greatest common divisor of two non-negative BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Normalize `(num, den)` into a lowest-terms rational with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Denominator must be non-zero');
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
 * Validate and normalize an input rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`);
  }
  if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
    throw new TypeError(`${name}.num and ${name}.den must be BigInts`);
  }
  if (value.den === 0n) {
    throw new RangeError(`${name}.den must be non-zero`);
  }
  return makeRational(value.num, value.den);
}

/**
 * Add two normalized rationals and return the sum in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
  if (a.num === 0n) {
    return b;
  }
  if (b.num === 0n) {
    return a;
  }
  return makeRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

/**
 * Multiply a rational by a BigInt integer and return the result in lowest terms.
 *
 * @param {bigint} k
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function scaleRational(k, r) {
  if (k === 0n || r.num === 0n) {
    return { num: 0n, den: 1n };
  }
  return makeRational(k * r.num, r.den);
}

/**
 * Recursive exponentiation by squaring for non-negative BigInt exponents.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @returns {bigint}
 */
function powBigInt(base, exp) {
  if (exp === 0n) {
    return 1n;
  }
  if (exp === 1n) {
    return base;
  }
  const half = powBigInt(base, exp >> 1n);
  const sq = half * half;
  return (exp & 1n) === 1n ? sq * base : sq;
}

/**
 * Parse and validate the optional second parameter `{ tolerance, precision, terms }`.
 *
 * @param {unknown} options
 * @returns {{ tolNum: bigint, tolDen: bigint, fixedTerms: bigint | null }}
 */
function parseOptions(options) {
  if (options === undefined) {
    return {
      tolNum: DEFAULT_TOLERANCE.num,
      tolDen: DEFAULT_TOLERANCE.den,
      fixedTerms: null,
    };
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  const hasTolerance = options.tolerance !== undefined;
  const hasPrecision = options.precision !== undefined;
  const hasTerms = options.terms !== undefined;

  const specifiedCount = Number(hasTolerance) + Number(hasPrecision) + Number(hasTerms);
  if (specifiedCount > 1) {
    throw new RangeError('Specify at most one of options.tolerance, options.precision, or options.terms');
  }

  if (hasTerms) {
    const raw = options.terms;
    if (typeof raw !== 'number' && typeof raw !== 'bigint') {
      throw new TypeError('options.terms must be a positive integer or BigInt');
    }
    if (typeof raw === 'number' && (!Number.isInteger(raw) || !Number.isSafeInteger(raw) || raw < 1)) {
      throw new RangeError('options.terms must be a positive safe integer');
    }
    const terms = typeof raw === 'bigint' ? raw : BigInt(raw);
    if (terms < 1n) {
      throw new RangeError('options.terms must be >= 1');
    }
    return { tolNum: DEFAULT_TOLERANCE.num, tolDen: DEFAULT_TOLERANCE.den, fixedTerms: terms };
  }

  if (hasPrecision) {
    const raw = options.precision;
    if (typeof raw !== 'number' && typeof raw !== 'bigint') {
      throw new TypeError('options.precision must be a non-negative integer or BigInt');
    }
    if (typeof raw === 'number' && (!Number.isInteger(raw) || !Number.isSafeInteger(raw) || raw < 0)) {
      throw new RangeError('options.precision must be a non-negative safe integer');
    }
    const prec = typeof raw === 'bigint' ? raw : BigInt(raw);
    if (prec < 0n) {
      throw new RangeError('options.precision must be >= 0');
    }
    return { tolNum: 1n, tolDen: powBigInt(10n, prec), fixedTerms: null };
  }

  if (hasTolerance) {
    const tol = validateRational(options.tolerance, 'options.tolerance');
    if (tol.num <= 0n) {
      throw new RangeError('options.tolerance must be positive');
    }
    return { tolNum: tol.num, tolDen: tol.den, fixedTerms: null };
  }

  return {
    tolNum: DEFAULT_TOLERANCE.num,
    tolDen: DEFAULT_TOLERANCE.den,
    fixedTerms: null,
  };
}

/**
 * Recursively find the largest power-of-two shift `step = 2^j` such that
 * `a >= (b << step)` (starting from `a >= b` and `step = 1n`).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @param {bigint} step
 * @returns {bigint}
 */
function findShiftUp(a, b, step) {
  const nextStep = step << 1n;
  if (a >= (b << nextStep)) {
    return findShiftUp(a, b, nextStep);
  }
  return step;
}

/**
 * Recursively find the largest power-of-two shift `step = 2^j` such that
 * `(a << step) < b` (starting from `a < b` and `step = 1n`).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @param {bigint} step
 * @returns {bigint}
 */
function findShiftDown(a, b, step) {
  const nextStep = step << 1n;
  if ((a << nextStep) < b) {
    return findShiftDown(a, b, nextStep);
  }
  return step;
}

/**
 * Recursively reduce a positive rational `p / q` into `2^exp2 * (num / den)`
 * such that `2/3 <= num / den < 4/3`.
 *
 * Uses exponential bit-shift doubling so recursion depth is `O(log |exp2|)`.
 *
 * @param {bigint} p
 * @param {bigint} q
 * @returns {{ num: bigint, den: bigint, exp2: bigint }}
 */
function reduceArgumentRecursive(p, q) {
  const threeP = 3n * p;
  const twoQ = q << 1n;
  const fourQ = q << 2n;

  if (threeP >= twoQ && threeP < fourQ) {
    return { num: p, den: q, exp2: 0n };
  }

  if (threeP >= fourQ) {
    const k = findShiftUp(threeP, fourQ, 1n);
    const reduced = reduceArgumentRecursive(p, q << k);
    return { num: reduced.num, den: reduced.den, exp2: reduced.exp2 + k };
  }

  const k = findShiftDown(threeP, twoQ, 1n);
  const reduced = reduceArgumentRecursive(p << k, q);
  return { num: reduced.num, den: reduced.den, exp2: reduced.exp2 - k };
}

/**
 * Determine the smallest number of atanh series terms `N >= 1` whose strict
 * remainder upper bound satisfies:
 *   `2 * u^(2N+1) / ((2N+1) * (v^2 - u^2) * v^(2N-1)) <= tolNum / tolDen`
 * where `|y| = u / v` with `0 < u < v`.
 *
 * Uses recursive doubling + recursive binary search (`O(log N)` depth).
 *
 * @param {bigint} u
 * @param {bigint} v
 * @param {bigint} tolNum
 * @param {bigint} tolDen
 * @returns {bigint}
 */
function findTermCountRecursive(u, v, tolNum, tolDen) {
  const diffSq = v * v - u * u;

  function meetsBound(n) {
    const lhs = 2n * powBigInt(u, 2n * n + 1n) * tolDen;
    const rhs = tolNum * (2n * n + 1n) * diffSq * powBigInt(v, 2n * n - 1n);
    return lhs <= rhs;
  }

  if (meetsBound(1n)) {
    return 1n;
  }

  function bracket(lo, hi) {
    if (meetsBound(hi)) {
      return [lo, hi];
    }
    return bracket(hi, hi << 1n);
  }

  function binarySearch(lo, hi) {
    if (lo + 1n >= hi) {
      return hi;
    }
    const mid = (lo + hi) >> 1n;
    if (meetsBound(mid)) {
      return binarySearch(lo, mid);
    }
    return binarySearch(mid, hi);
  }

  const [lo, hi] = bracket(1n, 2n);
  return binarySearch(lo, hi);
}

/**
 * Recursive binary splitting for the series:
 *   `sum_{k=l}^{h-1} (1 / (2k + 1)) * prod_{j=l}^{k} (p_j / q_j)`
 * where `(p_0, q_0) = (1, 1)` and `(p_j, q_j) = (r, s)` for `j >= 1`.
 *
 * For `[0, N)`, `T / (B * Q) === sum_{k=0}^{N-1} (r / s)^k / (2k + 1)`.
 *
 * @param {bigint} l
 * @param {bigint} h
 * @param {bigint} r
 * @param {bigint} s
 * @returns {{ P: bigint, Q: bigint, B: bigint, T: bigint }}
 */
function binarySplitAtanh(l, h, r, s) {
  if (h - l === 1n) {
    const P = l === 0n ? 1n : r;
    const Q = l === 0n ? 1n : s;
    const B = 2n * l + 1n;
    return { P, Q, B, T: P };
  }

  const mid = (l + h) >> 1n;
  const left = binarySplitAtanh(l, mid, r, s);
  const right = binarySplitAtanh(mid, h, r, s);

  return {
    P: left.P * right.P,
    Q: left.Q * right.Q,
    B: left.B * right.B,
    T: right.B * right.Q * left.T + left.B * left.P * right.T,
  };
}

/**
 * Compute `ln(num / den)` directly via the atanh series and recursive binary
 * splitting for a positive rational `num / den` close to 1.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @param {bigint} tolNum
 * @param {bigint} tolDen
 * @param {bigint | null} fixedTerms
 * @returns {{ num: bigint, den: bigint }}
 */
function lnViaAtanh(num, den, tolNum, tolDen, fixedTerms) {
  if (num === den) {
    return { num: 0n, den: 1n };
  }

  // y = (num - den) / (num + den) = p / q in lowest terms
  const y = makeRational(num - den, num + den);
  const u = absBigInt(y.num);
  const v = y.den;
  const r = u * u;
  const s = v * v;

  const terms = fixedTerms !== null ? fixedTerms : findTermCountRecursive(u, v, tolNum, tolDen);
  const { Q, B, T } = binarySplitAtanh(0n, terms, r, s);

  return makeRational(2n * y.num * T, y.den * B * Q);
}

/**
 * Compute `ln(2)` using the identity `2 = (4/3)^2 * (9/8)`:
 *   `ln(2) = 2 * ln(4/3) + ln(9/8)`
 * where `y = 1/7` for `4/3` and `y = 1/17` for `9/8`, giving rapid convergence
 * and guaranteed error `<= tolNum / tolDen` when `fixedTerms === null`.
 *
 * @param {bigint} tolNum
 * @param {bigint} tolDen
 * @param {bigint | null} fixedTerms
 * @returns {{ num: bigint, den: bigint }}
 */
function computeLn2(tolNum, tolDen, fixedTerms) {
  // Allocate tol/4 to ln(4/3) (doubled -> tol/2) and tol/2 to ln(9/8)
  const lnFourThirds = lnViaAtanh(4n, 3n, tolNum, tolDen * 4n, fixedTerms);
  const lnNineEighths = lnViaAtanh(9n, 8n, tolNum, tolDen * 2n, fixedTerms);
  return addRational(scaleRational(2n, lnFourThirds), lnNineEighths);
}

/**
 * Compute the natural logarithm `ln(x)` of a positive exact rational
 * `x = { num: bigint, den: bigint }` using recursive argument reduction and
 * recursive binary splitting of the atanh series.
 *
 * @param {{ num: bigint, den: bigint }} x - Positive exact rational (`x > 0`).
 * @param {object} [options] - Optional accuracy configuration (specify at most one field).
 * @param {{ num: bigint, den: bigint }} [options.tolerance] - Positive rational maximum absolute error (default `10^-15`).
 * @param {number | bigint} [options.precision] - Non-negative integer decimal digits of accuracy (`tolerance = 10^-precision`).
 * @param {number | bigint} [options.terms] - Positive integer number of atanh series terms to sum directly.
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation to `ln(x)` in lowest terms (`den > 0n`), or exact `{ num: 0n, den: 1n }` when `x === 1`.
 * @throws {TypeError} If `x` or `options` (or option fields) have invalid types.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or option values are out of range.
 */
export function lnRationalRecursive(x, options) {
  const normalized = validateRational(x, 'x');
  if (normalized.num <= 0n) {
    throw new RangeError('x must be strictly positive (x > 0)');
  }

  const { tolNum, tolDen, fixedTerms } = parseOptions(options);

  if (normalized.num === 1n && normalized.den === 1n) {
    return { num: 0n, den: 1n };
  }

  const reduced = reduceArgumentRecursive(normalized.num, normalized.den);
  const m = makeRational(reduced.num, reduced.den);
  const exp2 = reduced.exp2;

  if (exp2 === 0n) {
    return lnViaAtanh(m.num, m.den, tolNum, tolDen, fixedTerms);
  }

  const absExp2 = absBigInt(exp2);

  if (m.num === 1n && m.den === 1n) {
    const ln2 = computeLn2(tolNum, tolDen * absExp2, fixedTerms);
    return scaleRational(exp2, ln2);
  }

  // Split error budget evenly: |exp2 * err(ln2)| <= tol/2 and |err(ln(m))| <= tol/2
  const ln2 = computeLn2(tolNum, tolDen * 2n * absExp2, fixedTerms);
  const lnM = lnViaAtanh(m.num, m.den, tolNum, tolDen * 2n, fixedTerms);
  return addRational(scaleRational(exp2, ln2), lnM);
}
