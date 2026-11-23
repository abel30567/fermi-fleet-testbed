/**
 * Exact discrete factorial over rationals `{ num: BigInt, den: BigInt }` in
 * lowest terms, implemented with a streaming/generator pipeline that consumes
 * iterable inputs lazily.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Validates and reduces a rational `{ num: BigInt, den: BigInt }` to canonical
 * lowest terms with `den > 0n` (and `0n / 1n` for zero).
 *
 * @param {unknown} value
 * @returns {Rational}
 */
function normalizeRational(value) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Expected a rational object { num: BigInt, den: BigInt }');
  }
  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError('Rational properties num and den must both be BigInt');
  }
  if (den === 0n) {
    throw new RangeError('Rational denominator must not be zero');
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  const sign = den < 0n ? -1n : 1n;
  const absNum = num < 0n ? -num : num;
  const absDen = den < 0n ? -den : den;
  const g = gcd(absNum, absDen);
  return {
    num: (sign * num) / g,
    den: absDen / g,
  };
}

/**
 * Multiplies two normalized rationals and returns the exact product in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
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
 * Validates that a rational represents a non-negative integer and returns its
 * integer value as a BigInt.
 *
 * @param {unknown} value
 * @returns {bigint}
 */
function toNonNegativeInteger(value) {
  const r = normalizeRational(value);
  if (r.den !== 1n) {
    throw new RangeError(
      `Discrete factorial requires an integer rational, received ${r.num}/${r.den}`
    );
  }
  if (r.num < 0n) {
    throw new RangeError(
      `Discrete factorial requires a non-negative integer, received ${r.num}/${r.den}`
    );
  }
  return r.num;
}

/**
 * Lazily streams rational factors `{ num: k, den: 1n }` for `k` in `[start, end]`.
 *
 * @param {bigint} start
 * @param {bigint} end
 * @returns {Generator<Rational, void, unknown>}
 */
function* rationalFactorStream(start, end) {
  for (let k = start; k <= end; k += 1n) {
    yield { num: k, den: 1n };
  }
}

/**
 * Computes `n!` as an exact rational in lowest terms by streaming factors
 * from `startN + 1n` through `n` onto `startAcc`.
 *
 * @param {bigint} n
 * @param {bigint} [startN=0n]
 * @param {Rational} [startAcc={ num: 1n, den: 1n }]
 * @returns {Rational}
 */
function computeFactorialFrom(n, startN = 0n, startAcc = { num: 1n, den: 1n }) {
  let acc = { num: startAcc.num, den: startAcc.den };
  for (const factor of rationalFactorStream(startN + 1n, n)) {
    acc = mulRational(acc, factor);
  }
  return acc;
}

/**
 * Returns true if the input is an object iterable (excluding boxed String objects).
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof String) &&
    typeof value[Symbol.iterator] === 'function'
  );
}

/**
 * Lazily consumes an iterable of exact rationals and yields the exact rational
 * factorial `{ num: BigInt, den: BigInt }` in lowest terms for each element.
 *
 * @param {Iterable<Rational>} iterable
 * @returns {Generator<Rational, void, unknown>}
 */
function* factorialSequenceGenerator(iterable) {
  let hasPrev = false;
  let prevN = 0n;
  let prevFact = { num: 1n, den: 1n };

  for (const item of iterable) {
    const n = toNonNegativeInteger(item);
    const result =
      hasPrev && n >= prevN
        ? computeFactorialFrom(n, prevN, prevFact)
        : computeFactorialFrom(n);

    hasPrev = true;
    prevN = n;
    prevFact = { num: result.num, den: result.den };
    yield result;
  }
}

/**
 * Computes the discrete factorial `n!` over exact rationals `{ num: BigInt, den: BigInt }`
 * in lowest terms using a streaming/generator-based implementation.
 *
 * - When given a single rational `{ num: BigInt, den: BigInt }` whose reduced
 *   value is a non-negative integer `n`, streams factors `1/1 .. n/1` through
 *   exact rational multiplication and returns `{ num: n!, den: 1n }`.
 * - When given an iterable of rationals (e.g., an Array, Generator, or custom
 *   iterable, including infinite streams), returns a Generator that consumes
 *   elements lazily one at a time and yields each exact rational factorial in
 *   lowest terms.
 *
 * @param {Rational | Iterable<Rational>} input - A single exact rational or an iterable of exact rationals.
 * @returns {Rational | Generator<Rational, void, unknown>} Exact rational factorial or lazy generator of factorials.
 * @throws {TypeError} If input (or a consumed element) is not a valid rational object `{ num: BigInt, den: BigInt }` or iterable.
 * @throws {RangeError} If a rational has denominator `0n`, is negative, or does not reduce to an integer.
 */
export function factorialRationalLazy(input) {
  if (isIterableObject(input)) {
    return factorialSequenceGenerator(input);
  }
  const n = toNonNegativeInteger(input);
  return computeFactorialFrom(n);
}
