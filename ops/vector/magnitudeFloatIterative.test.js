import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeFloatIterative } from './magnitudeFloatIterative.js';

/**
 * Helper to assert two finite numbers are close within a relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 */
function assertClose(actual, expected, relTol = 1e-12) {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), Number.MIN_VALUE);
  assert.ok(
    diff <= relTol * scale,
    `Expected ${actual} to be within relative tolerance ${relTol} of ${expected} (diff=${diff})`
  );
}

describe('magnitudeFloatIterative', () => {
  describe('normal cases', () => {
    it('computes classic 3-4-5 right triangle', () => {
      assert.equal(magnitudeFloatIterative([3, 4]), 5);
      assert.equal(magnitudeFloatIterative([-3, -4]), 5);
      assert.equal(magnitudeFloatIterative([3, -4]), 5);
    });

    it('computes unit basis vectors in 1D, 2D, and 3D', () => {
      assert.equal(magnitudeFloatIterative([1]), 1);
      assert.equal(magnitudeFloatIterative([-1]), 1);
      assert.equal(magnitudeFloatIterative([1, 0]), 1);
      assert.equal(magnitudeFloatIterative([0, -1, 0]), 1);
      assert.equal(magnitudeFloatIterative([0, 0, 1]), 1);
    });

    it('computes n-dimensional vectors', () => {
      assert.equal(magnitudeFloatIterative([1, 2, 2]), 3);
      assert.equal(magnitudeFloatIterative([2, 3, 6]), 7);
      assert.equal(magnitudeFloatIterative([1, 1, 1, 1]), 2);
      assertClose(magnitudeFloatIterative([1, 2, 3, 4, 5]), Math.sqrt(55));
    });

    it('handles single-element vectors accurately', () => {
      assert.equal(magnitudeFloatIterative([42.5]), 42.5);
      assert.equal(magnitudeFloatIterative([-42.5]), 42.5);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for an empty vector', () => {
      const result = magnitudeFloatIterative([]);
      assert.equal(result, 0);
      assert.equal(Object.is(result, 0), true);
    });

    it('returns +0 for zero vectors including negative zero', () => {
      assert.equal(Object.is(magnitudeFloatIterative([0]), 0), true);
      assert.equal(Object.is(magnitudeFloatIterative([-0]), 0), true);
      assert.equal(Object.is(magnitudeFloatIterative([0, -0, 0, -0]), 0), true);
    });

    it('avoids intermediate overflow for very large components', () => {
      const result = magnitudeFloatIterative([3e307, 4e307]);
      assert.equal(Number.isFinite(result), true);
      assertClose(result, 5e307);

      const large2 = magnitudeFloatIterative([1e308, 1e308]);
      assert.equal(Number.isFinite(large2), true);
      assertClose(large2, Math.SQRT2 * 1e308);
    });

    it('returns Infinity when the true magnitude overflows float64', () => {
      assert.equal(
        magnitudeFloatIterative([Number.MAX_VALUE, Number.MAX_VALUE]),
        Infinity
      );
    });

    it('avoids intermediate underflow for very small and subnormal components', () => {
      const result = magnitudeFloatIterative([3e-300, 4e-300]);
      assert.ok(result > 0);
      assertClose(result, 5e-300);

      const subnormal = magnitudeFloatIterative([3e-320, 4e-320]);
      assert.ok(subnormal > 0);
      assertClose(subnormal, 5e-320, 1e-3);
    });

    it('handles Infinity and -Infinity components', () => {
      assert.equal(magnitudeFloatIterative([Infinity]), Infinity);
      assert.equal(magnitudeFloatIterative([-Infinity]), Infinity);
      assert.equal(magnitudeFloatIterative([1, -Infinity, 3]), Infinity);
      assert.equal(magnitudeFloatIterative([NaN, Infinity]), Infinity);
      assert.equal(magnitudeFloatIterative([-Infinity, NaN]), Infinity);
    });

    it('handles NaN components when no component is infinite', () => {
      assert.equal(Number.isNaN(magnitudeFloatIterative([NaN])), true);
      assert.equal(Number.isNaN(magnitudeFloatIterative([1, NaN, 3])), true);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when input is not an array', () => {
      const invalidInputs = [
        null,
        undefined,
        42,
        '123',
        {},
        { length: 2, 0: 3, 1: 4 },
        new Float64Array([3, 4]),
        true,
      ];
      for (const input of invalidInputs) {
        assert.throws(() => magnitudeFloatIterative(input), TypeError);
      }
    });

    it('throws TypeError when any element is not a number', () => {
      assert.throws(() => magnitudeFloatIterative(['3', 4]), TypeError);
      assert.throws(() => magnitudeFloatIterative([3, null]), TypeError);
      assert.throws(() => magnitudeFloatIterative([3, undefined]), TypeError);
      assert.throws(() => magnitudeFloatIterative([3, true]), TypeError);
      assert.throws(() => magnitudeFloatIterative([3, 4n]), TypeError);
      assert.throws(() => magnitudeFloatIterative([3, {}]), TypeError);
      assert.throws(() => magnitudeFloatIterative([Infinity, 'bad']), TypeError);
      assert.throws(() => magnitudeFloatIterative([NaN, null]), TypeError);
    });

    it('throws TypeError on sparse arrays with holes', () => {
      const sparse = [3, , 4];
      assert.throws(() => magnitudeFloatIterative(sparse), TypeError);
    });
  });

  describe('cross-check against Math.hypot', () => {
    it('matches Math.hypot across diverse vectors', () => {
      const vectors = [
        [],
        [0, 0, 0],
        [3, 4],
        [-5, 12],
        [1, -2, 3, -4, 5, -6],
        [0.1, 0.2, 0.3, 0.4],
        [1e150, 2e150, 3e150],
        [1e-200, 2e-200, 3e-200],
        [1e308, 1e-308],
        [Math.PI, Math.E, Math.SQRT2, -Math.LN10],
        Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? i * 0.5 : -i * 0.25)),
      ];

      for (const v of vectors) {
        const expected = Math.hypot(...v);
        const actual = magnitudeFloatIterative(v);
        if (expected === 0) {
          assert.equal(actual, 0);
        } else {
          assertClose(actual, expected, 1e-14);
        }
      }
    });
  });
});
