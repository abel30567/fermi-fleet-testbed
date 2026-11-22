/**
 * Fixed-point scaling factor (10^18) used for partial derivative results.
 * A return value of `10n ** 18n` represents `1.0`.
 */
export const SCALE = 10n ** 18n;

/**
 * Exact integer division rounded to nearest integer (ties away from zero).
 *
 * @param {bigint} numerator - Dividend (may be negative, zero, or positive).
 * @param {bigint} denominator - Strictly positive divisor (> 0n).
 * @returns {bigint} Rounded quotient.
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
  const absNum = numerator < 0n ? -numerator : numerator;
  const quotient = (absNum + denominator / 2n) / denominator;
  return numerator < 0n ? -quotient : quotient;
}

/**
 * Iteratively computes the gradient (vector of partial derivatives) of a scalar
 * field `f(point)` at a BigInt coordinate vector `point` using the symmetric
 * central-difference scheme with step size `h`.
 *
 * For each coordinate dimension `i` (`0 <= i < point.length`):
 *   `(∂f / ∂x_i)(point) ≈ (f(point + h * e_i) - f(point - h * e_i)) / (2 * h)`
 *
 * Fixed-point scaling semantics:
 * - Each returned partial derivative is a `bigint` scaled by `SCALE = 10n ** 18n`,
 *   computed as `round(((f(point + h*e_i) - f(point - h*e_i)) * SCALE) / (2n * h))`
 *   using round-to-nearest (ties away from zero).
 * - This scaling is consistent both when `point`, `h`, and `f(point)` are unscaled
 *   integers and when all three are uniformly fixed-point scaled by `SCALE` (since
 *   the common scale factor cancels in `(Δf) / (2h)` before multiplying by `SCALE`).
 * - For any constant, linear, or quadratic polynomial, the central difference is
 *   exact for every positive step `h`.
 * - The caller's `point` array is never mutated.
 *
 * @param {(point: bigint[]) => bigint} f - Scalar field mapping a BigInt vector to a BigInt.
 * @param {readonly bigint[]} point - Coordinate vector of BigInt values.
 * @param {bigint} [h=1n] - Positive BigInt finite-difference step size.
 * @returns {bigint[]} Array of partial derivatives, each a fixed-point BigInt scaled by `10n ** 18n`.
 * @throws {TypeError} If `f` is not a function, `point` is not an array of BigInts,
 *   `h` is not a BigInt, or `f` returns a non-BigInt value.
 * @throws {RangeError} If `h <= 0n`.
 */
export function gradientBigIntIterative(f, point, h = 1n) {
  if (typeof f !== 'function') {
    throw new TypeError('Scalar field f must be a function');
  }
  if (!Array.isArray(point)) {
    throw new TypeError('Point must be an array of BigInt coordinates');
  }
  if (typeof h !== 'bigint') {
    throw new TypeError('Step size h must be a BigInt');
  }
  if (h <= 0n) {
    throw new RangeError('Step size h must be a positive BigInt (> 0n)');
  }

  const n = point.length;
  const probe = new Array(n);
  for (let i = 0; i < n; i++) {
    const coord = point[i];
    if (typeof coord !== 'bigint') {
      throw new TypeError(`point[${i}] must be a BigInt, got ${typeof coord}`);
    }
    probe[i] = coord;
  }

  const gradient = new Array(n);
  const twoH = 2n * h;

  for (let i = 0; i < n; i++) {
    const original = probe[i];

    probe[i] = original + h;
    const fPlus = f(probe);
    if (typeof fPlus !== 'bigint') {
      throw new TypeError(
        `Scalar field f must return a BigInt (dimension ${i}, +h returned ${typeof fPlus})`
      );
    }

    probe[i] = original - h;
    const fMinus = f(probe);
    if (typeof fMinus !== 'bigint') {
      throw new TypeError(
        `Scalar field f must return a BigInt (dimension ${i}, -h returned ${typeof fMinus})`
      );
    }

    probe[i] = original;

    const delta = fPlus - fMinus;
    gradient[i] = divRoundHalfAwayFromZero(delta * SCALE, twoH);
  }

  return gradient;
}
