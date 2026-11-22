import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10DualIterative } from './log10DualIterative.js';

function assertClose(actual, expected, relTol = 1e-13, absTol = 1e-14, label = '') {
  const diff = Math.abs(actual - expected);
  const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
  assert.ok(
    diff <= tol,
    `${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
  );
}

describe('log10DualIterative', () => {
  describe('normal cases', () => {
    it('evaluates exact and standard powers of 10 with unit derivative', () => {
      const cases = [
        [1e-6, -6],
        [0.001, -3],
        [0.01, -2],
        [0.1, -1],
        [1, 0],
        [10, 1],
        [100, 2],
        [1000, 3],
        [1e6, 6],
      ];

      for (const [v, expectedV] of cases) {
        const res = log10DualIterative({ v, d: 1 });
        assertClose(res.v, expectedV, 1e-14, 1e-14, `v=${v}`);
        assertClose(res.d, 1 / (v * Math.LN10), 1e-14, 1e-14, `d for v=${v}`);
      }
    });

    it('handles arbitrary positive, negative, and zero tangent components', () => {
      const inputs = [
        { v: 2.5, d: 0 },
        { v: 2.5, d: 3.7 },
        { v: 2.5, d: -4.2 },
        { v: Math.E, d: Math.PI },
        { v: Math.PI, d: -Math.SQRT2 },
        { v: 0.5, d: 2 },
        { v: 2, d: 0.5 },
        { v: Math.SQRT1_2, d: 1.5 },
        { v: Math.SQRT2, d: -1.5 },
      ];

      for (const x of inputs) {
        const res = log10DualIterative(x);
        assertClose(res.v, Math.log10(x.v), 1e-14, 1e-14, `value for v=${x.v}`);
        assertClose(res.d, x.d / (x.v * Math.LN10), 1e-14, 1e-14, `deriv for v=${x.v}, d=${x.d}`);
      }
    });

    it('maintains accuracy very close to v = 1 without catastrophic cancellation', () => {
      const epsilons = [1e-12, -1e-12, 1e-9, -1e-9, 1e-6, -1e-6];
      for (const eps of epsilons) {
        const v = 1 + eps;
        const res = log10DualIterative({ v, d: 1 });
        const expectedV = Math.log1p(eps) / Math.LN10;
        const expectedD = 1 / (v * Math.LN10);
        assertClose(res.v, expectedV, 1e-12, 1e-16, `near-1 value eps=${eps}`);
        assertClose(res.d, expectedD, 1e-14, 1e-14, `near-1 deriv eps=${eps}`);
      }
    });

    it('does not mutate the input object and returns a new dual object', () => {
      const input = Object.freeze({ v: 10, d: 2 });
      const res = log10DualIterative(input);
      assert.notStrictEqual(res, input);
      assert.deepStrictEqual(Object.keys(res).sort(), ['d', 'v']);
      assertClose(res.v, 1, 1e-14, 1e-14);
      assertClose(res.d, 2 / (10 * Math.LN10), 1e-14, 1e-14);
    });
  });

  describe('edge cases across extreme IEEE-754 scales', () => {
    it('handles very large and very small positive values including subnormals', () => {
      const values = [1e-300, 1e-100, 1e100, 1e300, Number.MAX_VALUE, Number.MIN_VALUE];
      for (const v of values) {
        const res = log10DualIterative({ v, d: v });
        assertClose(res.v, Math.log10(v), 1e-13, 1e-13, `extreme v=${v}`);
        assertClose(res.d, 1 / Math.LN10, 1e-13, 1e-13, `extreme d/v=1 for v=${v}`);
      }
    });

    it('avoids spurious intermediate overflow and underflow in derivative scaling', () => {
      // d / (v * ln10) ≈ 4.342944819032518e+307 (finite, even though d/v * m would overflow if unscaled)
      const nearMaxDeriv = log10DualIterative({ v: 1e-300, d: 1e8 });
      assert.ok(Number.isFinite(nearMaxDeriv.d), 'expected finite derivative near Number.MAX_VALUE');
      assertClose(nearMaxDeriv.v, -300, 1e-13, 1e-13);
      assertClose(nearMaxDeriv.d, 1e308 / Math.LN10, 1e-13, 1e-13);

      // Subnormal v and d at k = -1 should not prematurely underflow to 0
      const smallSubnormal = log10DualIterative({ v: 0.5, d: Number.MIN_VALUE });
      assertClose(smallSubnormal.v, Math.log10(0.5), 1e-14, 1e-14);
      assert.ok(smallSubnormal.d > 0, 'expected positive subnormal derivative');

      // Zero and negative zero derivatives
      const zeroD = log10DualIterative({ v: 10, d: 0 });
      assert.strictEqual(zeroD.d, 0);
      const negZeroD = log10DualIterative({ v: 10, d: -0 });
      assert.ok(Object.is(negZeroD.d, -0));
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-object or malformed dual inputs', () => {
      const invalidInputs = [null, undefined, 10, '10', true, [10, 1], () => ({ v: 10, d: 1 })];
      for (const bad of invalidInputs) {
        assert.throws(() => log10DualIterative(bad), TypeError);
      }
    });

    it('throws TypeError when v or d is not a number', () => {
      const badShapes = [
        {},
        { v: 10 },
        { d: 1 },
        { v: '10', d: 1 },
        { v: 10, d: '1' },
        { v: 10n, d: 1 },
        { v: 10, d: null },
      ];
      for (const bad of badShapes) {
        assert.throws(() => log10DualIterative(bad), TypeError);
      }
    });

    it('throws RangeError for non-finite v or d', () => {
      const nonFinite = [
        { v: NaN, d: 1 },
        { v: 10, d: NaN },
        { v: Infinity, d: 1 },
        { v: -Infinity, d: 1 },
        { v: 10, d: Infinity },
        { v: 10, d: -Infinity },
      ];
      for (const bad of nonFinite) {
        assert.throws(() => log10DualIterative(bad), RangeError);
      }
    });

    it('throws RangeError for domain violations v <= 0', () => {
      const nonPositive = [
        { v: 0, d: 1 },
        { v: -0, d: 1 },
        { v: -1, d: 1 },
        { v: -1e-300, d: 0 },
        { v: -Number.MAX_VALUE, d: 2 },
      ];
      for (const bad of nonPositive) {
        assert.throws(() => log10DualIterative(bad), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches Math.log10(v), analytic derivative, and central finite differences', () => {
      const testPoints = [
        { v: 0.037, d: 1.9 },
        { v: 0.25, d: -3.1 },
        { v: 0.71, d: 0.4 },
        { v: 1.0, d: 2.5 },
        { v: 1.37, d: -0.8 },
        { v: 4.2, d: 5.5 },
        { v: 17.8, d: -2.2 },
        { v: 1234.567, d: 11.3 },
        { v: 9.87654321e7, d: -42.5 },
      ];

      for (const { v, d } of testPoints) {
        const res = log10DualIterative({ v, d });

        // 1. Cross-check against Math.log10 and analytic derivative
        assertClose(res.v, Math.log10(v), 1e-14, 1e-14, `Math.log10 v=${v}`);
        assertClose(res.d, d / (v * Math.LN10), 1e-14, 1e-14, `analytic d for v=${v}`);

        // 2. Cross-check derivative against central finite difference
        const h = v * 1e-6;
        const fdDeriv = ((Math.log10(v + h) - Math.log10(v - h)) / (2 * h)) * d;
        assertClose(res.d, fdDeriv, 1e-8, 1e-10, `central FD for v=${v}`);
      }
    });

    it('satisfies the dual logarithm product law log10(x * y) = log10(x) + log10(y)', () => {
      const pairs = [
        [{ v: 2.3, d: 1.1 }, { v: 7.9, d: -0.4 }],
        [{ v: 0.05, d: 0.3 }, { v: 400, d: 12.5 }],
        [{ v: Math.PI, d: 2 }, { v: Math.E, d: -3 }],
      ];

      for (const [a, b] of pairs) {
        const prod = { v: a.v * b.v, d: a.v * b.d + a.d * b.v };
        const lhs = log10DualIterative(prod);
        const la = log10DualIterative(a);
        const lb = log10DualIterative(b);
        const rhs = { v: la.v + lb.v, d: la.d + lb.d };

        assertClose(lhs.v, rhs.v, 1e-13, 1e-13, 'product law value');
        assertClose(lhs.d, rhs.d, 1e-13, 1e-13, 'product law derivative');
      }
    });

    it('propagates forward-mode chain rule for composed polynomial g(t) = log10(t^3 + 2t + 1)', () => {
      const f = (t) => t * t * t + 2 * t + 1;
      const df = (t) => 3 * t * t + 2;

      for (const t of [0.25, 1.5, 4.0, 10.0]) {
        const res = log10DualIterative({ v: f(t), d: df(t) });
        const h = 1e-6;
        const fd = (Math.log10(f(t + h)) - Math.log10(f(t - h))) / (2 * h);

        assertClose(res.v, Math.log10(f(t)), 1e-14, 1e-14, `chain value t=${t}`);
        assertClose(res.d, df(t) / (f(t) * Math.LN10), 1e-14, 1e-14, `chain analytic t=${t}`);
        assertClose(res.d, fd, 1e-8, 1e-10, `chain FD t=${t}`);
      }
    });
  });
});
