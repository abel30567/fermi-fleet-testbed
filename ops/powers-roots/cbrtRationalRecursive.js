/**
 * Computes the cube root of an exact rational number using recursive /
 * divide-and-conquer BigInt rational arithmetic.
 *
 * Exact rationals are represented as `{ num: bigint, den: bigint }` and are
 * always returned in lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero represented as `{ num: 0n, den: 1n }`.
 *
 * Algorithm:
 * 1. Validates and normalizes the input rational to lowest terms with `den > 0n`
 *    via recursive Euclidean GCD.
 * 2. Preserves sign: returns `0/1` for zero, and delegates negative inputs via
 *    `cbrt(-x) = -cbrt(x)`.
 * 3. Checks for exact rational cubes by computing the recursive integer cube
 *    root (recursive Newton-Raphson with divide-and-conquer bit-length
 *    estimation) on the coprime numerator and denominator. If both are perfect
 *    cubes, returns the exact rational cube root immediately.
 * 4. For irrational cube roots, brackets the root via power-of-two scaling
 *    `[2^(k-1), 2^(k+1)]`, refines the initial estimate with recursive
 *    bisection over exact rationals, and runs recursive Newton-Raphson
 *    `r_{n+1} = (2*r_n + x / r_n^2) / 3` over exact BigInt rationals with
 *    bounded intermediate denominator quantization until the exact rational
 *    inequality `(max(0, r - tol))^3 <= x <= (r + tol)^3` holds.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {Rational} rational - Input rational `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {Rational | { tolerance?: Rational, precision?: number | bigint }} [options]
 *   Optional accuracy specification:
 *   - Omitted / `{}`: defaults to error `<= 10^-15` (strictly better than `1e-12`).
 *   - A positive rational `{ num, den }` used directly as maximum absolute error tolerance.
 *   - `{ tolerance: Rational }`: positive rational maximum absolute error tolerance.
 *   - `{ precision: number | bigint }`: positive integer decimal digits `p` (tolerance `1 / 10^p`).
 * @returns {Rational} Exact cube root (when rational) or high-accuracy rational approximation
 *   in lowest terms with `den > 0n`.
 * @throws {TypeError} If `rational` or `options` have invalid types or shapes.
 * @throws {RangeError} If any denominator is `0n`, tolerance is non-positive,
 *   precision is not a positive integer, or both `tolerance` and `precision` are specified.
 */

const DEFAULT_TOLERANCE = Object.freeze({
  num: 1n,
  den: 1_000_000_000_000_000n, // 1e-15 (strictly better than 1e-12)
});

const ONE_SIXTEENTH = Object.freeze({ num: 1n, den: 16n });
const BISECTION_STEPS = 3;

/**
 * Computes the greatest common divisor of two non-negative BigInts recursively.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdRecursive(a, b) {
  if (b === 0n) {
    return a;
  }
  return gcdRecursive(b, a % b);
}

/**
 * Returns the absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
  return n < 0n ? -n : n;
}

/**
 * Mathematical floor division `floor(a / b)` for `b > 0n`.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r < 0n ? q - 1n : q;
}

/**
 * Validates and normalizes a rational object to lowest terms with `den > 0n`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalizeRational(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object with { num: bigint, den: bigint }`);
  }
  if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
    throw new TypeError(`${label} num and den must be BigInt values`);
  }
  if (value.den === 0n) {
    throw new RangeError(`${label} denominator must not be zero`);
  }
  return normalizeRational(value.num, value.den);
}

/**
 * Normalizes `(num, den)` to lowest terms with `den > 0n` and `0` as `0n / 1n`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcdRecursive(absBigInt(num), den);
  return { num: num / g, den: den / g };
}

/**
 * Recursive exponentiation by squaring for non-negative BigInt exponent.
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
  const sq = half * half;
  return (exp & 1n) === 1n ? sq * base : sq;
}

/**
 * Finds a power-of-two upper bound `step` such that `(n >> step) === 0n`.
 * @param {bigint} n
 * @param {bigint} step
 * @returns {bigint}
 */
function findBitUpperBound(n, step) {
  if ((n >> step) === 0n) {
    return step;
  }
  return findBitUpperBound(n, step << 1n);
}

/**
 * Divide-and-conquer bit length of `n > 0n` given `n < (1n << bound)`.
 * @param {bigint} n
 * @param {bigint} bound
 * @returns {bigint}
 */
function bitLengthBounded(n, bound) {
  const half = bound >> 1n;
  if (half === 0n) {
    return 1n;
  }
  const hi = n >> half;
  if (hi > 0n) {
    return half + bitLengthBounded(hi, half);
  }
  return bitLengthBounded(n, half);
}

/**
 * Computes the bit length of a positive BigInt recursively in O(log(bits)) depth.
 * @param {bigint} n
 * @returns {bigint}
 */
function bitLengthRecursive(n) {
  const bound = findBitUpperBound(n, 1n);
  return bitLengthBounded(n, bound);
}

/**
 * Recursive integer Newton-Raphson step for `floor(cbrt(n))`.
 * @param {bigint} n
 * @param {bigint} x
 * @returns {bigint}
 */
function icbrtNewtonRecursive(n, x) {
  const next = (2n * x + n / (x * x)) / 3n;
  if (next >= x) {
    return x;
  }
  return icbrtNewtonRecursive(n, next);
}

/**
 * Computes `floor(cbrt(n))` for `n >= 0n` recursively.
 * @param {bigint} n
 * @returns {bigint}
 */
function icbrtRecursive(n) {
  if (n === 0n) {
    return 0n;
  }
  const bits = bitLengthRecursive(n);
  const initial = 1n << ((bits + 2n) / 3n);
  return icbrtNewtonRecursive(n, initial);
}

/**
 * Returns `2^exp` as a reduced rational.
 * @param {bigint} exp
 * @returns {Rational}
 */
function pow2Rational(exp) {
  if (exp >= 0n) {
    return { num: 1n << exp, den: 1n };
  }
  return { num: 1n, den: 1n << -exp };
}

/** @param {Rational} a @param {Rational} b @returns {Rational} */
function ratAdd(a, b) {
  return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** @param {Rational} a @param {Rational} b @returns {Rational} */
function ratSub(a, b) {
  return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den);
}

/** @param {Rational} a @param {Rational} b @returns {Rational} */
function ratMul(a, b) {
  return normalizeRational(a.num * b.num, a.den * b.den);
}

/** @param {Rational} a @param {Rational} b @returns {Rational} */
function ratDiv(a, b) {
  return normalizeRational(a.num * b.den, a.den * b.num);
}

/** @param {Rational} r @returns {Rational} */
function ratSquare(r) {
  return { num: r.num * r.num, den: r.den * r.den };
}

/** @param {Rational} r @returns {Rational} */
function ratCube(r) {
  return { num: r.num * r.num * r.num, den: r.den * r.den * r.den };
}

/** @param {Rational} r @returns {Rational} */
function ratDouble(r) {
  if ((r.den & 1n) === 0n) {
    return { num: r.num, den: r.den >> 1n };
  }
  return { num: r.num << 1n, den: r.den };
}

/** @param {Rational} r @returns {Rational} */
function ratHalf(r) {
  if ((r.num & 1n) === 0n) {
    return { num: r.num >> 1n, den: r.den };
  }
  return { num: r.num, den: r.den << 1n };
}

/** @param {Rational} r @returns {Rational} */
function ratDivBy3(r) {
  if (r.num % 3n === 0n) {
    return { num: r.num / 3n, den: r.den };
  }
  return { num: r.num, den: r.den * 3n };
}

/** @param {Rational} a @param {Rational} b @returns {-1 | 0 | 1} */
function ratCompare(a, b) {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/** @param {Rational} a @param {Rational} b @returns {Rational} */
function ratMin(a, b) {
  return ratCompare(a, b) <= 0 ? a : b;
}

/**
 * Exact rational check for `|r - cbrt(x)| <= tol` where `r > 0`, `x > 0`, `tol > 0`.
 * Equivalent to `(max(0, r - tol))^3 <= x <= (r + tol)^3`.
 * @param {Rational} r
 * @param {Rational} x
 * @param {Rational} tol
 * @returns {boolean}
 */
function isWithinTolerance(r, x, tol) {
  const hi = ratAdd(r, tol);
  if (ratCompare(x, ratCube(hi)) > 0) {
    return false;
  }
  const lo = ratSub(r, tol);
  if (lo.num > 0n && ratCompare(ratCube(lo), x) > 0) {
    return false;
  }
  return true;
}

/**
 * Rounds a positive rational `r` to the nearest multiple of `1 / maxDen`
 * if `r.den > maxDen`, keeping the result strictly positive and reduced.
 * @param {Rational} r
 * @param {bigint} maxDen
 * @returns {Rational}
 */
function roundRationalToDen(r, maxDen) {
  if (r.den <= maxDen) {
    return r;
  }
  const scaledNum = (2n * r.num * maxDen + r.den) / (2n * r.den);
  return normalizeRational(scaledNum === 0n ? 1n : scaledNum, maxDen);
}

/**
 * Recursive binary search over exact rationals to refine an initial bracket
 * `[low, high]` around `cbrt(x)`.
 * @param {Rational} x
 * @param {Rational} low
 * @param {Rational} high
 * @param {number} steps
 * @returns {Rational}
 */
function bisectBracketRecursive(x, low, high, steps) {
  const mid = ratHalf(ratAdd(low, high));
  if (steps <= 0) {
    return mid;
  }
  const cmp = ratCompare(ratCube(mid), x);
  if (cmp === 0) {
    return mid;
  }
  if (cmp < 0) {
    return bisectBracketRecursive(x, mid, high, steps - 1);
  }
  return bisectBracketRecursive(x, low, mid, steps - 1);
}

/**
 * Recursive Newton-Raphson iteration over exact BigInt rationals:
 * `r_{n+1} = (2 * r_n + x / r_n^2) / 3`.
 * @param {Rational} x
 * @param {Rational} guess
 * @param {Rational} tol
 * @param {bigint} maxDen
 * @returns {Rational}
 */
function newtonCbrtRecursive(x, guess, tol, maxDen) {
  const next = ratDivBy3(ratAdd(ratDouble(guess), ratDiv(x, ratSquare(guess))));
  if (isWithinTolerance(next, x, tol)) {
    const rounded = roundRationalToDen(next, maxDen);
    if (isWithinTolerance(rounded, x, tol)) {
      return rounded;
    }
    return next;
  }
  const quantized = roundRationalToDen(next, maxDen);
  if (ratCompare(quantized, guess) === 0) {
    return newtonCbrtRecursive(x, next, tol, maxDen << 1n);
  }
  return newtonCbrtRecursive(x, quantized, tol, maxDen);
}

/**
 * Parses and validates the optional accuracy options parameter.
 * @param {unknown} options
 * @returns {Rational} Positive tolerance rational.
 */
function parseTolerance(options) {
  if (options === undefined) {
    return DEFAULT_TOLERANCE;
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('Options must be an object or a positive rational { num: bigint, den: bigint }');
  }
  if ('num' in options || 'den' in options) {
    const tol = validateAndNormalizeRational(options, 'Tolerance');
    if (tol.num <= 0n) {
      throw new RangeError('Tolerance must be strictly positive');
    }
    return tol;
  }

  const hasTolerance = options.tolerance !== undefined;
  const hasPrecision = options.precision !== undefined;
  if (hasTolerance && hasPrecision) {
    throw new RangeError('Specify either options.tolerance or options.precision, not both');
  }
  if (hasTolerance) {
    const tol = validateAndNormalizeRational(options.tolerance, 'Tolerance');
    if (tol.num <= 0n) {
      throw new RangeError('Tolerance must be strictly positive');
    }
    return tol;
  }
  if (hasPrecision) {
    const p = options.precision;
    if (typeof p === 'bigint') {
      if (p < 1n) {
        throw new RangeError('Precision must be a positive integer');
      }
      return { num: 1n, den: powBigIntRecursive(10n, p) };
    }
    if (typeof p === 'number') {
      if (!Number.isInteger(p) || p < 1 || !Number.isSafeInteger(p)) {
        throw new RangeError('Precision must be a positive safe integer');
      }
      return { num: 1n, den: powBigIntRecursive(10n, BigInt(p)) };
    }
    throw new TypeError('Precision must be a positive integer number or BigInt');
  }
  return DEFAULT_TOLERANCE;
}

/**
 * Computes the cube root of a strictly positive reduced rational `x`.
 * @param {Rational} x
 * @param {Rational} tolerance
 * @returns {Rational}
 */
function cbrtPositiveRational(x, tolerance) {
  // Check for exact rational cube (coprime numerator and denominator must each be perfect cubes)
  const numRoot = icbrtRecursive(x.num);
  if (numRoot * numRoot * numRoot === x.num) {
    const denRoot = icbrtRecursive(x.den);
    if (denRoot * denRoot * denRoot === x.den) {
      return { num: numRoot, den: denRoot };
    }
  }

  // Scale exponent k such that 2^(3k - 1) < x < 2^(3k + 3),
  // hence 2^(k - 1) < cbrt(x) < 2^(k + 1).
  const bitDiff = bitLengthRecursive(x.num) - bitLengthRecursive(x.den);
  const k = floorDiv(bitDiff, 3n);
  const scale = pow2Rational(k);

  // Enforce both requested absolute tolerance and relative accuracy for tiny/loose inputs.
  const relCap = ratMul(ratMin(tolerance, ONE_SIXTEENTH), scale);
  const effectiveTol = ratMin(tolerance, relCap);

  // Choose quantization denominator Q = 2^m >= 8 * ceil(effectiveTol.den / effectiveTol.num)
  // so rounding error 1/(2Q) <= effectiveTol / 16.
  const minQ = (8n * effectiveTol.den + effectiveTol.num - 1n) / effectiveTol.num;
  const maxDen = 1n << bitLengthRecursive(minQ);

  // Refine initial bracket recursively, then run recursive Newton-Raphson.
  const low = pow2Rational(k - 1n);
  const high = pow2Rational(k + 1n);
  const initialGuess = bisectBracketRecursive(x, low, high, BISECTION_STEPS);

  return newtonCbrtRecursive(x, initialGuess, effectiveTol, maxDen);
}

/**
 * Computes the cube root of an exact rational `{ num: bigint, den: bigint }`.
 *
 * @param {Rational} rational
 * @param {Rational | { tolerance?: Rational, precision?: number | bigint }} [options]
 * @returns {Rational}
 */
export function cbrtRationalRecursive(rational, options) {
  const normalized = validateAndNormalizeRational(rational, 'Input rational');
  const tolerance = parseTolerance(options);

  if (normalized.num === 0n) {
    return { num: 0n, den: 1n };
  }
  if (normalized.num < 0n) {
    const posRoot = cbrtPositiveRational(
      { num: -normalized.num, den: normalized.den },
      tolerance,
    );
    return { num: -posRoot.num, den: posRoot.den };
  }
  return cbrtPositiveRational(normalized, tolerance);
}
