/**
 * Numerically robust Discrete Fourier Transform (DFT / FFT) over Float64Array inputs.
 *
 * Numerical stability techniques used:
 * - Exact power-of-two pre-scaling (split into two exponents to avoid overflow/underflow
 *   across the entire IEEE-754 range, including subnormals and values near Number.MAX_VALUE).
 * - Octant-reduced trigonometric unit-root evaluation so cardinal angles (0, pi/2, pi, 3pi/2)
 *   are exact and all trig calls occur on [0, pi/4].
 * - Dekker/Veltkamp error-free TwoProd + Neumaier compensated summation for direct DFT
 *   (arbitrary lengths N <= 1024 or non-power-of-two lengths).
 * - Double-double (compensated pair) iterative radix-2 Cooley-Tukey FFT for power-of-two
 *   lengths N > 1024, preserving ~106-bit intermediate precision in O(N log N) time.
 * - Conservative a posteriori component-wise error bound (`maxErrorBound`).
 *
 * @module ops/advanced/fourierTransformTypedStable
 */

const SPLIT = 134217729; // 2^27 + 1 (Veltkamp splitting constant for IEEE-754 binary64)
const UNIT_ROUNDOFF = Number.EPSILON / 2; // 2^-53
const VALID_NORMALIZATIONS = new Set(['backward', 'forward', 'ortho', 'none']);
const FFT_THRESHOLD = 1024;

/**
 * Normalize -0 to +0 to avoid spurious signed zeros.
 * @param {number} x
 * @returns {number}
 */
function cleanZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Validate a Float64Array input and verify all elements are finite.
 * @param {unknown} arr
 * @param {string} name
 */
function validateFloat64Array(arr, name) {
  if (!(arr instanceof Float64Array)) {
    throw new TypeError(`${name} must be a Float64Array`);
  }
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      throw new RangeError(`${name}[${i}] must be a finite number`);
    }
  }
}

/**
 * Build octant-reduced unit-root tables cos(sign * 2*pi*m/N), sin(sign * 2*pi*m/N)
 * for m = 0..N-1, guaranteeing exact values on cardinal axes and <= 0.5 ulp elsewhere.
 *
 * @param {number} n
 * @param {1 | -1} sign
 * @returns {{ cosTable: Float64Array, sinTable: Float64Array }}
 */
function buildTwiddleTables(n, sign) {
  const cosTable = new Float64Array(n);
  const sinTable = new Float64Array(n);
  const denom = 4 * n;
  const n2 = 2 * n;
  const n3 = 3 * n;
  const n4 = 4 * n;
  const n5 = 5 * n;
  const n6 = 6 * n;
  const n7 = 7 * n;
  const n8 = 8 * n;

  for (let m = 0; m < n; m++) {
    const r = 8 * m;
    let c;
    let s;

    if (r === 0) {
      c = 1;
      s = 0;
    } else if (r <= n) {
      const a = (Math.PI * r) / denom;
      c = Math.cos(a);
      s = Math.sin(a);
    } else if (r <= n2) {
      const a = (Math.PI * (n2 - r)) / denom;
      c = Math.sin(a);
      s = Math.cos(a);
    } else if (r <= n3) {
      const a = (Math.PI * (r - n2)) / denom;
      c = -Math.sin(a);
      s = Math.cos(a);
    } else if (r <= n4) {
      const a = (Math.PI * (n4 - r)) / denom;
      c = -Math.cos(a);
      s = Math.sin(a);
    } else if (r <= n5) {
      const a = (Math.PI * (r - n4)) / denom;
      c = -Math.cos(a);
      s = -Math.sin(a);
    } else if (r <= n6) {
      const a = (Math.PI * (n6 - r)) / denom;
      c = -Math.sin(a);
      s = -Math.cos(a);
    } else if (r <= n7) {
      const a = (Math.PI * (r - n6)) / denom;
      c = Math.sin(a);
      s = -Math.cos(a);
    } else {
      const a = (Math.PI * (n8 - r)) / denom;
      c = Math.cos(a);
      s = -Math.sin(a);
    }

    cosTable[m] = cleanZero(c);
    sinTable[m] = cleanZero(sign * s);
  }

  return { cosTable, sinTable };
}

/**
 * Direct O(N^2) DFT using Dekker TwoProd and Neumaier compensated summation.
 *
 * @param {Float64Array} scaledRe
 * @param {Float64Array} scaledIm
 * @param {Float64Array} cosTable
 * @param {Float64Array} sinTable
 * @param {number} normFactor
 * @param {number} up1
 * @param {number} up2
 * @returns {{ real: Float64Array, imag: Float64Array, maxCond: number, maxOut: number }}
 */
function directCompensatedDft(scaledRe, scaledIm, cosTable, sinTable, normFactor, up1, up2) {
  const n = scaledRe.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  let maxCond = 0;
  let maxOut = 0;

  for (let k = 0; k < n; k++) {
    let reSum = 0;
    let reComp = 0;
    let imSum = 0;
    let imComp = 0;
    let reCond = 0;
    let imCond = 0;
    let m = 0;

    for (let j = 0; j < n; j++) {
      const xr = scaledRe[j];
      const xi = scaledIm[j];
      const c = cosTable[m];
      const s = sinTable[m];

      // Dekker split of c and s
      const tc = SPLIT * c;
      const cHi = tc - (tc - c);
      const cLo = c - cHi;
      const ts = SPLIT * s;
      const sHi = ts - (ts - s);
      const sLo = s - sHi;

      // Dekker split of xr and xi
      const txr = SPLIT * xr;
      const xrHi = txr - (txr - xr);
      const xrLo = xr - xrHi;
      const txi = SPLIT * xi;
      const xiHi = txi - (txi - xi);
      const xiLo = xi - xiHi;

      // Four exact TwoProd products:
      // re += xr*c - xi*s
      // im += xr*s + xi*c
      const p1 = xr * c;
      const e1 = ((xrHi * cHi - p1) + xrHi * cLo + xrLo * cHi) + xrLo * cLo;

      const p2 = -xi * s;
      const e2 = ((-xiHi * sHi - p2) - xiHi * sLo - xiLo * sHi) - xiLo * sLo;

      const p3 = xr * s;
      const e3 = ((xrHi * sHi - p3) + xrHi * sLo + xrLo * sHi) + xrLo * sLo;

      const p4 = xi * c;
      const e4 = ((xiHi * cHi - p4) + xiHi * cLo + xiLo * cHi) + xiLo * cLo;

      // Neumaier compensated accumulation for real part (p1, p2, e1 + e2)
      let t = reSum + p1;
      reComp += Math.abs(reSum) >= Math.abs(p1) ? (reSum - t) + p1 : (p1 - t) + reSum;
      reSum = t;

      t = reSum + p2;
      reComp += Math.abs(reSum) >= Math.abs(p2) ? (reSum - t) + p2 : (p2 - t) + reSum;
      reSum = t;

      const eRe = e1 + e2;
      t = reSum + eRe;
      reComp += Math.abs(reSum) >= Math.abs(eRe) ? (reSum - t) + eRe : (eRe - t) + reSum;
      reSum = t;

      // Neumaier compensated accumulation for imaginary part (p3, p4, e3 + e4)
      t = imSum + p3;
      imComp += Math.abs(imSum) >= Math.abs(p3) ? (imSum - t) + p3 : (p3 - t) + imSum;
      imSum = t;

      t = imSum + p4;
      imComp += Math.abs(imSum) >= Math.abs(p4) ? (imSum - t) + p4 : (p4 - t) + imSum;
      imSum = t;

      const eIm = e3 + e4;
      t = imSum + eIm;
      imComp += Math.abs(imSum) >= Math.abs(eIm) ? (imSum - t) + eIm : (eIm - t) + imSum;
      imSum = t;

      reCond += Math.abs(p1) + Math.abs(p2);
      imCond += Math.abs(p3) + Math.abs(p4);

      m += k;
      if (m >= n) m -= n;
    }

    const rScaled = (reSum + reComp) * normFactor;
    const iScaled = (imSum + imComp) * normFactor;
    const rFinal = cleanZero((rScaled * up1) * up2);
    const iFinal = cleanZero((iScaled * up1) * up2);

    outRe[k] = rFinal;
    outIm[k] = iFinal;

    if (reCond > maxCond) maxCond = reCond;
    if (imCond > maxCond) maxCond = imCond;
    const ar = Math.abs(rFinal);
    const ai = Math.abs(iFinal);
    if (ar > maxOut) maxOut = ar;
    if (ai > maxOut) maxOut = ai;
  }

  return { real: outRe, imag: outIm, maxCond, maxOut };
}

/**
 * Iterative radix-2 Cooley-Tukey FFT using double-double (hi, lo) compensated arithmetic.
 * Requires n to be a power of two.
 *
 * @param {Float64Array} scaledRe
 * @param {Float64Array} scaledIm
 * @param {Float64Array} cosTable
 * @param {Float64Array} sinTable
 * @param {number} normFactor
 * @param {number} up1
 * @param {number} up2
 * @returns {{ real: Float64Array, imag: Float64Array, maxOut: number, stages: number }}
 */
function doubleDoubleRadix2Fft(scaledRe, scaledIm, cosTable, sinTable, normFactor, up1, up2) {
  const n = scaledRe.length;
  const reHi = new Float64Array(n);
  const reLo = new Float64Array(n);
  const imHi = new Float64Array(n);
  const imLo = new Float64Array(n);

  // Bit-reversal copy
  const stages = Math.round(Math.log2(n));
  for (let i = 0; i < n; i++) {
    let rev = 0;
    let x = i;
    for (let b = 0; b < stages; b++) {
      rev = (rev << 1) | (x & 1);
      x >>= 1;
    }
    reHi[rev] = scaledRe[i];
    imHi[rev] = scaledIm[i];
  }

  // Iterative butterflies in double-double precision
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;

    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < half; j++) {
        const wIdx = j * step;
        const wr = cosTable[wIdx];
        const wi = sinTable[wIdx];

        const u = i + j;
        const v = u + half;

        const vrHi = reHi[v];
        const vrLo = reLo[v];
        const viHi = imHi[v];
        const viLo = imLo[v];

        // Dekker splits
        const twr = SPLIT * wr;
        const wrHi = twr - (twr - wr);
        const wrLo = wr - wrHi;
        const twi = SPLIT * wi;
        const wiHi = twi - (twi - wi);
        const wiLo = wi - wiHi;

        const tvr = SPLIT * vrHi;
        const vrH = tvr - (tvr - vrHi);
        const vrL = vrHi - vrH;
        const tvi = SPLIT * viHi;
        const viH = tvi - (tvi - viHi);
        const viL = viHi - viH;

        // ddMulD(vRe, wr) -> (aHi, aLo)
        let p = vrHi * wr;
        let e = ((vrH * wrHi - p) + vrH * wrLo + vrL * wrHi) + vrL * wrLo + vrLo * wr;
        let s = p + e;
        let bb = s - p;
        const aHi = s;
        const aLo = (p - (s - bb)) + (e - bb);

        // ddMulD(vIm, -wi) -> (bHi, bLo)
        const nwi = -wi;
        p = viHi * nwi;
        e = ((-viH * wiHi - p) - viH * wiLo - viL * wiHi) - viL * wiLo + viLo * nwi;
        s = p + e;
        bb = s - p;
        const bHi = s;
        const bLo = (p - (s - bb)) + (e - bb);

        // tRe = a + b (accurate ddAdd)
        let s1 = aHi + bHi;
        bb = s1 - aHi;
        let s2 = (aHi - (s1 - bb)) + (bHi - bb);
        let t1 = aLo + bLo;
        bb = t1 - aLo;
        let t2 = (aLo - (t1 - bb)) + (bLo - bb);
        s2 += t1;
        let v1 = s1 + s2;
        bb = v1 - s1;
        let v2 = (s1 - (v1 - bb)) + (s2 - bb) + t2;
        const tReHi = v1 + v2;
        bb = tReHi - v1;
        const tReLo = (v1 - (tReHi - bb)) + (v2 - bb);

        // ddMulD(vRe, wi) -> (cHi, cLo)
        p = vrHi * wi;
        e = ((vrH * wiHi - p) + vrH * wiLo + vrL * wiHi) + vrL * wiLo + vrLo * wi;
        s = p + e;
        bb = s - p;
        const cHi = s;
        const cLo = (p - (s - bb)) + (e - bb);

        // ddMulD(vIm, wr) -> (dHi, dLo)
        p = viHi * wr;
        e = ((viH * wrHi - p) + viH * wrLo + viL * wrHi) + viL * wrLo + viLo * wr;
        s = p + e;
        bb = s - p;
        const dHi = s;
        const dLo = (p - (s - bb)) + (e - bb);

        // tIm = c + d (accurate ddAdd)
        s1 = cHi + dHi;
        bb = s1 - cHi;
        s2 = (cHi - (s1 - bb)) + (dHi - bb);
        t1 = cLo + dLo;
        bb = t1 - cLo;
        t2 = (cLo - (t1 - bb)) + (dLo - bb);
        s2 += t1;
        v1 = s1 + s2;
        bb = v1 - s1;
        v2 = (s1 - (v1 - bb)) + (s2 - bb) + t2;
        const tImHi = v1 + v2;
        bb = tImHi - v1;
        const tImLo = (v1 - (tImHi - bb)) + (v2 - bb);

        const urHi = reHi[u];
        const urLo = reLo[u];
        const uiHi = imHi[u];
        const uiLo = imLo[u];

        // uRe' = uRe + tRe
        s1 = urHi + tReHi;
        bb = s1 - urHi;
        s2 = (urHi - (s1 - bb)) + (tReHi - bb);
        t1 = urLo + tReLo;
        bb = t1 - urLo;
        t2 = (urLo - (t1 - bb)) + (tReLo - bb);
        s2 += t1;
        v1 = s1 + s2;
        bb = v1 - s1;
        v2 = (s1 - (v1 - bb)) + (s2 - bb) + t2;
        reHi[u] = v1 + v2;
        bb = reHi[u] - v1;
        reLo[u] = (v1 - (reHi[u] - bb)) + (v2 - bb);

        // vRe' = uRe - tRe
        s1 = urHi - tReHi;
        bb = s1 - urHi;
        s2 = (urHi - (s1 - bb)) + (-tReHi - bb);
        t1 = urLo - tReLo;
        bb = t1 - urLo;
        t2 = (urLo - (t1 - bb)) + (-tReLo - bb);
        s2 += t1;
        v1 = s1 + s2;
        bb = v1 - s1;
        v2 = (s1 - (v1 - bb)) + (s2 - bb) + t2;
        reHi[v] = v1 + v2;
        bb = reHi[v] - v1;
        reLo[v] = (v1 - (reHi[v] - bb)) + (v2 - bb);

        // uIm' = uIm + tIm
        s1 = uiHi + tImHi;
        bb = s1 - uiHi;
        s2 = (uiHi - (s1 - bb)) + (tImHi - bb);
        t1 = uiLo + tImLo;
        bb = t1 - uiLo;
        t2 = (uiLo - (t1 - bb)) + (tImLo - bb);
        s2 += t1;
        v1 = s1 + s2;
        bb = v1 - s1;
        v2 = (s1 - (v1 - bb)) + (s2 - bb) + t2;
        imHi[u] = v1 + v2;
        bb = imHi[u] - v1;
        imLo[u] = (v1 - (imHi[u] - bb)) + (v2 - bb);

        // vIm' = uIm - tIm
        s1 = uiHi - tImHi;
        bb = s1 - uiHi;
        s2 = (uiHi - (s1 - bb)) + (-tImHi - bb);
        t1 = uiLo - tImLo;
        bb = t1 - uiLo;
        t2 = (uiLo - (t1 - bb)) + (-tImLo - bb);
        s2 += t1;
        v1 = s1 + s2;
        bb = v1 - s1;
        v2 = (s1 - (v1 - bb)) + (s2 - bb) + t2;
        imHi[v] = v1 + v2;
        bb = imHi[v] - v1;
        imLo[v] = (v1 - (imHi[v] - bb)) + (v2 - bb);
      }
    }
  }

  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  let maxOut = 0;

  for (let k = 0; k < n; k++) {
    const rFinal = cleanZero((((reHi[k] + reLo[k]) * normFactor) * up1) * up2);
    const iFinal = cleanZero((((imHi[k] + imLo[k]) * normFactor) * up1) * up2);
    outRe[k] = rFinal;
    outIm[k] = iFinal;
    const ar = Math.abs(rFinal);
    const ai = Math.abs(iFinal);
    if (ar > maxOut) maxOut = ar;
    if (ai > maxOut) maxOut = ai;
  }

  return { real: outRe, imag: outIm, maxOut, stages };
}

/**
 * Compute a numerically robust Discrete Fourier Transform (DFT / FFT) over Float64Array inputs.
 *
 * Computes:
 * - Forward (`inverse: false`): `X[k] = norm * sum_{j=0}^{N-1} (real[j] + i*imag[j]) * exp(-i * 2*pi*k*j / N)`
 * - Inverse (`inverse: true`):  `x[k] = norm * sum_{j=0}^{N-1} (real[j] + i*imag[j]) * exp(+i * 2*pi*k*j / N)`
 *
 * @param {Float64Array} real - Real part of the input signal (all entries must be finite).
 * @param {Float64Array | null} [imag] - Optional imaginary part of the input signal (same length as `real`).
 * @param {object} [options] - Transform options.
 * @param {boolean} [options.inverse=false] - Whether to compute the inverse transform.
 * @param {'backward' | 'forward' | 'ortho' | 'none'} [options.normalize='backward'] - Normalization convention:
 *   - `'backward'`: scale by `1` on forward, `1 / N` on inverse (default).
 *   - `'forward'`: scale by `1 / N` on forward, `1` on inverse.
 *   - `'ortho'`: scale by `1 / sqrt(N)` on both forward and inverse.
 *   - `'none'`: unscaled (`1`) on both forward and inverse.
 * @returns {{ real: Float64Array, imag: Float64Array, maxErrorBound: number }}
 *   Transformed real and imaginary Float64Array buffers, plus a conservative upper bound
 *   `maxErrorBound` on the component-wise absolute rounding error.
 * @throws {TypeError} If `real`, `imag`, or `options` have invalid types.
 * @throws {RangeError} If `real` and `imag` lengths differ, contain non-finite values, or options are invalid.
 */
export function fourierTransformTypedStable(real, imag = null, options = {}) {
  validateFloat64Array(real, 'real');
  const n = real.length;

  let imagArr = null;
  if (imag !== null && imag !== undefined) {
    validateFloat64Array(imag, 'imag');
    if (imag.length !== n) {
      throw new RangeError(`imag length (${imag.length}) must match real length (${n})`);
    }
    imagArr = imag;
  }

  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { inverse = false, normalize = 'backward' } = options;

  if (typeof inverse !== 'boolean') {
    throw new TypeError('options.inverse must be a boolean');
  }
  if (typeof normalize !== 'string' || !VALID_NORMALIZATIONS.has(normalize)) {
    throw new RangeError(
      `options.normalize must be one of: ${Array.from(VALID_NORMALIZATIONS).join(', ')}`
    );
  }

  // Trivial lengths
  if (n === 0) {
    return {
      real: new Float64Array(0),
      imag: new Float64Array(0),
      maxErrorBound: 0,
    };
  }

  if (n === 1) {
    return {
      real: new Float64Array([cleanZero(real[0])]),
      imag: new Float64Array([cleanZero(imagArr ? imagArr[0] : 0)]),
      maxErrorBound: 0,
    };
  }

  // Find maximum absolute component for exact power-of-two pre-scaling
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const ar = Math.abs(real[i]);
    if (ar > maxAbs) maxAbs = ar;
    if (imagArr) {
      const ai = Math.abs(imagArr[i]);
      if (ai > maxAbs) maxAbs = ai;
    }
  }

  if (maxAbs === 0) {
    return {
      real: new Float64Array(n),
      imag: new Float64Array(n),
      maxErrorBound: 0,
    };
  }

  // Split exponent into two normal power-of-two factors so even subnormals (5e-324)
  // and values near Number.MAX_VALUE (1.79e308) scale without overflow or underflow.
  const exp = Math.floor(Math.log2(maxAbs));
  const e1 = Math.trunc(exp / 2);
  const e2 = exp - e1;
  const down1 = 2 ** -e1;
  const down2 = 2 ** -e2;
  const up1 = 2 ** e1;
  const up2 = 2 ** e2;

  const scaledRe = new Float64Array(n);
  const scaledIm = new Float64Array(n);
  let scaledL1 = 0;

  for (let i = 0; i < n; i++) {
    const sr = (real[i] * down1) * down2;
    const si = imagArr ? (imagArr[i] * down1) * down2 : 0;
    scaledRe[i] = sr;
    scaledIm[i] = si;
    scaledL1 += Math.abs(sr) + Math.abs(si);
  }

  let normFactor = 1;
  if (normalize === 'backward') {
    normFactor = inverse ? 1 / n : 1;
  } else if (normalize === 'forward') {
    normFactor = inverse ? 1 : 1 / n;
  } else if (normalize === 'ortho') {
    normFactor = 1 / Math.sqrt(n);
  }

  const sign = inverse ? 1 : -1;
  const { cosTable, sinTable } = buildTwiddleTables(n, sign);

  const isPowerOfTwo = (n & (n - 1)) === 0;
  if (n > FFT_THRESHOLD && isPowerOfTwo) {
    const { real: outRe, imag: outIm, maxOut, stages } = doubleDoubleRadix2Fft(
      scaledRe,
      scaledIm,
      cosTable,
      sinTable,
      normFactor,
      up1,
      up2
    );
    // Conservative error bound: trig rounding across stages + final Float64 rounding
    const trigBound = ((((2 * stages * scaledL1 * UNIT_ROUNDOFF) * normFactor) * up1) * up2);
    const roundBound = 2 * UNIT_ROUNDOFF * maxOut;
    const maxErrorBound = trigBound + roundBound;
    return { real: outRe, imag: outIm, maxErrorBound };
  }

  const { real: outRe, imag: outIm, maxCond, maxOut } = directCompensatedDft(
    scaledRe,
    scaledIm,
    cosTable,
    sinTable,
    normFactor,
    up1,
    up2
  );

  // Conservative error bound:
  // - <= 2 * u * maxCond from trig evaluation in [0, pi/4]
  // - <= n * u^2 * maxCond from compensated accumulation residual
  // - <= 2 * u * maxOut from final scaling and rounding to Float64
  const scaledAccErr = (2 * UNIT_ROUNDOFF + n * UNIT_ROUNDOFF * UNIT_ROUNDOFF) * maxCond;
  const accBound = (((scaledAccErr * normFactor) * up1) * up2);
  const roundBound = 2 * UNIT_ROUNDOFF * maxOut;
  const maxErrorBound = accBound + roundBound;

  return { real: outRe, imag: outIm, maxErrorBound };
}
