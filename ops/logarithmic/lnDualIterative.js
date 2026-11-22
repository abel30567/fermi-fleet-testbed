const SQRT1_2 = Math.SQRT1_2;
const SQRT2 = Math.SQRT2;

// Cody-Waite split of ln(2) so k * LN2_HI is exact for all valid binary exponents k.
const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;

const TWO_64 = 2 ** 64;
const TWO_NEG_64 = 2 ** -64;
const TWO_512 = 2 ** 512;
const TWO_NEG_512 = 2 ** -512;

const MAX_ITERATIONS = 64;
const DUAL_ONE = Object.freeze({ v: 1, d: 0 });

/**
 * Adds two dual numbers.
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualAdd(a, b) {
  return { v: a.v + b.v, d: a.d + b.d };
}

/**
 * Subtracts dual number b from dual number a.
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualSub(a, b) {
  return { v: a.v - b.v, d: a.d - b.d };
}

/**
 * Multiplies two dual numbers: (a.v + a.d*e)(b.v + b.d*e).
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualMul(a, b) {
  return {
    v: a.v * b.v,
    d: a.v * b.d + a.d * b.v,
  };
}

/**
 * Divides dual number a by dual number b (with b.v !== 0).
 * @param {{v: number, d: number}} a
 * @param {{v: number, d: number}} b
 * @returns {{v: number, d: number}}
 */
function dualDiv(a, b) {
  return {
    v: a.v / b.v,
    d: (a.d * b.v - a.v * b.d) / (b.v * b.v),
  };
}

/**
 * Reduces a strictly positive finite number y into m * 2^k with m in [sqrt(0.5), sqrt(2)].
 * @param {number} y
 * @returns {{m: number, k: number}}
 */
function reducePow2(y) {
  let m = y;
  let k = 0;

  while (m >= TWO_64) {
    m *= TWO_NEG_64;
    k += 64;
  }
  while (m < TWO_NEG_64) {
    m *= TWO_64;
    k -= 64;
  }
  while (m > SQRT2) {
    m *= 0.5;
    k += 1;
  }
  while (m < SQRT1_2) {
    m *= 2;
    k -= 1;
  }

  return { m, k };
}

/**
 * Multiplies a finite number by 2^exp safely across the full IEEE-754 exponent range.
 * @param {number} value
 * @param {number} exp
 * @returns {number}
 */
function scaleByPow2(value, exp) {
  if (value === 0 || exp === 0) {
    return value;
  }

  let out = value;
  let remaining = exp;

  while (remaining > 512 && Number.isFinite(out)) {
    out *= TWO_512;
    remaining -= 512;
  }
  while (remaining < -512 && out !== 0) {
    out *= TWO_NEG_512;
    remaining += 512;
  }

  if (!Number.isFinite(out) || out === 0) {
    return out;
  }

  return out * 2 ** remaining;
}

/**
 * Computes the natural logarithm of a dual number x = v + d*ε using a
 * straightforward iterative algorithm.
 *
 * Mathematical semantics:
 *   ln(v + d*ε) = ln(v) + (d / v)*ε   for v > 0.
 *
 * Algorithm:
 *   1. Range-reduce v = m * 2^k with m in [sqrt(0.5), sqrt(2)], and scale d
 *      by powers of 2 to avoid intermediate overflow/underflow.
 *   2. Transform z = m + dm*ε via t = (z - 1) / (z + 1) in dual arithmetic
 *      so |t.v| <= 3 - 2*sqrt(2) ≈ 0.1716.
 *   3. Evaluate atanh(t) = sum_{n=0} t^(2n+1) / (2n+1) iteratively in dual
 *      arithmetic until convergence.
 *   4. Reconstruct ln(v) = k * ln(2) + 2 * atanh(t).v (using a Cody-Waite
 *      high/low split of ln(2)) and restore the power-of-2 scale on the
 *      derivative component 2 * atanh(t).d.
 *
 * @param {{v: number, d: number}} x - Input dual number with finite v > 0 and finite d.
 * @returns {{v: number, d: number}} Dual number { v: ln(x.v), d: x.d / x.v }.
 * @throws {TypeError} If x is not a non-null non-array object or if x.v / x.d are not numbers.
 * @throws {RangeError} If x.v or x.d is NaN/non-finite, or if x.v <= 0.
 */
export function lnDualIterative(x) {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) {
    throw new TypeError('Expected a dual number object { v, d }');
  }
  if (typeof x.v !== 'number' || typeof x.d !== 'number') {
    throw new TypeError('Dual number components v and d must be numbers');
  }
  if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
    throw new RangeError('Dual number components v and d must be finite numbers');
  }
  if (x.v <= 0) {
    throw new RangeError('Natural logarithm domain error: dual value v must be strictly positive (v > 0)');
  }

  const { m, k } = reducePow2(x.v);

  // Normalize derivative magnitude by a power of 2 to keep dual arithmetic well-conditioned.
  let dm = 0;
  let dShift = 0;
  if (x.d !== 0) {
    const sign = x.d < 0 ? -1 : 1;
    const { m: absDm, k: eD } = reducePow2(Math.abs(x.d));
    dm = sign * absDm;
    dShift = eD - k;
  }

  const z = { v: m, d: dm };
  const t = dualDiv(dualSub(z, DUAL_ONE), dualAdd(z, DUAL_ONE));
  const t2 = dualMul(t, t);

  let power = t;
  let sum = t;
  for (let n = 1; n <= MAX_ITERATIONS; n += 1) {
    power = dualMul(power, t2);
    const denom = 2 * n + 1;
    const term = { v: power.v / denom, d: power.d / denom };
    const next = dualAdd(sum, term);
    if (next.v === sum.v && next.d === sum.d) {
      break;
    }
    sum = next;
  }

  const lnM = 2 * sum.v;
  const vOut = k === 0 ? lnM : k * LN2_HI + (lnM + k * LN2_LO);
  const dOut = dm === 0 ? 0 : scaleByPow2(2 * sum.d, dShift);

  return {
    v: vOut === 0 ? 0 : vOut,
    d: dOut === 0 ? 0 : dOut,
  };
}
