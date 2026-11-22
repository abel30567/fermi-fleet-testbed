import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productTypedIterative } from './productTypedIterative.js';

describe('productTypedIterative', () => {
  describe('normal cases', () => {
    it('computes the product of positive integers', () => {
      assert.strictEqual(productTypedIterative(new Float64Array([2, 3, 4])), 24);
      assert.strictEqual(productTypedIterative(new Float64Array([1, 5, 7, 2])), 70);
    });

    it('computes the product of floating-point numbers', () => {
      assert.strictEqual(productTypedIterative(new Float64Array([0.5, 0.25, 8])), 1);
      assert.strictEqual(productTypedIterative(new Float64Array([1.5, 2.5, 4])), 15);
    });

    it('returns the single element for a length-1 Float64Array', () => {
      assert.strictEqual(productTypedIterative(new Float64Array([7.25])), 7.25);
      assert.strictEqual(productTypedIterative(new Float64Array([-3.5])), -3.5);
    });

    it('returns 1 for an array of ones', () => {
      assert.strictEqual(productTypedIterative(new Float64Array([1, 1, 1, 1, 1])), 1);
    });

    it('supports Float64Array subarray views and does not mutate input', () => {
      const full = new Float64Array([10, 2, 3, 5, 20]);
      const view = full.subarray(1, 4); // [2, 3, 5]
      const snapshot = new Float64Array(full);

      assert.strictEqual(productTypedIterative(view), 30);
      assert.deepStrictEqual(full, snapshot);
    });
  });

  describe('edge cases', () => {
    it('returns 1 (multiplicative identity) for an empty Float64Array', () => {
      assert.strictEqual(productTypedIterative(new Float64Array(0)), 1);
    });

    it('returns +0 when the array contains 0 or -0', () => {
      const cases = [
        new Float64Array([0]),
        new Float64Array([-0]),
        new Float64Array([2, 0, 5]),
        new Float64Array([-2, 0, 5]),
        new Float64Array([3, -0, 4]),
      ];

      for (const input of cases) {
        const result = productTypedIterative(input);
        assert.strictEqual(result, 0);
        assert.ok(Object.is(result, 0), 'expected positive zero (+0)');
      }
    });

    it('handles negative values with odd and even counts', () => {
      assert.strictEqual(productTypedIterative(new Float64Array([-2, 3, 4])), -24);
      assert.strictEqual(productTypedIterative(new Float64Array([-2, -3, 4])), 24);
      assert.strictEqual(productTypedIterative(new Float64Array([-2, -3, -4])), -24);
      assert.strictEqual(productTypedIterative(new Float64Array([-1, -1, -1, -1])), 1);
      assert.strictEqual(productTypedIterative(new Float64Array([-1, -1, -1])), -1);
    });

    it('follows IEEE 754 overflow and underflow for extreme finite inputs', () => {
      assert.strictEqual(productTypedIterative(new Float64Array([1e200, 1e200])), Infinity);
      assert.strictEqual(productTypedIterative(new Float64Array([-1e200, 1e200])), -Infinity);
      const underflow = productTypedIterative(new Float64Array([1e-200, 1e-200]));
      assert.strictEqual(underflow, 0);
      assert.ok(Object.is(underflow, 0));
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-Float64Array inputs', () => {
      const invalidInputs = [
        undefined,
        null,
        [1, 2, 3],
        new Float32Array([1, 2, 3]),
        new Int32Array([1, 2, 3]),
        42,
        '123',
        { 0: 1, length: 1 },
      ];

      for (const invalid of invalidInputs) {
        assert.throws(() => productTypedIterative(invalid), TypeError);
      }
    });

    it('throws RangeError when any element is NaN or infinite', () => {
      const invalidArrays = [
        new Float64Array([NaN]),
        new Float64Array([1, NaN, 2]),
        new Float64Array([Infinity]),
        new Float64Array([-Infinity]),
        new Float64Array([2, Infinity]),
        new Float64Array([0, NaN]),
        new Float64Array([0, Infinity]),
        new Float64Array([0, -Infinity]),
      ];

      for (const arr of invalidArrays) {
        assert.throws(() => productTypedIterative(arr), RangeError);
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches exp(sum(ln(x_i))) for positive values', () => {
      const datasets = [
        new Float64Array([1.2, 3.4, 5.6, 0.75, 2.1]),
        new Float64Array([2, 3, 5, 7, 11, 13, 17]),
        new Float64Array([0.1, 0.25, 4.5, 8.2, 1.05, 0.95]),
      ];

      for (const values of datasets) {
        const direct = productTypedIterative(values);
        let logSum = 0;
        for (let i = 0; i < values.length; i++) {
          logSum += Math.log(values[i]);
        }
        const viaLogExp = Math.exp(logSum);
        const relError = Math.abs(direct - viaLogExp) / Math.abs(viaLogExp);
        assert.ok(
          relError < 1e-12,
          `expected relative error < 1e-12, got ${relError} (direct=${direct}, viaLogExp=${viaLogExp})`,
        );
      }
    });

    it('matches exact factorials n! = 1 * 2 * ... * n for n = 0..18', () => {
      const expectedFactorials = [
        1, // 0!
        1, // 1!
        2, // 2!
        6, // 3!
        24, // 4!
        120, // 5!
        720, // 6!
        5040, // 7!
        40320, // 8!
        362880, // 9!
        3628800, // 10!
        39916800, // 11!
        479001600, // 12!
        6227020800, // 13!
        87178291200, // 14!
        1307674368000, // 15!
        20922789888000, // 16!
        355687428096000, // 17!
        6402373705728000, // 18!
      ];

      for (let n = 0; n < expectedFactorials.length; n++) {
        const seq = new Float64Array(n);
        for (let k = 0; k < n; k++) {
          seq[k] = k + 1;
        }
        assert.strictEqual(productTypedIterative(seq), expectedFactorials[n]);
      }
    });

    it('matches closed-form product of a geometric progression a * r^k', () => {
      const a = 3;
      const r = 2;
      const n = 6;
      const terms = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        terms[k] = a * r ** k;
      }
      // prod_{k=0}^{n-1} (a * r^k) = a^n * r^(n*(n-1)/2)
      const closedForm = a ** n * r ** ((n * (n - 1)) / 2);
      assert.strictEqual(productTypedIterative(terms), closedForm);
    });

    it('satisfies the multiplicative split identity prod(A ++ B) === prod(A) * prod(B)', () => {
      const left = new Float64Array([-1.5, 2, 4.5, -0.5]);
      const right = new Float64Array([3, -2, 0.25, 8]);
      const combined = new Float64Array(left.length + right.length);
      combined.set(left, 0);
      combined.set(right, left.length);

      const expected = productTypedIterative(left) * productTypedIterative(right);
      assert.strictEqual(productTypedIterative(combined), expected);
    });
  });
});
