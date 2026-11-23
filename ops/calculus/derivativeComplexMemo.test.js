import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeComplexMemo } from './derivativeComplexMemo.js';

// Complex arithmetic helpers for test functions and analytical derivatives
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a, b) => {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
};
const cExp = ({ re, im }) => {
  const r = Math.exp(re);
  return { re: r * Math.cos(im), im: r * Math.sin(im) };
};
const cSin = ({ re, im }) => ({
  re: Math.sin(re) * Math.cosh(im),
  im: Math.cos(re) * Math.sinh(im),
});
const cCos = ({ re, im }) => ({
  re: Math.cos(re) * Math.cosh(im),
  im: -Math.sin(re) * Math.sinh(im),
});

function assertComplexClose(actual, expected, tol = 1e-9, msg = '') {
  const errRe = Math.abs(actual.re - expected.re);
  const errIm = Math.abs(actual.im - expected.im);
  assert.ok(
    errRe <= tol && errIm <= tol,
    `${msg ? `${msg}: ` : ''}expected (${expected.re}, ${expected.im}) ± ${tol}, got (${actual.re}, ${actual.im}) [errRe=${errRe}, errIm=${errIm}]`,
  );
}

describe('derivativeComplexMemo', () => {
  describe('normal holomorphic functions vs exact analytical derivatives', () => {
    it('differentiates f(z) = z^2 -> 2z', () => {
      const f = (z) => cMul(z, z);
      const points = [
        { re: 3, im: 4 },
        { re: -2.5, im: 1.25 },
        { re: 0, im: 0 },
      ];
      for (const z of points) {
        const expected = { re: 2 * z.re, im: 2 * z.im };
        assertComplexClose(derivativeComplexMemo(f, z), expected, 1e-10, `z^2 at (${z.re},${z.im})`);
      }
    });

    it('differentiates f(z) = z^3 -> 3z^2', () => {
      const f = (z) => cMul(cMul(z, z), z);
      const z = { re: 1.5, im: -2.2 };
      const z2 = cMul(z, z);
      const expected = { re: 3 * z2.re, im: 3 * z2.im };
      assertComplexClose(derivativeComplexMemo(f, z), expected, 1e-9, 'z^3');
    });

    it('differentiates f(z) = exp(z) -> exp(z)', () => {
      const points = [
        { re: 1, im: Math.PI / 3 },
        { re: -0.7, im: 2.1 },
        { re: 0, im: Math.PI },
      ];
      for (const z of points) {
        assertComplexClose(derivativeComplexMemo(cExp, z), cExp(z), 1e-9, `exp(z) at (${z.re},${z.im})`);
      }
    });

    it('differentiates f(z) = sin(z) -> cos(z)', () => {
      const z = { re: 0.8, im: -1.2 };
      assertComplexClose(derivativeComplexMemo(cSin, z), cCos(z), 1e-9, 'sin(z)');
    });

    it('differentiates f(z) = 1/z -> -1/z^2', () => {
      const f = (z) => cDiv({ re: 1, im: 0 }, z);
      const points = [
        { re: 2, im: 3 },
        { re: -1, im: -1 },
      ];
      for (const z of points) {
        const expected = cDiv({ re: -1, im: 0 }, cMul(z, z));
        assertComplexClose(derivativeComplexMemo(f, z), expected, 1e-10, `1/z at (${z.re},${z.im})`);
      }
    });

    it('differentiates composite holomorphic function f(z) = exp(z^2) -> 2z * exp(z^2)', () => {
      const f = (z) => cExp(cMul(z, z));
      const z = { re: 0.6, im: -0.9 };
      const expected = cMul({ re: 2 * z.re, im: 2 * z.im }, cExp(cMul(z, z)));
      assertComplexClose(derivativeComplexMemo(f, z), expected, 1e-9, 'exp(z^2)');
    });
  });

  describe('edge cases and stencil configuration', () => {
    it('returns exact { re: 0, im: 0 } (no -0) for constant functions', () => {
      const f = () => ({ re: 7.25, im: -3.5 });
      const res = derivativeComplexMemo(f, { re: 2, im: -5 });
      assert.deepEqual(res, { re: 0, im: 0 });
      assert.ok(Object.is(res.re, 0));
      assert.ok(Object.is(res.im, 0));
    });

    it('is exact within floating-point precision for linear functions across all orders', () => {
      const a = { re: 3.5, im: -2.25 };
      const b = { re: -4, im: 9 };
      const f = (z) => cAdd(cMul(a, z), b);
      const z = { re: -1.3, im: 2.7 };
      for (const order of [2, 4, 6, 8]) {
        assertComplexClose(derivativeComplexMemo(f, z, { order }), a, 1e-10, `linear order=${order}`);
      }
    });

    it('supports custom step size h and orders 2, 4, 6, 8 with expected convergence hierarchy', () => {
      const z = { re: 0.5, im: 0.7 };
      const exact = cExp(z);
      // Use a deliberately coarse step so truncation error dominates and order hierarchy is visible
      const h = 0.2;
      const err = (order) => {
        const res = derivativeComplexMemo(cExp, z, { order, h });
        return Math.hypot(res.re - exact.re, res.im - exact.im);
      };
      const e2 = err(2);
      const e4 = err(4);
      const e6 = err(6);
      const e8 = err(8);
      assert.ok(e4 < e2 * 1e-2, `expected order 4 (${e4}) << order 2 (${e2})`);
      assert.ok(e6 < e4 * 1e-2, `expected order 6 (${e6}) << order 4 (${e4})`);
      assert.ok(e8 < e6 * 1e-1, `expected order 8 (${e8}) < order 6 (${e6})`);
    });

    it('normalizes -0 in z coordinates consistently', () => {
      let calls = 0;
      const f = (z) => {
        calls += 1;
        return cAdd(cMul(z, z), z);
      };
      const r1 = derivativeComplexMemo(f, { re: -0, im: -0 });
      const callsAfterFirst = calls;
      const r2 = derivativeComplexMemo(f, { re: 0, im: 0 });
      assertComplexClose(r1, { re: 1, im: 0 }, 1e-10);
      assert.deepEqual(r2, r1);
      assert.equal(calls, callsAfterFirst, '-0 and +0 should hit the same cache entry');
    });
  });

  describe('memoization, cache isolation, immutability, and bounded eviction', () => {
    it('caches results per function and avoids recomputation on cache hits', () => {
      let calls = 0;
      const f = (z) => {
        calls += 1;
        return cMul(z, z);
      };
      const z = { re: 4, im: -3 };
      const r1 = derivativeComplexMemo(f, z);
      assert.equal(calls, 4, 'default 4th-order stencil should evaluate fn 4 times on miss');

      const r2 = derivativeComplexMemo(f, z);
      assert.equal(calls, 4, 'second call with identical arguments must hit cache');
      assert.deepEqual(r2, r1);

      // Different options or point should miss cache
      derivativeComplexMemo(f, z, { order: 2 });
      assert.equal(calls, 6, 'order=2 miss should evaluate fn 2 additional times');

      derivativeComplexMemo(f, z, { h: 1e-3 });
      assert.equal(calls, 10, 'different h miss should evaluate fn 4 additional times');

      derivativeComplexMemo(f, { re: 5, im: -3 });
      assert.equal(calls, 14, 'different z miss should evaluate fn 4 additional times');
    });

    it('returns fresh { re, im } objects so caller mutations cannot corrupt cached values', () => {
      let calls = 0;
      const f = (z) => {
        calls += 1;
        return cExp(z);
      };
      const z = { re: 0.25, im: 0.5 };
      const first = derivativeComplexMemo(f, z);
      const snapshot = { re: first.re, im: first.im };

      // Mutate returned object
      first.re = 123456;
      first.im = -654321;

      const second = derivativeComplexMemo(f, z);
      assert.equal(calls, 4, 'should still be a cache hit');
      assert.notEqual(second, first, 'must return a fresh object instance');
      assert.deepEqual(second, snapshot, 'cached result must remain uncorrupted');
    });

    it('isolates caches across distinct function instances', () => {
      const f1 = (z) => cMul({ re: 2, im: 0 }, z);
      const f2 = (z) => cMul({ re: 5, im: 0 }, z);
      const z = { re: 1, im: 1 };
      assertComplexClose(derivativeComplexMemo(f1, z), { re: 2, im: 0 }, 1e-10);
      assertComplexClose(derivativeComplexMemo(f2, z), { re: 5, im: 0 }, 1e-10);
    });

    it('enforces bounded LRU cache eviction beyond 1024 entries', () => {
      let calls = 0;
      const f = (z) => {
        calls += 1;
        return cMul(z, z);
      };

      // Fill cache with 1024 entries (keys i = 0 .. 1023) using order=2 (2 evals per miss)
      for (let i = 0; i < 1024; i += 1) {
        derivativeComplexMemo(f, { re: i, im: 0 }, { order: 2 });
      }
      assert.equal(calls, 1024 * 2);

      // Touch entry 0 to make it most-recently-used; entry 1 is now the oldest
      derivativeComplexMemo(f, { re: 0, im: 0 }, { order: 2 });
      assert.equal(calls, 1024 * 2, 'entry 0 should still be cached');

      // Insert 1025th entry -> should evict entry 1 (least recently used)
      derivativeComplexMemo(f, { re: 2000, im: 0 }, { order: 2 });
      assert.equal(calls, 1025 * 2);

      // Entry 0 should still be cached
      derivativeComplexMemo(f, { re: 0, im: 0 }, { order: 2 });
      assert.equal(calls, 1025 * 2, 'recently touched entry 0 must survive eviction');

      // Entry 1 should have been evicted and recompute
      derivativeComplexMemo(f, { re: 1, im: 0 }, { order: 2 });
      assert.equal(calls, 1026 * 2, 'evicted LRU entry 1 must recompute');
    });
  });

  describe('independent cross-checks (Cauchy-Riemann equations)', () => {
    it('matches independent imaginary-axis difference (f(z+ih) - f(z-ih)) / (2ih) for holomorphic functions', () => {
      const h = 1e-5;
      const independentImagDerivative = (fn, z) => {
        const fPlus = fn({ re: z.re, im: z.im + h });
        const fMinus = fn({ re: z.re, im: z.im - h });
        const diff = cSub(fPlus, fMinus);
        // Divide by 2*i*h: (a + b*i) / (2*i*h) = (b / (2h)) + (-a / (2h))*i
        return { re: diff.im / (2 * h), im: -diff.re / (2 * h) };
      };

      const cases = [
        { name: 'z^3', fn: (z) => cMul(cMul(z, z), z), z: { re: 1.2, im: -0.8 } },
        { name: 'exp(z)', fn: cExp, z: { re: -0.4, im: 1.7 } },
        { name: 'sin(z)', fn: cSin, z: { re: 0.9, im: 0.5 } },
        { name: '1/z', fn: (z) => cDiv({ re: 1, im: 0 }, z), z: { re: -2.1, im: 1.3 } },
      ];

      for (const { name, fn, z } of cases) {
        const viaMemoRe = derivativeComplexMemo(fn, z);
        const viaMemoIm = derivativeComplexMemo(fn, z, { axis: 'im' });
        const viaIndependentIm = independentImagDerivative(fn, z);

        assertComplexClose(viaMemoRe, viaIndependentIm, 1e-8, `Cauchy-Riemann independent check (${name})`);
        assertComplexClose(viaMemoRe, viaMemoIm, 1e-10, `axis='re' vs axis='im' (${name})`);
      }
    });

    it('satisfies partial derivative Cauchy-Riemann identities du/dx = dv/dy and du/dy = -dv/dx', () => {
      const fn = (z) => cExp(cAdd(cMul(z, z), z));
      const z = { re: 0.4, im: -0.6 };
      const h = 1e-6;

      const fxPlus = fn({ re: z.re + h, im: z.im });
      const fxMinus = fn({ re: z.re - h, im: z.im });
      const fyPlus = fn({ re: z.re, im: z.im + h });
      const fyMinus = fn({ re: z.re, im: z.im - h });

      const dudx = (fxPlus.re - fxMinus.re) / (2 * h);
      const dvdx = (fxPlus.im - fxMinus.im) / (2 * h);
      const dudy = (fyPlus.re - fyMinus.re) / (2 * h);
      const dvdy = (fyPlus.im - fyMinus.im) / (2 * h);

      const deriv = derivativeComplexMemo(fn, z);
      assert.ok(Math.abs(dudx - dvdy) < 1e-7, 'du/dx == dv/dy');
      assert.ok(Math.abs(dudy + dvdx) < 1e-7, 'du/dy == -dv/dx');
      assertComplexClose(deriv, { re: dudx, im: dvdx }, 1e-7, 'matches du/dx + i dv/dx');
      assertComplexClose(deriv, { re: dvdy, im: -dudy }, 1e-7, 'matches dv/dy - i du/dy');
    });
  });

  describe('input and output validation', () => {
    const id = (z) => z;

    it('rejects non-function fn', () => {
      for (const badFn of [null, undefined, 42, 'fn', {}]) {
        assert.throws(() => derivativeComplexMemo(badFn, { re: 0, im: 0 }), TypeError);
      }
    });

    it('rejects invalid z types and non-finite coordinates', () => {
      for (const badZ of [null, undefined, 5, '1+i', {}, { re: 1 }, { re: '1', im: 0 }]) {
        assert.throws(() => derivativeComplexMemo(id, badZ), TypeError);
      }
      for (const nonFiniteZ of [
        { re: Number.NaN, im: 0 },
        { re: 0, im: Number.NaN },
        { re: Infinity, im: 0 },
        { re: 0, im: -Infinity },
      ]) {
        assert.throws(() => derivativeComplexMemo(id, nonFiniteZ), RangeError);
      }
    });

    it('rejects invalid options object, order, h, and axis', () => {
      for (const badOpts of [null, 123, 'opts', []]) {
        assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, badOpts), TypeError);
      }
      assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, { order: '4' }), TypeError);
      for (const badOrder of [0, 1, 3, 5, 10, Number.NaN]) {
        assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, { order: badOrder }), RangeError);
      }
      assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, { h: '1e-4' }), TypeError);
      for (const badH of [0, -1e-4, Number.NaN, Infinity, -Infinity]) {
        assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, { h: badH }), RangeError);
      }
      assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, { axis: 1 }), TypeError);
      assert.throws(() => derivativeComplexMemo(id, { re: 0, im: 0 }, { axis: 'diag' }), RangeError);
    });

    it('rejects invalid or non-finite return values from fn', () => {
      assert.throws(() => derivativeComplexMemo(() => null, { re: 0, im: 0 }), TypeError);
      assert.throws(() => derivativeComplexMemo(() => ({ re: 'a', im: 0 }), { re: 0, im: 0 }), TypeError);
      assert.throws(() => derivativeComplexMemo(() => ({ re: Number.NaN, im: 0 }), { re: 0, im: 0 }), RangeError);
      assert.throws(() => derivativeComplexMemo(() => ({ re: Infinity, im: 0 }), { re: 0, im: 0 }), RangeError);
    });
  });
});
