/**
 * Exact rational number represented in lowest terms as `{ num: BigInt, den: BigInt }`
 * with `den > 0n` and `gcd(|num|, den) === 1n`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdIterative(a, b) {
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
 * Reduces a rational `(num / den)` to canonical lowest terms with `den > 0n`.
 * Zero is always represented as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
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
  const g = gcdIterative(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes a 3D vector of exact rationals.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {[Rational, Rational, Rational]}
 */
function validateVector(vec, name) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${name} must be an Array of 3 rational objects`);
  }
  if (vec.length !== 3) {
    throw new RangeError(`${name} must have length 3, received length ${vec.length}`);
  }

  const normalized = [];
  for (let i = 0; i < 3; i += 1) {
    if (!(i in vec)) {
      throw new TypeError(`${name}[${i}] must be a rational object { num: BigInt, den: BigInt }`);
    }
    const entry = vec[i];
    if (entry === null || typeof entry !== 'object') {
      throw new TypeError(`${name}[${i}] must be a rational object { num: BigInt, den: BigInt }`);
    }
    const { num, den } = entry;
    if (typeof num !== 'bigint' || typeof den !== 'bigint') {
      throw new TypeError(
        `${name}[${i}] must have BigInt num and den properties`
      );
    }
    if (den === 0n) {
      throw new RangeError(`${name}[${i}].den must not be 0n`);
    }
    normalized.push(normalizeRational(num, den));
  }

  return normalized;
}

/**
 * Multiplies two normalized exact rationals and returns the result in lowest terms.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function mulRational(x, y) {
  return normalizeRational(x.num * y.num, x.den * y.den);
}

/**
 * Subtracts two normalized exact rationals (`x - y`) and returns the result in lowest terms.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function subRational(x, y) {
  return normalizeRational(x.num * y.den - y.num * x.den, x.den * y.den);
}

/**
 * Computes the 3D vector cross product `a × b` over exact rational numbers
 * represented as `{ num: BigInt, den: BigInt }` in lowest terms, using a
 * straightforward iterative implementation.
 *
 * For each component `i` in `0..2`, computes:
 * `result[i] = a[(i + 1) % 3] * b[(i + 2) % 3] - a[(i + 2) % 3] * b[(i + 1) % 3]`
 *
 * Each output component is normalized so that `den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero is represented as `{ num: 0n, den: 1n }`.
 *
 * @param {readonly [Rational, Rational, Rational]} a First 3D rational vector.
 * @param {readonly [Rational, Rational, Rational]} b Second 3D rational vector.
 * @returns {[Rational, Rational, Rational]} The exact rational cross product `a × b` in lowest terms.
 * @throws {TypeError} If either argument is not an array of `{ num: BigInt, den: BigInt }` objects.
 * @throws {RangeError} If either vector does not have length 3 or contains a zero denominator.
 */
export function crossProductRationalIterative(a, b) {
  const va = validateVector(a, 'a');
  const vb = validateVector(b, 'b');

  const result = [];
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    const term1 = mulRational(va[j], vb[k]);
    const term2 = mulRational(va[k], vb[j]);
    result.push(subRational(term1, term2));
  }

  return result;
}
