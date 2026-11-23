import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notFuzzyIterative } from './notFuzzyIterative.js';

const EPS = 1e-12;

function assertClose(actual, expected, eps = EPS, message) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    message ?? `Expected ${actual} to be within ${eps} of ${expected}`
  );
}

describe('notFuzzyIterative', () => {
  describe('normal cases', () => {
    it('computes Zadeh NOT for scalar membership values', () => {
      assert.equal(notFuzzyIterative(0), 1);
      assert.equal(notFuzzyIterative(1), 0);
      assert.equal(notFuzzyIterative(0.5), 0.5);
      assert.equal(notFuzzyIterative(0.25), 0.75);
      assert.equal(notFuzzyIterative(0.75), 0.25);
      assertClose(notFuzzyIterative(0.1), 0.9);
      assertClose(notFuzzyIterative(0.3), 0.7);
      assertClose(notFuzzyIterative(0.85), 0.15);
    });

    it('computes Zadeh NOT for fuzzy sets represented as arrays without mutating input', () => {
      const input = [0, 0.25, 0.5, 0.75, 1];
      const snapshot = [...input];
      const result = notFuzzyIterative(input);

      assert.deepEqual(result, [1, 0.75, 0.5, 0.25, 0]);
      assert.deepEqual(input, snapshot);
      assert.notEqual(result, input);
    });

    it('computes Zadeh NOT for fuzzy sets represented as plain objects without mutating input', () => {
      const input = { cold: 0.2, warm: 0.75, hot: 1, freezing: 0 };
      const snapshot = { ...input };
      const result = notFuzzyIterative(input);

      assert.deepEqual(Object.keys(result), ['cold', 'warm', 'hot', 'freezing']);
      assertClose(result.cold, 0.8);
      assert.equal(result.warm, 0.25);
      assert.equal(result.hot, 0);
      assert.equal(result.freezing, 1);
      assert.deepEqual(input, snapshot);
      assert.notEqual(result, input);
    });

    it('computes Zadeh NOT for fuzzy sets represented as Maps without mutating input', () => {
      const objKey = { id: 1 };
      const input = new Map([
        ['low', 0],
        [42, 0.4],
        [objKey, 1],
      ]);
      const result = notFuzzyIterative(input);

      assert.ok(result instanceof Map);
      assert.notEqual(result, input);
      assert.equal(result.size, 3);
      assert.equal(result.get('low'), 1);
      assertClose(result.get(42), 0.6);
      assert.equal(result.get(objKey), 0);

      // Original map remains unchanged
      assert.equal(input.get('low'), 0);
      assert.equal(input.get(42), 0.4);
      assert.equal(input.get(objKey), 1);
    });
  });

  describe('edge cases', () => {
    it('handles boundary and near-boundary floating-point values', () => {
      assert.equal(Object.is(notFuzzyIterative(1), 0), true);
      assert.equal(Object.is(notFuzzyIterative(0), 1), true);
      assert.equal(Object.is(notFuzzyIterative(-0), 1), true);
      assert.equal(notFuzzyIterative(Number.MIN_VALUE), 1);
      assertClose(notFuzzyIterative(1 - Number.EPSILON), Number.EPSILON, 1e-16);
    });

    it('handles empty collections', () => {
      assert.deepEqual(notFuzzyIterative([]), []);
      assert.deepEqual(notFuzzyIterative({}), {});
      const emptyMap = notFuzzyIterative(new Map());
      assert.ok(emptyMap instanceof Map);
      assert.equal(emptyMap.size, 0);
    });

    it('handles single-element collections', () => {
      assert.deepEqual(notFuzzyIterative([0.5]), [0.5]);
      assert.deepEqual(notFuzzyIterative({ only: 0 }), { only: 1 });
      const singleMap = notFuzzyIterative(new Map([['only', 1]]));
      assert.equal(singleMap.get('only'), 0);
    });

    it('preserves null-prototype plain objects', () => {
      const input = Object.create(null);
      input.a = 0.25;
      input.b = 1;
      const result = notFuzzyIterative(input);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.equal(result.a, 0.75);
      assert.equal(result.b, 0);
    });

    it('handles large fuzzy sets iteratively without stack overflow', () => {
      const size = 20000;
      const input = new Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = i / (size - 1);
      }
      const result = notFuzzyIterative(input);
      assert.equal(result.length, size);
      assert.equal(result[0], 1);
      assert.equal(result[size - 1], 0);
      assertClose(result[Math.floor(size / 2)], 1 - input[Math.floor(size / 2)]);
    });
  });

  describe('invalid inputs', () => {
    it('rejects out-of-range and non-finite scalar values with RangeError', () => {
      for (const bad of [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]) {
        assert.throws(() => notFuzzyIterative(bad), RangeError);
      }
    });

    it('rejects unsupported top-level types with TypeError', () => {
      class CustomFuzzy {}
      for (const bad of [
        null,
        undefined,
        '0.5',
        true,
        false,
        1n,
        Symbol('s'),
        () => 0.5,
        new Set([0.5]),
        new Date(),
        /abc/,
        new CustomFuzzy(),
      ]) {
        assert.throws(() => notFuzzyIterative(bad), TypeError);
      }
    });

    it('rejects invalid elements and sparse holes in arrays', () => {
      assert.throws(() => notFuzzyIterative([0.5, -0.1]), RangeError);
      assert.throws(() => notFuzzyIterative([0.5, 1.2]), RangeError);
      assert.throws(() => notFuzzyIterative([0.5, NaN]), RangeError);
      assert.throws(() => notFuzzyIterative([0.5, Infinity]), RangeError);
      assert.throws(() => notFuzzyIterative([0.5, '0.2']), TypeError);
      assert.throws(() => notFuzzyIterative([0.5, null]), TypeError);
      assert.throws(() => notFuzzyIterative([0.5, undefined]), TypeError);

      // Sparse array with hole
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [0.2, , 0.8];
      assert.throws(() => notFuzzyIterative(sparse), TypeError);
    });

    it('rejects invalid values in plain objects and Maps', () => {
      assert.throws(() => notFuzzyIterative({ a: 0.5, b: -0.5 }), RangeError);
      assert.throws(() => notFuzzyIterative({ a: 0.5, b: 1.5 }), RangeError);
      assert.throws(() => notFuzzyIterative({ a: NaN }), RangeError);
      assert.throws(() => notFuzzyIterative({ a: '0.5' }), TypeError);
      assert.throws(() => notFuzzyIterative({ a: undefined }), TypeError);

      assert.throws(() => notFuzzyIterative(new Map([['a', -1]])), RangeError);
      assert.throws(() => notFuzzyIterative(new Map([['a', Infinity]])), RangeError);
      assert.throws(() => notFuzzyIterative(new Map([['a', true]])), TypeError);
    });
  });

  describe('independent cross-checks (Zadeh fuzzy algebra & reference oracle)', () => {
    it('satisfies involution: not(not(x)) === x across scalars, arrays, objects, and Maps', () => {
      const values = [0, 0.05, 0.17, 0.33, 0.5, 0.67, 0.83, 0.95, 1];
      for (const v of values) {
        assertClose(notFuzzyIterative(notFuzzyIterative(v)), v);
      }

      const arrDouble = notFuzzyIterative(notFuzzyIterative(values));
      for (let i = 0; i < values.length; i++) {
        assertClose(arrDouble[i], values[i]);
      }

      const obj = { a: 0.12, b: 0.5, c: 0.88 };
      const objDouble = notFuzzyIterative(notFuzzyIterative(obj));
      for (const k of Object.keys(obj)) {
        assertClose(objDouble[k], obj[k]);
      }

      const map = new Map([['x', 0.19], ['y', 0.81]]);
      const mapDouble = notFuzzyIterative(notFuzzyIterative(map));
      for (const [k, v] of map) {
        assertClose(mapDouble.get(k), v);
      }
    });

    it('satisfies antitonicity (order reversal): a <= b implies not(a) >= not(b)', () => {
      const steps = 100;
      let prev = notFuzzyIterative(0);
      for (let i = 1; i <= steps; i++) {
        const curr = notFuzzyIterative(i / steps);
        assert.ok(curr <= prev, `Expected not(${i / steps})=${curr} <= ${prev}`);
        prev = curr;
      }
    });

    it('satisfies De Morgan laws with Zadeh AND (min) and OR (max)', () => {
      const zadehAnd = (a, b) => Math.min(a, b);
      const zadehOr = (a, b) => Math.max(a, b);
      const grid = [0, 0.1, 0.25, 0.5, 0.7, 0.9, 1];

      for (const a of grid) {
        for (const b of grid) {
          // ¬(a ∧ b) = (¬a) ∨ (¬b)
          assertClose(
            notFuzzyIterative(zadehAnd(a, b)),
            zadehOr(notFuzzyIterative(a), notFuzzyIterative(b))
          );
          // ¬(a ∨ b) = (¬a) ∧ (¬b)
          assertClose(
            notFuzzyIterative(zadehOr(a, b)),
            zadehAnd(notFuzzyIterative(a), notFuzzyIterative(b))
          );
        }
      }

      // Set-level De Morgan check on arrays
      const setA = [0, 0.2, 0.5, 0.8, 1];
      const setB = [1, 0.6, 0.5, 0.3, 0];
      const andAB = setA.map((v, i) => zadehAnd(v, setB[i]));
      const orAB = setA.map((v, i) => zadehOr(v, setB[i]));
      const notA = notFuzzyIterative(setA);
      const notB = notFuzzyIterative(setB);

      const lhs1 = notFuzzyIterative(andAB);
      const rhs1 = notA.map((v, i) => zadehOr(v, notB[i]));
      const lhs2 = notFuzzyIterative(orAB);
      const rhs2 = notA.map((v, i) => zadehAnd(v, notB[i]));

      for (let i = 0; i < setA.length; i++) {
        assertClose(lhs1[i], rhs1[i]);
        assertClose(lhs2[i], rhs2[i]);
      }
    });

    it('matches an independent recursive reference oracle on pseudo-random fuzzy sets', () => {
      // Independent recursive oracle for arrays
      function recursiveNot(arr, idx = 0) {
        if (idx === arr.length) return [];
        return [1 - arr[idx], ...recursiveNot(arr, idx + 1)];
      }

      // Deterministic LCG pseudo-random generator in [0, 1]
      let seed = 1337;
      const nextUnit = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      };

      const sample = Array.from({ length: 120 }, () => nextUnit());
      const actual = notFuzzyIterative(sample);
      const expected = recursiveNot(sample);

      assert.equal(actual.length, expected.length);
      for (let i = 0; i < sample.length; i++) {
        assert.equal(actual[i], expected[i]);
        assert.ok(actual[i] >= 0 && actual[i] <= 1);
      }
    });
  });
});
