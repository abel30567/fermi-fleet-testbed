import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractDualSeries } from './subtractDualSeries.js';

/**
 * Converts a dual number `{ v, d }` into its faithful 2x2 upper-triangular matrix
 * representation `[[v, d], [0, v]]` over the real numbers.
 *
 * @param {{ v: number, d: number }} x
 * @returns {[[number, number], [number, number]]}
 */
function dualToMatrix(x) {
  return [
    [x.v, x.d],
    [0, x.v],
  ];
}

/**
 * Subtracts two 2x2 matrices entrywise.
 *
 * @param {[[number, number], [number, number]]} A
 * @param {[[number, number], [number, number]]} B
 * @returns {[[number, number], [number, number]]}
 */
function subtractMatrix2x2(A, B) {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ];
}

describe('subtractDualSeries', () => {
  describe('normal cases', () => {
    it('subtracts positive dual numbers componentwise', () => {
      const res = subtractDualSeries({ v: 10, d: 4 }, { v: 3, d: 1 });
      assert.deepStrictEqual(res, { v: 7, d: 3 });
    });

    it('handles mixed signs and fractional values', () => {
      const res = subtractDualSeries({ v: 2.5, d: -1.25 }, { v: -0.5, d: 0.75 });
      assert.deepStrictEqual(res, { v: 3, d: -2 });
    });

    it('subtracts pure real (d = 0) and pure dual (v = 0) numbers', () => {
      assert.deepStrictEqual(
        subtractDualSeries({ v: 5, d: 0 }, { v: 2, d: 0 }),
        { v: 3, d: 0 }
      );
      assert.deepStrictEqual(
        subtractDualSeries({ v: 0, d: 6 }, { v: 0, d: 2.5 }),
        { v: 0, d: 3.5 }
      );
      assert.deepStrictEqual(
        subtractDualSeries({ v: 5, d: 0 }, { v: 0, d: 3 }),
        { v: 5, d: -3 }
      );
    });

    it('does not mutate inputs and returns a fresh { v, d } object', () => {
      const a = Object.freeze({ v: 8, d: 3, extra: 'ignored' });
      const b = Object.freeze({ v: 2, d: 5, meta: 42 });
      const res = subtractDualSeries(a, b);
      assert.deepStrictEqual(res, { v: 6, d: -2 });
      assert.notStrictEqual(res, a);
      assert.notStrictEqual(res, b);
      assert.deepStrictEqual(Object.keys(res), ['v', 'd']);
    });
  });

  describe('edge cases and algebraic identities', () => {
    it('handles zeros and normalizes -0 to +0', () => {
      const zero = { v: 0, d: 0 };
      const x = { v: 4.5, d: -2.25 };

      assert.deepStrictEqual(subtractDualSeries(zero, zero), { v: 0, d: 0 });
      assert.deepStrictEqual(subtractDualSeries(x, zero), x);
      assert.deepStrictEqual(subtractDualSeries(zero, x), { v: -4.5, d: 2.25 });

      const negZeroResult = subtractDualSeries({ v: -0, d: -0 }, { v: 0, d: 0 });
      assert.strictEqual(Object.is(negZeroResult.v, 0), true);
      assert.strictEqual(Object.is(negZeroResult.d, 0), true);
    });

    it('handles negative values', () => {
      assert.deepStrictEqual(
        subtractDualSeries({ v: -10, d: -7 }, { v: -4, d: -9 }),
        { v: -6, d: 2 }
      );
    });

    it('satisfies self-subtraction identity: a - a = { v: 0, d: 0 }', () => {
      const samples = [
        { v: 0, d: 0 },
        { v: 42, d: -17 },
        { v: -Math.PI, d: Math.E },
        { v: 1e150, d: -1e-150 },
        { v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
      ];
      for (const a of samples) {
        const diff = subtractDualSeries(a, a);
        assert.deepStrictEqual(diff, { v: 0, d: 0 });
        assert.strictEqual(Object.is(diff.v, 0), true);
        assert.strictEqual(Object.is(diff.d, 0), true);
      }
    });

    it('satisfies anti-commutativity: (a - b) = -(b - a)', () => {
      const pairs = [
        [{ v: 3, d: 7 }, { v: 11, d: -2 }],
        [{ v: -0.125, d: 0.5 }, { v: 4.25, d: -3.75 }],
        [{ v: 1e20, d: -1e-10 }, { v: -1e20, d: 1e-10 }],
      ];
      for (const [a, b] of pairs) {
        const ab = subtractDualSeries(a, b);
        const ba = subtractDualSeries(b, a);
        assert.strictEqual(ab.v, -ba.v);
        assert.strictEqual(ab.d, -ba.d);
      }
    });

    it('handles very large and very small magnitudes accurately', () => {
      const large = subtractDualSeries(
        { v: 1e200, d: -2e200 },
        { v: 0.5e200, d: -0.5e200 }
      );
      assert.deepStrictEqual(large, { v: 0.5e200, d: -1.5e200 });

      const small = subtractDualSeries(
        { v: 3e-200, d: 5e-200 },
        { v: 1e-200, d: 2e-200 }
      );
      assert.ok(Math.abs(small.v - 2e-200) <= 1e-214);
      assert.ok(Math.abs(small.d - 3e-200) <= 1e-214);

      const safeInt = subtractDualSeries(
        { v: Number.MAX_SAFE_INTEGER, d: Number.MIN_SAFE_INTEGER },
        { v: 1, d: -1 }
      );
      assert.deepStrictEqual(safeInt, {
        v: Number.MAX_SAFE_INTEGER - 1,
        d: Number.MIN_SAFE_INTEGER + 1,
      });

      const subnormal = subtractDualSeries(
        { v: Number.MIN_VALUE * 4, d: Number.MIN_VALUE * 3 },
        { v: Number.MIN_VALUE, d: Number.MIN_VALUE * 2 }
      );
      assert.deepStrictEqual(subnormal, {
        v: Number.MIN_VALUE * 3,
        d: Number.MIN_VALUE,
      });
    });
  });

  describe('invalid inputs', () => {
    const valid = { v: 1, d: 2 };

    it('rejects non-object, null, undefined, and array inputs', () => {
      const badValues = [null, undefined, 42, '1', true, [], [1, 2], () => {}];
      for (const bad of badValues) {
        assert.throws(() => subtractDualSeries(bad, valid), TypeError);
        assert.throws(() => subtractDualSeries(valid, bad), TypeError);
      }
    });

    it('rejects objects with missing or non-numeric v or d fields', () => {
      const badObjects = [
        {},
        { v: 1 },
        { d: 2 },
        { v: '1', d: 2 },
        { v: 1, d: '2' },
        { v: null, d: 2 },
        { v: 1, d: undefined },
        { v: true, d: 2 },
        { v: 1, d: {} },
      ];
      for (const bad of badObjects) {
        assert.throws(() => subtractDualSeries(bad, valid), TypeError);
        assert.throws(() => subtractDualSeries(valid, bad), TypeError);
      }
    });

    it('rejects NaN, Infinity, and -Infinity in v or d', () => {
      const nonFiniteObjects = [
        { v: NaN, d: 0 },
        { v: 0, d: NaN },
        { v: Infinity, d: 0 },
        { v: -Infinity, d: 0 },
        { v: 0, d: Infinity },
        { v: 0, d: -Infinity },
      ];
      for (const bad of nonFiniteObjects) {
        assert.throws(() => subtractDualSeries(bad, valid), RangeError);
        assert.throws(() => subtractDualSeries(valid, bad), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches central finite-difference derivative of f(x) - g(x)', () => {
      // f(x) = sin(x^2) + exp(0.5 * x)
      const f = (x) => Math.sin(x * x) + Math.exp(0.5 * x);
      const df = (x) => 2 * x * Math.cos(x * x) + 0.5 * Math.exp(0.5 * x);

      // g(x) = x^3 - ln(x^2 + 2)
      const g = (x) => x * x * x - Math.log(x * x + 2);
      const dg = (x) => 3 * x * x - (2 * x) / (x * x + 2);

      const h = 1e-6;
      const testPoints = [-2.3, -0.75, 0, 0.85, 1.9];

      for (const x of testPoints) {
        const dualF = { v: f(x), d: df(x) };
        const dualG = { v: g(x), d: dg(x) };
        const diff = subtractDualSeries(dualF, dualG);

        const expectedValue = f(x) - g(x);
        const centralDiffDerivative =
          ((f(x + h) - g(x + h)) - (f(x - h) - g(x - h))) / (2 * h);

        assert.ok(
          Math.abs(diff.v - expectedValue) <= 1e-12,
          `value mismatch at x=${x}: got ${diff.v}, expected ${expectedValue}`
        );
        assert.ok(
          Math.abs(diff.d - centralDiffDerivative) <= 1e-7,
          `derivative mismatch at x=${x}: got ${diff.d}, finite-diff ${centralDiffDerivative}`
        );
      }
    });

    it('is isomorphic to 2x2 upper-triangular matrix subtraction [[v, d], [0, v]]', () => {
      const pairs = [
        [{ v: 3, d: 5 }, { v: 1, d: 2 }],
        [{ v: -4.25, d: 7.5 }, { v: 2.75, d: -1.5 }],
        [{ v: 0, d: -9 }, { v: 6, d: 0 }],
        [{ v: Math.SQRT2, d: -Math.LN2 }, { v: Math.PI, d: Math.E }],
      ];

      for (const [a, b] of pairs) {
        const diffDual = subtractDualSeries(a, b);
        const diffMatrix = subtractMatrix2x2(dualToMatrix(a), dualToMatrix(b));
        assert.deepStrictEqual(dualToMatrix(diffDual), diffMatrix);
      }
    });
  });
});
