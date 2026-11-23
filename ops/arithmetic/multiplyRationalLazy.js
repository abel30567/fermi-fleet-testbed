/**
 * @typedef {Object} Rational
 * @property {bigint} num - Exact numerator (carries the sign; 0n when value is zero).
 * @property {bigint} den - Exact denominator (strictly positive in canonical lowest terms; 1n when num is 0n).
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Determines whether a value is a non-string iterable.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableInput(value) {
  return (
    value !== null &&
    value !== undefined &&
    typeof value !== 'string' &&
    typeof value[Symbol.iterator] === 'function'
  );
}

/**
 * Validates and normalizes a rational object `{ num: BigInt, den: BigInt }`
 * into canonical lowest terms with a strictly positive denominator.
 *
 * @param {unknown} value
 * @param {string} [label='rational']
 * @returns {Rational}
 */
function normalizeRational(value, label = 'rational') {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object with BigInt num and den properties`);
  }
  const { num, den } = value;
  if (typeof num !== 'bigint') {
    throw new TypeError(`${label}.num must be a BigInt`);
  }
  if (typeof den !== 'bigint') {
    throw new TypeError(`${label}.den must be a BigInt`);
  }
  if (den === 0n) {
    throw new RangeError(`${label}.den must not be 0n`);
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  const sign = den < 0n ? -1n : 1n;
  const signedNum = num * sign;
  const posDen = den * sign;
  const divisor = gcd(signedNum, posDen);
  return {
    num: signedNum / divisor,
    den: posDen / divisor,
  };
}

/**
 * Multiplies two already-normalized exact rationals using cross-cancellation
 * so the result is directly in canonical lowest terms without intermediate blowup.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyNormalized(a, b) {
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
 * Lazily yields the running (cumulative) exact product of a sequence of rationals.
 *
 * @param {Iterable<Rational>} iterable
 * @returns {Generator<Rational, void, undefined>}
 */
function* runningProduct(iterable) {
  let acc = null;
  for (const item of iterable) {
    const r = normalizeRational(item, 'iterable element');
    acc = acc === null ? r : multiplyNormalized(acc, r);
    yield { num: acc.num, den: acc.den };
  }
}

/**
 * Lazily zips two iterables of rationals and yields each pairwise exact product,
 * stopping as soon as either iterable is exhausted and closing both iterators.
 *
 * @param {Iterable<Rational>} left
 * @param {Iterable<Rational>} right
 * @returns {Generator<Rational, void, undefined>}
 */
function* zipProduct(left, right) {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  let leftDone = false;
  let rightDone = false;

  try {
    while (true) {
      const leftStep = leftIter.next();
      if (leftStep.done) {
        leftDone = true;
        return;
      }
      const rightStep = rightIter.next();
      if (rightStep.done) {
        rightDone = true;
        return;
      }
      const a = normalizeRational(leftStep.value, 'left element');
      const b = normalizeRational(rightStep.value, 'right element');
      yield multiplyNormalized(a, b);
    }
  } finally {
    try {
      if (!leftDone && typeof leftIter.return === 'function') {
        leftIter.return();
      }
    } finally {
      if (!rightDone && typeof rightIter.return === 'function') {
        rightIter.return();
      }
    }
  }
}

/**
 * Lazily multiplies each rational in an iterable by a normalized scalar rational.
 *
 * @param {Iterable<Rational>} iterable
 * @param {Rational} scalar
 * @returns {Generator<Rational, void, undefined>}
 */
function* scaleStream(iterable, scalar) {
  for (const item of iterable) {
    const r = normalizeRational(item, 'iterable element');
    yield multiplyNormalized(r, scalar);
  }
}

/**
 * Yields the single exact product of two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Generator<Rational, void, undefined>}
 */
function* singleProduct(a, b) {
  yield multiplyNormalized(a, b);
}

/**
 * Lazily multiplies exact rationals represented as `{ num: BigInt, den: BigInt }`,
 * yielding every result in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` for zero).
 *
 * Supported call forms (all return a pull-based `Generator<Rational>`):
 * 1. `multiplyRationalLazy(iterable)`: consumes `iterable` lazily and yields the
 *    running cumulative product after each element.
 * 2. `multiplyRationalLazy(leftIterable, rightIterable)`: lazily zips both iterables
 *    and yields each pairwise product until the shorter iterable ends.
 * 3. `multiplyRationalLazy(iterable, scalar)` or `multiplyRationalLazy(scalar, iterable)`:
 *    lazily scales each element of the iterable by the scalar rational.
 * 4. `multiplyRationalLazy(a, b)`: yields the single exact product of two rationals.
 *
 * Top-level arguments and scalar rationals are validated eagerly; elements of iterables
 * are validated lazily as they are consumed.
 *
 * @param {Iterable<Rational> | Rational} first - An iterable of rationals, or a single rational (when two arguments are provided).
 * @param {Iterable<Rational> | Rational} [second] - Optional second iterable of rationals or scalar rational.
 * @returns {Generator<Rational, void, undefined>} Generator yielding exact reduced `{ num: bigint, den: bigint }` products.
 * @throws {TypeError} If argument count is not 1 or 2, an expected iterable is invalid, or a rational's `num`/`den` is not a BigInt.
 * @throws {RangeError} If any rational has a denominator of `0n`.
 */
export function multiplyRationalLazy(first, second) {
  if (arguments.length === 0 || arguments.length > 2) {
    throw new TypeError(
      `multiplyRationalLazy expects 1 or 2 arguments, received ${arguments.length}`
    );
  }

  if (arguments.length === 1) {
    if (!isIterableInput(first)) {
      throw new TypeError(
        'multiplyRationalLazy(iterable) expects a non-string iterable of rationals'
      );
    }
    return runningProduct(first);
  }

  const firstIsIterable = isIterableInput(first);
  const secondIsIterable = isIterableInput(second);

  if (firstIsIterable && secondIsIterable) {
    return zipProduct(first, second);
  }
  if (firstIsIterable) {
    const scalar = normalizeRational(second, 'second argument');
    return scaleStream(first, scalar);
  }
  if (secondIsIterable) {
    const scalar = normalizeRational(first, 'first argument');
    return scaleStream(second, scalar);
  }

  const a = normalizeRational(first, 'first argument');
  const b = normalizeRational(second, 'second argument');
  return singleProduct(a, b);
}
