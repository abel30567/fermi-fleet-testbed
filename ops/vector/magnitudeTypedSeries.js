/**
 * Computes the Euclidean vector magnitude (L2 norm) of a Float64Array using
 * overflow/underflow-safe max-element scaling, Kahan compensated summation,
 * and a Newton-Raphson square root.
 *
 * Uses the identity:
 *   ||v||_2 = s * sqrt(sum_{i=0}^{n-1} (v[i] / s)^2),  where s = max_i |v[i]|.
 *
 * @param {Float64Array} v - Input vector of IEEE-754 double-precision floats.
 * @returns {number} Non-negative L2 magnitude (0 for empty or zero vector;
 *   Infinity if any element is ±Infinity; NaN if any element is NaN and none
 *   is ±Infinity).
 * @throws {TypeError} If `v` is not a `Float64Array`.
 */
export function magnitudeTypedSeries(v) {
  if (!(v instanceof Float64Array)) {
    throw new TypeError('magnitudeTypedSeries expects a Float64Array input');
  }

  const len = v.length;
  if (len === 0) {
    return 0;
  }

  let scale = 0;
  let hasNaN = false;

  for (let i = 0; i < len; i++) {
    const x = v[i];
    if (x === Infinity || x === -Infinity) {
      return Infinity;
    }
    if (Number.isNaN(x)) {
      hasNaN = true;
      continue;
    }
    const ax = x < 0 ? -x : x;
    if (ax > scale) {
      scale = ax;
    }
  }

  if (hasNaN) {
    return NaN;
  }

  if (scale === 0) {
    return 0;
  }

  if (len === 1) {
    return scale;
  }

  let sumSq = 0;
  let comp = 0;
  for (let i = 0; i < len; i++) {
    const r = v[i] / scale;
    const term = r * r;
    const y = term - comp;
    const t = sumSq + y;
    comp = (t - sumSq) - y;
    sumSq = t;
  }

  return scale * newtonSqrt(sumSq);
}

/**
 * Computes sqrt(s) for finite s >= 0 via power-of-four range reduction into
 * [1, 4) followed by Newton-Raphson iteration to full float64 precision.
 *
 * @param {number} s - Non-negative finite radicand.
 * @returns {number} Square root of `s`.
 */
function newtonSqrt(s) {
  if (s <= 0) {
    return 0;
  }
  if (s === 1) {
    return 1;
  }

  let x = s;
  let factor = 1;

  while (x >= 4) {
    x *= 0.25;
    factor *= 2;
  }
  while (x < 1) {
    x *= 4;
    factor *= 0.5;
  }

  let g = 0.5 * (1 + x);
  for (let i = 0; i < 6; i++) {
    const next = 0.5 * (g + x / g);
    if (next === g) {
      break;
    }
    g = next;
  }

  return g * factor;
}
