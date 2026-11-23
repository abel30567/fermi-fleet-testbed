/**
 * Exact discrete (floored) modulo over rational numbers `{ num: BigInt, den: BigInt }`
 * in lowest terms, implemented lazily via generators for streaming iterable inputs.
 *
 * For rationals `a` and `b` (`b !== 0`), the discrete modulo `r = a mod b` satisfies:
 *   - `a = b * q + r` where `q = floor(a / b)` is an integer,
 *   - `0 <= r < b` when `b > 0`, and `b < r <= 0` when `b < 0`,
 *   - `r` is returned in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 *     and `{ num: 0n, den: 1n }` when zero).
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Check whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {value is Iterable<unknown>}
 */
function isIterableSequence(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value[Symbol.iterator] === 'function'
  );
}

/**
 * Validate and normalize a rational object `{ num: bigint, den: bigint }` into
 * canonical lowest terms with strictly positive denominator.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalizeRational(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('num' in value) ||
    !('den' in value)
  ) {
    throw new TypeError(
      `${label} must be a rational object { num: bigint, den: bigint }`
    );
  }

  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(
      `${label} num and den must both be bigint values`
    );
  }

  if (den === 0n) {
    throw new RangeError(`${label} denominator must be non-zero`);
  }

  if (num === 0n) {
    return { num: 0n, den: 1n };
  }

  const signedNum = den < 0n ? -num : num;
  const posDen = den < 0n ? -den : den;
  const g = gcdBigInt(signedNum, posDen);
  return { num: signedNum / g, den: posDen / g };
}

/**
 * Compute `a mod b` (floored discrete modulo) for normalized rationals `a` and `b`,
 * returning a rational in canonical lowest terms.
 *
 * @param {Rational} a - Normalized dividend (`a.den > 0n`).
 * @param {Rational} b - Normalized divisor (`b.den > 0n`, `b.num !== 0n`).
 * @returns {Rational}
 */
function modNormalizedRational(a, b) {
  if (b.num === 0n) {
    throw new RangeError('Modulo by zero');
  }
  if (a.num === 0n) {
    return { num: 0n, den: 1n };
  }

  const gDen = gcdBigInt(a.den, b.den);
  const da = a.den / gDen;
  const db = b.den / gDen;

  // a = (a.num * db) / lcm, b = (b.num * da) / lcm, where lcm = a.den * db > 0n
  const scaledNum = a.num * db;
  const scaledMod = b.num * da;
  const rem = ((scaledNum % scaledMod) + scaledMod) % scaledMod;

  if (rem === 0n) {
    return { num: 0n, den: 1n };
  }

  const lcmDen = a.den * db;
  const g = gcdBigInt(rem, lcmDen);
  return { num: rem / g, den: lcmDen / g };
}

/**
 * Lazily compute the discrete (floored) modulo over exact rationals `{ num: BigInt, den: BigInt }`.
 *
 * Supports four combinations of inputs, always returning a lazy `Generator<Rational>`:
 * - `(Iterable<Rational>, Iterable<Rational>)`: lazily zips both iterables and yields
 *   `a_i mod b_i` until the shorter iterable is exhausted.
 * - `(Iterable<Rational>, Rational)`: lazily yields `a_i mod divisor` for each element.
 * - `(Rational, Iterable<Rational>)`: lazily yields `dividend mod b_i` for each element.
 * - `(Rational, Rational)`: lazily yields the single result `dividend mod divisor`.
 *
 * Top-level argument kinds and scalar rational values are validated eagerly; elements of
 * iterables are consumed and validated lazily one at a time as the returned generator is pulled.
 *
 * @param {Rational | Iterable<Rational>} dividends - A rational or iterable of rational dividends.
 * @param {Rational | Iterable<Rational>} divisors - A rational or iterable of non-zero rational divisors.
 * @returns {Generator<Rational, void, undefined>} A lazy generator yielding normalized `{ num, den }` rationals.
 * @throws {TypeError} If inputs are neither rational objects nor iterable sequences, or if elements have invalid types.
 * @throws {RangeError} If any denominator is `0n` or any divisor is `0n / den`.
 */
export function moduloRationalLazy(dividends, divisors) {
  const aIsIterable = isIterableSequence(dividends);
  const bIsIterable = isIterableSequence(divisors);

  const scalarA = aIsIterable
    ? null
    : validateAndNormalizeRational(dividends, 'dividends');
  const scalarB = bIsIterable
    ? null
    : validateAndNormalizeRational(divisors, 'divisors');

  if (scalarB !== null && scalarB.num === 0n) {
    throw new RangeError('Modulo by zero');
  }

  if (aIsIterable && bIsIterable) {
    return (function* zipMod() {
      const iterA = dividends[Symbol.iterator]();
      const iterB = divisors[Symbol.iterator]();
      let doneA = false;
      let doneB = false;
      try {
        while (true) {
          const stepA = iterA.next();
          if (stepA.done) {
            doneA = true;
            return;
          }
          const stepB = iterB.next();
          if (stepB.done) {
            doneB = true;
            return;
          }
          const normA = validateAndNormalizeRational(stepA.value, 'dividend');
          const normB = validateAndNormalizeRational(stepB.value, 'divisor');
          yield modNormalizedRational(normA, normB);
        }
      } finally {
        if (!doneA && typeof iterA.return === 'function') {
          iterA.return();
        }
        if (!doneB && typeof iterB.return === 'function') {
          iterB.return();
        }
      }
    })();
  }

  if (aIsIterable) {
    return (function* streamDividendsModScalar() {
      for (const item of dividends) {
        const normA = validateAndNormalizeRational(item, 'dividend');
        yield modNormalizedRational(normA, scalarB);
      }
    })();
  }

  if (bIsIterable) {
    return (function* scalarDividendModStream() {
      for (const item of divisors) {
        const normB = validateAndNormalizeRational(item, 'divisor');
        yield modNormalizedRational(scalarA, normB);
      }
    })();
  }

  return (function* singleMod() {
    yield modNormalizedRational(scalarA, scalarB);
  })();
}
