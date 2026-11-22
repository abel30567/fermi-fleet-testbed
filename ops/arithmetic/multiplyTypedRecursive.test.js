import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyTypedRecursive } from './multiplyTypedRecursive.js';

describe('multiplyTypedRecursive', () => {
  describe('normal cases across array lengths', () => {
    it('handles empty Float64Arrays', () => {
      const a = new Float64Array(0);
      const b = new Float64Array(0);
      const result = multiplyTypedRecursive(a, b);

      assert.ok(result instanceof Float64Array);
      assert.equal(result.length, 0);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
    });

    it('handles single-element Float64Arrays', () => {
      const a = new Float64Array([6]);
      const b = new Float64Array([7]);
      const result = multiplyTypedRecursive(a, b);

      assert.deepEqual(result, new Float64Array([42]));
    });

    it('handles even-length Float64Arrays', () => {
      const a = new Float64Array([1, 2, 3, 4]);
      const b = new Float64Array([5, 6, 7, 8]);
      const result = multiplyTypedRecursive(a, b);

      assert.deepEqual(result, new Float64Array([5, 12, 21, 32]));
    });

    it('handles odd-length Float64Arrays', () => {
      const a = new Float64Array([2, 3, 5, 7, 11]);
      const b = new Float64Array([13, 17, 19, 23, 29]);
      const result = multiplyTypedRecursive(a, b);

      assert.deepEqual(result, new Float64Array([26, 51, 95, 161, 319]));
    });

    it('handles larger Float64Arrays (power-of-two and non-power-of-two)', () => {
      for (const size of [128, 1024, 4097]) {
        const a = new Float64Array(size);
        const b = new Float64Array(size);
        const expected = new Float64Array(size);

        for (let i = 0; i < size; i++) {
          a[i] = i + 1;
          b[i] = 2;
          expected[i] = (i + 1) * 2;
        }

        const result = multiplyTypedRecursive(a, b);
        assert.ok(result instanceof Float64Array);
        assert.equal(result.length, size);
        assert.deepEqual(result, expected);
      }
    });
  });

  describe('edge cases', () => {
    it('handles negative numbers and mixed signs', () => {
      const a = new Float64Array([-3, -4, 5, -1, 0]);
      const b = new Float64Array([2, -6, -7, 1, -9]);
      const result = multiplyTypedRecursive(a, b);

      assert.deepEqual(result, new Float64Array([-6, 24, -35, -1, -0]));
      assert.equal(Object.is(result[4], -0), true);
    });

    it('handles zeros and signed zeros', () => {
      const a = new Float64Array([0, -0, 0, 42]);
      const b = new Float64Array([0, 0, -5, 0]);
      const result = multiplyTypedRecursive(a, b);

      assert.equal(Object.is(result[0], 0), true);
      assert.equal(Object.is(result[1], -0), true);
      assert.equal(Object.is(result[2], -0), true);
      assert.equal(Object.is(result[3], 0), true);
    });

    it('handles decimal and fractional values', () => {
      const a = new Float64Array([0.5, 1.25, -2.5, 0.1, Math.PI]);
      const b = new Float64Array([0.25, 4.0, 0.4, 0.2, 2.0]);
      const result = multiplyTypedRecursive(a, b);

      assert.deepEqual(
        result,
        new Float64Array([0.5 * 0.25, 1.25 * 4.0, -2.5 * 0.4, 0.1 * 0.2, Math.PI * 2.0])
      );
    });

    it('handles special IEEE 754 values (Infinity, -Infinity, NaN)', () => {
      const a = new Float64Array([Infinity, -Infinity, Infinity, NaN]);
      const b = new Float64Array([2, -3, 0, 5]);
      const result = multiplyTypedRecursive(a, b);

      assert.equal(result[0], Infinity);
      assert.equal(result[1], Infinity);
      assert.ok(Number.isNaN(result[2]));
      assert.ok(Number.isNaN(result[3]));
    });

    it('preserves input immutability and supports aliased inputs', () => {
      const a = new Float64Array([1.5, -2.5, 3.5, 4.5, -5.5]);
      const b = new Float64Array([2, 3, 4, 5, 6]);
      const aSnapshot = new Float64Array(a);
      const bSnapshot = new Float64Array(b);

      const result = multiplyTypedRecursive(a, b);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
      assert.deepEqual(a, aSnapshot);
      assert.deepEqual(b, bSnapshot);

      const squared = multiplyTypedRecursive(a, a);
      assert.notEqual(squared, a);
      assert.deepEqual(a, aSnapshot);
      assert.deepEqual(squared, new Float64Array([2.25, 6.25, 12.25, 20.25, 30.25]));
    });
  });

  describe('input validation', () => {
    it('throws TypeError when first argument is not a Float64Array', () => {
      const valid = new Float64Array([1, 2, 3]);
      const invalidInputs = [
        null,
        undefined,
        [1, 2, 3],
        new Float32Array([1, 2, 3]),
        new Int32Array([1, 2, 3]),
        new Uint8Array([1, 2, 3]),
        '123',
        123,
        { length: 3, 0: 1, 1: 2, 2: 3 },
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => multiplyTypedRecursive(bad, valid), TypeError);
      }
    });

    it('throws TypeError when second argument is not a Float64Array', () => {
      const valid = new Float64Array([1, 2, 3]);
      const invalidInputs = [
        null,
        undefined,
        [1, 2, 3],
        new Float32Array([1, 2, 3]),
        new Int32Array([1, 2, 3]),
        '123',
        42,
        {},
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => multiplyTypedRecursive(valid, bad), TypeError);
      }
    });

    it('throws RangeError when lengths do not match', () => {
      assert.throws(
        () => multiplyTypedRecursive(new Float64Array(0), new Float64Array([1])),
        RangeError
      );
      assert.throws(
        () => multiplyTypedRecursive(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
        RangeError
      );
      assert.throws(
        () => multiplyTypedRecursive(new Float64Array([1, 2, 3, 4]), new Float64Array([1])),
        RangeError
      );
    });
  });

  describe('cross-check against independent iterative computation', () => {
    it('matches iterative element-wise multiplication across varied sizes and values', () => {
      // Deterministic LCG for reproducible floating-point test data
      let state = 0x12345678;
      const nextFloat = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state / 0xffffffff - 0.5) * 2000;
      };

      for (const len of [0, 1, 2, 3, 7, 16, 63, 257, 1500]) {
        const a = new Float64Array(len);
        const b = new Float64Array(len);
        for (let i = 0; i < len; i++) {
          a[i] = nextFloat();
          b[i] = nextFloat();
        }

        const expected = new Float64Array(len);
        for (let i = 0; i < len; i++) {
          expected[i] = a[i] * b[i];
        }

        const actual = multiplyTypedRecursive(a, b);
        assert.equal(actual.length, expected.length);
        for (let i = 0; i < len; i++) {
          assert.equal(Object.is(actual[i], expected[i]), true);
        }
      }
    });
  });
});
