import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { powerComplexMemo } from './powerComplexMemo.js';

/**
 * Helper to assert two complex numbers are within `tol` on both real and imaginary parts.
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [tol=1e-12]
 */
function assertComplexClose(actual, expected, tol = 1e-12) {
  assert.ok(
    Math.abs(actual.re - expected.re) <= tol,
    `Expected re ≈ ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`,
  );
  assert.ok(
    Math.abs(actual.im - expected.im) <= tol,
    `Expected im ≈ ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`,
  );
}

/**
 * Independent reference complex multiplication: (a + bi)(c + di).
 */
function mulComplex(z1, z2) {
  return {
    re: z1.re * z2.re - z1.im * z2.im,
    im: z1.re * z2.im + z1.im * z2.re,
  };
}

/**
 * Independent direct polar reference implementation of z^w = exp(w * Log(z)).
 */
function referenceComplexPow(z, w) {
  const r = Math.hypot(z.re, z.im);
  const theta = Math.atan2(z.im, z.re);
  const lnR = Math.log(r);
  const u = w.re * lnR - w.im * theta;
  const v = w.im * lnR + w.re * theta;
  const mag = Math.exp(u);
  return { re: mag * Math.cos(v), im: mag * Math.sin(v) };
}

describe('powerComplexMemo', () => {
  describe('normal cases and precomputed table values', () => {
    it('computes real powers embedded in complex numbers', () => {
      assert.deepEqual(powerComplexMemo({ re: 2, im: 0 }, { re: 3, im: 0 }), { re: 8, im: 0 });
      assert.deepEqual(powerComplexMemo({ re: 5, im: 0 }, { re: 0, im: 0 }), { re: 1, im: 0 });
      assert.deepEqual(powerComplexMemo({ re: 2, im: 0 }, { re: -2, im: 0 }), { re: 0.25, im: 0 });
      assertComplexClose(powerComplexMemo({ re: 9, im: 0 }, { re: 0.5, im: 0 }), { re: 3, im: 0 });
    });

    it('uses exact precomputed tables for powers of i, -i, and -1', () => {
      const i = { re: 0, im: 1 };
      const negI = { re: 0, im: -1 };
      const negOne = { re: -1, im: 0 };

      // Powers of i across positive and negative cycles
      assert.deepEqual(powerComplexMemo(i, { re: 0, im: 0 }), { re: 1, im: 0 });
      assert.deepEqual(powerComplexMemo(i, { re: 1, im: 0 }), { re: 0, im: 1 });
      assert.deepEqual(powerComplexMemo(i, { re: 2, im: 0 }), { re: -1, im: 0 });
      assert.deepEqual(powerComplexMemo(i, { re: 3, im: 0 }), { re: 0, im: -1 });
      assert.deepEqual(powerComplexMemo(i, { re: 4, im: 0 }), { re: 1, im: 0 });
      assert.deepEqual(powerComplexMemo(i, { re: -1, im: 0 }), { re: 0, im: -1 });
      assert.deepEqual(powerComplexMemo(i, { re: -3, im: 0 }), { re: 0, im: 1 });
      assert.deepEqual(powerComplexMemo(i, { re: 1000003, im: 0 }), { re: 0, im: -1 });

      // Powers of -i
      assert.deepEqual(powerComplexMemo(negI, { re: 1, im: 0 }), { re: 0, im: -1 });
      assert.deepEqual(powerComplexMemo(negI, { re: 2, im: 0 }), { re: -1, im: 0 });
      assert.deepEqual(powerComplexMemo(negI, { re: 3, im: 0 }), { re: 0, im: 1 });
      assert.deepEqual(powerComplexMemo(negI, { re: -1, im: 0 }), { re: 0, im: 1 });

      // Integer powers of -1
      assert.deepEqual(powerComplexMemo(negOne, { re: 2, im: 0 }), { re: 1, im: 0 });
      assert.deepEqual(powerComplexMemo(negOne, { re: 3, im: 0 }), { re: -1, im: 0 });
      assert.deepEqual(powerComplexMemo(negOne, { re: -5, im: 0 }), { re: -1, im: 0 });
      assert.deepEqual(powerComplexMemo(negOne, { re: -6, im: 0 }), { re: 1, im: 0 });
    });

    it('computes precomputed iconic complex identities accurately', () => {
      // (-1)^0.5 = i, (-1)^-0.5 = -i
      assert.deepEqual(powerComplexMemo({ re: -1, im: 0 }, { re: 0.5, im: 0 }), { re: 0, im: 1 });
      assert.deepEqual(powerComplexMemo({ re: -1, im: 0 }, { re: -0.5, im: 0 }), { re: 0, im: -1 });

      // i^i = e^(-pi/2)
      assertComplexClose(
        powerComplexMemo({ re: 0, im: 1 }, { re: 0, im: 1 }),
        { re: Math.exp(-Math.PI / 2), im: 0 },
        1e-15,
      );

      // (-i)^i = e^(pi/2)
      assertComplexClose(
        powerComplexMemo({ re: 0, im: -1 }, { re: 0, im: 1 }),
        { re: Math.exp(Math.PI / 2), im: 0 },
        1e-15,
      );

      // (-1)^i = e^(-pi)
      assertComplexClose(
        powerComplexMemo({ re: -1, im: 0 }, { re: 0, im: 1 }),
        { re: Math.exp(-Math.PI), im: 0 },
        1e-15,
      );

      // sqrt(i) = (1 + i) / sqrt(2)
      assertComplexClose(
        powerComplexMemo({ re: 0, im: 1 }, { re: 0.5, im: 0 }),
        { re: Math.SQRT1_2, im: Math.SQRT1_2 },
        1e-15,
      );

      // Euler's identity: e^(i*pi) = -1
      assertComplexClose(
        powerComplexMemo({ re: Math.E, im: 0 }, { re: 0, im: Math.PI }),
        { re: -1, im: 0 },
        1e-14,
      );
    });

    it('computes exact small integer powers of Gaussian integers', () => {
      assert.deepEqual(powerComplexMemo({ re: 1, im: 1 }, { re: 2, im: 0 }), { re: 0, im: 2 });
      assert.deepEqual(powerComplexMemo({ re: 1, im: 1 }, { re: 4, im: 0 }), { re: -4, im: 0 });
      assert.deepEqual(powerComplexMemo({ re: 2, im: 3 }, { re: 2, im: 0 }), { re: -5, im: 12 });
      assert.deepEqual(powerComplexMemo({ re: 1, im: 1 }, { re: -2, im: 0 }), { re: 0, im: -0.5 });
    });

    it('computes principal roots and general complex exponents', () => {
      // (3 + 4i)^0.5 = 2 + i
      assertComplexClose(powerComplexMemo({ re: 3, im: 4 }, { re: 0.5, im: 0 }), { re: 2, im: 1 });
      // (-3 + 4i)^0.5 = 1 + 2i
      assertComplexClose(powerComplexMemo({ re: -3, im: 4 }, { re: 0.5, im: 0 }), { re: 1, im: 2 });
      // (1 + i)^(1 - i)
      const ln2Half = 0.5 * Math.LN2;
      const u = ln2Half + Math.PI / 4;
      const v = -ln2Half + Math.PI / 4;
      assertComplexClose(
        powerComplexMemo({ re: 1, im: 1 }, { re: 1, im: -1 }),
        { re: Math.exp(u) * Math.cos(v), im: Math.exp(u) * Math.sin(v) },
      );
    });
  });

  describe('edge cases and memoization behavior', () => {
    it('handles zero base conventions correctly', () => {
      assert.deepEqual(powerComplexMemo({ re: 0, im: 0 }, { re: 0, im: 0 }), { re: 1, im: 0 });
      assert.deepEqual(powerComplexMemo({ re: 0, im: 0 }, { re: 3, im: 0 }), { re: 0, im: 0 });
      assert.deepEqual(powerComplexMemo({ re: 0, im: 0 }, { re: 0.5, im: -7 }), { re: 0, im: 0 });

      assert.throws(() => powerComplexMemo({ re: 0, im: 0 }, { re: -1, im: 0 }), RangeError);
      assert.throws(() => powerComplexMemo({ re: 0, im: 0 }, { re: -0.1, im: 2 }), RangeError);
      assert.throws(() => powerComplexMemo({ re: 0, im: 0 }, { re: 0, im: 1 }), RangeError);
      assert.throws(() => powerComplexMemo({ re: 0, im: 0 }, { re: 0, im: -2 }), RangeError);
    });

    it('handles base 1 for arbitrary complex exponents', () => {
      assert.deepEqual(powerComplexMemo({ re: 1, im: 0 }, { re: 42, im: -99 }), { re: 1, im: 0 });
      assert.deepEqual(powerComplexMemo({ re: 1, im: 0 }, { re: 0, im: 1e6 }), { re: 1, im: 0 });
    });

    it('normalizes -0 inputs and never returns -0 components', () => {
      const res1 = powerComplexMemo({ re: -1, im: -0 }, { re: 0.5, im: -0 });
      assert.deepEqual(res1, { re: 0, im: 1 });
      assert.equal(Object.is(res1.re, -0), false);
      assert.equal(Object.is(res1.im, -0), false);

      const res2 = powerComplexMemo({ re: 1, im: 1 }, { re: 2, im: -0 });
      assert.equal(Object.is(res2.re, -0), false);
      assert.equal(Object.is(res2.im, -0), false);
    });

    it('handles extreme magnitudes without spurious hypot overflow or underflow', () => {
      // (1e308 + 1e308i)^0.5 would overflow naive Math.hypot(1e308, 1e308)
      const largeRoot = powerComplexMemo({ re: 1e308, im: 1e308 }, { re: 0.5, im: 0 });
      const expectedMag = Math.sqrt(1e308 * Math.SQRT2);
      assertComplexClose(
        largeRoot,
        { re: expectedMag * Math.cos(Math.PI / 8), im: expectedMag * Math.sin(Math.PI / 8) },
        expectedMag * 1e-14,
      );

      // Underflows cleanly to 0 + 0i
      assert.deepEqual(powerComplexMemo({ re: 1e200, im: 0 }, { re: -2, im: 0 }), { re: 0, im: 0 });

      // True overflow throws RangeError
      assert.throws(() => powerComplexMemo({ re: 1e200, im: 0 }, { re: 10, im: 0 }), RangeError);
      assert.throws(() => powerComplexMemo({ re: 0, im: 1 }, { re: 0, im: -1000 }), RangeError);
    });

    it('returns defensive copies so mutating a result cannot corrupt memoized cache', () => {
      const z = { re: 2.3, im: -1.7 };
      const w = { re: 1.4, im: 0.8 };
      const first = powerComplexMemo(z, w);
      const snapshot = { re: first.re, im: first.im };

      // Mutate returned object and inputs
      first.re = 999999;
      first.im = -999999;

      const second = powerComplexMemo(z, w);
      assert.notStrictEqual(first, second);
      assert.deepEqual(second, snapshot);
    });

    it('handles LRU cache eviction smoothly beyond 4096 distinct entries', () => {
      const z = { re: 1.1, im: 0.2 };
      const firstVal = powerComplexMemo(z, { re: 0.0001, im: 0.0001 });
      for (let k = 1; k <= 4200; k += 1) {
        const res = powerComplexMemo(z, { re: k * 0.0001, im: k * 0.0001 });
        assert.ok(Number.isFinite(res.re) && Number.isFinite(res.im));
      }
      // Re-evaluating the evicted key produces the exact same value
      assert.deepEqual(powerComplexMemo(z, { re: 0.0001, im: 0.0001 }), firstVal);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-object or malformed inputs', () => {
      const valid = { re: 1, im: 1 };
      const badTypes = [null, undefined, 42, '1+i', true, [1, 2], {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }];

      for (const bad of badTypes) {
        assert.throws(() => powerComplexMemo(bad, valid), TypeError);
        assert.throws(() => powerComplexMemo(valid, bad), TypeError);
      }
    });

    it('throws RangeError for non-finite components (NaN, Infinity, -Infinity)', () => {
      const valid = { re: 2, im: 1 };
      const nonFinite = [
        { re: Number.NaN, im: 0 },
        { re: 0, im: Number.NaN },
        { re: Number.POSITIVE_INFINITY, im: 0 },
        { re: 0, im: Number.NEGATIVE_INFINITY },
      ];

      for (const bad of nonFinite) {
        assert.throws(() => powerComplexMemo(bad, valid), RangeError);
        assert.throws(() => powerComplexMemo(valid, bad), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches independent direct polar reference across all four quadrants', () => {
      const bases = [
        { re: 2.5, im: 1.5 },
        { re: -2.5, im: 1.5 },
        { re: -2.5, im: -1.5 },
        { re: 2.5, im: -1.5 },
        { re: 0.3, im: -0.7 },
      ];
      const exponents = [
        { re: 0.7, im: 0.3 },
        { re: -1.2, im: 2.1 },
        { re: 3.5, im: -0.4 },
        { re: 0, im: 2.5 },
      ];

      for (const z of bases) {
        for (const w of exponents) {
          assertComplexClose(powerComplexMemo(z, w), referenceComplexPow(z, w), 1e-11);
        }
      }
    });

    it('satisfies algebraic power identities: z^w * z^(-w) = 1 and z^(w1+w2) = z^w1 * z^w2', () => {
      const z = { re: -1.5, im: 2.2 };
      const w1 = { re: 0.8, im: -0.6 };
      const w2 = { re: -0.3, im: 1.1 };

      // z^w1 * z^(-w1) == 1
      const pw = powerComplexMemo(z, w1);
      const pNegW = powerComplexMemo(z, { re: -w1.re, im: -w1.im });
      assertComplexClose(mulComplex(pw, pNegW), { re: 1, im: 0 }, 1e-12);

      // z^(w1 + w2) == z^w1 * z^w2 (holds identically on the principal branch)
      const lhs = powerComplexMemo(z, { re: w1.re + w2.re, im: w1.im + w2.im });
      const rhs = mulComplex(powerComplexMemo(z, w1), powerComplexMemo(z, w2));
      assertComplexClose(lhs, rhs, 1e-11);
    });

    it('satisfies (z^(1/k))^k = z for principal k-th roots', () => {
      const z = { re: -2, im: 5 };
      for (const k of [2, 3, 4, 5, 7]) {
        const root = powerComplexMemo(z, { re: 1 / k, im: 0 });
        let acc = { re: 1, im: 0 };
        for (let j = 0; j < k; j += 1) {
          acc = mulComplex(acc, root);
        }
        assertComplexClose(acc, z, 1e-11);
      }
    });

    it('matches iterative complex multiplication for positive integer exponents', () => {
      const z = { re: 1.2, im: -0.9 };
      let expected = { re: 1, im: 0 };
      for (let n = 1; n <= 12; n += 1) {
        expected = mulComplex(expected, z);
        assertComplexClose(powerComplexMemo(z, { re: n, im: 0 }), expected, 1e-11);
      }
    });
  });
});
