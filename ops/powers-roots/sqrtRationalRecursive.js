/**
 * Recursive Euclidean greatest common divisor for non-negative BigInts.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} The greatest common divisor gcd(a, b).
 */
function gcdRecursive(a, b) {
  if (b === 0n) {
    return a;
  }
  return gcdRecursive(b, a % b);
}

/**
 * Normalizes a rational number num / den to lowest terms with den > 0n
 * and zero represented as { num: 0n, den: 1n }.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 */
function normalizeRational(num, den) {
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
  const absN = n < 0n ? -n : n;
  const g = gcdRecursive(absN, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes a rational input object.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Descriptive name for error messages.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 */
function parseRational(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object with BigInt num and den properties`);
  }
  if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
    throw new TypeError(`${label} num and den must be BigInt values`);
  }
  if (value.den === 0n) {
    throw new RangeError(`${label} denominator cannot be zero`);
  }
  return normalizeRational(value.num, value.den);
}

const DEFAULT_TOLERANCE = Object.freeze({ num: 1n, den: 10n ** 12n });

/**
 * Parses the optional tolerance/precision argument into a strictly positive
 * exact rational tolerance.
 *
 * @param {undefined | { num: bigint, den: bigint } | { tolerance?: { num: bigint, den: bigint }, precision?: number | bigint }} options
 * @returns {{ num: bigint, den: bigint }} Positive normalized tolerance rational.
 */
function parseTolerance(options) {
  if (options === undefined) {
    return DEFAULT_TOLERANCE;
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      'Options must be a rational tolerance { num, den } or an options object { tolerance?, precision? }',
    );
  }

  const hasRationalKeys = 'num' in options || 'den' in options;
  const hasOptionKeys = 'tolerance' in options || 'precision' in options;

  if (hasRationalKeys && hasOptionKeys) {
    throw new TypeError('Cannot combine rational { num, den } keys with { tolerance, precision } options');
  }

  if (hasRationalKeys) {
    const tol = parseRational(options, 'Tolerance');
    if (tol.num <= 0n) {
      throw new RangeError('Tolerance must be strictly positive');
    }
    return tol;
  }

  if (hasOptionKeys) {
    const hasTolerance = options.tolerance !== undefined;
    const hasPrecision = options.precision !== undefined;
    if (hasTolerance && hasPrecision) {
      throw new RangeError('Specify either tolerance or precision, not both');
    }
    if (hasTolerance) {
      const tol = parseRational(options.tolerance, 'Tolerance');
      if (tol.num <= 0n) {
        throw new RangeError('Tolerance must be strictly positive');
      }
      return tol;
    }
    if (hasPrecision) {
      const p = options.precision;
      if (typeof p !== 'bigint' && (typeof p !== 'number' || !Number.isSafeInteger(p))) {
        throw new TypeError('Precision must be a safe integer or BigInt');
      }
      const prec = typeof p === 'bigint' ? p : BigInt(p);
      if (prec < 1n) {
        throw new RangeError('Precision must be at least 1');
      }
      return { num: 1n, den: 10n ** prec };
    }
    return DEFAULT_TOLERANCE;
  }

  if (Object.keys(options).length === 0) {
    return DEFAULT_TOLERANCE;
  }

  throw new TypeError('Unrecognized options object; expected { num, den }, { tolerance }, or { precision }');
}

/**
 * Computes the bit length of a positive BigInt n > 0n.
 *
 * @param {bigint} n - Positive integer.
 * @returns {number} Number of bits required to represent n.
 */
function bitLength(n) {
  const hex = n.toString(16);
  const topNibble = parseInt(hex[0], 16);
  const topBits = topNibble >= 8 ? 4 : topNibble >= 4 ? 3 : topNibble >= 2 ? 2 : 1;
  return (hex.length - 1) * 4 + topBits;
}

/**
 * Recursive binary search for floor(sqrt(n)) on [low, high].
 *
 * @param {bigint} n - Non-negative integer.
 * @param {bigint} low - Inclusive lower bound.
 * @param {bigint} high - Inclusive upper bound.
 * @returns {bigint} floor(sqrt(n)).
 */
function isqrtBinarySearch(n, low, high) {
  if (low === high) {
    return low;
  }
  const mid = (low + high + 1n) >> 1n;
  if (mid * mid <= n) {
    return isqrtBinarySearch(n, mid, high);
  }
  return isqrtBinarySearch(n, low, mid - 1n);
}

/**
 * Computes floor(sqrt(n)) for a non-negative BigInt using divide-and-conquer
 * bit-halving recursion (with recursive binary search for small base cases).
 *
 * Splitting n by 2 * floor(bits / 4) bits recursively produces the upper half
 * of the bits of floor(sqrt(n)), after which one exact Newton refinement step
 * yields floor(sqrt(n)) within at most +-1.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} floor(sqrt(n)).
 */
function isqrtRecursive(n) {
  if (n < 2n) {
    return n;
  }
  if (n < 256n) {
    return isqrtBinarySearch(n, 1n, n >> 1n);
  }
  const bits = bitLength(n);
  const shift = BigInt(bits >> 2);
  const smallRoot = isqrtRecursive(n >> (2n * shift));
  const x0 = smallRoot << shift;
  let x1 = (x0 + n / x0) >> 1n;
  if (x1 * x1 > n) {
    x1 -= 1n;
  } else if ((x1 + 1n) * (x1 + 1n) <= n) {
    x1 += 1n;
  }
  return x1;
}

/**
 * Recursive divide-and-conquer bisection over exact BigInt rationals.
 *
 * Maintains the invariant:
 *   lowNum / den < sqrt(p / q) < (lowNum + 1) / den
 * At each step the midpoint mid = (2 * lowNum + 1) / (2 * den) has error
 * strictly less than 1 / (2 * den). Recursion terminates as soon as
 * 1 / (2 * den) <= effNum / effDen, guaranteeing |mid - sqrt(p / q)| <= effTol.
 *
 * @param {bigint} p - Reduced positive numerator of radicand.
 * @param {bigint} q - Reduced positive denominator of radicand.
 * @param {bigint} lowNum - Numerator of lower endpoint lowNum / den.
 * @param {bigint} den - Common positive denominator of the bracket endpoints.
 * @param {bigint} effNum - Positive numerator of effective error tolerance.
 * @param {bigint} effDen - Positive denominator of effective error tolerance.
 * @returns {{ num: bigint, den: bigint }} Normalized rational approximation.
 */
function bisectSqrtRecursive(p, q, lowNum, den, effNum, effDen) {
  const midNum = (lowNum << 1n) + 1n;
  const midDen = den << 1n;

  if (effDen <= midDen * effNum) {
    return normalizeRational(midNum, midDen);
  }

  const lhs = midNum * midNum * q;
  const rhs = p * midDen * midDen;

  if (lhs === rhs) {
    return normalizeRational(midNum, midDen);
  }
  if (lhs < rhs) {
    return bisectSqrtRecursive(p, q, midNum, midDen, effNum, effDen);
  }
  return bisectSqrtRecursive(p, q, lowNum << 1n, midDen, effNum, effDen);
}

/**
 * Computes the principal square root of a non-negative exact rational number
 * `{ num: bigint, den: bigint }` using recursive divide-and-conquer algorithms
 * over exact BigInt rationals.
 *
 * Algorithm:
 * 1. Validate inputs and reduce `rational` to lowest terms `p / q` (`q > 0n`, `gcd(p, q) = 1n`).
 *    Negative inputs throw `RangeError`.
 * 2. Handle zero exactly (`{ num: 0n, den: 1n }`).
 * 3. Compute exact integer square roots `sp = isqrtRecursive(p)` and `sq = isqrtRecursive(q)`
 *    via recursive divide-and-conquer bit-halving (with recursive binary search base cases).
 *    If `sp^2 === p` and `sq^2 === q`, return the exact lowest-terms root `{ num: sp, den: sq }`.
 * 4. Otherwise, construct a tight exact unit-numerator-gap rational bracket:
 *    - For `p >= q`: `k = isqrtRecursive(p / q)` gives `k / 1 < sqrt(p / q) < (k + 1) / 1`.
 *    - For `p < q`: `k = isqrtRecursive(q / p)` gives `k / (k * (k + 1)) < sqrt(p / q) < (k + 1) / (k * (k + 1))`,
 *      with scaled effective tolerance `tol / (k + 1)` so both absolute and relative errors stay `<= tol`.
 * 5. Recursively bisect the exact rational interval until the half-width satisfies the tolerance,
 *    and return the resulting rational reduced to lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} rational - Non-negative exact rational number.
 * @param {{ num: bigint, den: bigint } | { tolerance?: { num: bigint, den: bigint }, precision?: number | bigint }} [options]
 *   Optional accuracy specification:
 *   - Omit for default tolerance `1 / 10^12` (error `<= 1e-12`).
 *   - Pass a strictly positive rational `{ num: bigint, den: bigint }` directly as the error tolerance.
 *   - Or pass `{ tolerance: { num, den } }` or `{ precision: integer >= 1 }` (meaning `10^-precision`).
 * @returns {{ num: bigint, den: bigint }} Exact or high-accuracy rational square root in lowest terms
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `rational` or `options` has an invalid shape or non-BigInt numerator/denominator.
 * @throws {RangeError} If `rational` has a zero denominator or negative value, or if `tolerance`/`precision` is out of range.
 */
export function sqrtRationalRecursive(rational, options) {
  const { num: p, den: q } = parseRational(rational, 'Rational');
  const tol = parseTolerance(options);

  if (p < 0n) {
    throw new RangeError('Cannot compute square root of a negative rational number');
  }

  if (p === 0n) {
    return { num: 0n, den: 1n };
  }

  const sp = isqrtRecursive(p);
  const sq = isqrtRecursive(q);
  if (sp * sp === p && sq * sq === q) {
    return normalizeRational(sp, sq);
  }

  if (p >= q) {
    const k = isqrtRecursive(p / q);
    return bisectSqrtRecursive(p, q, k, 1n, tol.num, tol.den);
  }

  const k = isqrtRecursive(q / p);
  const den = k * (k + 1n);
  return bisectSqrtRecursive(p, q, k, den, tol.num, tol.den * (k + 1n));
}
