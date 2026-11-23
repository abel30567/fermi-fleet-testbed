/**
 * @typedef {{ v: number, d: number }} Dual
 * A forward-mode dual number `v + d*ε` (where `ε^2 = 0`), carrying a primal
 * value `v` alongside its directional derivative `d`.
 */

const HALF_PI = Math.PI / 2;

/**
 * Threshold below which the recursive argument halving stops and the
 * divide-and-conquer Maclaurin series is evaluated directly.
 *
 * At `|v| <= 1/64`, an 8-term series (indices 0..7) has truncation error
 * `< (1/64)^17 / 17 ≈ 1.3e-32`, well below IEEE-754 double precision.
 */
const SERIES_THRESHOLD = 1 / 64;

/** Highest series index (inclusive) in the base-case Maclaurin polynomial. */
const SERIES_MAX_INDEX = 7;

/**
 * Adds two dual numbers.
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualAdd(a, b) {
  return { v: a.v + b.v, d: a.d + b.d };
}

/**
 * Multiplies two dual numbers: `(av + ad*ε)(bv + bd*ε) = av*bv + (av*bd + ad*bv)*ε`.
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualMul(a, b) {
  return { v: a.v * b.v, d: a.v * b.d + a.d * b.v };
}

/**
 * Divides two dual numbers with `b.v !== 0`.
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualDiv(a, b) {
  const inv = 1 / b.v;
  return {
    v: a.v * inv,
    d: (a.d - a.v * inv * b.d) * inv,
  };
}

/**
 * Computes the reciprocal `1 / a` of a dual number with `|a.v| > 1`, avoiding
 * intermediate overflow of `a.v * a.v`.
 * @param {Dual} a
 * @returns {Dual}
 */
function dualReciprocal(a) {
  return {
    v: 1 / a.v,
    d: (-a.d / a.v) / a.v,
  };
}

/**
 * Computes the square root of a dual number with `a.v > 0`.
 * @param {Dual} a
 * @returns {Dual}
 */
function dualSqrt(a) {
  const root = Math.sqrt(a.v);
  return {
    v: root,
    d: a.d / (2 * root),
  };
}

/**
 * Recursively evaluates the polynomial slice
 * `sum_{k=lo}^{hi} u^(k - lo) / (2k + 1)` over dual numbers using
 * divide-and-conquer binary splitting.
 *
 * Returns both the partial polynomial value and `u^(hi - lo + 1)` so parent
 * frames can combine left and right halves without recomputing powers.
 *
 * @param {Dual} u - Evaluation point `-x^2`.
 * @param {number} lo - Inclusive lower summation index.
 * @param {number} hi - Inclusive upper summation index.
 * @returns {{ val: Dual, pow: Dual }}
 */
function evalSeriesDivideAndConquer(u, lo, hi) {
  if (lo === hi) {
    return {
      val: { v: 1 / (2 * lo + 1), d: 0 },
      pow: u,
    };
  }

  const mid = (lo + hi) >> 1;
  const left = evalSeriesDivideAndConquer(u, lo, mid);
  const right = evalSeriesDivideAndConquer(u, mid + 1, hi);

  return {
    val: dualAdd(left.val, dualMul(left.pow, right.val)),
    pow: dualMul(left.pow, right.pow),
  };
}

/**
 * Recursively reduces a dual number with `|x.v| <= 1` via the half-angle
 * identity `arctan(x) = 2 * arctan(x / (1 + sqrt(1 + x^2)))` until
 * `|x.v| <= SERIES_THRESHOLD`, then evaluates the base case with
 * divide-and-conquer binary splitting on the Maclaurin series.
 *
 * @param {Dual} x - Dual number with `|x.v| <= 1`.
 * @returns {Dual}
 */
function arctanHalveRecursive(x) {
  if (Math.abs(x.v) <= SERIES_THRESHOLD) {
    const x2 = dualMul(x, x);
    const negX2 = { v: -x2.v, d: -x2.d };
    const { val } = evalSeriesDivideAndConquer(negX2, 0, SERIES_MAX_INDEX);
    return dualMul(x, val);
  }

  const x2 = dualMul(x, x);
  const onePlusX2 = { v: 1 + x2.v, d: x2.d };
  const root = dualSqrt(onePlusX2);
  const denom = { v: 1 + root.v, d: root.d };
  const reduced = dualDiv(x, denom);
  const half = arctanHalveRecursive(reduced);

  return { v: 2 * half.v, d: 2 * half.d };
}

/**
 * Validates that the argument is a well-formed finite dual number `{ v, d }`.
 *
 * @param {unknown} x
 * @throws {TypeError} If `x` is not a plain-like object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateDual(x) {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) {
    throw new TypeError('arctanDualRecursive: expected a dual number object { v, d }');
  }
  if (typeof x.v !== 'number' || typeof x.d !== 'number') {
    throw new TypeError('arctanDualRecursive: dual number properties v and d must be numbers');
  }
  if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
    throw new RangeError('arctanDualRecursive: dual number properties v and d must be finite');
  }
}

/**
 * Computes the arctangent of a forward-mode dual number `{ v, d }` using a
 * recursive / divide-and-conquer algorithm over dual arithmetic:
 *
 * - For `|v| > 1`, recursively applies the reciprocal identity
 *   `arctan(x) = sign(v) * (π / 2) - arctan(1 / x)`.
 * - For `|v| <= 1`, recursively applies argument halving
 *   `arctan(x) = 2 * arctan(x / (1 + sqrt(1 + x^2)))` until `|v| <= 1/64`.
 * - In the base case, evaluates `x * sum_{k=0}^{7} (-x^2)^k / (2k + 1)` via
 *   divide-and-conquer binary splitting on dual numbers.
 *
 * Mathematically returns `{ v: arctan(x.v), d: x.d / (1 + x.v^2) }`.
 *
 * @param {Dual} x - Input dual number `{ v, d }` with finite numeric components.
 * @returns {Dual} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If `x` is not a non-null, non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function arctanDualRecursive(x) {
  validateDual(x);

  if (x.v === 0) {
    return { v: x.v, d: x.d };
  }

  if (Math.abs(x.v) > 1) {
    const sign = x.v > 0 ? 1 : -1;
    const recip = dualReciprocal(x);
    const atanRecip = arctanHalveRecursive(recip);
    return {
      v: sign * HALF_PI - atanRecip.v,
      d: 0 - atanRecip.d,
    };
  }

  return arctanHalveRecursive({ v: x.v, d: x.d });
}
