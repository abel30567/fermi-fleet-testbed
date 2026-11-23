import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fourierTransformTypedStable } from './fourierTransformTypedStable.js';

/**
 * Independent reference DFT using direct definition for cross-checking.
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @param {boolean} inverse
 */
function referenceDft(re, im, inverse = false) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  const sign = inverse ? 1 : -1;
  const scale = inverse ? 1 / n : 1;

  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const angle = (sign * 2 * Math.PI * k * j) / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      sr += re[j] * c - im[j] * s;
      si += re[j] * s + im[j] * c;
    }
    outRe[k] = sr * scale;
    outIm[k] = si * scale;
  }
  return { real: outRe, imag: outIm };
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible test signals.
 * @param {number} seed
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertClose(actual, expected, tol, label = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${label}: expected ${expected} (+/- ${tol}), got ${actual} (diff ${diff})`
  );
}

describe('fourierTransformTypedStable', () => {
  describe('normal cases', () => {
    it('transforms a unit impulse into a flat spectrum', () => {
      const re = new Float64Array([1, 0, 0, 0]);
      const res = fourierTransformTypedStable(re);

      assert.ok(res.real instanceof Float64Array);
      assert.ok(res.imag instanceof Float64Array);
      assert.equal(res.real.length, 4);
      assert.equal(res.imag.length, 4);
      assert.deepStrictEqual(res.real, new Float64Array([1, 1, 1, 1]));
      assert.deepStrictEqual(res.imag, new Float64Array([0, 0, 0, 0]));
      assert.ok(res.maxErrorBound >= 0 && Number.isFinite(res.maxErrorBound));
    });

    it('transforms a constant DC signal into a single DC spike', () => {
      const re = new Float64Array([3.5, 3.5, 3.5, 3.5]);
      const res = fourierTransformTypedStable(re);

      assert.deepStrictEqual(res.real, new Float64Array([14, 0, 0, 0]));
      assert.deepStrictEqual(res.imag, new Float64Array([0, 0, 0, 0]));
    });

    it('recovers exact frequency bins for pure cosine and sine waves', () => {
      const n = 16;
      const freq = 3;
      const cosSig = new Float64Array(n);
      const sinSig = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        cosSig[j] = Math.cos((2 * Math.PI * freq * j) / n);
        sinSig[j] = Math.sin((2 * Math.PI * freq * j) / n);
      }

      const cosSpec = fourierTransformTypedStable(cosSig);
      const sinSpec = fourierTransformTypedStable(sinSig);

      for (let k = 0; k < n; k++) {
        const expectedCosRe = k === freq || k === n - freq ? n / 2 : 0;
        assertClose(cosSpec.real[k], expectedCosRe, 1e-13, `cosSpec.real[${k}]`);
        assertClose(cosSpec.imag[k], 0, 1e-13, `cosSpec.imag[${k}]`);

        let expectedSinIm = 0;
        if (k === freq) expectedSinIm = -n / 2;
        if (k === n - freq) expectedSinIm = n / 2;
        assertClose(sinSpec.real[k], 0, 1e-13, `sinSpec.real[${k}]`);
        assertClose(sinSpec.imag[k], expectedSinIm, 1e-13, `sinSpec.imag[${k}]`);
      }
    });

    it('handles complex inputs and all normalization modes', () => {
      const re = new Float64Array([1, -2, 3, -4, 5]);
      const im = new Float64Array([0.5, 1.5, -2.5, 0.25, -1.25]);

      for (const normalize of ['backward', 'forward', 'ortho']) {
        const fwd = fourierTransformTypedStable(re, im, { inverse: false, normalize });
        const inv = fourierTransformTypedStable(fwd.real, fwd.imag, {
          inverse: true,
          normalize,
        });
        for (let i = 0; i < re.length; i++) {
          assertClose(inv.real[i], re[i], 1e-13, `${normalize} round-trip re[${i}]`);
          assertClose(inv.imag[i], im[i], 1e-13, `${normalize} round-trip im[${i}]`);
        }
      }

      // 'none' scales round-trip by N
      const fwdNone = fourierTransformTypedStable(re, im, { inverse: false, normalize: 'none' });
      const invNone = fourierTransformTypedStable(fwdNone.real, fwdNone.imag, {
        inverse: true,
        normalize: 'none',
      });
      for (let i = 0; i < re.length; i++) {
        assertClose(invNone.real[i], re[i] * re.length, 1e-12, `none re[${i}]`);
        assertClose(invNone.imag[i], im[i] * re.length, 1e-12, `none im[${i}]`);
      }
    });

    it('does not mutate input Float64Arrays', () => {
      const re = new Float64Array([1, 2, 3, 4, 5, 6]);
      const im = new Float64Array([-1, 0, 1, -2, 2, 0.5]);
      const reCopy = new Float64Array(re);
      const imCopy = new Float64Array(im);

      fourierTransformTypedStable(re, im);

      assert.deepStrictEqual(re, reCopy);
      assert.deepStrictEqual(im, imCopy);
    });
  });

  describe('edge cases and input validation', () => {
    it('handles empty Float64Array', () => {
      const res = fourierTransformTypedStable(new Float64Array(0));
      assert.equal(res.real.length, 0);
      assert.equal(res.imag.length, 0);
      assert.equal(res.maxErrorBound, 0);
    });

    it('handles length-1 signals', () => {
      const res = fourierTransformTypedStable(new Float64Array([42.5]), new Float64Array([-3.25]));
      assert.deepStrictEqual(res.real, new Float64Array([42.5]));
      assert.deepStrictEqual(res.imag, new Float64Array([-3.25]));
      assert.equal(res.maxErrorBound, 0);
    });

    it('handles all-zero signals without signed zeros', () => {
      const res = fourierTransformTypedStable(new Float64Array([-0, 0, -0, 0]));
      assert.equal(res.maxErrorBound, 0);
      for (let i = 0; i < 4; i++) {
        assert.ok(Object.is(res.real[i], 0));
        assert.ok(Object.is(res.imag[i], 0));
      }
    });

    it('rejects invalid input types, mismatched lengths, non-finite values, and bad options', () => {
      assert.throws(() => fourierTransformTypedStable([1, 2, 3]), TypeError);
      assert.throws(() => fourierTransformTypedStable(new Float32Array([1, 2])), TypeError);
      assert.throws(() => fourierTransformTypedStable(null), TypeError);
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, 2]), [0, 0]),
        TypeError
      );
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, 2]), new Float64Array([0])),
        RangeError
      );
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, Number.NaN])),
        RangeError
      );
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, Number.POSITIVE_INFINITY])),
        RangeError
      );
      assert.throws(
        () =>
          fourierTransformTypedStable(
            new Float64Array([1, 2]),
            new Float64Array([0, Number.NEGATIVE_INFINITY])
          ),
        RangeError
      );
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, 2]), null, null),
        TypeError
      );
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, 2]), null, { inverse: 1 }),
        TypeError
      );
      assert.throws(
        () => fourierTransformTypedStable(new Float64Array([1, 2]), null, { normalize: 'unitary' }),
        RangeError
      );
    });
  });

  describe('numerical stability', () => {
    it('prevents catastrophic cancellation via compensated summation', () => {
      // Naive Float64 summation: (((1e16 + 1) - 1e16) + 1) === 1 instead of exact 2
      const re = new Float64Array([1e16, 1, -1e16, 1]);
      const res = fourierTransformTypedStable(re);

      assert.equal(res.real[0], 2, 'DC bin must preserve small terms canceled by +/-1e16');
      assert.equal(res.imag[0], 0);
      assert.equal(res.real[1], 2e16);
      assert.equal(res.imag[1], 0);
      assert.equal(res.real[2], -2);
      assert.equal(res.imag[2], 0);
    });

    it('handles extreme large magnitudes without intermediate overflow', () => {
      const big = 1e308;
      const re = new Float64Array([big, big, big, big]);
      // Inverse transform divides by 4 -> mathematical result is [1e308, 0, 0, 0]
      const inv = fourierTransformTypedStable(re, null, { inverse: true });

      assertClose(inv.real[0], big, big * 1e-14, 'large inverse DC');
      assert.equal(inv.real[1], 0);
      assert.equal(inv.real[2], 0);
      assert.equal(inv.real[3], 0);
      assert.ok(Number.isFinite(inv.maxErrorBound));
    });

    it('handles extreme tiny and subnormal magnitudes without underflow loss', () => {
      const tiny = 1e-308;
      const re = new Float64Array([tiny, -tiny, tiny, -tiny]);
      const fwd = fourierTransformTypedStable(re);

      assert.equal(fwd.real[0], 0);
      assert.equal(fwd.real[1], 0);
      assertClose(fwd.real[2], 4 * tiny, 4 * tiny * 1e-13, 'tiny Nyquist bin');
      assert.equal(fwd.real[3], 0);

      // Subnormal regime (~1e-320)
      const sub = 1e-320;
      const subRe = new Float64Array([sub, sub, sub, sub]);
      const subFwd = fourierTransformTypedStable(subRe);
      assertClose(subFwd.real[0], 4 * sub, 4 * sub * 1e-2, 'subnormal DC bin');
    });

    it('preserves high accuracy on large power-of-two FFT path (N = 2048) including cancellation', () => {
      const n = 2048;
      const re = new Float64Array(n);
      const im = new Float64Array(n);
      // Mix large canceling terms with small signal
      re[0] = 1e15;
      re[n / 2] = -1e15;
      for (let i = 0; i < n; i++) {
        re[i] += Math.cos((2 * Math.PI * 17 * i) / n) * 0.25;
        im[i] = Math.sin((2 * Math.PI * 29 * i) / n) * 0.5;
      }

      const fwd = fourierTransformTypedStable(re, im);
      // DC bin should be 0 (1e15 and -1e15 cancel completely, and pure cosines/sines sum to 0)
      assertClose(fwd.real[0], 0, 1e-1, 'FFT DC cancellation');
      assertClose(fwd.imag[0], 0, 1e-10, 'FFT DC imag');

      // Spot-check selected bins against independent direct DFT formula
      for (const k of [1, 17, 29, 513, 1024, 2031]) {
        let refR = 0;
        let refI = 0;
        // Compute with large pair canceled analytically first: re[0] + re[n/2]*(-1)^k
        const bigContrib = k % 2 === 0 ? 0 : 2e15;
        for (let j = 0; j < n; j++) {
          const rSmall = Math.cos((2 * Math.PI * 17 * j) / n) * 0.25;
          const iSmall = im[j];
          const angle = (-2 * Math.PI * k * j) / n;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          refR += rSmall * c - iSmall * s;
          refI += rSmall * s + iSmall * c;
        }
        refR += bigContrib;
        const tol = Math.max(1e-9, Math.abs(refR) * 1e-13);
        assertClose(fwd.real[k], refR, tol, `FFT N=2048 real[${k}]`);
        assertClose(fwd.imag[k], refI, 1e-9, `FFT N=2048 imag[${k}]`);
      }

      // Round-trip via inverse FFT
      const inv = fourierTransformTypedStable(fwd.real, fwd.imag, { inverse: true });
      for (let i = 0; i < n; i++) {
        const tol = Math.max(1e-9, Math.abs(re[i]) * 1e-13);
        assertClose(inv.real[i], re[i], tol, `FFT round-trip re[${i}]`);
        assertClose(inv.imag[i], im[i], 1e-9, `FFT round-trip im[${i}]`);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches independent reference DFT across prime, composite, and power-of-two lengths', () => {
      const rng = makeRng(20261123);
      for (const n of [2, 3, 5, 7, 12, 16, 31, 64]) {
        const re = new Float64Array(n);
        const im = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          re[i] = (rng() - 0.5) * 20;
          im[i] = (rng() - 0.5) * 20;
        }

        const stable = fourierTransformTypedStable(re, im);
        const ref = referenceDft(re, im, false);

        for (let k = 0; k < n; k++) {
          assertClose(stable.real[k], ref.real[k], 1e-11, `n=${n} real[${k}]`);
          assertClose(stable.imag[k], ref.imag[k], 1e-11, `n=${n} imag[${k}]`);
        }
      }
    });

    it('satisfies Parseval energy conservation theorem', () => {
      const rng = makeRng(42);
      for (const n of [13, 64, 2048]) {
        const re = new Float64Array(n);
        const im = new Float64Array(n);
        let timeEnergy = 0;
        for (let i = 0; i < n; i++) {
          re[i] = rng() * 2 - 1;
          im[i] = rng() * 2 - 1;
          timeEnergy += re[i] * re[i] + im[i] * im[i];
        }

        const ortho = fourierTransformTypedStable(re, im, { normalize: 'ortho' });
        let freqEnergy = 0;
        for (let k = 0; k < n; k++) {
          freqEnergy += ortho.real[k] * ortho.real[k] + ortho.imag[k] * ortho.imag[k];
        }

        assertClose(freqEnergy, timeEnergy, timeEnergy * 1e-12, `Parseval n=${n}`);
      }
    });

    it('satisfies linearity, conjugate symmetry, circular shift, and convolution theorems', () => {
      const rng = makeRng(999);
      const n = 15;
      const x = new Float64Array(n);
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = rng() * 4 - 2;
        y[i] = rng() * 4 - 2;
      }

      // 1. Linearity: F(a*x + b*y) = a*F(x) + b*F(y)
      const a = 2.75;
      const b = -1.5;
      const lin = new Float64Array(n);
      for (let i = 0; i < n; i++) lin[i] = a * x[i] + b * y[i];

      const fx = fourierTransformTypedStable(x);
      const fy = fourierTransformTypedStable(y);
      const flin = fourierTransformTypedStable(lin);
      for (let k = 0; k < n; k++) {
        assertClose(flin.real[k], a * fx.real[k] + b * fy.real[k], 1e-12, `linearity re[${k}]`);
        assertClose(flin.imag[k], a * fx.imag[k] + b * fy.imag[k], 1e-12, `linearity im[${k}]`);
      }

      // 2. Conjugate symmetry for real input: X[N-k] = conj(X[k])
      for (let k = 1; k < n; k++) {
        assertClose(fx.real[n - k], fx.real[k], 1e-13, `conj sym re[${k}]`);
        assertClose(fx.imag[n - k], -fx.imag[k], 1e-13, `conj sym im[${k}]`);
      }

      // 3. Circular shift theorem: F(shift(x, d))[k] = exp(-i*2*pi*k*d/N) * F(x)[k]
      const shift = 4;
      const xShifted = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        xShifted[i] = x[(i - shift + n) % n];
      }
      const fShifted = fourierTransformTypedStable(xShifted);
      for (let k = 0; k < n; k++) {
        const angle = (-2 * Math.PI * k * shift) / n;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const expectedRe = fx.real[k] * c - fx.imag[k] * s;
        const expectedIm = fx.real[k] * s + fx.imag[k] * c;
        assertClose(fShifted.real[k], expectedRe, 1e-12, `shift re[${k}]`);
        assertClose(fShifted.imag[k], expectedIm, 1e-12, `shift im[${k}]`);
      }

      // 4. Circular convolution theorem: IFFT(FFT(x) * FFT(y)) == circularConv(x, y)
      const directConv = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          sum += x[j] * y[(i - j + n) % n];
        }
        directConv[i] = sum;
      }

      const prodRe = new Float64Array(n);
      const prodIm = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        prodRe[k] = fx.real[k] * fy.real[k] - fx.imag[k] * fy.imag[k];
        prodIm[k] = fx.real[k] * fy.imag[k] + fx.imag[k] * fy.real[k];
      }
      const fftConv = fourierTransformTypedStable(prodRe, prodIm, { inverse: true });
      for (let i = 0; i < n; i++) {
        assertClose(fftConv.real[i], directConv[i], 1e-12, `conv re[${i}]`);
        assertClose(fftConv.imag[i], 0, 1e-12, `conv im[${i}]`);
      }
    });
  });
});
