/**
 * Element-wise base-2 logarithm over a Float64Array using IEEE 754 binary64
 * exponent/mantissa extraction, range reduction to (sqrt(2)/2, sqrt(2)],
 * and the hyperbolic arctangent power series:
 *
 *   ln(m) = 2 * sum_{k=0..N} (t^(2k+1) / (2k+1)),  where t = (m - 1) / (m + 1)
 *   log2(m * 2^e) = e + ln(m) / ln(2)
 *
 * Zero dependencies; does not delegate to Math.log2 or Math.log.
 */

const TWO_POW_54 = 18014398509481984; // 2^54, normalizes all positive subnormals
const SQRT2 = 1.4142135623730951; // Nearest IEEE 754 binary64 to sqrt(2)
const EXPONENT_BIAS = 1023;
const FRAC_MASK = 0x000fffffffffffffn;
const ONE_EXPONENT_BITS = 0x3ff0000000000000n;

// Reusable 8-byte scratch view for IEEE 754 float64 <-> uint64 bit reinterpretation.
const scratchBuffer = new ArrayBuffer(8);
const scratchF64 = new Float64Array(scratchBuffer);
const scratchU64 = new BigUint64Array(scratchBuffer);

/**
 * Evaluates ln(2) via the atanh series at m = 2 (t = 1/3, t^2 = 1/9).
 * Converges to full IEEE 754 binary64 precision in ~20 terms.
 *
 * @returns {number}
 */
function computeLn2Series() {
  const t = 1 / 3;
  const s = t * t;
  let poly = 0;
  // Horner evaluation from k = 24 down to k = 0 for sum_{k=0..24} s^k / (2k + 1)
  for (let k = 24; k >= 0; k -= 1) {
    poly = 1 / (2 * k + 1) + s * poly;
  }
  return 2 * t * poly;
}

const INV_LN2 = 1 / computeLn2Series();

/**
 * Computes log2(x) for a single IEEE 754 binary64 scalar using exponent
 * extraction and the atanh series.
 *
 * @param {number} x
 * @returns {number}
 */
function log2ScalarSeries(x) {
  // Handle NaN and negative numbers (including -Infinity).
  if (x !== x || x < 0) {
    return Number.NaN;
  }
  // Handle +0 and -0.
  if (x === 0) {
    return -Infinity;
  }
  // Handle +Infinity.
  if (x === Infinity) {
    return Infinity;
  }

  // Extract IEEE 754 biased exponent and 52-bit significand fraction.
  scratchF64[0] = x;
  let bits = scratchU64[0];
  let biasedExp = Number((bits >> 52n) & 0x7ffn);
  let exp;

  if (biasedExp === 0) {
    // Subnormal positive value: scale into normal range by 2^54.
    scratchF64[0] = x * TWO_POW_54;
    bits = scratchU64[0];
    biasedExp = Number((bits >> 52n) & 0x7ffn);
    exp = biasedExp - EXPONENT_BIAS - 54;
  } else {
    exp = biasedExp - EXPONENT_BIAS;
  }

  const frac = bits & FRAC_MASK;

  // Exact power of 2: x = 2^exp => log2(x) = exp (including 1 => +0).
  if (frac === 0n) {
    return exp === 0 ? 0 : exp;
  }

  // Reconstruct normalized mantissa m in (1, 2).
  scratchU64[0] = ONE_EXPONENT_BITS | frac;
  let m = scratchF64[0];

  // Range-reduce m into (sqrt(2)/2, sqrt(2)] so |t| <= 3 - 2*sqrt(2) ~= 0.17157.
  if (m > SQRT2) {
    m *= 0.5;
    exp += 1;
  }

  // Evaluate ln(m) = 2 * t * (1 + sum_{k=1..12} t^(2k) / (2k + 1)) via Horner's method.
  // At |t| <= 0.17157, the k=13 tail is < 2e-20, well below binary64 machine epsilon.
  const t = (m - 1) / (m + 1);
  const s = t * t;
  let tail = 1 / 25;
  tail = 1 / 23 + s * tail;
  tail = 1 / 21 + s * tail;
  tail = 1 / 19 + s * tail;
  tail = 1 / 17 + s * tail;
  tail = 1 / 15 + s * tail;
  tail = 1 / 13 + s * tail;
  tail = 1 / 11 + s * tail;
  tail = 1 / 9 + s * tail;
  tail = 1 / 7 + s * tail;
  tail = 1 / 5 + s * tail;
  tail = 1 / 3 + s * tail;

  const twoT = 2 * t;
  const lnM = twoT + twoT * s * tail;

  return exp + lnM * INV_LN2;
}

/**
 * Computes the base-2 logarithm element-wise over a Float64Array using a
 * series/identity-based algorithm (IEEE 754 exponent extraction + range-reduced
 * atanh power series).
 *
 * @param {Float64Array} input - Input vector of IEEE 754 float64 values.
 * @returns {Float64Array} A new Float64Array containing log2(input[i]) for each element.
 * @throws {TypeError} If `input` is not a Float64Array.
 */
export function log2TypedSeries(input) {
  if (!(input instanceof Float64Array)) {
    throw new TypeError('log2TypedSeries expects a Float64Array input');
  }

  const len = input.length;
  const out = new Float64Array(len);

  for (let i = 0; i < len; i += 1) {
    out[i] = log2ScalarSeries(input[i]);
  }

  return out;
}
