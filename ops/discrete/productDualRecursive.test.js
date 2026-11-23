import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productDualRecursive } from './productDualRecursive.js';

function assertClose(actual, expected, tol = 1e-10, label = '') {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    diff <= tol * scale,
    `${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
  );
}

describe('productDualRecursive', () => {
  describe('normal cases', () => {
    it('multiplies two dual numbers via the product rule', () => {
      // (2 + 3e)(4 + 5e) = 8 + (2*5 + 3*4)e = 8 + 22e
      const res = productDualRecursive([
        { v: 2, d: 3 },
        { v: 4, d: 5 },
      ]);
      assert.deepStrictEqual(res, { v: 8, d: 22 });
    });

    it('multiplies an odd number of dual numbers', () => {
      // (1 + 2e)(3 + 4e)(5 + 6e)
      // v = 1 * 3 * 5 = 15
      // d = 2*3*5 + 1*4*5 + 1*3*6 = 30 + 20 + 18 = 68
      const res = productDualRecursive([
        { v: 1, d: 2 },
        { v: 3, d: 4 },
        { v: 5, d: 6 },
      ]);
      assert.deepStrictEqual(res, { v: 15, d: 68 });
    });

    it('multiplies a power-of-two count of dual numbers with mixed signs', () => {
      // (-2 + 1e)(3 - 2e)(-1 + 4e)(5 + 0.5e)
      // v = (-2)*(3)*(-1)*(5) = 30
      // d = 1*(3)(-1)(5) + (-2)(-2)(-1)(5) + (-2)(3)(4)(5) + (-2)(3)(-1)(0.5)
      //   = -15 + (-20) + (-120) + 3 = -152
      const res = productDualRecursive([
        { v: -2, d: 1 },
        { v: 3, d: -2 },
        { v: -1, d: 4 },
        { v: 5, d: 0.5 },
      ]);
      assert.deepStrictEqual(res, { v: 30, d: -152 });
    });

    it('computes the derivative of x^n as n*x^(n-1)', () => {
      const x = 2.5;
      const n = 7;
      const factors = Array.from({ length: n }, () => ({ v: x, d: 1 }));
      const res = productDualRecursive(factors);
      assertClose(res.v, x ** n, 1e-12, 'value');
      assertClose(res.d, n * x ** (n - 1), 1e-12, 'derivative');
    });

    it('does not mutate inputs and returns a fresh object', () => {
      const item = { v: 3, d: -7 };
      const input = [item];
      const res = productDualRecursive(input);
      assert.deepStrictEqual(res, { v: 3, d: -7 });
      assert.notStrictEqual(res, item);
      res.v = 999;
      assert.strictEqual(item.v, 3);
    });
  });

  describe('edge cases', () => {
    it('returns multiplicative identity { v: 1, d: 0 } for empty array', () => {
      assert.deepStrictEqual(productDualRecursive([]), { v: 1, d: 0 });
    });

    it('returns matching { v, d } for a single element', () => {
      assert.deepStrictEqual(productDualRecursive([{ v: -4.25, d: 9.5 }]), { v: -4.25, d: 9.5 });
    });

    it('handles a single zero-valued factor accurately without division by zero', () => {
      // (3 + 2e)(0 + 5e)(-4 + 7e)
      // v = 0, d = 5 * 3 * (-4) = -60
      const res = productDualRecursive([
        { v: 3, d: 2 },
        { v: 0, d: 5 },
        { v: -4, d: 7 },
      ]);
      assert.deepStrictEqual(res, { v: 0, d: -60 });
    });

    it('handles multiple zero-valued factors', () => {
      const res = productDualRecursive([
        { v: 0, d: 4 },
        { v: 7, d: 2 },
        { v: 0, d: -3 },
        { v: 5, d: 1 },
      ]);
      assert.deepStrictEqual(res, { v: 0, d: 0 });
    });

    it('handles constant factors (all derivatives zero)', () => {
      const res = productDualRecursive([
        { v: 2, d: 0 },
        { v: -3, d: 0 },
        { v: 5, d: 0 },
      ]);
      assert.deepStrictEqual(res, { v: -30, d: 0 });
    });

    it('normalizes signed -0 to +0', () => {
      const res = productDualRecursive([
        { v: 0, d: 1 },
        { v: -5, d: 0 },
      ]);
      assert.ok(Object.is(res.v, 0));
      assert.strictEqual(res.d, -5);
    });

    it('handles large inputs efficiently with O(log n) recursion depth', () => {
      // Product of 1000 copies of (1 + (1/1000)*e):
      // v = 1^1000 = 1, d = 1000 * (1/1000) * 1^999 = 1
      const n = 1000;
      const factors = Array.from({ length: n }, () => ({ v: 1, d: 1 / n }));
      const res = productDualRecursive(factors);
      assert.strictEqual(res.v, 1);
      assertClose(res.d, 1, 1e-12, 'large-n derivative');
    });
  });

  describe('input validation', () => {
    it('throws TypeError when input is not an array', () => {
      for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 2 }, true]) {
        assert.throws(() => productDualRecursive(bad), TypeError);
      }
    });

    it('throws TypeError for invalid element types or sparse arrays', () => {
      for (const badElem of [null, undefined, 1, '1', [1, 2], true]) {
        assert.throws(() => productDualRecursive([{ v: 1, d: 0 }, badElem]), TypeError);
      }
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [{ v: 1, d: 0 }, , { v: 2, d: 1 }];
      assert.throws(() => productDualRecursive(sparse), TypeError);
    });

    it('throws TypeError when v or d is missing or non-numeric', () => {
      assert.throws(() => productDualRecursive([{ v: 1 }]), TypeError);
      assert.throws(() => productDualRecursive([{ d: 1 }]), TypeError);
      assert.throws(() => productDualRecursive([{ v: '1', d: 2 }]), TypeError);
      assert.throws(() => productDualRecursive([{ v: 1, d: null }]), TypeError);
    });

    it('throws RangeError when v or d is non-finite', () => {
      assert.throws(() => productDualRecursive([{ v: NaN, d: 1 }]), RangeError);
      assert.throws(() => productDualRecursive([{ v: 1, d: NaN }]), RangeError);
      assert.throws(() => productDualRecursive([{ v: Infinity, d: 1 }]), RangeError);
      assert.throws(() => productDualRecursive([{ v: 1, d: -Infinity }]), RangeError);
    });
  });

  describe('independent cross-checks', () => {
    it('matches the logarithmic derivative identity for non-zero factors', () => {
      const duals = [
        { v: 1.7, d: -0.4 },
        { v: -2.3, d: 1.1 },
        { v: 0.85, d: 0.3 },
        { v: 4.2, d: -2.5 },
        { v: -0.6, d: -0.9 },
        { v: 3.14, d: 0.25 },
        { v: 1.11, d: 0.77 },
      ];

      const res = productDualRecursive(duals);
      const expectedV = duals.reduce((acc, x) => acc * x.v, 1);
      const logDerivSum = duals.reduce((acc, x) => acc + x.d / x.v, 0);
      const expectedD = expectedV * logDerivSum;

      assertClose(res.v, expectedV, 1e-12, 'log-deriv value');
      assertClose(res.d, expectedD, 1e-12, 'log-deriv derivative');
    });

    it('matches central finite differences of a smooth product function', () => {
      const fns = [
        { f: (t) => Math.sin(t) + 2, df: (t) => Math.cos(t) },
        { f: (t) => Math.exp(0.3 * t), df: (t) => 0.3 * Math.exp(0.3 * t) },
        { f: (t) => t * t - 1, df: (t) => 2 * t }, // vanishes at t = 1!
        { f: (t) => Math.cos(2 * t) + 3, df: (t) => -2 * Math.sin(2 * t) },
        { f: (t) => Math.log(t + 5), df: (t) => 1 / (t + 5) },
      ];

      const evalProduct = (t) => fns.reduce((acc, { f }) => acc * f(t), 1);
      const h = 1e-6;

      // Includes t = 1 where factor (t^2 - 1) is identically zero
      for (const t of [-1.25, 0, 0.7, 1, 2.3]) {
        const duals = fns.map(({ f, df }) => ({ v: f(t), d: df(t) }));
        const res = productDualRecursive(duals);
        const expectedV = evalProduct(t);
        const fdDeriv = (evalProduct(t + h) - evalProduct(t - h)) / (2 * h);

        assertClose(res.v, expectedV, 1e-12, `value at t=${t}`);
        assertClose(res.d, fdDeriv, 1e-7, `central finite-diff derivative at t=${t}`);
      }
    });

    it('is invariant under permutation of factors', () => {
      const duals = [
        { v: 1.5, d: 0.7 },
        { v: -2.2, d: 3.1 },
        { v: 0.4, d: -1.8 },
        { v: 5.0, d: 0.2 },
        { v: -0.9, d: -0.5 },
      ];
      const forward = productDualRecursive(duals);
      const reversed = productDualRecursive([...duals].reverse());
      const shuffled = productDualRecursive([duals[2], duals[4], duals[0], duals[3], duals[1]]);

      assertClose(reversed.v, forward.v, 1e-12, 'reversed v');
      assertClose(reversed.d, forward.d, 1e-12, 'reversed d');
      assertClose(shuffled.v, forward.v, 1e-12, 'shuffled v');
      assertClose(shuffled.d, forward.d, 1e-12, 'shuffled d');
    });
  });
});
