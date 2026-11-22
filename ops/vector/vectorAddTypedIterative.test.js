import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddTypedIterative } from './vectorAddTypedIterative.js';

describe('vectorAddTypedIterative', () => {
  describe('normal cases', () => {
    it('adds positive integer and floating-point Float64Array vectors element-wise', () => {
      const a = new Float64Array([1, 2.5, 3.25, 4]);
      const b = new Float64Array([5, 6.5, 0.75, 8]);
      const result = vectorAddTypedIterative(a, b);

      assert.ok(result instanceof Float64Array);
      assert.deepEqual(result, new Float64Array([6, 9, 4, 12]));
    });

    it('handles negative values and exact cancellation', () => {
      const a = new Float64Array([-10, 4.5, -0.25, 7]);
      const b = new Float64Array([10, -1.5, -0.75, -12]);
      const result = vectorAddTypedIterative(a, b);

      assert.deepEqual(result, new Float64Array([0, 3, -1, -5]));
    });

    it('does not mutate inputs and returns a new Float64Array instance', () => {
      const a = new Float64Array([1, 2, 3]);
      const b = new Float64Array([4, 5, 6]);
      const aCopy = new Float64Array(a);
      const bCopy = new Float64Array(b);

      const result = vectorAddTypedIterative(a, b);

      assert.notEqual(result, a);
      assert.notEqual(result, b);
      assert.deepEqual(a, aCopy);
      assert.deepEqual(b, bCopy);
    });

    it('supports aliasing when the same Float64Array is passed for both arguments', () => {
      const v = new Float64Array([1.5, -2.5, 0, 10]);
      const result = vectorAddTypedIterative(v, v);

      assert.notEqual(result, v);
      assert.deepEqual(result, new Float64Array([3, -5, 0, 20]));
      assert.deepEqual(v, new Float64Array([1.5, -2.5, 0, 10]));
    });

    it('handles Float64Array subarray views with non-zero byteOffset', () => {
      const backing = new Float64Array([100, 1, 2, 3, 200, 10, 20, 30, 300]);
      const a = backing.subarray(1, 4);
      const b = backing.subarray(5, 8);

      const result = vectorAddTypedIterative(a, b);
      assert.deepEqual(result, new Float64Array([11, 22, 33]));
    });
  });

  describe('edge cases', () => {
    it('returns an empty Float64Array for empty inputs', () => {
      const a = new Float64Array(0);
      const b = new Float64Array(0);
      const result = vectorAddTypedIterative(a, b);

      assert.ok(result instanceof Float64Array);
      assert.equal(result.length, 0);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
    });

    it('handles single-element vectors', () => {
      const result = vectorAddTypedIterative(new Float64Array([42.5]), new Float64Array([-2.5]));
      assert.deepEqual(result, new Float64Array([40]));
    });

    it('preserves additive identity with zero vectors', () => {
      const a = new Float64Array([-3.5, 0, 7.25, 1e-12]);
      const zeros = new Float64Array([0, 0, 0, 0]);

      assert.deepEqual(vectorAddTypedIterative(a, zeros), a);
      assert.deepEqual(vectorAddTypedIterative(zeros, a), a);
    });

    it('handles subnormal and extreme finite values', () => {
      const a = new Float64Array([Number.MIN_VALUE, 1, 1e300, -1e300]);
      const b = new Float64Array([Number.MIN_VALUE, Number.EPSILON, -1e300, 1e300]);

      const result = vectorAddTypedIterative(a, b);
      assert.equal(result[0], Number.MIN_VALUE + Number.MIN_VALUE);
      assert.equal(result[1], 1 + Number.EPSILON);
      assert.equal(result[2], 0);
      assert.equal(result[3], 0);
    });

    it('throws TypeError if either argument is not a Float64Array', () => {
      const valid = new Float64Array([1, 2]);
      const invalidInputs = [
        [1, 2],
        new Float32Array([1, 2]),
        new Int32Array([1, 2]),
        null,
        undefined,
        42,
        '12',
        { length: 2, 0: 1, 1: 2 },
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => vectorAddTypedIterative(bad, valid), TypeError);
        assert.throws(() => vectorAddTypedIterative(valid, bad), TypeError);
      }
    });

    it('throws RangeError on length mismatch', () => {
      assert.throws(
        () => vectorAddTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
        RangeError
      );
      assert.throws(
        () => vectorAddTypedIterative(new Float64Array(0), new Float64Array([1])),
        RangeError
      );
    });

    it('throws RangeError if any element is NaN, Infinity, or -Infinity', () => {
      const valid = new Float64Array([1, 2, 3]);
      const nonFiniteVectors = [
        new Float64Array([1, Number.NaN, 3]),
        new Float64Array([Number.POSITIVE_INFINITY, 2, 3]),
        new Float64Array([1, 2, Number.NEGATIVE_INFINITY]),
      ];

      for (const bad of nonFiniteVectors) {
        assert.throws(() => vectorAddTypedIterative(bad, valid), RangeError);
        assert.throws(() => vectorAddTypedIterative(valid, bad), RangeError);
      }
    });
  });

  describe('cross-checks and algebraic identities', () => {
    it('matches independent Array.from map computation on deterministic vectors', () => {
      const n = 256;
      const a = new Float64Array(n);
      const b = new Float64Array(n);
      for (let i = 0; i < n; i += 1) {
        a[i] = Math.sin(i * 0.37) * 100;
        b[i] = Math.cos(i * 0.53) * 100;
      }

      const actual = vectorAddTypedIterative(a, b);
      const expected = Array.from(a, (val, idx) => val + b[idx]);

      assert.equal(actual.length, expected.length);
      for (let i = 0; i < n; i += 1) {
        assert.equal(actual[i], expected[i]);
      }
    });

    it('satisfies commutativity, associativity, additive inverse, and sum linearity', () => {
      const a = new Float64Array([1.25, -4.5, 3.75, 10.125, -0.5]);
      const b = new Float64Array([-2.5, 7.25, -1.125, 0.25, 8.5]);
      const c = new Float64Array([0.5, -3.0, 2.5, -5.375, 1.25]);
      const negA = new Float64Array(Array.from(a, (x) => -x));

      // Commutativity: a + b == b + a
      const ab = vectorAddTypedIterative(a, b);
      const ba = vectorAddTypedIterative(b, a);
      assert.deepEqual(ab, ba);

      // Associativity: (a + b) + c == a + (b + c) within floating-point tolerance
      const leftAssoc = vectorAddTypedIterative(ab, c);
      const rightAssoc = vectorAddTypedIterative(a, vectorAddTypedIterative(b, c));
      for (let i = 0; i < a.length; i += 1) {
        assert.ok(
          Math.abs(leftAssoc[i] - rightAssoc[i]) <= 1e-12,
          `Associativity mismatch at index ${i}: ${leftAssoc[i]} vs ${rightAssoc[i]}`
        );
      }

      // Additive inverse: a + (-a) == 0
      const zero = vectorAddTypedIterative(a, negA);
      assert.deepEqual(zero, new Float64Array(a.length));

      // Linearity of summation: sum(a + b) == sum(a) + sum(b)
      const sum = (vec) => vec.reduce((acc, x) => acc + x, 0);
      assert.ok(Math.abs(sum(ab) - (sum(a) + sum(b))) <= 1e-12);
    });
  });
});
