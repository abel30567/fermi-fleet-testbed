import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductFloatIterative } from './dotProductFloatIterative.js';

describe('dotProductFloatIterative', () => {
  describe('normal cases', () => {
    it('computes dot product of positive integer vectors', () => {
      assert.equal(dotProductFloatIterative([1, 2, 3], [4, 5, 6]), 32);
    });

    it('computes dot product of mixed-sign vectors', () => {
      assert.equal(dotProductFloatIterative([-1, 2, -3], [4, -5, 6]), -32);
    });

    it('computes dot product of floating-point vectors', () => {
      assert.equal(dotProductFloatIterative([0.5, 1.5, -2.25], [2, -4, 8]), -23);
    });

    it('returns 0 for orthogonal vectors', () => {
      assert.equal(dotProductFloatIterative([1, 0, 0], [0, 1, 0]), 0);
      assert.equal(dotProductFloatIterative([3, 4], [-4, 3]), 0);
    });

    it('handles single-element vectors', () => {
      assert.equal(dotProductFloatIterative([7.5], [-2]), -15);
    });

    it('supports Float64Array and mixed Array/Float64Array inputs', () => {
      const a = new Float64Array([1.25, -2.5, 4]);
      const b = new Float64Array([8, 4, -0.5]);
      assert.equal(dotProductFloatIterative(a, b), -2);
      assert.equal(dotProductFloatIterative(a, [8, 4, -0.5]), -2);
      assert.equal(dotProductFloatIterative([1.25, -2.5, 4], b), -2);
    });

    it('does not mutate input vectors', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      dotProductFloatIterative(a, b);
      assert.deepEqual(a, [1, 2, 3]);
      assert.deepEqual(b, [4, 5, 6]);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for empty vectors', () => {
      assert.equal(dotProductFloatIterative([], []), 0);
      assert.equal(dotProductFloatIterative(new Float64Array(0), new Float64Array(0)), 0);
    });

    it('handles zero and negative-zero elements cleanly', () => {
      const result = dotProductFloatIterative([-0, 0], [1, -1]);
      assert.equal(Object.is(result, 0), true);
    });

    it('handles subnormal float64 values', () => {
      const result = dotProductFloatIterative([Number.MIN_VALUE, 1], [1, Number.MIN_VALUE]);
      assert.equal(result, 2 * Number.MIN_VALUE);
    });

    it('follows IEEE-754 float64 overflow semantics for extreme finite products', () => {
      assert.equal(dotProductFloatIterative([1e200], [1e200]), Infinity);
      assert.equal(dotProductFloatIterative([-1e200], [1e200]), -Infinity);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when first or second argument is not an Array or Float64Array', () => {
      const invalidInputs = [null, undefined, 42, '123', {}, { length: 1, 0: 1 }, new Set([1]), new Int32Array([1])];
      for (const bad of invalidInputs) {
        assert.throws(() => dotProductFloatIterative(bad, [1]), TypeError);
        assert.throws(() => dotProductFloatIterative([1], bad), TypeError);
      }
    });

    it('throws RangeError when vector lengths differ', () => {
      assert.throws(() => dotProductFloatIterative([1, 2], [1]), RangeError);
      assert.throws(() => dotProductFloatIterative([], [0]), RangeError);
      assert.throws(() => dotProductFloatIterative(new Float64Array([1]), new Float64Array([1, 2])), RangeError);
    });

    it('throws TypeError for non-number elements and sparse arrays', () => {
      assert.throws(() => dotProductFloatIterative([1, '2'], [1, 2]), TypeError);
      assert.throws(() => dotProductFloatIterative([1, 2], [1, null]), TypeError);
      assert.throws(() => dotProductFloatIterative([1, undefined], [1, 2]), TypeError);
      assert.throws(() => dotProductFloatIterative([1, 2n], [1, 2]), TypeError);
      assert.throws(() => dotProductFloatIterative([true], [1]), TypeError);
      // eslint-disable-next-line no-sparse-arrays
      assert.throws(() => dotProductFloatIterative([1, , 3], [1, 2, 3]), TypeError);
    });

    it('throws RangeError for non-finite number elements (NaN, Infinity, -Infinity)', () => {
      for (const nonFinite of [NaN, Infinity, -Infinity]) {
        assert.throws(() => dotProductFloatIterative([1, nonFinite], [1, 2]), RangeError);
        assert.throws(() => dotProductFloatIterative([1, 2], [nonFinite, 2]), RangeError);
        assert.throws(
          () => dotProductFloatIterative(new Float64Array([nonFinite]), new Float64Array([1])),
          RangeError
        );
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches closed-form sum of squares formula sum_{k=1}^n k^2 = n(n+1)(2n+1)/6', () => {
      const n = 1000;
      const v = Array.from({ length: n }, (_, i) => i + 1);
      const expected = (n * (n + 1) * (2 * n + 1)) / 6;
      assert.equal(dotProductFloatIterative(v, v), expected);
    });

    it('matches exact BigInt scaled arithmetic on exact dyadic float64 vectors', () => {
      // Deterministic PRNG (LCG) producing exact quarter-integer values (k / 4)
      let state = 123456789;
      const nextInt = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state % 2001) - 1000;
      };

      const n = 250;
      const aScaled = Array.from({ length: n }, () => nextInt());
      const bScaled = Array.from({ length: n }, () => nextInt());
      const a = aScaled.map((x) => x / 4);
      const b = bScaled.map((x) => x / 4);

      let exactNumerator = 0n;
      for (let i = 0; i < n; i++) {
        exactNumerator += BigInt(aScaled[i]) * BigInt(bScaled[i]);
      }
      // Denominator is 4 * 4 = 16, exact in IEEE-754 float64 for this magnitude
      const expected = Number(exactNumerator) / 16;
      assert.equal(dotProductFloatIterative(a, b), expected);
    });

    it('satisfies commutativity, bilinearity, and Cauchy-Schwarz inequality', () => {
      const a = [1.5, -2.25, 3.75, -0.5, 4.125];
      const b = [-0.75, 5.5, 1.25, -3.5, 2.0];
      const c = [2.0, 1.0, -4.0, 0.25, -1.5];
      const scalar = 3.5;

      // Exact commutativity
      assert.equal(dotProductFloatIterative(a, b), dotProductFloatIterative(b, a));

      // Bilinearity: dot(scalar * a, b) === scalar * dot(a, b) within float64 tolerance
      const scaledA = a.map((x) => x * scalar);
      assert.ok(
        Math.abs(dotProductFloatIterative(scaledA, b) - scalar * dotProductFloatIterative(a, b)) < 1e-12
      );

      // Distributivity: dot(a + b, c) === dot(a, c) + dot(b, c)
      const aPlusB = a.map((x, i) => x + b[i]);
      assert.ok(
        Math.abs(
          dotProductFloatIterative(aPlusB, c) -
            (dotProductFloatIterative(a, c) + dotProductFloatIterative(b, c))
        ) < 1e-12
      );

      // Cauchy-Schwarz: |dot(a, b)| <= sqrt(dot(a, a) * dot(b, b))
      const dotAB = dotProductFloatIterative(a, b);
      const normSqA = dotProductFloatIterative(a, a);
      const normSqB = dotProductFloatIterative(b, b);
      assert.ok(normSqA >= 0 && normSqB >= 0);
      assert.ok(Math.abs(dotAB) <= Math.sqrt(normSqA * normSqB) + 1e-12);
    });
  });
});
