/**
 * Base-10 logarithm over dual numbers `{v, d}` carrying a forward-mode
 * derivative alongside the value, implemented via iterative range reduction
 * and an iterative atanh power series in dual arithmetic.
 */

const DUAL_ONE = Object.freeze({ v: 1, d: 0 });
const MAX_SERIES_ITERATIONS = 200;

/**
 * Adds two dual numbers.
 *
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualAdd(a, b) {
  return { v: a.v + b.v, d: a.d + b.d };
}

/**
 * Subtracts dual number `b` from `a`.
 *
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualSub(a, b) {
  return { v: a.v - b.v, d: a.d - b.d };
}

/**
 * Multiplies two dual numbers: (a_v + a_d ε)(b_v + b_d ε) = a_v b_v + (a_v b_d + a_d b_v) ε.
 *
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualMul(a, b) {
  return { v: a.v * b.v, d: a.v * b.d + a.d * b.v };
}

/**
 * Divides dual number `a` by `b`: (a_v / b_v) + ((a_d b_v - a_v b_d) / b_v^2) ε.
 *
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualDiv(a, b) {
  const denom = b.v * b.v;
  return { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / denom };
}

/**
 * Scales a dual number by a real constant.
 *
 * @param {{v: number, d: number}} a
 * @param {number} s
 * @returns {{v: number, d: number}}
 */
function dualScale(a, s) {
  return { v: a.v * s, d: a.d * s };
}

/**
 * Computes `ln(m)` for a reduced dual number `m = {v, d}` with `m.v` near 1
 * using the iterative atanh series in dual arithmetic:
 *
 *   t = (m - 1) / (m + 1)
 *   ln(m) = 2 * sum_{j=0}^{\infty} t^(2j+1) / (2j+1)
 *
 * @param {{v: number, d: number}} m
 * @returns {{v: number, d: number}}
 */
function lnDualReduced(m) {
  const t = dualDiv(dualSub(m, DUAL_ONE), dualAdd(m, DUAL_ONE));
  const t2 = dualMul(t, t);

  let term = t;
  let sum = t;

  for (let j = 1; j <= MAX_SERIES_ITERATIONS; j += 1) {
    term = dualMul(term, t2);
    const denom = 2 * j + 1;
    const nextV = sum.v + term.v / denom;
    const nextD = sum.d + term.d / denom;
    if (nextV === sum.v && nextD === sum.d) {
      break;
    }
    sum = { v: nextV, d: nextD };
  }

  return dualScale(sum, 2);
}

// Compute ln(2) and ln(10) iteratively using the same atanh series:
// 2 has t = 1/3; 10 = 2^3 * 1.25 where 1.25 is in [sqrt(1/2), sqrt(2)].
const LN2_ITERATIVE = lnDualReduced({ v: 2, d: 0 }).v;
const LN10_ITERATIVE = 3 * LN2_ITERATIVE + lnDualReduced({ v: 1.25, d: 0 }).v;

/**
 * Computes the base-10 logarithm of a dual number `x = {v, d}`, returning
 * `{v: log10(v), d: d / (v * ln(10))}`.
 *
 * Mathematical semantics:
 * For a dual number `x = v + d·ε` (with `ε² = 0` and `v > 0`):
 *   `log10(v + d·ε) = log10(v) + (d / (v · ln(10)))·ε`
 *
 * Implementation:
 * Reduces `v = m · 2^k` iteratively so that `m ∈ [√(1/2), √2]`, evaluates
 * `ln(m + ε)` via the iterative atanh power series `2 · Σ t^(2j+1)/(2j+1)`
 * in dual arithmetic, combines `ln(v) = k·ln(2) + ln(m)`, and divides by
 * `ln(10)` (also computed iteratively). The derivative `d · (1/m) · 2^(-k) / ln(10)`
 * is scaled with split powers of 2 to avoid spurious intermediate overflow or
 * underflow across the full positive IEEE-754 finite range.
 *
 * @param {{v: number, d: number}} x - Input dual number with finite `v > 0` and finite `d`.
 * @returns {{v: number, d: number}} Dual number `{v, d}` holding `log10(x.v)` and its forward-mode derivative.
 * @throws {TypeError} If `x` is not a non-null plain/object or `x.v` / `x.d` are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite (NaN or ±Infinity), or if `x.v <= 0`.
 */
export function log10DualIterative(x) {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) {
    throw new TypeError('Expected a dual number object {v, d}');
  }
  if (typeof x.v !== 'number' || typeof x.d !== 'number') {
    throw new TypeError('Dual number components v and d must be numbers');
  }
  if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
    throw new RangeError('Dual number components v and d must be finite');
  }
  if (x.v <= 0) {
    throw new RangeError(`log10 domain error: expected v > 0, received ${x.v}`);
  }

  let m = x.v;
  let k = 0;

  while (m > Math.SQRT2) {
    m *= 0.5;
    k += 1;
  }
  while (m < Math.SQRT1_2) {
    m *= 2;
    k -= 1;
  }

  const lnM = lnDualReduced({ v: m, d: 1 });
  const lnV = k * LN2_ITERATIVE + lnM.v;
  const val = lnV / LN10_ITERATIVE;

  const unitScale = lnM.d / LN10_ITERATIVE;
  let der;
  if (x.d === 0) {
    der = x.d * unitScale;
  } else {
    const k2 = Math.trunc(k / 2);
    const k1 = k - k2;
    const p1 = 2 ** -k1;
    const p2 = 2 ** -k2;

    if (k < 0) {
      if (Math.abs(x.d) < 1) {
        der = x.d * p1 * unitScale * p2;
      } else {
        der = x.d * unitScale * p1 * p2;
      }
    } else {
      der = x.d * p1 * p2 * unitScale;
    }
  }

  return { v: val, d: der };
}
