/**
 * Exact rational division over `{ num: bigint, den: bigint }` values in lowest terms,
 * implemented with recursive Euclidean GCD cross-cancellation and a divide-and-conquer
 * recursive divisor product for chained division.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInts using the recursive Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdRecursive(a, b) {
  const x = a < 0n ? -a : a;
  const y = b < 0n ? -b : b;
  if (y === 0n) {
    return x;
  }
  return gcdRecursive(y, x % y);
}

/**
 * Validates and normalizes a rational number into lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` for zero).
 *
 * @param {unknown} value
 * @param {string} label - Argument label for error messages.
 * @returns {Rational}
 */
function validateAndNormalize(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`);
  }
  const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value);
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`${label}.num and ${label}.den must both be bigint values`);
  }
  if (den === 0n) {
    throw new RangeError(`${label}.den must not be zero`);
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  const signedNum = den < 0n ? -num : num;
  const posDen = den < 0n ? -den : den;
  const g = gcdRecursive(signedNum, posDen);
  return { num: signedNum / g, den: posDen / g };
}

/**
 * Multiplies two already-normalized rationals using recursive GCD cross-cancellation.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function multiplyNormalized(x, y) {
  if (x.num === 0n || y.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g1 = gcdRecursive(x.num, y.den);
  const g2 = gcdRecursive(y.num, x.den);
  return {
    num: (x.num / g1) * (y.num / g2),
    den: (x.den / g2) * (y.den / g1),
  };
}

/**
 * Divides two already-normalized rationals (where `b.num !== 0n`) using recursive GCD
 * cross-cancellation.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divideNormalized(a, b) {
  if (a.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const invB = b.num < 0n
    ? { num: -b.den, den: -b.num }
    : { num: b.den, den: b.num };
  return multiplyNormalized(a, invB);
}

/**
 * Computes the exact product of `items[lo..hi]` via balanced divide-and-conquer recursion.
 *
 * @param {Rational[]} items
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational}
 */
function productRange(items, lo, hi) {
  if (lo === hi) {
    return items[lo];
  }
  const mid = lo + ((hi - lo) >> 1);
  const left = productRange(items, lo, mid);
  const right = productRange(items, mid + 1, hi);
  return multiplyNormalized(left, right);
}

/**
 * Divides exact rationals represented as `{ num: bigint, den: bigint }` and returns
 * the result normalized to lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 *
 * Supports:
 * - Two rationals: `divideRationalRecursive(a, b)` -> `a / b`
 * - Chained variadic division: `divideRationalRecursive(a, b1, b2, ...)` -> `a / (b1 * b2 * ... * bk)`
 * - Array of rationals: `divideRationalRecursive([a, b1, b2, ...])` -> `a / (b1 * b2 * ... * bk)`
 * - Dividend with divisor array: `divideRationalRecursive(a, [b1, b2, ...])` -> `a / (b1 * b2 * ... * bk)`
 *
 * Uses recursive Euclidean GCD cross-cancellation and a divide-and-conquer recursive product
 * over divisors.
 *
 * @param {Rational | Rational[]} first - Dividend rational, or an array `[a, b1, ...]` of rationals.
 * @param {...(Rational | Rational[])} rest - One or more divisor rationals, or a single array of divisors.
 * @returns {Rational} Quotient in lowest terms with `den > 0n`.
 * @throws {TypeError} If arguments are missing or not valid `{ num: bigint, den: bigint }` objects.
 * @throws {RangeError} If any rational has a zero denominator, any divisor is zero, or an empty array is passed.
 */
export function divideRationalRecursive(first, ...rest) {
  if (arguments.length === 0) {
    throw new TypeError('divideRationalRecursive requires at least two rationals or a non-empty array');
  }

  /** @type {unknown} */
  let rawDividend;
  /** @type {unknown[]} */
  let rawDivisors;

  if (arguments.length === 1) {
    if (!Array.isArray(first)) {
      throw new TypeError('divideRationalRecursive requires a divisor rational or an array of rationals');
    }
    if (first.length === 0) {
      throw new RangeError('divideRationalRecursive requires a non-empty array of rationals');
    }
    rawDividend = first[0];
    rawDivisors = first.slice(1);
  } else if (arguments.length === 2 && !Array.isArray(first) && Array.isArray(rest[0])) {
    rawDividend = first;
    rawDivisors = rest[0];
  } else {
    rawDividend = first;
    rawDivisors = rest;
  }

  const dividend = validateAndNormalize(rawDividend, 'dividend');

  const divisors = new Array(rawDivisors.length);
  for (let i = 0; i < rawDivisors.length; i++) {
    const d = validateAndNormalize(rawDivisors[i], `divisor[${i}]`);
    if (d.num === 0n) {
      throw new RangeError(`Division by zero at divisor[${i}]`);
    }
    divisors[i] = d;
  }

  if (divisors.length === 0) {
    return dividend;
  }

  if (dividend.num === 0n) {
    return { num: 0n, den: 1n };
  }

  const combinedDivisor = productRange(divisors, 0, divisors.length - 1);
  return divideNormalized(dividend, combinedDivisor);
}
