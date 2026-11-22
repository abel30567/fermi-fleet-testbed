/**
 * @fileoverview Exact rational base-2 logarithm using recursive divide-and-conquer
 * range reduction and recursive binary splitting of the atanh Taylor series.
 */

const DEFAULT_PRECISION = 15;

/**
 * Recursive Euclidean greatest common divisor over non-negative BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdRecursive(a, b) {
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  if (absB === 0n) {
    return absA;
  }
  return gcdRecursive(absB, absA % absB);
}

/**
 * Normalizes a rational number to lowest terms with positive denominator.
 * Zero is always represented as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdRecursive(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes an exact rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`);
  }
  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`${label}.num and ${label}.den must both be BigInt values`);
  }
  if (den === 0n) {
    throw new RangeError(`${label}.den cannot be zero`);
  }
  return normalizeRational(num, den);
}

/**
 * Recursive exponentiation by squaring for BigInt base and non-negative BigInt exponent.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @returns {bigint}
 */
function powBigIntRecursive(base, exp) {
  if (exp === 0n) {
    return 1n;
  }
  if (exp === 1n) {
    return base;
  }
  const half = powBigIntRecursive(base, exp >> 1n);
  const squared = half * half;
  return (exp & 1n) === 1n ? squared * base : squared;
}

/**
 * Converts a positive finite JS number into a positive exact rational `{ num, den }`.
 *
 * @param {number} value
 * @returns {{ num: bigint, den: bigint }}
 */
function positiveNumberToRational(value) {
  const [mantissa, expStr] = value.toExponential().split('e');
  const exp = BigInt(expStr);
  const dotIndex = mantissa.indexOf('.');
  let digits;
  let fracLen;
  if (dotIndex === -1) {
    digits = mantissa;
    fracLen = 0n;
  } else {
    digits = mantissa.slice(0, dotIndex) + mantissa.slice(dotIndex + 1);
    fracLen = BigInt(mantissa.length - dotIndex - 1);
  }
  const numDigits = BigInt(digits);
  const netExp = exp - fracLen;
  if (netExp >= 0n) {
    return normalizeRational(numDigits * powBigIntRecursive(10n, netExp), 1n);
  }
  return normalizeRational(numDigits, powBigIntRecursive(10n, -netExp));
}

/**
 * Validates and resolves optional accuracy configuration.
 *
 * @param {unknown} options
 * @returns {{ terms: number | null, tolerance: { num: bigint, den: bigint } }}
 */
function parseOptions(options) {
  if (options === undefined) {
    return {
      terms: null,
      tolerance: { num: 1n, den: powBigIntRecursive(10n, BigInt(DEFAULT_PRECISION)) },
    };
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  let terms = null;
  if (options.terms !== undefined) {
    if (typeof options.terms !== 'number') {
      throw new TypeError('options.terms must be a number');
    }
    if (!Number.isSafeInteger(options.terms) || options.terms < 1) {
      throw new RangeError('options.terms must be a positive safe integer');
    }
    terms = options.terms;
  }

  let precision = null;
  if (options.precision !== undefined) {
    if (typeof options.precision !== 'number') {
      throw new TypeError('options.precision must be a number');
    }
    if (!Number.isSafeInteger(options.precision) || options.precision < 1) {
      throw new RangeError('options.precision must be a positive safe integer');
    }
    precision = options.precision;
  }

  let tolerance = null;
  if (options.tolerance !== undefined) {
    if (typeof options.tolerance === 'number') {
      if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
        throw new RangeError('options.tolerance must be a positive finite number');
      }
      tolerance = positiveNumberToRational(options.tolerance);
    } else if (
      options.tolerance !== null &&
      typeof options.tolerance === 'object' &&
      !Array.isArray(options.tolerance)
    ) {
      const parsedTol = validateRational(options.tolerance, 'options.tolerance');
      if (parsedTol.num <= 0n) {
        throw new RangeError('options.tolerance must be positive');
      }
      tolerance = parsedTol;
    } else {
      throw new TypeError(
        'options.tolerance must be a positive number or rational { num: bigint, den: bigint }',
      );
    }
  }

  if (tolerance === null) {
    const digits = precision !== null ? precision : DEFAULT_PRECISION;
    tolerance = { num: 1n, den: powBigIntRecursive(10n, BigInt(digits)) };
  }

  return { terms, tolerance };
}

/**
 * Recursively doubles `shift` until `num < (den << shift)`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @param {bigint} shift
 * @returns {bigint}
 */
function findUpperShiftRecursive(num, den, shift) {
  if (num < (den << shift)) {
    return shift;
  }
  return findUpperShiftRecursive(num, den, shift << 1n);
}

/**
 * Recursive divide-and-conquer binary search for `k` in `[lo, hi)` such that
 * `(den << k) <= num < (den << (k + 1n))`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function bisectUpperShiftRecursive(num, den, lo, hi) {
  if (hi - lo <= 1n) {
    return lo;
  }
  const mid = lo + ((hi - lo) >> 1n);
  if ((den << mid) <= num) {
    return bisectUpperShiftRecursive(num, den, mid, hi);
  }
  return bisectUpperShiftRecursive(num, den, lo, mid);
}

/**
 * Recursively doubles `shift` until `(num << shift) >= den`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @param {bigint} shift
 * @returns {bigint}
 */
function findLowerShiftRecursive(num, den, shift) {
  if ((num << shift) >= den) {
    return shift;
  }
  return findLowerShiftRecursive(num, den, shift << 1n);
}

/**
 * Recursive divide-and-conquer binary search for smallest `m` in `(lo, hi]`
 * such that `(num << m) >= den`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function bisectLowerShiftRecursive(num, den, lo, hi) {
  if (hi - lo <= 1n) {
    return hi;
  }
  const mid = lo + ((hi - lo) >> 1n);
  if ((num << mid) >= den) {
    return bisectLowerShiftRecursive(num, den, lo, mid);
  }
  return bisectLowerShiftRecursive(num, den, mid, hi);
}

/**
 * Recursively reduces a positive reduced rational `num / den` into `2^k * r`
 * with integer `k` and `r` in `[1, 2)`, detecting exact powers of 2 (`r === 1`).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ k: bigint, r: { num: bigint, den: bigint }, exact: boolean }}
 */
function reduceToUnitInterval(num, den) {
  if (num === den) {
    return { k: 0n, r: { num: 1n, den: 1n }, exact: true };
  }
  if (num > den && num < (den << 1n)) {
    return { k: 0n, r: { num, den }, exact: false };
  }
  if (num >= (den << 1n)) {
    const hi = findUpperShiftRecursive(num, den, 1n);
    const k = bisectUpperShiftRecursive(num, den, hi >> 1n, hi);
    const scaledDen = den << k;
    if (num === scaledDen) {
      return { k, r: { num: 1n, den: 1n }, exact: true };
    }
    return { k, r: normalizeRational(num, scaledDen), exact: false };
  }
  const hi = findLowerShiftRecursive(num, den, 1n);
  const m = hi === 1n ? 1n : bisectLowerShiftRecursive(num, den, hi >> 1n, hi);
  const scaledNum = num << m;
  const k = -m;
  if (scaledNum === den) {
    return { k, r: { num: 1n, den: 1n }, exact: true };
  }
  return { k, r: normalizeRational(scaledNum, den), exact: false };
}

/**
 * Checks whether `n` terms of `2 * atanh(u)` with `0 < u <= 1/M` (`M >= 3`)
 * guarantee truncation error `<= tolerance / 2`.
 *
 * Bound: `2 * sum_{j=n}^inf u^(2j+1)/(2j+1) < (9/4) * u^(2n+1) <= (9/4) * M^(-(2n+1))`.
 * Requiring `(9/4) * M^(-(2n+1)) <= tol / 2` gives `2 * tol.num * M^(2n+1) >= 9 * tol.den`.
 *
 * @param {bigint} M
 * @param {bigint} tolNum
 * @param {bigint} tolDen
 * @param {number} n
 * @returns {boolean}
 */
function meetsSeriesTolerance(M, tolNum, tolDen, n) {
  const exponent = 2n * BigInt(n) + 1n;
  return 2n * tolNum * powBigIntRecursive(M, exponent) >= 9n * tolDen;
}

/**
 * Recursively doubles candidate term count until tolerance is met.
 *
 * @param {bigint} M
 * @param {bigint} tolNum
 * @param {bigint} tolDen
 * @param {number} n
 * @returns {number}
 */
function findUpperTermsRecursive(M, tolNum, tolDen, n) {
  if (meetsSeriesTolerance(M, tolNum, tolDen, n)) {
    return n;
  }
  return findUpperTermsRecursive(M, tolNum, tolDen, n * 2);
}

/**
 * Recursive binary search for the smallest term count in `(lo, hi]` satisfying tolerance.
 *
 * @param {bigint} M
 * @param {bigint} tolNum
 * @param {bigint} tolDen
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function bisectTermsRecursive(M, tolNum, tolDen, lo, hi) {
  if (hi - lo <= 1) {
    return hi;
  }
  const mid = lo + ((hi - lo) >> 1);
  if (meetsSeriesTolerance(M, tolNum, tolDen, mid)) {
    return bisectTermsRecursive(M, tolNum, tolDen, lo, mid);
  }
  return bisectTermsRecursive(M, tolNum, tolDen, mid, hi);
}

/**
 * Determines the minimum number of atanh series terms needed for `u = uNum / uDen`
 * (`0 < u <= 1/3`) to guarantee the target tolerance.
 *
 * @param {bigint} uNum
 * @param {bigint} uDen
 * @param {{ num: bigint, den: bigint }} tolerance
 * @returns {number}
 */
function determineTerms(uNum, uDen, tolerance) {
  const M = uDen / uNum;
  if (meetsSeriesTolerance(M, tolerance.num, tolerance.den, 1)) {
    return 1;
  }
  const hi = findUpperTermsRecursive(M, tolerance.num, tolerance.den, 2);
  return bisectTermsRecursive(M, tolerance.num, tolerance.den, hi >> 1, hi);
}

/**
 * Recursive binary splitting for the atanh partial sum over `[left, right)`:
 *   `S(left, right) = sum_{j=left}^{right-1} (1 / (2j + 1)) * (a / b)^(j - left)`
 *
 * Returns exact integers `{ P, B, D, T }` satisfying:
 *   `P = a^(right - left)`
 *   `B = b^(right - left)`
 *   `D = prod_{j=left}^{right-1} (2j + 1)`
 *   `T = D * b^(right - left - 1) * S(left, right)`
 *
 * @param {bigint} a - Numerator of `u^2`.
 * @param {bigint} b - Denominator of `u^2`.
 * @param {number} left - Inclusive start index.
 * @param {number} right - Exclusive end index (`right > left`).
 * @returns {{ P: bigint, B: bigint, D: bigint, T: bigint }}
 */
function binarySplitAtanh(a, b, left, right) {
  if (right - left === 1) {
    return {
      P: a,
      B: b,
      D: 2n * BigInt(left) + 1n,
      T: 1n,
    };
  }
  const mid = left + ((right - left) >> 1);
  const L = binarySplitAtanh(a, b, left, mid);
  const R = binarySplitAtanh(a, b, mid, right);
  return {
    P: L.P * R.P,
    B: L.B * R.B,
    D: L.D * R.D,
    T: L.T * R.D * R.B + L.P * L.D * R.T,
  };
}

/**
 * Approximates `ln(r) = 2 * atanh((r - 1) / (r + 1))` for `r > 1` using recursive
 * binary splitting over exact BigInt rationals.
 *
 * @param {{ num: bigint, den: bigint }} r - Reduced rational with `r > 1`.
 * @param {number | null} explicitTerms - Optional explicit series term count.
 * @param {{ num: bigint, den: bigint }} tolerance - Target error tolerance.
 * @returns {{ num: bigint, den: bigint }}
 */
function lnViaBinarySplitAtanh(r, explicitTerms, tolerance) {
  const u = normalizeRational(r.num - r.den, r.num + r.den);
  const terms = explicitTerms !== null ? explicitTerms : determineTerms(u.num, u.den, tolerance);
  const a = u.num * u.num;
  const b = u.den * u.den;
  const { B, D, T } = binarySplitAtanh(a, b, 0, terms);
  // 2 * (u.num / u.den) * (T / (D * b^(terms - 1))) = (2 * u.num * u.den * T) / (D * B)
  const num = 2n * u.num * u.den * T;
  const den = D * B;
  return normalizeRational(num, den);
}

/**
 * Computes the base-2 logarithm of a positive exact rational number `{ num, den }`
 * using recursive divide-and-conquer range reduction and recursive binary splitting
 * of the `atanh` series over exact BigInt rationals.
 *
 * Algorithm:
 * 1. Validate `x` as `{ num: bigint, den: bigint }` with `den !== 0n` and `x > 0`,
 *    and normalize `x` to lowest terms.
 * 2. Recursively scale `x = 2^k * r` into `r in [1, 2)` using exponential search
 *    and divide-and-conquer binary search on bit shifts (`O(log |k|)` recursion depth).
 * 3. If `r === 1` (exact power of 2), return `{ num: k, den: 1n }` immediately.
 * 4. Otherwise compute `ln(r)` and `ln(2)` via recursive binary splitting of
 *    `ln(y) = 2 * atanh((y - 1) / (y + 1))` over exact BigInt rationals and return
 *    `k + ln(r) / ln(2)` reduced to lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} x - Positive exact rational input.
 * @param {object} [options] - Optional precision configuration.
 * @param {number} [options.precision=15] - Minimum decimal digits of accuracy
 *   (positive safe integer; default guarantees error <= 1e-15, well within 1e-12).
 * @param {number | { num: bigint, den: bigint }} [options.tolerance] - Maximum
 *   allowed absolute error as a positive finite number or positive exact rational.
 * @param {number} [options.terms] - Explicit number of `atanh` series terms
 *   (positive safe integer) used for both `ln(r)` and `ln(2)`.
 * @returns {{ num: bigint, den: bigint }} Exact rational in lowest terms
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `x` is not a valid rational object with BigInt `num`/`den`,
 *   or if `options` or any option property has an invalid type.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or option values are out of range.
 */
export function log2RationalRecursive(x, options) {
  const normalizedX = validateRational(x, 'x');
  if (normalizedX.num <= 0n) {
    throw new RangeError('log2RationalRecursive requires x > 0');
  }
  const { terms, tolerance } = parseOptions(options);

  const { k, r, exact } = reduceToUnitInterval(normalizedX.num, normalizedX.den);
  if (exact) {
    return { num: k, den: 1n };
  }

  const lnR = lnViaBinarySplitAtanh(r, terms, tolerance);
  const ln2 = lnViaBinarySplitAtanh({ num: 2n, den: 1n }, terms, tolerance);

  // log2(x) = k + ln(r) / ln(2) = (k * (lnR.den * ln2.num) + lnR.num * ln2.den) / (lnR.den * ln2.num)
  const fracNum = lnR.num * ln2.den;
  const fracDen = lnR.den * ln2.num;
  return normalizeRational(k * fracDen + fracNum, fracDen);
}
