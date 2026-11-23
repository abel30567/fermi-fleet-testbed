/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator as a BigInt.
 * @property {bigint} den - Non-zero denominator as a BigInt (normalized to den > 0n in output).
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
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
 * Validates and normalizes a single rational input into lowest terms with den > 0n.
 *
 * @param {Rational} value - Candidate rational object.
 * @param {number} index - Element index in the input array (for error reporting).
 * @returns {Rational} Normalized exact rational in lowest terms with den > 0n.
 */
function normalizeRational(value, index) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      `Expected a rational object {num: BigInt, den: BigInt} at index ${index}`
    );
  }

  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(
      `Expected BigInt num and den properties at index ${index}`
    );
  }
  if (den === 0n) {
    throw new RangeError(`Denominator cannot be 0n at index ${index}`);
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }

  let normalizedNum = num;
  let normalizedDen = den;
  if (normalizedDen < 0n) {
    normalizedNum = -normalizedNum;
    normalizedDen = -normalizedDen;
  }

  const divisor = gcd(normalizedNum, normalizedDen);
  return {
    num: normalizedNum / divisor,
    den: normalizedDen / divisor,
  };
}

/**
 * Adds two already-normalized exact rationals and returns the reduced sum
 * with den > 0n in lowest terms.
 *
 * @param {Rational} a - First normalized rational.
 * @param {Rational} b - Second normalized rational.
 * @returns {Rational} Normalized sum in lowest terms.
 */
function addNormalized(a, b) {
  if (a.num === 0n) {
    return b;
  }
  if (b.num === 0n) {
    return a;
  }

  const g = gcd(a.den, b.den);
  const aDenDivG = a.den / g;
  const bDenDivG = b.den / g;
  const num = a.num * bDenDivG + b.num * aDenDivG;

  if (num === 0n) {
    return { num: 0n, den: 1n };
  }

  // Any common factor of num and lcm(a.den, b.den) must divide g.
  const g2 = gcd(num, g);
  return {
    num: num / g2,
    den: aDenDivG * (b.den / g2),
  };
}

/**
 * Recursively sums terms[start..end-1] via divide-and-conquer binary splitting.
 *
 * @param {readonly Rational[]} terms - Array of rational terms.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Rational} Normalized partial sum in lowest terms.
 */
function sumSliceRecursive(terms, start, end) {
  const length = end - start;
  if (length === 0) {
    return { num: 0n, den: 1n };
  }
  if (length === 1) {
    return normalizeRational(terms[start], start);
  }

  const mid = start + Math.floor(length / 2);
  const left = sumSliceRecursive(terms, start, mid);
  const right = sumSliceRecursive(terms, mid, end);
  return addNormalized(left, right);
}

/**
 * Computes the discrete summation of an array of exact rational numbers
 * `{ num: BigInt, den: BigInt }` using a recursive divide-and-conquer
 * (binary splitting) algorithm.
 *
 * The returned rational is always normalized to lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` when the sum is zero or the input array is empty).
 *
 * @param {readonly Rational[]} terms - Array of exact rational objects `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact sum `{ num: bigint, den: bigint }` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `terms` is not an Array or any element is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If any element has a denominator of `0n`.
 */
export function summationRationalRecursive(terms) {
  if (!Array.isArray(terms)) {
    throw new TypeError('Expected terms to be an Array of rational objects');
  }
  return sumSliceRecursive(terms, 0, terms.length);
}
