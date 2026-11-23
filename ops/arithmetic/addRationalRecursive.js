/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as a numerator and denominator of type `bigint`.
 */

/**
 * Validates that a value is a well-formed Rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational value.
 * @param {string} label - Label used in error messages.
 * @returns {Rational} The validated rational object.
 * @throws {TypeError} If `value` is not a non-null object with `bigint` `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`);
  }
  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`${label}.num and ${label}.den must both be bigint values`);
  }
  if (den === 0n) {
    throw new RangeError(`${label}.den must not be 0n`);
  }
  return { num, den };
}

/**
 * Computes the greatest common divisor of two non-negative `bigint` values
 * using the recursive Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdPositiveRecursive(a, b) {
  if (b === 0n) {
    return a;
  }
  return gcdPositiveRecursive(b, a % b);
}

/**
 * Computes the greatest common divisor of two `bigint` values recursively.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdRecursive(a, b) {
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  return gcdPositiveRecursive(absA, absB);
}

/**
 * Normalizes a rational pair `(num, den)` to lowest terms with `den > 0n`
 * and `{ num: 0n, den: 1n }` for zero.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {Rational} Normalized rational in lowest terms.
 */
function normalizeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Rational denominator must not be 0n');
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
  const g = gcdRecursive(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Adds two normalized rationals and returns the sum in lowest terms.
 *
 * @param {Rational} a - First normalized rational (`den > 0n`).
 * @param {Rational} b - Second normalized rational (`den > 0n`).
 * @returns {Rational} Normalized sum `a + b`.
 */
function addPair(a, b) {
  const g = gcdRecursive(a.den, b.den);
  const scaleA = b.den / g;
  const scaleB = a.den / g;
  const num = a.num * scaleA + b.num * scaleB;
  const den = scaleB * b.den;
  return normalizeRational(num, den);
}

/**
 * Recursively sums `items[lo..hi]` inclusive using divide-and-conquer.
 *
 * @param {Rational[]} items - Validated rational operands.
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Inclusive upper index.
 * @returns {Rational} Normalized sum over the slice.
 */
function sumDivideAndConquer(items, lo, hi) {
  if (lo === hi) {
    return normalizeRational(items[lo].num, items[lo].den);
  }
  const mid = lo + Math.floor((hi - lo) / 2);
  const left = sumDivideAndConquer(items, lo, mid);
  const right = sumDivideAndConquer(items, mid + 1, hi);
  return addPair(left, right);
}

/**
 * Adds exact rational numbers `{ num: bigint, den: bigint }` and returns the exact
 * sum reduced to lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 *
 * Uses a recursive divide-and-conquer summation tree and recursive Euclidean GCD
 * reduction. Accepts either two or more rational arguments (`addRationalRecursive(a, b, ...)`)
 * or a single array of rationals (`addRationalRecursive([a, b, ...])`). An empty array
 * returns the additive identity `{ num: 0n, den: 1n }`.
 *
 * @param {Rational | Rational[]} first - First rational operand, or an array of rational operands.
 * @param {...Rational} rest - Additional rational operands when called variadically.
 * @returns {Rational} The exact sum in lowest terms with `den > 0n`.
 * @throws {TypeError} If called with no arguments or with any non-rational operand.
 * @throws {RangeError} If any operand has `den === 0n`.
 */
export function addRationalRecursive(first, ...rest) {
  if (arguments.length === 0) {
    throw new TypeError('addRationalRecursive requires at least one rational argument or an array of rationals');
  }

  let rawItems;
  if (arguments.length === 1 && Array.isArray(first)) {
    if (first.length === 0) {
      return { num: 0n, den: 1n };
    }
    rawItems = first;
  } else {
    rawItems = [first, ...rest];
  }

  const validated = new Array(rawItems.length);
  for (let i = 0; i < rawItems.length; i += 1) {
    validated[i] = validateRational(rawItems[i], `operand[${i}]`);
  }

  return sumDivideAndConquer(validated, 0, validated.length - 1);
}
