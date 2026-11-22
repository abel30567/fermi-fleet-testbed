import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sinTypedRecursive } from './sinTypedRecursive.js';

/**
 * Helper to assert two numbers are within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [eps=1e-12]
 */
function assertClose(actual, expected, eps = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected} (diff=${Math.abs(actual - expected)})`,
  );
}

/**
 * Independent sine approximation via Maclaurin / Taylor series:
 *   sin(x) = sum_{k=0}^{terms-1} (-1)^k * x^(2k+1) / (2k+1)!
 * Accurate to full double precision for |x| <= pi with terms >= 15.
 *
 * @param {number} x
 * @param {number} [terms=18]
 * @returns {number}
 */
function sinTaylor(x, terms = 18) {
  let term = x;
  let sum = x;
  for (let k = 1; k < terms; k += 1) {
    term *= (-x * x) / (2 * k * (2 * k + 1));
    sum += term;
  }
  return sum;
}

describe('sinTypedRecursive', () => {
  describe('normal cases across array lengths', () => {
    it('handles an empty Float64Array', () => {
      const input = new Float64Array(0);
      const output = sinTypedRecursive(input);

      assert.ok(output instanceof Float64Array);
      assert.equal(output.length, 0);
      assert.notEqual(output, input);
    });

    it('handles a single-element Float64Array', () => {
      const input = new Float64Array([Math.PI / 6]);
      const output = sinTypedRecursive(input);

      assert.ok(output instanceof Float64Array);
      assert.equal(output.length, 1);
      assertClose(output[0], 0.5);
    });

    it('handles odd-length Float64Arrays', () => {
      const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2];
      const expected = [0, 0.5, Math.SQRT1_2, Math.sqrt(3) / 2, 1];
      const output = sinTypedRecursive(new Float64Array(angles));

      assert.equal(output.length, angles.length);
      for (let i = 0; i < angles.length; i += 1) {
        assertClose(output[i], expected[i]);
      }
    });

    it('handles even-length Float64Arrays', () => {
      const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      const expected = [0, 1, 0, -1];
      const output = sinTypedRecursive(new Float64Array(angles));

      assert.equal(output.length, angles.length);
      for (let i = 0; i < angles.length; i += 1) {
        assertClose(output[i], expected[i]);
      }
    });

    it('handles larger Float64Arrays (non-power-of-two length)', () => {
      const n = 1025;
      const input = new Float64Array(n);
      for (let i = 0; i < n; i += 1) {
        input[i] = ((i - 512) / 512) * 4 * Math.PI;
      }

      const output = sinTypedRecursive(input);
      assert.ok(output instanceof Float64Array);
      assert.equal(output.length, n);
      for (let i = 0; i < n; i += 1) {
        assertClose(output[i], Math.sin(input[i]), 1e-15);
      }
    });
  });

  describe('edge cases and immutability', () => {
    it('evaluates special angles accurately (0, -0, pi/2, pi, negative angles)', () => {
      const input = new Float64Array([
        0,
        -0,
        Math.PI / 2,
        Math.PI,
        -Math.PI / 2,
        -Math.PI,
        -Math.PI / 6,
        2 * Math.PI,
      ]);
      const output = sinTypedRecursive(input);

      assert.ok(Object.is(output[0], 0));
      assert.ok(Object.is(output[1], -0));
      assertClose(output[2], 1);
      assertClose(output[3], 0);
      assertClose(output[4], -1);
      assertClose(output[5], 0);
      assertClose(output[6], -0.5);
      assertClose(output[7], 0);
    });

    it('handles very small and large finite angles', () => {
      const input = new Float64Array([1e-12, -1e-12, 1e6, -1e6]);
      const output = sinTypedRecursive(input);

      assertClose(output[0], 1e-12, 1e-24);
      assertClose(output[1], -1e-12, 1e-24);
      assertClose(output[2], Math.sin(1e6), 1e-15);
      assertClose(output[3], -Math.sin(1e6), 1e-15);
    });

    it('does not mutate the input Float64Array and returns a distinct instance', () => {
      const original = [0.25, -0.75, 1.5, Math.PI / 3, -2.1];
      const input = new Float64Array(original);
      const output = sinTypedRecursive(input);

      assert.notEqual(output, input);
      assert.notEqual(output.buffer, input.buffer);
      assert.deepEqual(Array.from(input), original);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-Float64Array inputs', () => {
      const invalidInputs = [
        null,
        undefined,
        0,
        '0',
        {},
        [0, 1, 2],
        new Float32Array([0, 1]),
        new Int32Array([0, 1]),
        new Uint8Array([0, 1]),
        new ArrayBuffer(16),
      ];

      for (const bad of invalidInputs) {
        assert.throws(
          () => sinTypedRecursive(bad),
          { name: 'TypeError' },
          `expected TypeError for input ${Object.prototype.toString.call(bad)}`,
        );
      }
    });

    it('throws RangeError when any element is NaN, Infinity, or -Infinity', () => {
      const nonFiniteCases = [
        new Float64Array([NaN]),
        new Float64Array([Infinity]),
        new Float64Array([-Infinity]),
        new Float64Array([NaN, 0, 1, 2]),
        new Float64Array([0, 1, Infinity, 2, 3]),
        new Float64Array([0, 1, 2, 3, -Infinity]),
      ];

      for (const bad of nonFiniteCases) {
        assert.throws(
          () => sinTypedRecursive(bad),
          { name: 'RangeError' },
        );
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('agrees with an independent Maclaurin/Taylor series over [-pi, pi]', () => {
      const sampleCount = 65;
      const input = new Float64Array(sampleCount);
      for (let i = 0; i < sampleCount; i += 1) {
        input[i] = -Math.PI + (2 * Math.PI * i) / (sampleCount - 1);
      }

      const output = sinTypedRecursive(input);
      for (let i = 0; i < sampleCount; i += 1) {
        assertClose(output[i], sinTaylor(input[i]), 1e-12);
      }
    });

    it('satisfies Pythagorean identity sin^2(x) + cos^2(x) = 1 and odd symmetry sin(-x) = -sin(x)', () => {
      const positive = new Float64Array([0.1, 0.5, 1.0, 1.7, 2.3, 3.0, 5.5]);
      const negative = new Float64Array(positive.length);
      for (let i = 0; i < positive.length; i += 1) {
        negative[i] = -positive[i];
      }

      const sinPos = sinTypedRecursive(positive);
      const sinNeg = sinTypedRecursive(negative);

      for (let i = 0; i < positive.length; i += 1) {
        const cosVal = Math.cos(positive[i]);
        assertClose(sinPos[i] * sinPos[i] + cosVal * cosVal, 1, 1e-12);
        assertClose(sinNeg[i], -sinPos[i], 1e-15);
      }
    });
  });
});
