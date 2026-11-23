/**
 * Interval division with guaranteed IEEE 754 outward rounding.
 *
 * Computes the tightest IEEE 754 binary64 interval enclosure `[lo, hi]` of the
 * exact real set `{ x / y : x in [aLo, aHi], y in [bLo, bHi] }` for bounded
 * intervals with `0` strictly outside `[bLo, bHi]`.
 *
 * Implementation strategy:
 * - Closed-form sign-case endpoint selection over `[aLo, aHi]` and `[bLo, bHi]`
 *   (monotone extrema occur at interval corners whenever `0` is not in the
 *   divisor interval).
 * - Exact directed rounding (`divDown`, `divUp`) via exponent normalization
 *   and Veltkamp/Dekker error-free product (`twoProd`) identity to determine
 *   the exact sign of the division residual `x - q * y`, followed by exact
 *   IEEE 754 ULP stepping (`nextDown` / `nextUp`). This guarantees optimal
 *   1-ULP outward rounding across normal, subnormal, underflow, and overflow
 *   regimes without losing enclosure.
 *
 * @module ops/arithmetic/divideIntervalSeries
 */

const _buf = new ArrayBuffer(8);
const _dv = new DataView(_buf);

/** Dekker splitting factor 2^27 + 1 for IEEE 754 binary64 (53-bit significand). */
const DEKKER_SPLIT = 134217729;

/** Scaling factor 2^54 to lift any subnormal binary64 value into normal range. */
const SUBNORMAL_SCALE = 18014398509481984;

/** Threshold 2^-1022 below which positive finite binary64 values are subnormal. */
const MIN_NORMAL = 2.2250738585072014e-308;

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Returns the smallest IEEE 754 binary64 number strictly greater than `x`
 * (or `Infinity` if `x === Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
  if (x === Infinity) return Infinity;
  if (x === -Infinity) return -Number.MAX_VALUE;
  if (x === 0) return Number.MIN_VALUE;
  _dv.setFloat64(0, x, false);
  const bits = _dv.getBigUint64(0, false);
  _dv.setBigUint64(0, x > 0 ? bits + 1n : bits - 1n, false);
  return normalizeZero(_dv.getFloat64(0, false));
}

/**
 * Returns the largest IEEE 754 binary64 number strictly less than `x`
 * (or `-Infinity` if `x === -Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
  return normalizeZero(-nextUp(-x));
}

/**
 * Decomposes a finite nonzero binary64 number `v` into `(sig, exp)` such that
 * `v === sig * 2^exp` exactly and `1 <= |sig| < 2`.
 *
 * @param {number} v - Finite nonzero number.
 * @returns {[number, number]} Tuple `[sig, exp]`.
 */
function frexpExact(v) {
  let expOffset = 0;
  let scaled = v;
  if (Math.abs(scaled) < MIN_NORMAL) {
    scaled *= SUBNORMAL_SCALE;
    expOffset = -54;
  }
  _dv.setFloat64(0, scaled, false);
  const hi = _dv.getUint32(0, false);
  const biasedExp = (hi >>> 20) & 0x7ff;
  const exp = biasedExp - 1023 + expOffset;
  // Replace biased exponent with 1023 (0x3ff) while preserving sign & mantissa.
  _dv.setUint32(0, (hi & 0x800fffff) | 0x3ff00000, false);
  const sig = _dv.getFloat64(0, false);
  return [sig, exp];
}

/**
 * Veltkamp/Dekker error-free product identity for normalized inputs
 * (`1 <= |a|, |b| < 2`), returning `[p, e]` with `p + e = a * b` exactly.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProdNormalized(a, b) {
  const p = a * b;

  const ac = DEKKER_SPLIT * a;
  const aHi = ac - (ac - a);
  const aLo = a - aHi;

  const bc = DEKKER_SPLIT * b;
  const bHi = bc - (bc - b);
  const bLo = b - bHi;

  const err1 = p - aHi * bHi;
  const err2 = err1 - aHi * bLo;
  const err3 = err2 - aLo * bHi;
  const e = aLo * bLo - err3;
  return [p, e];
}

/**
 * Computes the exact sign of `(x / y) - q` where `q = x / y` (round-to-nearest)
 * is finite and nonzero, and `x`, `y` are finite and nonzero.
 *
 * Returns `-1` if `x / y < q`, `0` if `x / y === q`, or `+1` if `x / y > q`.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} q
 * @returns {-1 | 0 | 1}
 */
function quotientResidualSign(x, y, q) {
  const [xSig, xExp] = frexpExact(x);
  const [ySig, yExp] = frexpExact(y);
  const [qSig, qExp] = frexpExact(q);

  // q * y = (qSig * ySig * 2^(qExp + yExp - xExp)) * 2^xExp.
  // Because q = fl(x / y) is finite and nonzero, deltaExp is always in {-1, 0, 1}.
  const deltaExp = qExp + yExp - xExp;
  const scale = deltaExp === 0 ? 1 : deltaExp === 1 ? 2 : 0.5;

  const [p, e] = twoProdNormalized(qSig, ySig);
  const pScaled = p * scale;
  const eScaled = e * scale;

  // By Sterbenz's lemma, |pScaled| is guaranteed within [0.5, 2] * |xSig|
  // with identical sign, so `xSig - pScaled` is exact.
  const diff = xSig - pScaled;

  // Exact numerator residual is 2^xExp * (diff - eScaled).
  if (diff === eScaled) return 0;
  const numSign = diff > eScaled ? 1 : -1;
  return y > 0 ? numSign : -numSign;
}

/**
 * Computes `x / y` rounded toward `-Infinity` (exact IEEE 754 directed rounding).
 *
 * @param {number} x - Finite numerator.
 * @param {number} y - Finite nonzero denominator.
 * @returns {number} Largest IEEE 754 binary64 number `<= x / y`.
 */
function divDown(x, y) {
  if (x === 0) return 0;
  const q = x / y;
  if (q === Infinity) return Number.MAX_VALUE;
  if (q === -Infinity) return -Infinity;
  if (q === 0) {
    // Underflow with x !== 0: exact quotient has sign(x) * sign(y).
    return (x > 0) === (y > 0) ? 0 : -Number.MIN_VALUE;
  }
  const s = quotientResidualSign(x, y, q);
  return s < 0 ? nextDown(q) : normalizeZero(q);
}

/**
 * Computes `x / y` rounded toward `+Infinity` (exact IEEE 754 directed rounding).
 *
 * @param {number} x - Finite numerator.
 * @param {number} y - Finite nonzero denominator.
 * @returns {number} Smallest IEEE 754 binary64 number `>= x / y`.
 */
function divUp(x, y) {
  if (x === 0) return 0;
  const q = x / y;
  if (q === Infinity) return Infinity;
  if (q === -Infinity) return -Number.MAX_VALUE;
  if (q === 0) {
    // Underflow with x !== 0: exact quotient has sign(x) * sign(y).
    return (x > 0) === (y > 0) ? Number.MIN_VALUE : 0;
  }
  const s = quotientResidualSign(x, y, q);
  return s > 0 ? nextUp(q) : normalizeZero(q);
}

/**
 * Validates that `interval` is a valid bounded closed interval `[lo, hi]`.
 *
 * @param {unknown} interval
 * @param {string} name
 * @returns {[number, number]}
 */
function validateInterval(interval, name) {
  if (!Array.isArray(interval)) {
    throw new TypeError(`${name} must be an array [lo, hi]`);
  }
  if (interval.length !== 2) {
    throw new RangeError(`${name} must have length 2`);
  }
  const [lo, hi] = interval;
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError(`${name} endpoints must be numbers`);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError(`${name} endpoints must be finite numbers`);
  }
  if (lo > hi) {
    throw new RangeError(`${name} lower bound (${lo}) must not exceed upper bound (${hi})`);
  }
  return [lo, hi];
}

/**
 * Divides two closed real intervals `a = [aLo, aHi]` and `b = [bLo, bHi]` with
 * outward rounding guaranteeing exact mathematical enclosure:
 *
 *   For every real `x in [aLo, aHi]` and `y in [bLo, bHi]`,
 *   `lo <= x / y <= hi`.
 *
 * Uses the closed-form sign-case interval division formula together with
 * Veltkamp/Dekker error-free product residual testing for optimal IEEE 754
 * directed rounding.
 *
 * Note: If the exact quotient overflows `Number.MAX_VALUE` (or `-Number.MAX_VALUE`),
 * the corresponding outward bound is `Infinity` (or `-Infinity`) to preserve
 * guaranteed enclosure.
 *
 * @param {[number, number]} a - Dividend interval `[lo, hi]` with finite `lo <= hi`.
 * @param {[number, number]} b - Divisor interval `[lo, hi]` with finite `lo <= hi` and `0` not in `[lo, hi]`.
 * @returns {[number, number]} Outward-rounded quotient interval `[lo, hi]`.
 * @throws {TypeError} If `a` or `b` is not an array of numbers.
 * @throws {RangeError} If either interval has length !== 2, non-finite endpoints, `lo > hi`, or `b` contains `0`.
 */
export function divideIntervalSeries(a, b) {
  const [aLo, aHi] = validateInterval(a, 'a');
  const [bLo, bHi] = validateInterval(b, 'b');

  if (bLo <= 0 && bHi >= 0) {
    throw new RangeError('divisor interval b must not contain zero');
  }

  let lo;
  let hi;

  if (bLo > 0) {
    // 0 < bLo <= bHi
    if (aLo >= 0) {
      lo = divDown(aLo, bHi);
      hi = divUp(aHi, bLo);
    } else if (aHi <= 0) {
      lo = divDown(aLo, bLo);
      hi = divUp(aHi, bHi);
    } else {
      // aLo < 0 < aHi
      lo = divDown(aLo, bLo);
      hi = divUp(aHi, bLo);
    }
  } else {
    // bLo <= bHi < 0
    if (aLo >= 0) {
      lo = divDown(aHi, bHi);
      hi = divUp(aLo, bLo);
    } else if (aHi <= 0) {
      lo = divDown(aHi, bLo);
      hi = divUp(aLo, bHi);
    } else {
      // aLo < 0 < aHi
      lo = divDown(aHi, bHi);
      hi = divUp(aLo, bHi);
    }
  }

  return [normalizeZero(lo), normalizeZero(hi)];
}
