import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fourierTransformBigIntIterative,
  SCALE,
} from './fourierTransformBigIntIterative.js';

/**
 * Computes floor(sqrt(n)) iteratively via Newton's method for non-negative BigInt.
 * Used as an independent exact reference for irrational trig values (sqrt(2), sqrt(3), sqrt(5)).
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

/**
 * Rounds sqrt(radicand) * scale to nearest BigInt using exact integer square root.
 *
 * @param {bigint} radicand
 * @param {bigint} scale
 * @returns {bigint}
 */
function exactScaledSqrt(radicand, scale) {
  // Compute floor(sqrt(radicand * (2 * scale)^2)), then round half up
  const doubled = isqrt(radicand * 4n * scale * scale);
  return (doubled + 1n) >> 1n;
}

/**
 * Independent IEEE-754 floating-point DFT reference implementation.
 *
 * @param {Array<{ re: number, im: number }>} signal
 * @param {boolean} [inverse=false]
 * @returns {Array<{ re: number, im: number }>}
 */
function referenceFloatDft(signal, inverse = false) {
  const n = signal.length;
  const sign = inverse ? 1 : -1;
  const norm = inverse ? n : 1;
  const out = new Array(n);

  for (let k = 0; k < n; k += 1) {
    let sumRe = 0;
    let sumIm = 0;
    for (let j = 0; j < n; j += 1) {
      const angle = (2 * Math.PI * k * j) / n;
      const c = Math.cos(angle);
      const s = sign * Math.sin(angle);
      sumRe += signal[j].re * c - signal[j].im * s;
      sumIm += signal[j].re * s + signal[j].im * c;
    }
    out[k] = { re: sumRe / norm, im: sumIm / norm };
  }
  return out;
}

/**
 * Returns absolute difference of two BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function absDiff(a, b) {
  return a >= b ? a - b : b - a;
}

describe('fourierTransformBigIntIterative', () => {
  describe('exact analytical & normal cases', () => {
    it('exports SCALE = 10n ** 18n', () => {
      assert.equal(SCALE, 10n ** 18n);
    });

    it('computes exact DFT of [1n, 2n, 3n, 4n]', () => {
      // Exact DFT: [10, -2 + 2i, -2, -2 - 2i]
      const out = fourierTransformBigIntIterative([1n, 2n, 3n, 4n]);
      assert.deepEqual(out, [
        { re: 10n * SCALE, im: 0n },
        { re: -2n * SCALE, im: 2n * SCALE },
        { re: -2n * SCALE, im: 0n },
        { re: -2n * SCALE, im: -2n * SCALE },
      ]);
    });

    it('computes exact DFT of unit impulse, DC signal, cosine, and sine', () => {
      // Unit impulse -> flat spectrum of 1
      const impulse = fourierTransformBigIntIterative([1n, 0n, 0n, 0n]);
      assert.deepEqual(impulse, [
        { re: SCALE, im: 0n },
        { re: SCALE, im: 0n },
        { re: SCALE, im: 0n },
        { re: SCALE, im: 0n },
      ]);

      // Constant signal -> all energy in DC bin
      const dc = fourierTransformBigIntIterative([5n, 5n, 5n, 5n]);
      assert.deepEqual(dc, [
        { re: 20n * SCALE, im: 0n },
        { re: 0n, im: 0n },
        { re: 0n, im: 0n },
        { re: 0n, im: 0n },
      ]);

      // Pure cosine [1, 0, -1, 0] -> bins 1 and 3 have real amplitude 2
      const cosSig = fourierTransformBigIntIterative([1n, 0n, -1n, 0n]);
      assert.deepEqual(cosSig, [
        { re: 0n, im: 0n },
        { re: 2n * SCALE, im: 0n },
        { re: 0n, im: 0n },
        { re: 2n * SCALE, im: 0n },
      ]);

      // Pure sine [0, 1, 0, -1] -> bins 1 and 3 have imaginary -2i and +2i
      const sinSig = fourierTransformBigIntIterative([0n, 1n, 0n, -1n]);
      assert.deepEqual(sinSig, [
        { re: 0n, im: 0n },
        { re: 0n, im: -2n * SCALE },
        { re: 0n, im: 0n },
        { re: 0n, im: 2n * SCALE },
      ]);
    });

    it('supports complex { re, im } inputs and mixed real/complex arrays', () => {
      const input = [
        { re: 1n, im: 2n },
        3n,
        { re: -1n, im: 4n },
        { re: 0n, im: -2n },
      ];
      // Hand-computed for N=4 (w = -i):
      // k=0: (1+2i) + 3 + (-1+4i) + (-2i) = 3 + 4i
      // k=1: (1+2i) + 3(-i) + (-1+4i)(-1) + (-2i)(i) = (1+2i) - 3i + (1-4i) + 2 = 4 - 5i
      // k=2: (1+2i) - 3 + (-1+4i) - (-2i) = -3 + 8i
      // k=3: (1+2i) + 3(i) + (-1+4i)(-1) + (-2i)(-i) = (1+2i) + 3i + (1-4i) - 2 = 0 + 1i
      const out = fourierTransformBigIntIterative(input);
      assert.deepEqual(out, [
        { re: 3n * SCALE, im: 4n * SCALE },
        { re: 4n * SCALE, im: -5n * SCALE },
        { re: -3n * SCALE, im: 8n * SCALE },
        { re: 0n, im: 1n * SCALE },
      ]);
    });

    it('achieves exact 10^18 precision on irrational bins (N=3, N=5, N=8)', () => {
      // N = 3, x = [0, 1, 0] -> X[1] = cos(2pi/3) - i*sin(2pi/3) = -1/2 - i*sqrt(3)/2
      const dft3 = fourierTransformBigIntIterative([0n, 1n, 0n]);
      const halfScale = SCALE / 2n;
      const halfSqrt3 = exactScaledSqrt(3n, SCALE) / 2n; // exact to <= 1n
      assert.equal(dft3[0].re, SCALE);
      assert.equal(dft3[0].im, 0n);
      assert.equal(dft3[1].re, -halfScale);
      assert.ok(absDiff(dft3[1].im, -halfSqrt3) <= 1n);
      assert.equal(dft3[2].re, -halfScale);
      assert.ok(absDiff(dft3[2].im, halfSqrt3) <= 1n);

      // N = 8, x = [0, 1, 0, 0, 0, 0, 0, 0] -> X[1] = sqrt(2)/2 - i*sqrt(2)/2
      const dft8 = fourierTransformBigIntIterative([0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]);
      const sqrt2Over2 = exactScaledSqrt(2n, SCALE) / 2n;
      assert.ok(absDiff(dft8[1].re, sqrt2Over2) <= 1n);
      assert.ok(absDiff(dft8[1].im, -sqrt2Over2) <= 1n);

      // N = 5, x = [0, 1, 0, 0, 0] -> X[1].re = cos(2pi/5) = (sqrt(5) - 1) / 4
      const dft5 = fourierTransformBigIntIterative([0n, 1n, 0n, 0n, 0n]);
      const cos72 = (exactScaledSqrt(5n, SCALE) - SCALE) / 4n;
      assert.ok(absDiff(dft5[1].re, cos72) <= 1n);
    });

    it('round-trips forward DFT and inverse DFT (inputScaled: true) accurately', () => {
      const original = [
        { re: 7n, im: -3n },
        { re: -12n, im: 5n },
        { re: 0n, im: 19n },
        { re: 25n, im: 0n },
        { re: -4n, im: -8n },
        { re: 11n, im: 2n },
        { re: -9n, im: 6n },
      ];
      const spectrum = fourierTransformBigIntIterative(original);
      const recovered = fourierTransformBigIntIterative(spectrum, {
        inverse: true,
        inputScaled: true,
      });

      assert.equal(recovered.length, original.length);
      for (let i = 0; i < original.length; i += 1) {
        assert.ok(
          absDiff(recovered[i].re, original[i].re * SCALE) <= 2n,
          `real mismatch at index ${i}`
        );
        assert.ok(
          absDiff(recovered[i].im, original[i].im * SCALE) <= 2n,
          `imag mismatch at index ${i}`
        );
      }
    });
  });

  describe('edge cases & arbitrary-precision BigInt fidelity', () => {
    it('handles empty signal', () => {
      assert.deepEqual(fourierTransformBigIntIterative([]), []);
      assert.deepEqual(fourierTransformBigIntIterative([], { inverse: true }), []);
    });

    it('handles single-element signal', () => {
      assert.deepEqual(fourierTransformBigIntIterative([42n]), [
        { re: 42n * SCALE, im: 0n },
      ]);
      assert.deepEqual(
        fourierTransformBigIntIterative([{ re: -7n, im: 13n }]),
        [{ re: -7n * SCALE, im: 13n * SCALE }]
      );
      assert.deepEqual(
        fourierTransformBigIntIterative([{ re: -7n, im: 13n }], { inverse: true }),
        [{ re: -7n * SCALE, im: 13n * SCALE }]
      );
    });

    it('handles all-zero signals', () => {
      const out = fourierTransformBigIntIterative([
        0n,
        { re: 0n, im: 0n },
        0n,
        0n,
        0n,
      ]);
      assert.deepEqual(out, [
        { re: 0n, im: 0n },
        { re: 0n, im: 0n },
        { re: 0n, im: 0n },
        { re: 0n, im: 0n },
        { re: 0n, im: 0n },
      ]);
    });

    it('preserves full precision on huge BigInts with zero float truncation loss', () => {
      // IEEE-754 float64 completely loses +1n when added to 10^50.
      const big = 10n ** 50n;
      const out = fourierTransformBigIntIterative([big + 1n, big, big, big]);
      assert.deepEqual(out, [
        { re: (4n * big + 1n) * SCALE, im: 0n },
        { re: 1n * SCALE, im: 0n },
        { re: 1n * SCALE, im: 0n },
        { re: 1n * SCALE, im: 0n },
      ]);

      // Huge irrational DFT bin: N = 3, x = [0n, 10n ** 40n, 0n]
      const huge = 10n ** 40n;
      const dftHuge3 = fourierTransformBigIntIterative([0n, huge, 0n]);
      const expectedIm = -exactScaledSqrt(3n, huge * SCALE) / 2n;
      assert.equal(dftHuge3[1].re, -(huge * SCALE) / 2n);
      assert.ok(
        absDiff(dftHuge3[1].im, expectedIm) <= 2n,
        `expected diff <= 2n, got ${absDiff(dftHuge3[1].im, expectedIm)}`
      );
    });

    it('throws TypeError on invalid signal and options inputs', () => {
      assert.throws(() => fourierTransformBigIntIterative(null), TypeError);
      assert.throws(() => fourierTransformBigIntIterative(undefined), TypeError);
      assert.throws(() => fourierTransformBigIntIterative(123), TypeError);
      assert.throws(() => fourierTransformBigIntIterative('123'), TypeError);
      assert.throws(() => fourierTransformBigIntIterative({}), TypeError);

      // Non-BigInt array elements
      assert.throws(() => fourierTransformBigIntIterative([1, 2, 3]), TypeError);
      assert.throws(() => fourierTransformBigIntIterative([1n, '2']), TypeError);
      assert.throws(() => fourierTransformBigIntIterative([null]), TypeError);
      assert.throws(() => fourierTransformBigIntIterative([[]]), TypeError);
      assert.throws(
        () => fourierTransformBigIntIterative([{ re: 1, im: 0n }]),
        TypeError
      );
      assert.throws(
        () => fourierTransformBigIntIterative([{ re: 1n }]),
        TypeError
      );
      assert.throws(
        () => fourierTransformBigIntIterative([{ re: 1n, im: '0' }]),
        TypeError
      );

      // Sparse array hole
      const sparse = new Array(3);
      sparse[0] = 1n;
      sparse[2] = 3n;
      assert.throws(() => fourierTransformBigIntIterative(sparse), TypeError);

      // Invalid options
      assert.throws(() => fourierTransformBigIntIterative([1n], null), TypeError);
      assert.throws(() => fourierTransformBigIntIterative([1n], []), TypeError);
      assert.throws(() => fourierTransformBigIntIterative([1n], 'inv'), TypeError);
      assert.throws(
        () => fourierTransformBigIntIterative([1n], { inverse: 'true' }),
        TypeError
      );
      assert.throws(
        () => fourierTransformBigIntIterative([1n], { inputScaled: 1 }),
        TypeError
      );
    });
  });

  describe('independent cross-checks (Parseval, float DFT, algebraic identities)', () => {
    it("satisfies Parseval's theorem across prime, composite, complex, and huge BigInt signals", () => {
      const testSignals = [
        [3n, -1n, 4n, 1n, -5n, 9n, 2n], // N = 7 (prime, real)
        [
          { re: 2n, im: -3n },
          { re: 5n, im: 7n },
          { re: -11n, im: 13n },
          { re: 17n, im: -19n },
          { re: -23n, im: -29n },
          { re: 31n, im: 37n },
          { re: -41n, im: 43n },
          { re: 47n, im: -53n },
          { re: 59n, im: 61n },
          { re: -67n, im: 71n },
          { re: 73n, im: -79n },
          { re: 83n, im: 89n },
        ], // N = 12 (composite, complex)
        [
          10n ** 25n + 7n,
          -3n * 10n ** 25n + 11n,
          2n * 10n ** 25n - 19n,
          -5n * 10n ** 25n + 23n,
          4n * 10n ** 25n - 29n,
        ], // N = 5 (huge BigInts)
      ];

      for (const sig of testSignals) {
        const nBig = BigInt(sig.length);
        const spectrum = fourierTransformBigIntIterative(sig);

        let timeEnergy = 0n;
        for (const elem of sig) {
          const re = typeof elem === 'bigint' ? elem : elem.re;
          const im = typeof elem === 'bigint' ? 0n : elem.im;
          timeEnergy += re * re + im * im;
        }

        let freqEnergy = 0n;
        for (const bin of spectrum) {
          freqEnergy += bin.re * bin.re + bin.im * bin.im;
        }

        // Parseval: sum |X[k]|^2 = N * SCALE^2 * sum |x[n]|^2
        const expectedFreqEnergy = nBig * SCALE * SCALE * timeEnergy;
        const diff = absDiff(freqEnergy, expectedFreqEnergy);

        // Rounding each bin by <= 1 ULP changes |X[k]|^2 by at most ~2*|X[k]|,
        // so relative error must be < 10^-16 (diff * 10^16 < expectedFreqEnergy).
        assert.ok(
          diff * 10n ** 16n < expectedFreqEnergy,
          `Parseval relative error too large for N=${sig.length}: diff=${diff}, expected=${expectedFreqEnergy}`
        );
      }
    });

    it('matches independent JS floating-point DFT for forward and inverse transforms', () => {
      const complexSignal = [
        { re: 12n, im: -5n },
        { re: -3n, im: 8n },
        { re: 19n, im: 4n },
        { re: 0n, im: -11n },
        { re: -7n, im: 2n },
        { re: 14n, im: 9n },
        { re: -6n, im: -15n },
        { re: 8n, im: 1n },
        { re: -2n, im: 10n },
      ];
      const floatSignal = complexSignal.map(({ re, im }) => ({
        re: Number(re),
        im: Number(im),
      }));

      for (const inverse of [false, true]) {
        const bigIntOut = fourierTransformBigIntIterative(complexSignal, { inverse });
        const floatOut = referenceFloatDft(floatSignal, inverse);
        const scaleNum = Number(SCALE);

        assert.equal(bigIntOut.length, floatOut.length);
        for (let k = 0; k < floatOut.length; k += 1) {
          const gotRe = Number(bigIntOut[k].re) / scaleNum;
          const gotIm = Number(bigIntOut[k].im) / scaleNum;
          assert.ok(
            Math.abs(gotRe - floatOut[k].re) < 1e-12,
            `inverse=${inverse} bin ${k} re mismatch: ${gotRe} vs ${floatOut[k].re}`
          );
          assert.ok(
            Math.abs(gotIm - floatOut[k].im) < 1e-12,
            `inverse=${inverse} bin ${k} im mismatch: ${gotIm} vs ${floatOut[k].im}`
          );
        }
      }
    });

    it('preserves exact conjugate symmetry for real inputs and satisfies linearity', () => {
      const x = [4n, -7n, 13n, 0n, -2n, 9n, -15n, 6n, 11n];
      const y = [-3n, 5n, -8n, 12n, 1n, -6n, 4n, -9n, 2n];
      const a = 5n;
      const b = -3n;

      const X = fourierTransformBigIntIterative(x);
      const Y = fourierTransformBigIntIterative(y);

      // Exact conjugate symmetry for real signals: X[N - k] === conj(X[k])
      const n = x.length;
      assert.equal(X[0].im, 0n);
      for (let k = 1; k < n; k += 1) {
        assert.equal(X[n - k].re, X[k].re);
        assert.equal(X[n - k].im, -X[k].im);
      }

      // Linearity: DFT(a*x + b*y) === a*DFT(x) + b*DFT(y)
      const combined = x.map((xi, i) => a * xi + b * y[i]);
      const Z = fourierTransformBigIntIterative(combined);
      for (let k = 0; k < n; k += 1) {
        assert.ok(absDiff(Z[k].re, a * X[k].re + b * Y[k].re) <= 10n);
        assert.ok(absDiff(Z[k].im, a * X[k].im + b * Y[k].im) <= 10n);
      }
    });

    it('satisfies the circular convolution theorem', () => {
      const x = [2n, -1n, 3n, 5n, -4n, 1n];
      const y = [-3n, 4n, 0n, 2n, -1n, 6n];
      const n = x.length;

      // Direct exact circular convolution
      const conv = new Array(n).fill(0n);
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          conv[(i + j) % n] += x[i] * y[j];
        }
      }

      const X = fourierTransformBigIntIterative(x);
      const Y = fourierTransformBigIntIterative(y);
      const C = fourierTransformBigIntIterative(conv);

      // C[k] === (X[k] * Y[k]) / SCALE
      for (let k = 0; k < n; k += 1) {
        const prodRe = (X[k].re * Y[k].re - X[k].im * Y[k].im) / SCALE;
        const prodIm = (X[k].re * Y[k].im + X[k].im * Y[k].re) / SCALE;
        assert.ok(
          absDiff(C[k].re, prodRe) <= 50n,
          `convolution theorem re mismatch at bin ${k}`
        );
        assert.ok(
          absDiff(C[k].im, prodIm) <= 50n,
          `convolution theorem im mismatch at bin ${k}`
        );
      }
    });
  });
});
