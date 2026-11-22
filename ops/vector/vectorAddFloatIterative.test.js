import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddFloatIterative } from './vectorAddFloatIterative.js';

describe('vectorAddFloatIterative', () => {
  describe('normal cases', () => {
    it('adds 1D vectors', () => {
      assert.deepEqual(vectorAddFloatIterative([3.5], [4.25]), [7.75]);
    });

    it('adds 2D vectors', () => {
      assert.deepEqual(vectorAddFloatIterative([1.5, -2.5], [0.5, 3.25]), [2, 0.75]);
    });

    it('adds 3D vectors', () => {
      assert.deepEqual(vectorAddFloatIterative([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
    });

    it('adds higher-dimensional (nD) vectors', () => {
      const a = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
      const b = [1.5, -2.5, 3.5, -4.5, 5.5, -6.5];
      assert.deepEqual(vectorAddFloatIterative(a, b), [
        0.1 + 1.5,
        0.2 + -2.5,
        0.3 + 3.5,
        0.4 + -4.5,
        0.5 + 5.5,
        0.6 + -6.5,
      ]);
    });

    it('is commutative (a + b === b + a)', () => {
      const a = [1.1, -2.2, 3.3, 0, 42.5, -100.75];
      const b = [-9.9, 8.8, -7.7, 6.6, -5.5, 4.4];
      assert.deepEqual(vectorAddFloatIterative(a, b), vectorAddFloatIterative(b, a));
    });

    it('does not mutate inputs and returns a new array instance', () => {
      const a = [1.25, 2.5, 3.75];
      const b = [4.0, 5.0, 6.0];
      const aSnapshot = [...a];
      const bSnapshot = [...b];

      const result = vectorAddFloatIterative(a, b);

      assert.deepEqual(a, aSnapshot);
      assert.deepEqual(b, bSnapshot);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
      assert.deepEqual(result, [5.25, 7.5, 9.75]);
    });
  });

  describe('edge cases', () => {
    it('handles empty vectors', () => {
      const a = [];
      const b = [];
      const result = vectorAddFloatIterative(a, b);
      assert.deepEqual(result, []);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
    });

    it('handles zeros and signed zero IEEE-754 semantics', () => {
      const res = vectorAddFloatIterative([0, -0, -0, 5.5], [0, -0, 0, -5.5]);
      assert.equal(Object.is(res[0], 0), true);
      assert.equal(Object.is(res[1], -0), true);
      assert.equal(Object.is(res[2], 0), true);
      assert.equal(Object.is(res[3], 0), true);
    });

    it('handles negative values and additive inverses', () => {
      assert.deepEqual(
        vectorAddFloatIterative([-1.5, -2.5, -3.5], [-4.5, 2.5, 10.5]),
        [-6, 0, 7]
      );
    });

    it('handles NaN, Infinity, -Infinity, and float64 overflow/subnormals', () => {
      const a = [NaN, 1, Infinity, -Infinity, Infinity, Number.MAX_VALUE, Number.MIN_VALUE];
      const b = [1, NaN, 100, -100, -Infinity, Number.MAX_VALUE, Number.MIN_VALUE];
      const res = vectorAddFloatIterative(a, b);

      assert.equal(Number.isNaN(res[0]), true);
      assert.equal(Number.isNaN(res[1]), true);
      assert.equal(res[2], Infinity);
      assert.equal(res[3], -Infinity);
      assert.equal(Number.isNaN(res[4]), true);
      assert.equal(res[5], Infinity);
      assert.equal(res[6], 2 * Number.MIN_VALUE);
    });

    it('throws RangeError when vector lengths differ', () => {
      assert.throws(() => vectorAddFloatIterative([1, 2], [1]), RangeError);
      assert.throws(() => vectorAddFloatIterative([], [0]), RangeError);
      assert.throws(() => vectorAddFloatIterative([1], [1, 2, 3]), RangeError);
    });

    it('throws TypeError when inputs are not arrays', () => {
      const invalidInputs = [
        null,
        undefined,
        42,
        '123',
        true,
        { length: 2, 0: 1, 1: 2 },
        new Float64Array([1, 2]),
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => vectorAddFloatIterative(bad, [1, 2]), TypeError);
        assert.throws(() => vectorAddFloatIterative([1, 2], bad), TypeError);
      }
    });

    it('throws TypeError when any vector element is not a number', () => {
      assert.throws(() => vectorAddFloatIterative(['1', 2], [1, 2]), TypeError);
      assert.throws(() => vectorAddFloatIterative([1, 2], [1, '2']), TypeError);
      assert.throws(() => vectorAddFloatIterative([null], [1]), TypeError);
      assert.throws(() => vectorAddFloatIterative([1], [undefined]), TypeError);
      assert.throws(() => vectorAddFloatIterative([true], [1]), TypeError);
      assert.throws(() => vectorAddFloatIterative([1n], [1]), TypeError);
      assert.throws(() => vectorAddFloatIterative([{}], [1]), TypeError);

      // Sparse array holes should also be rejected as non-number elements
      const sparseA = new Array(2);
      sparseA[0] = 1;
      assert.throws(() => vectorAddFloatIterative(sparseA, [1, 2]), TypeError);
      assert.throws(() => vectorAddFloatIterative([1, 2], sparseA), TypeError);
    });
  });

  describe('cross-checks against independent computations', () => {
    it('matches Array.prototype.map reference implementation across generated vectors', () => {
      // Deterministic linear congruential generator for reproducible float64 values
      let seed = 123456789;
      const nextFloat = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return (seed / 0xffffffff) * 2000 - 1000;
      };

      for (const dim of [1, 5, 16, 64, 257]) {
        const a = Array.from({ length: dim }, nextFloat);
        const b = Array.from({ length: dim }, nextFloat);
        const expected = a.map((v, i) => v + b[i]);
        const actual = vectorAddFloatIterative(a, b);
        assert.deepEqual(actual, expected);
      }
    });

    it('satisfies sum-of-elements linearity and associativity on exact float64 integers', () => {
      const a = [10, -25, 300, -4000, 50000, -600000];
      const b = [-3, 17, -128, 2048, -32768, 1048576];
      const c = [7, 13, 29, -53, 97, -193];

      const sum = (vec) => vec.reduce((acc, v) => acc + v, 0);

      // Linearity of sum: sum(a + b) === sum(a) + sum(b)
      const ab = vectorAddFloatIterative(a, b);
      assert.equal(sum(ab), sum(a) + sum(b));

      // Associativity: (a + b) + c === a + (b + c)
      const leftAssoc = vectorAddFloatIterative(ab, c);
      const rightAssoc = vectorAddFloatIterative(a, vectorAddFloatIterative(b, c));
      assert.deepEqual(leftAssoc, rightAssoc);
    });
  });
});
