import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeTypedMemo } from './derivativeTypedMemo.js';

/**
 * Helper to assert two Float64Arrays are element-wise close within `tol`.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} tol
 * @param {string} [label]
 */
function assertArrayClose(actual, expected, tol, label = '') {
  assert.ok(actual instanceof Float64Array, `${label} result must be a Float64Array`);
  assert.equal(actual.length, expected.length, `${label} length mismatch`);
  for (let i = 0; i < actual.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    assert.ok(
      diff <= tol,
      `${label} mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${tol}`
    );
  }
}

describe('derivativeTypedMemo', () => {
  describe('normal cases', () => {
    it('returns all zeros for a constant function', () => {
      const values = new Float64Array([7.5, 7.5, 7.5, 7.5, 7.5, 7.5]);
      const d1 = derivativeTypedMemo(values);
      const d2 = derivativeTypedMemo(values, 0.25);

      assertArrayClose(d1, [0, 0, 0, 0, 0, 0], 1e-12, 'constant h=1');
      assertArrayClose(d2, [0, 0, 0, 0, 0, 0], 1e-12, 'constant h=0.25');
    });

    it('is exact for a linear function f(x) = 3x - 4', () => {
      const h = 0.5;
      const n = 10;
      const values = new Float64Array(n);
      const expected = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const x = i * h;
        values[i] = 3 * x - 4;
        expected[i] = 3;
      }

      const result = derivativeTypedMemo(values, h);
      assertArrayClose(result, expected, 1e-12, 'linear');
    });

    it('is exact (including boundaries) for a quadratic function f(x) = 2x^2 - 5x + 1', () => {
      const h = 0.2;
      const n = 15;
      const values = new Float64Array(n);
      const expected = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const x = -1 + i * h;
        values[i] = 2 * x * x - 5 * x + 1;
        expected[i] = 4 * x - 5;
      }

      const result = derivativeTypedMemo(values, h);
      assertArrayClose(result, expected, 1e-11, 'quadratic');
    });

    it('accurately approximates d/dx sin(x) = cos(x) across interior and boundary points', () => {
      const h = 0.01;
      const n = 629; // ~ [0, 2*pi]
      const values = new Float64Array(n);
      const expected = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const x = i * h;
        values[i] = Math.sin(x);
        expected[i] = Math.cos(x);
      }

      const result = derivativeTypedMemo(values, h);
      // 2nd-order stencil error is O(h^2) ~ 1e-4 (boundary error ~ (1/3)h^2)
      assertArrayClose(result, expected, 1e-4, 'sin(x) -> cos(x)');
    });

    it('defaults h to 1 when omitted', () => {
      const values = new Float64Array([0, 1, 4, 9, 16]);
      const defaultH = derivativeTypedMemo(values);
      const explicitH = derivativeTypedMemo(values, 1);

      assertArrayClose(defaultH, [0, 2, 4, 6, 8], 1e-12, 'default h=1');
      assert.deepEqual(defaultH, explicitH);
    });
  });

  describe('edge cases', () => {
    it('handles empty and small arrays (length 0, 1, 2, 3)', () => {
      const d0 = derivativeTypedMemo(new Float64Array(0), 0.5);
      assert.ok(d0 instanceof Float64Array);
      assert.equal(d0.length, 0);

      const d1 = derivativeTypedMemo(new Float64Array([42]), 0.5);
      assertArrayClose(d1, [0], 0, 'length 1');

      const d2 = derivativeTypedMemo(new Float64Array([2, 7]), 0.5);
      assertArrayClose(d2, [10, 10], 1e-12, 'length 2');

      const d3 = derivativeTypedMemo(new Float64Array([1, 4, 9]), 1);
      assertArrayClose(d3, [2, 4, 6], 1e-12, 'length 3');
    });

    it('handles Float64Array subarray views with non-zero byteOffset', () => {
      const backing = new Float64Array([999, 0, 1, 4, 9, 16, -999]);
      const sub = backing.subarray(1, 6);
      const result = derivativeTypedMemo(sub, 1);
      assertArrayClose(result, [0, 2, 4, 6, 8], 1e-12, 'subarray');
    });

    it('throws RangeError for invalid h (<= 0, NaN, Infinity)', () => {
      const values = new Float64Array([1, 2, 3]);
      for (const badH of [0, -0, -1, -1e-9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        assert.throws(() => derivativeTypedMemo(values, badH), RangeError);
      }
    });

    it('throws TypeError for invalid input types', () => {
      for (const badValues of [null, undefined, [1, 2, 3], new Float32Array([1, 2, 3]), new Int32Array([1, 2, 3]), '123', {}]) {
        assert.throws(() => derivativeTypedMemo(badValues), TypeError);
      }

      const valid = new Float64Array([1, 2, 3]);
      for (const badH of ['1', null, true, {}, []]) {
        assert.throws(() => derivativeTypedMemo(valid, badH), TypeError);
      }
    });

    it('memoizes repeated calls while preserving strict cache isolation on input and output mutation', () => {
      const input = new Float64Array([0, 1, 4, 9, 16]);

      const first = derivativeTypedMemo(input, 1);
      const second = derivativeTypedMemo(input, 1);

      // Returns a new Float64Array instance even on cache hit
      assert.notEqual(first, second);
      assert.deepEqual(first, second);

      // Mutating a returned result must not corrupt the cached value
      first[0] = 123456;
      first[2] = -999999;
      const third = derivativeTypedMemo(input, 1);
      assertArrayClose(third, [0, 2, 4, 6, 8], 1e-12, 'isolated after output mutation');

      // Mutating the input array in place must invalidate/miss the old cache entry
      input.set([0, 2, 8, 18, 32]); // 2 * x^2 -> derivative 4x
      const fourth = derivativeTypedMemo(input, 1);
      assertArrayClose(fourth, [0, 4, 8, 12, 16], 1e-12, 'isolated after input mutation');

      // Different step sizes for identical input values must not collide in cache
      const halfStep = derivativeTypedMemo(input, 0.5);
      assertArrayClose(halfStep, [0, 8, 16, 24, 32], 1e-12, 'distinct h cache key');
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies linearity (a*f + b*g)\' = a*f\' + b*g\' to machine precision', () => {
      const h = 0.05;
      const n = 50;
      const a = 2.75;
      const b = -1.4;

      const f = new Float64Array(n);
      const g = new Float64Array(n);
      const combined = new Float64Array(n);

      for (let i = 0; i < n; i++) {
        const x = i * h;
        f[i] = Math.exp(-0.3 * x) * Math.sin(2 * x);
        g[i] = Math.cos(1.5 * x) + 0.25 * x * x;
        combined[i] = a * f[i] + b * g[i];
      }

      const df = derivativeTypedMemo(f, h);
      const dg = derivativeTypedMemo(g, h);
      const dCombined = derivativeTypedMemo(combined, h);

      const linearCombination = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        linearCombination[i] = a * df[i] + b * dg[i];
      }

      assertArrayClose(dCombined, linearCombination, 1e-11, 'linearity');
    });

    it('matches analytic derivative of cubic polynomial with O(h^2) convergence rate', () => {
      // f(x) = x^3 - 2x^2 + 3x - 5, f'(x) = 3x^2 - 4x + 3
      const maxErrorForStep = (h) => {
        const n = Math.round(2 / h) + 1;
        const values = new Float64Array(n);
        const analytic = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const x = -1 + i * h;
          values[i] = x ** 3 - 2 * x ** 2 + 3 * x - 5;
          analytic[i] = 3 * x ** 2 - 4 * x + 3;
        }
        const numeric = derivativeTypedMemo(values, h);
        let maxErr = 0;
        for (let i = 0; i < n; i++) {
          maxErr = Math.max(maxErr, Math.abs(numeric[i] - analytic[i]));
        }
        return maxErr;
      };

      const errCoarse = maxErrorForStep(0.1);
      const errFine = maxErrorForStep(0.05);
      // Halving h should reduce O(h^2) error by a factor of ~4
      const ratio = errCoarse / errFine;
      assert.ok(
        ratio > 3.9 && ratio < 4.1,
        `expected O(h^2) convergence ratio ~4, got ${ratio} (coarse=${errCoarse}, fine=${errFine})`
      );
    });
  });
});
