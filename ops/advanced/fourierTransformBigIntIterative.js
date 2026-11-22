/**
 * Fixed-point scale factor (10^18) used for non-integer DFT output values.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const SCALE_DIGITS = 18;
const MIN_WORK_DIGITS = 40;
const EXTRA_PRECISION_DIGITS = 16;
const TRIG_GUARD_DIGITS = 10;
const PI_GUARD_DIGITS = 12;

let cachedPiDigits = 0;
let cachedPiValue = 0n;

/**
 * Returns the absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
  return value < 0n ? -value : value;
}

/**
 * Divides `numerator` by positive `denominator`, rounding half away from zero.
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
function divRound(numerator, denominator) {
  const half = denominator / 2n;
  if (numerator >= 0n) {
    return (numerator + half) / denominator;
  }
  return -((-numerator + half) / denominator);
}

/**
 * Iteratively computes `atan(1 / m) * scale` via its Taylor series:
 *   atan(1/m) = sum_{k=0..inf} (-1)^k / ((2k + 1) * m^(2k + 1))
 *
 * @param {bigint} m - Integer denominator (m >= 2).
 * @param {bigint} scale - Power-of-10 fixed-point scale.
 * @returns {bigint}
 */
function computeAtanReciprocal(m, scale) {
  const m2 = m * m;
  let power = scale / m;
  let sum = power;

  for (let k = 1n; power > 0n; k += 1n) {
    power /= m2;
    const term = power / (2n * k + 1n);
    if (term === 0n) {
      break;
    }
    if ((k & 1n) === 1n) {
      sum -= term;
    } else {
      sum += term;
    }
  }

  return sum;
}

/**
 * Iteratively computes `round(pi * 10^digits)` using Machin's formula:
 *   pi = 16 * atan(1/5) - 4 * atan(1/239)
 *
 * Caches the highest computed precision for reuse across calls.
 *
 * @param {number} digits - Number of fractional decimal digits.
 * @returns {bigint}
 */
function computePi(digits) {
  if (digits <= cachedPiDigits) {
    if (digits === cachedPiDigits) {
      return cachedPiValue;
    }
    return divRound(cachedPiValue, 10n ** BigInt(cachedPiDigits - digits));
  }

  const workDigits = digits + PI_GUARD_DIGITS;
  const workScale = 10n ** BigInt(workDigits);
  const piWork =
    16n * computeAtanReciprocal(5n, workScale) -
    4n * computeAtanReciprocal(239n, workScale);

  const piRounded = divRound(piWork, 10n ** BigInt(PI_GUARD_DIGITS));
  cachedPiDigits = digits;
  cachedPiValue = piRounded;
  return piRounded;
}

/**
 * Iteratively computes `cos(beta)` and `sin(beta)` for `beta = (pi * v) / (2 * n)`
 * where `0 < beta <= pi / 4`, using Taylor series in BigInt arithmetic.
 *
 * @param {bigint} v - Reduced angle numerator (`1 <= 2*v <= n`).
 * @param {bigint} nBig - Signal length as BigInt.
 * @param {bigint} piWork - `pi` scaled by `scaleWork`.
 * @param {bigint} scaleWork - Internal Taylor working scale (`10^(digits + TRIG_GUARD_DIGITS)`).
 * @param {bigint} guardFactor - `10^TRIG_GUARD_DIGITS`.
 * @returns {{ cos: bigint, sin: bigint }} Values scaled by `scaleWork / guardFactor`.
 */
function computeCosSinReduced(v, nBig, piWork, scaleWork, guardFactor) {
  const x = divRound(piWork * v, 2n * nBig);
  const x2 = x * x;
  const scaleWork2 = scaleWork * scaleWork;

  let cosSum = scaleWork;
  let cosTerm = scaleWork;
  for (let m = 1n; ; m += 1n) {
    cosTerm = (cosTerm * x2) / (scaleWork2 * (2n * m - 1n) * (2n * m));
    if (cosTerm === 0n) {
      break;
    }
    if ((m & 1n) === 1n) {
      cosSum -= cosTerm;
    } else {
      cosSum += cosTerm;
    }
  }

  let sinSum = x;
  let sinTerm = x;
  for (let m = 1n; ; m += 1n) {
    sinTerm = (sinTerm * x2) / (scaleWork2 * (2n * m) * (2n * m + 1n));
    if (sinTerm === 0n) {
      break;
    }
    if ((m & 1n) === 1n) {
      sinSum -= sinTerm;
    } else {
      sinSum += sinTerm;
    }
  }

  return {
    cos: divRound(cosSum, guardFactor),
    sin: divRound(sinSum, guardFactor),
  };
}

/**
 * Precomputes `cos(2*pi*r / n)` and `sin(2*pi*r / n)` scaled by `10^digits`
 * for all `r = 0, 1, ..., n - 1` using exact integer octant reduction and
 * iterative BigInt Taylor series.
 *
 * @param {number} n - Signal length (n >= 1).
 * @param {number} digits - Fractional decimal digits for output trig table.
 * @returns {{ cosTable: bigint[], sinTable: bigint[], scaleOut: bigint }}
 */
function buildTrigTable(n, digits) {
  const nBig = BigInt(n);
  const scaleOut = 10n ** BigInt(digits);
  const guardFactor = 10n ** BigInt(TRIG_GUARD_DIGITS);
  const scaleWork = scaleOut * guardFactor;
  const piWork = computePi(digits + TRIG_GUARD_DIGITS);

  const cosTable = new Array(n);
  const sinTable = new Array(n);
  const octantCache = new Map();

  for (let r = 0; r < n; r += 1) {
    const u = 4n * BigInt(r);
    let u1;
    let cosSign = 1n;
    let sinSign = 1n;

    if (u < nBig) {
      u1 = u;
    } else if (u < 2n * nBig) {
      u1 = 2n * nBig - u;
      cosSign = -1n;
    } else if (u < 3n * nBig) {
      u1 = u - 2n * nBig;
      cosSign = -1n;
      sinSign = -1n;
    } else {
      u1 = 4n * nBig - u;
      sinSign = -1n;
    }

    let cosA;
    let sinA;
    if (u1 === 0n) {
      cosA = scaleOut;
      sinA = 0n;
    } else if (u1 === nBig) {
      cosA = 0n;
      sinA = scaleOut;
    } else {
      const swap = 2n * u1 > nBig;
      const v = swap ? nBig - u1 : u1;
      let pair = octantCache.get(v);
      if (pair === undefined) {
        pair = computeCosSinReduced(v, nBig, piWork, scaleWork, guardFactor);
        octantCache.set(v, pair);
      }
      if (swap) {
        cosA = pair.sin;
        sinA = pair.cos;
      } else {
        cosA = pair.cos;
        sinA = pair.sin;
      }
    }

    cosTable[r] = cosSign * cosA;
    sinTable[r] = sinSign * sinA;
  }

  return { cosTable, sinTable, scaleOut };
}

/**
 * Computes the Discrete Fourier Transform (or Inverse DFT) iteratively over exact
 * BigInt inputs, returning complex frequency bins `{ re, im }` in fixed-point
 * BigInt arithmetic scaled by `SCALE = 10n ** 18n`.
 *
 * Forward DFT (`inverse = false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * (cos(2*pi*k*n / N) - i * sin(2*pi*k*n / N))
 *
 * Inverse DFT (`inverse = true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * (cos(2*pi*k*n / N) + i * sin(2*pi*k*n / N))
 *
 * Trigonometry (`pi`, `cos`, `sin`) is evaluated purely in BigInt using Machin's
 * formula, exact integer octant reduction, and iterative Taylor series with dynamic
 * guard precision sized to the input magnitude and length, avoiding any floating-point
 * truncation loss and guaranteeing 10^18 fixed-point accuracy even for very large BigInts.
 *
 * @param {Array<bigint | { re: bigint, im: bigint }>} signal
 *   Input sequence of real BigInt values or complex `{ re: bigint, im: bigint }` objects.
 * @param {object} [options] - Optional transform configuration.
 * @param {boolean} [options.inverse=false]
 *   If `true`, computes the Inverse DFT (positive exponent and `1/N` normalization).
 * @param {boolean} [options.inputScaled=false]
 *   If `true`, treats input elements as already scaled by `SCALE = 10n ** 18n` and
 *   returns outputs scaled by `SCALE = 10n ** 18n` (useful for round-tripping
 *   forward DFT output directly into the inverse DFT).
 * @returns {Array<{ re: bigint, im: bigint }>}
 *   Array of complex bins `{ re, im }` scaled by `SCALE = 10n ** 18n`.
 * @throws {TypeError}
 *   If `signal` is not an Array, any element is neither a BigInt nor a `{ re: bigint, im: bigint }`
 *   object, or `options` / its fields have invalid types.
 */
export function fourierTransformBigIntIterative(signal, options = undefined) {
  if (!Array.isArray(signal)) {
    throw new TypeError('signal must be an Array of BigInt or { re: BigInt, im: BigInt } elements');
  }

  let inverse = false;
  let inputScaled = false;
  if (options !== undefined) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('options must be a plain object when provided');
    }
    if (options.inverse !== undefined) {
      if (typeof options.inverse !== 'boolean') {
        throw new TypeError('options.inverse must be a boolean');
      }
      inverse = options.inverse;
    }
    if (options.inputScaled !== undefined) {
      if (typeof options.inputScaled !== 'boolean') {
        throw new TypeError('options.inputScaled must be a boolean');
      }
      inputScaled = options.inputScaled;
    }
  }

  const n = signal.length;
  const reIn = new Array(n);
  const imIn = new Array(n);
  let maxAbs = 0n;

  for (let i = 0; i < n; i += 1) {
    if (!(i in signal)) {
      throw new TypeError(`signal[${i}] must be a BigInt or { re: BigInt, im: BigInt } object (sparse hole found)`);
    }
    const elem = signal[i];
    if (typeof elem === 'bigint') {
      reIn[i] = elem;
      imIn[i] = 0n;
    } else if (elem !== null && typeof elem === 'object' && !Array.isArray(elem)) {
      if (typeof elem.re !== 'bigint' || typeof elem.im !== 'bigint') {
        throw new TypeError(`signal[${i}] must have BigInt properties "re" and "im"`);
      }
      reIn[i] = elem.re;
      imIn[i] = elem.im;
    } else {
      throw new TypeError(`signal[${i}] must be a BigInt or { re: BigInt, im: BigInt } object`);
    }

    const absRe = absBigInt(reIn[i]);
    const absIm = absBigInt(imIn[i]);
    if (absRe > maxAbs) {
      maxAbs = absRe;
    }
    if (absIm > maxAbs) {
      maxAbs = absIm;
    }
  }

  if (n === 0) {
    return [];
  }

  if (maxAbs === 0n) {
    const zeros = new Array(n);
    for (let k = 0; k < n; k += 1) {
      zeros[k] = { re: 0n, im: 0n };
    }
    return zeros;
  }

  const maxAbsDigits = maxAbs.toString().length;
  const nDigits = n.toString().length;
  const workDigits = Math.max(
    MIN_WORK_DIGITS,
    SCALE_DIGITS + maxAbsDigits + nDigits + EXTRA_PRECISION_DIGITS
  );

  const { cosTable, sinTable, scaleOut } = buildTrigTable(n, workDigits);
  const nBig = BigInt(n);

  // Determine exact divisor to map accumulated sum (scaled by scaleOut, or SCALE*scaleOut if inputScaled)
  // to final output scaled by SCALE (and divided by N for inverse DFT).
  let divisor = inputScaled ? scaleOut : scaleOut / SCALE;
  if (inverse) {
    divisor *= nBig;
  }

  const result = new Array(n);
  for (let k = 0; k < n; k += 1) {
    let sumRe = 0n;
    let sumIm = 0n;

    for (let j = 0; j < n; j += 1) {
      const idx = (k * j) % n;
      const c = cosTable[idx];
      const s = sinTable[idx];
      const a = reIn[j];
      const b = imIn[j];

      if (inverse) {
        // (a + b*i) * (c + s*i) = (a*c - b*s) + (b*c + a*s)*i
        sumRe += a * c - b * s;
        sumIm += b * c + a * s;
      } else {
        // (a + b*i) * (c - s*i) = (a*c + b*s) + (b*c - a*s)*i
        sumRe += a * c + b * s;
        sumIm += b * c - a * s;
      }
    }

    result[k] = {
      re: divRound(sumRe, divisor),
      im: divRound(sumIm, divisor),
    };
  }

  return result;
}
