import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nthRootFloatIterative } from './nthRootFloatIterative.js';

function assertRelClose(actual, expected, relTol = 1e-13, message = '') {
  assert.ok(Number.isFinite(actual), `Expected finite result, got ${actual}. ${message}`);
  if (expected === 0) {
    assert.ok(Math.abs(actual) <= relTol, `Expected ${actual} ≈ 0. ${message}`);
    return;
  }
  const relErr = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(
    relErr <= relTol,
    `Expected ${actual} to be within relTol=${relTol} of ${expected} (relErr=${relErr}). ${message}`
  );
}

describe('nthRootFloatIterative', () => {
  describe('normal cases', () => {
    it('computes exact and irrational even roots of positive numbers', () => {
      assertRelClose(nthRootFloatIterative(4, 2), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(9, 2), 3, 1e-15);
      assertRelClose(nthRootFloatIterative(16, 4), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(81, 4), 3, 1e-15);
      assertRelClose(nthRootFloatIterative(64, 6), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(2, 2), Math.SQRT2, 1e-15);
      assertRelClose(nthRootFloatIterative(0.25, 2), 0.5, 1e-15);
      assertRelClose(nthRootFloatIterative(0.0001, 4), 0.1, 1e-15);
    });

    it('computes exact and irrational odd roots of positive numbers', () => {
      assertRelClose(nthRootFloatIterative(8, 3), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(27, 3), 3, 1e-15);
      assertRelClose(nthRootFloatIterative(32, 5), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(243, 5), 3, 1e-15);
      assertRelClose(nthRootFloatIterative(128, 7), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(10, 3), Math.cbrt(10), 1e-15);
    });

    it('computes odd roots of negative numbers', () => {
      assertRelClose(nthRootFloatIterative(-8, 3), -2, 1e-15);
      assertRelClose(nthRootFloatIterative(-27, 3), -3, 1e-15);
      assertRelClose(nthRootFloatIterative(-32, 5), -2, 1e-15);
      assertRelClose(nthRootFloatIterative(-0.001, 3), -0.1, 1e-15);
      assertRelClose(nthRootFloatIterative(-10, 3), -Math.cbrt(10), 1e-15);
    });

    it('computes negative integer roots (reciprocals)', () => {
      assertRelClose(nthRootFloatIterative(4, -2), 0.5, 1e-15);
      assertRelClose(nthRootFloatIterative(8, -3), 0.5, 1e-15);
      assertRelClose(nthRootFloatIterative(-8, -3), -0.5, 1e-15);
      assertRelClose(nthRootFloatIterative(16, -4), 0.5, 1e-15);
      assertRelClose(nthRootFloatIterative(0.25, -2), 2, 1e-15);
      assertRelClose(nthRootFloatIterative(-0.125, -3), -2, 1e-15);
      assertRelClose(nthRootFloatIterative(5, -1), 0.2, 1e-15);
      assertRelClose(nthRootFloatIterative(-5, -1), -0.2, 1e-15);
    });

    it('handles n = 1 as identity', () => {
      assert.strictEqual(nthRootFloatIterative(42.5, 1), 42.5);
      assert.strictEqual(nthRootFloatIterative(-42.5, 1), -42.5);
      assert.strictEqual(nthRootFloatIterative(Number.MAX_VALUE, 1), Number.MAX_VALUE);
      assert.strictEqual(nthRootFloatIterative(Number.MIN_VALUE, 1), Number.MIN_VALUE);
    });
  });

  describe('edge cases', () => {
    it('handles 0, -0, 1, and -1', () => {
      assert.ok(Object.is(nthRootFloatIterative(0, 2), 0));
      assert.ok(Object.is(nthRootFloatIterative(0, 3), 0));
      assert.ok(Object.is(nthRootFloatIterative(-0, 2), 0));
      assert.ok(Object.is(nthRootFloatIterative(-0, 3), -0));
      assert.strictEqual(nthRootFloatIterative(1, 2), 1);
      assert.strictEqual(nthRootFloatIterative(1, 17), 1);
      assert.strictEqual(nthRootFloatIterative(1, -17), 1);
      assert.strictEqual(nthRootFloatIterative(-1, 1), -1);
      assert.strictEqual(nthRootFloatIterative(-1, 3), -1);
      assert.strictEqual(nthRootFloatIterative(-1, -5), -1);
    });

    it('handles very large and very small (subnormal) values without overflow or underflow', () => {
      // Near Number.MAX_VALUE
      assertRelClose(nthRootFloatIterative(Number.MAX_VALUE, 2), Math.sqrt(Number.MAX_VALUE), 1e-14);
      assertRelClose(nthRootFloatIterative(Number.MAX_VALUE, 3), Math.cbrt(Number.MAX_VALUE), 1e-14);
      assertRelClose(nthRootFloatIterative(Number.MAX_VALUE, 10), Math.pow(Number.MAX_VALUE, 0.1), 1e-14);
      assertRelClose(nthRootFloatIterative(Number.MAX_VALUE, 5000), Math.pow(Number.MAX_VALUE, 1 / 5000), 1e-14);
      assertRelClose(nthRootFloatIterative(-Number.MAX_VALUE, 3), -Math.cbrt(Number.MAX_VALUE), 1e-14);

      // Subnormals (Number.MIN_VALUE = 2^-1074)
      assertRelClose(nthRootFloatIterative(Number.MIN_VALUE, 2), 2 ** -537, 1e-15);
      assertRelClose(nthRootFloatIterative(Number.MIN_VALUE, 3), 2 ** -358, 1e-15);
      assertRelClose(nthRootFloatIterative(Number.MIN_VALUE, -2), 2 ** 537, 1e-15);
      assertRelClose(nthRootFloatIterative(Number.MIN_VALUE, 5000), Math.pow(Number.MIN_VALUE, 1 / 5000), 1e-14);
      assertRelClose(nthRootFloatIterative(-Number.MIN_VALUE, 3), -(2 ** -358), 1e-15);

      // Large root degrees
      assertRelClose(nthRootFloatIterative(1e100, 100), 10, 1e-14);
      assertRelClose(nthRootFloatIterative(1e-100, 100), 0.1, 1e-14);
      assertRelClose(nthRootFloatIterative(2, 1_000_000), Math.pow(2, 1e-6), 1e-14);
      assertRelClose(nthRootFloatIterative(2, Number.MAX_SAFE_INTEGER), Math.pow(2, 1 / Number.MAX_SAFE_INTEGER), 1e-15);
    });

    it('handles NaN and infinities according to IEEE-754 conventions', () => {
      assert.ok(Number.isNaN(nthRootFloatIterative(NaN, 2)));
      assert.ok(Number.isNaN(nthRootFloatIterative(NaN, 3)));
      assert.strictEqual(nthRootFloatIterative(Infinity, 2), Infinity);
      assert.strictEqual(nthRootFloatIterative(Infinity, 3), Infinity);
      assert.strictEqual(nthRootFloatIterative(-Infinity, 3), -Infinity);
      assert.ok(Object.is(nthRootFloatIterative(Infinity, -2), 0));
      assert.ok(Object.is(nthRootFloatIterative(-Infinity, -3), -0));
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-number x or n', () => {
      assert.throws(() => nthRootFloatIterative('8', 3), TypeError);
      assert.throws(() => nthRootFloatIterative(null, 3), TypeError);
      assert.throws(() => nthRootFloatIterative(undefined, 3), TypeError);
      assert.throws(() => nthRootFloatIterative(8n, 3), TypeError);
      assert.throws(() => nthRootFloatIterative({}, 3), TypeError);

      assert.throws(() => nthRootFloatIterative(8, '3'), TypeError);
      assert.throws(() => nthRootFloatIterative(8, null), TypeError);
      assert.throws(() => nthRootFloatIterative(8, undefined), TypeError);
      assert.throws(() => nthRootFloatIterative(8, 3n), TypeError);
      assert.throws(() => nthRootFloatIterative(8, []), TypeError);
    });

    it('throws RangeError for zero, non-integer, non-finite, or unsafe n', () => {
      assert.throws(() => nthRootFloatIterative(8, 0), RangeError);
      assert.throws(() => nthRootFloatIterative(8, -0), RangeError);
      assert.throws(() => nthRootFloatIterative(8, 1.5), RangeError);
      assert.throws(() => nthRootFloatIterative(8, -2.5), RangeError);
      assert.throws(() => nthRootFloatIterative(8, NaN), RangeError);
      assert.throws(() => nthRootFloatIterative(8, Infinity), RangeError);
      assert.throws(() => nthRootFloatIterative(8, -Infinity), RangeError);
      assert.throws(() => nthRootFloatIterative(8, Number.MAX_SAFE_INTEGER + 1), RangeError);
      assert.throws(() => nthRootFloatIterative(8, Number.MIN_SAFE_INTEGER - 1), RangeError);
    });

    it('throws RangeError for even root of a negative number', () => {
      assert.throws(() => nthRootFloatIterative(-1, 2), RangeError);
      assert.throws(() => nthRootFloatIterative(-16, 4), RangeError);
      assert.throws(() => nthRootFloatIterative(-16, -2), RangeError);
      assert.throws(() => nthRootFloatIterative(-Number.MIN_VALUE, 2), RangeError);
      assert.throws(() => nthRootFloatIterative(-Infinity, 2), RangeError);
    });

    it('throws RangeError for negative root of zero', () => {
      assert.throws(() => nthRootFloatIterative(0, -1), RangeError);
      assert.throws(() => nthRootFloatIterative(0, -2), RangeError);
      assert.throws(() => nthRootFloatIterative(-0, -3), RangeError);
    });
  });

  describe('cross-checks against Math.pow and r ** n ≈ x', () => {
    it('matches Math.pow across a grid of positive values and root degrees', () => {
      const xs = [1e-200, 1e-12, 0.0037, 0.5, 1.0001, 2, Math.PI, 12345.6789, 1e50, 1e200];
      const ns = [2, 3, 4, 5, 7, 12, 25, 64, -2, -3, -5, -12];

      for (const x of xs) {
        for (const n of ns) {
          const r = nthRootFloatIterative(x, n);
          const expected = Math.pow(x, 1 / n);
          assertRelClose(r, expected, 1e-13, `x=${x}, n=${n}`);
        }
      }
    });

    it('satisfies r ** n ≈ x for positive and negative radicands', () => {
      const cases = [
        [2, 2],
        [17, 3],
        [99.99, 4],
        [1024.5, 5],
        [0.00073, 7],
        [-27.5, 3],
        [-1000.25, 5],
        [-0.00032, 5],
        [42, -2],
        [42, -3],
        [-42, -3],
        [1e30, 10],
        [1e-30, 10],
      ];

      for (const [x, n] of cases) {
        const r = nthRootFloatIterative(x, n);
        const reconstructed = r ** n;
        assertRelClose(reconstructed, x, 1e-12, `x=${x}, n=${n}, r=${r}`);
      }
    });
  });
});
