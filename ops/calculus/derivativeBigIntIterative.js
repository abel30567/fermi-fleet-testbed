/**
 * Default fixed-point scaling factor (10^18).
 * A returned value of `SCALE` represents the mathematical value `1`.
 */
export const SCALE = 10n ** 18n;

const VALID_METHODS = new Set(['central', 'forward', 'backward']);

/**
 * Iterative Euclidean greatest common divisor for BigInts.
 * Always returns a non-negative BigInt.
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
 * Computes the k-th order finite-difference quotient `(num / den)` of `f` at `x`
 * using step `step` via a single iterative pass over binomial weights.
 *
 * - `'central'`: `(1 / (2 * step)^order) * sum_{j=0..order} (-1)^j * C(order, j) * f(x + (order - 2j) * step)`
 * - `'forward'`: `(1 / step^order)       * sum_{j=0..order} (-1)^j * C(order, j) * f(x + (order - j) * step)`
 * - `'backward'`: `(1 / step^order)      * sum_{j=0..order} (-1)^j * C(order, j) * f(x - j * step)`
 *
 * @param {(x: bigint) => bigint} f
 * @param {bigint} x
 * @param {bigint} step
 * @param {number} order
 * @param {'central' | 'forward' | 'backward'} method
 * @returns {{ num: bigint, den: bigint }}
 */
function finiteDifferenceRatio(f, x, step, order, method) {
  const orderBig = BigInt(order);
  let binom = 1n;
  let sum = 0n;

  for (let j = 0; j <= order; j++) {
    const jBig = BigInt(j);
    let point;
    if (method === 'central') {
      point = x + (orderBig - 2n * jBig) * step;
    } else if (method === 'forward') {
      point = x + (orderBig - jBig) * step;
    } else {
      point = x - jBig * step;
    }

    const value = f(point);
    if (typeof value !== 'bigint') {
      throw new TypeError(`Function f must return a BigInt, got ${typeof value}`);
    }

    const term = binom * value;
    sum = j % 2 === 0 ? sum + term : sum - term;

    if (j < order) {
      binom = (binom * BigInt(order - j)) / BigInt(j + 1);
    }
  }

  const denomBase = method === 'central' ? 2n * step : step;
  const den = denomBase ** orderBig;

  return { num: sum, den };
}

/**
 * Computes the numerical derivative of a BigInt function `f(x)` at point `x`
 * using an iterative finite-difference stencil and optional iterative
 * Richardson extrapolation, returning a fixed-point BigInt scaled by `scale`
 * (default `SCALE = 10n ** 18n`).
 *
 * With default options (`order = 1`, `refinements = 0`, `method = 'central'`,
 * `scale = 10n ** 18n`), this evaluates the exact central difference:
 *
 *   `((f(x + h) - f(x - h)) * SCALE) / (2n * h)`
 *
 * Scaling semantics:
 * - For unscaled integer inputs/outputs (`x` and `f(x)` in unit scale), the
 *   result represents `f^(order)(x) * scale` (truncated toward zero).
 * - For `order = 1`, the formula is scale-invariant when both `x` and `f(x)`
 *   share the same fixed-point scale (e.g., both scaled by `SCALE`), still
 *   returning `f'(x) * scale`.
 * - For `refinements = r > 0`, Richardson extrapolation iteratively combines
 *   estimates at steps `h * 2^r, h * 2^(r-1), ..., h` using exact BigInt
 *   rational arithmetic (with a single final scaling division), eliminating
 *   leading error terms (`O(h^(2 + 2r))` for `'central'`, `O(h^(1 + r))` for
 *   `'forward'` / `'backward'`).
 *
 * @param {(x: bigint) => bigint} f - Function mapping a BigInt input to a BigInt output.
 * @param {bigint} x - Evaluation point.
 * @param {bigint} [h=1n] - Positive finite-difference step size (finest step when `refinements > 0`).
 * @param {object} [options={}] - Optional configuration.
 * @param {number} [options.order=1] - Positive safe integer derivative order (`>= 1`).
 * @param {number} [options.refinements=0] - Non-negative safe integer Richardson extrapolation levels (`>= 0`).
 * @param {'central' | 'forward' | 'backward'} [options.method='central'] - Finite-difference scheme.
 * @param {bigint} [options.scale=SCALE] - Positive fixed-point output scale (default `10n ** 18n`).
 * @returns {bigint} Derivative value scaled by `options.scale`, truncated toward zero.
 * @throws {TypeError} If any argument or return value of `f` has an invalid type.
 * @throws {RangeError} If `h <= 0n`, `scale <= 0n`, `order < 1`, `refinements < 0`,
 *   non-safe-integer numeric options, or invalid `method`.
 */
export function derivativeBigIntIterative(f, x, h = 1n, options = {}) {
  if (typeof f !== 'function') {
    throw new TypeError('f must be a function');
  }
  if (typeof x !== 'bigint') {
    throw new TypeError('x must be a BigInt');
  }
  if (typeof h !== 'bigint') {
    throw new TypeError('h must be a BigInt');
  }
  if (h <= 0n) {
    throw new RangeError('h must be a positive BigInt (> 0n)');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  const {
    order = 1,
    refinements = 0,
    method = 'central',
    scale = SCALE,
  } = options;

  if (typeof order !== 'number') {
    throw new TypeError('options.order must be a number');
  }
  if (!Number.isSafeInteger(order) || order < 1) {
    throw new RangeError('options.order must be a positive safe integer (>= 1)');
  }

  if (typeof refinements !== 'number') {
    throw new TypeError('options.refinements must be a number');
  }
  if (!Number.isSafeInteger(refinements) || refinements < 0) {
    throw new RangeError('options.refinements must be a non-negative safe integer (>= 0)');
  }

  if (typeof method !== 'string') {
    throw new TypeError('options.method must be a string');
  }
  if (!VALID_METHODS.has(method)) {
    throw new RangeError("options.method must be 'central', 'forward', or 'backward'");
  }

  if (typeof scale !== 'bigint') {
    throw new TypeError('options.scale must be a BigInt');
  }
  if (scale <= 0n) {
    throw new RangeError('options.scale must be a positive BigInt (> 0n)');
  }

  // Fast path: single finite-difference stencil without Richardson extrapolation.
  if (refinements === 0) {
    const { num, den } = finiteDifferenceRatio(f, x, h, order, method);
    return (num * scale) / den;
  }

  // Build base Richardson column for steps h * 2^refinements, ..., h.
  const table = new Array(refinements + 1);
  for (let i = 0; i <= refinements; i++) {
    const step = h << BigInt(refinements - i);
    const { num, den } = finiteDifferenceRatio(f, x, step, order, method);
    const g = gcdBigInt(num, den);
    table[i] = { num: num / g, den: den / g };
  }

  // Iteratively apply Richardson extrapolation in-place using exact BigInt rationals.
  const baseFactor = method === 'central' ? 4n : 2n;
  for (let m = 1; m <= refinements; m++) {
    const factor = baseFactor ** BigInt(m);
    const denomFactor = factor - 1n;

    for (let i = refinements; i >= m; i--) {
      const fine = table[i];
      const coarse = table[i - 1];

      const gDen = gcdBigInt(fine.den, coarse.den);
      const fineDenRed = fine.den / gDen;
      const coarseDenRed = coarse.den / gDen;

      const num = factor * fine.num * coarseDenRed - coarse.num * fineDenRed;
      const den = fineDenRed * coarse.den * denomFactor;

      const g = gcdBigInt(num, den);
      table[i] = { num: num / g, den: den / g };
    }
  }

  const best = table[refinements];
  return (best.num * scale) / best.den;
}
