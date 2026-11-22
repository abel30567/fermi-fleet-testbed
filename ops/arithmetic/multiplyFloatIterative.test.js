import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyFloatIterative } from './multiplyFloatIterative.js';

describe('multiplyFloatIterative', () => {
  describe('normal cases', () => {
    it('multiplies two positive integers', () => {
      assert.equal(multiplyFloatIterative(2, 3), 6);
      assert.equal(multiplyFloatIterative(7, 8), 56);
    });

    it('multiplies more than two numbers iteratively', () => {
      assert.equal(multiplyFloatIterative(2, 3, 4), 24);
      assert.equal(multiplyFloatIterative(1, 2, 3, 4, 5), 120);
      assert.equal(multiplyFloatIterative(0.5, 2, 0.25, 8, 3), 6);
    });

    it('handles IEEE-754 floating-point values accurately', () => {
      assert.equal(multiplyFloatIterative(0.1, 0.2), 0.1 * 0.2);
      assert.equal(multiplyFloatIterative(1.5, 2.5), 3.75);
      assert.equal(multiplyFloatIterative(Math.PI, 2), Math.PI * 2);
    });

    it('preserves multiplicative identity with 1', () => {
      assert.equal(multiplyFloatIterative(42.5, 1), 42.5);
      assert.equal(multiplyFloatIterative(1, 1, 1, -7.25, 1), -7.25);
    });

    it('handles negative numbers with odd and even counts', () => {
      assert.equal(multiplyFloatIterative(-3, 4), -12);
      assert.equal(multiplyFloatIterative(3, -4), -12);
      assert.equal(multiplyFloatIterative(-3, -4), 12);
      assert.equal(multiplyFloatIterative(-2, -3, -4), -24);
      assert.equal(multiplyFloatIterative(-2, -3, -4, -5), 120);
    });

    it('handles subnormal numbers without losing IEEE-754 precision', () => {
      assert.equal(multiplyFloatIterative(Number.MIN_VALUE, 2), Number.MIN_VALUE * 2);
      assert.equal(multiplyFloatIterative(1e-308, 1e-10), 1e-308 * 1e-10);
    });
  });

  describe('edge cases', () => {
    it('handles zeros and preserves IEEE-754 signed zeros', () => {
      assert.ok(Object.is(multiplyFloatIterative(0, 5), 0));
      assert.ok(Object.is(multiplyFloatIterative(5, 0, 10), 0));
      assert.ok(Object.is(multiplyFloatIterative(-0, 5), -0));
      assert.ok(Object.is(multiplyFloatIterative(5, -0), -0));
      assert.ok(Object.is(multiplyFloatIterative(-0, -5), 0));
      assert.ok(Object.is(multiplyFloatIterative(-5, 0), -0));
      assert.ok(Object.is(multiplyFloatIterative(-0, -0), 0));
      assert.ok(Object.is(multiplyFloatIterative(0, -0), -0));
      assert.ok(Object.is(multiplyFloatIterative(-1, -1, -0), -0));
    });

    it('handles Infinity and -Infinity', () => {
      assert.equal(multiplyFloatIterative(Infinity, 2), Infinity);
      assert.equal(multiplyFloatIterative(Infinity, -2), -Infinity);
      assert.equal(multiplyFloatIterative(-Infinity, -3), Infinity);
      assert.equal(multiplyFloatIterative(Infinity, Infinity), Infinity);
      assert.equal(multiplyFloatIterative(Infinity, -Infinity), -Infinity);
      assert.ok(Number.isNaN(multiplyFloatIterative(Infinity, 0)));
      assert.ok(Number.isNaN(multiplyFloatIterative(-Infinity, -0)));
    });

    it('propagates NaN in any position', () => {
      assert.ok(Number.isNaN(multiplyFloatIterative(NaN, 5)));
      assert.ok(Number.isNaN(multiplyFloatIterative(5, NaN)));
      assert.ok(Number.isNaN(multiplyFloatIterative(1, 2, NaN, 4)));
      assert.ok(Number.isNaN(multiplyFloatIterative(0, NaN)));
    });

    it('handles float64 overflow and underflow', () => {
      assert.equal(multiplyFloatIterative(Number.MAX_VALUE, 2), Infinity);
      assert.equal(multiplyFloatIterative(-Number.MAX_VALUE, 2), -Infinity);
      assert.ok(Object.is(multiplyFloatIterative(Number.MIN_VALUE, 0.5), 0));
      assert.ok(Object.is(multiplyFloatIterative(-Number.MIN_VALUE, 0.5), -0));
    });

    it('throws TypeError when fewer than two arguments are provided', () => {
      assert.throws(() => multiplyFloatIterative(), TypeError);
      assert.throws(() => multiplyFloatIterative(42), TypeError);
    });

    it('throws TypeError on non-number inputs', () => {
      const invalidValues = [
        '2',
        null,
        undefined,
        true,
        false,
        {},
        [2],
        2n,
        Symbol('x'),
        () => 2,
        new Number(2),
      ];

      for (const bad of invalidValues) {
        assert.throws(() => multiplyFloatIterative(bad, 2), TypeError);
        assert.throws(() => multiplyFloatIterative(2, bad), TypeError);
        assert.throws(() => multiplyFloatIterative(1, 2, bad), TypeError);
        // Ensure validation runs even when earlier factors are 0 or NaN.
        assert.throws(() => multiplyFloatIterative(0, bad), TypeError);
        assert.throws(() => multiplyFloatIterative(NaN, bad), TypeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches BigInt exact multiplication for safe integer factors', () => {
      const cases = [
        [3, 7, 11, 13],
        [-5, 19, -23, 29],
        [1024, 1024, 512],
        [-97, 101, 103, -107, 109],
      ];

      for (const factors of cases) {
        const expected = Number(
          factors.reduce((acc, n) => acc * BigInt(n), 1n),
        );
        assert.equal(multiplyFloatIterative(...factors), expected);
      }
    });

    it('matches log-sum-exp identity for positive floats within float64 tolerance', () => {
      const cases = [
        [1.25, 3.5, 0.75, 4.2],
        [Math.E, Math.PI, Math.SQRT2],
        [0.00123, 456.789, 12.345, 0.987],
      ];

      for (const factors of cases) {
        const logSum = factors.reduce((sum, x) => sum + Math.log(x), 0);
        const independent = Math.exp(logSum);
        const actual = multiplyFloatIterative(...factors);
        const relError = Math.abs(actual - independent) / Math.abs(independent);
        assert.ok(
          relError < 1e-14,
          `Expected relative error < 1e-14 for [${factors}], got ${relError}`,
        );
      }
    });

    it('matches recursive left-fold multiplication bit-for-bit across deterministic float vectors', () => {
      const recursiveProduct = (arr) => {
        if (arr.length === 1) return arr[0];
        return recursiveProduct(arr.slice(0, -1)) * arr[arr.length - 1];
      };

      // Deterministic LCG for reproducible float64 test vectors.
      let seed = 0x12345678;
      const nextFloat = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (seed / 0xffffffff - 0.5) * 20;
      };

      for (let len = 2; len <= 10; len += 1) {
        for (let trial = 0; trial < 5; trial += 1) {
          const vector = Array.from({ length: len }, nextFloat);
          const expected = recursiveProduct(vector);
          const actual = multiplyFloatIterative(...vector);
          assert.ok(
            Object.is(actual, expected),
            `Mismatch for len=${len}, trial=${trial}: got ${actual}, expected ${expected}`,
          );
        }
      }
    });
  });
});
