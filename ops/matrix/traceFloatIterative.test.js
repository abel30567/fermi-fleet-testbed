import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceFloatIterative } from './traceFloatIterative.js';

/**
 * Helper: multiply two n x n matrices.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matMul(a, b) {
  const n = a.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) {
        s += a[i][k] * b[k][j];
      }
      out[i][j] = s;
    }
  }
  return out;
}

/**
 * Helper: linear combination alpha * A + beta * B.
 * @param {number[][]} a
 * @param {number[][]} b
 * @param {number} alpha
 * @param {number} beta
 * @returns {number[][]}
 */
function matLinearComb(a, b, alpha, beta) {
  const n = a.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => alpha * a[i][j] + beta * b[i][j])
  );
}

/**
 * Helper: transpose an n x n matrix.
 * @param {number[][]} a
 * @returns {number[][]}
 */
function matTranspose(a) {
  const n = a.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => a[j][i])
  );
}

describe('traceFloatIterative', () => {
  describe('normal cases', () => {
    it('computes trace of 1x1 matrices', () => {
      assert.equal(traceFloatIterative([[42]]), 42);
      assert.equal(traceFloatIterative([[-3.5]]), -3.5);
      assert.equal(traceFloatIterative([[0]]), 0);
    });

    it('computes trace of 2x2 and 3x3 matrices', () => {
      assert.equal(
        traceFloatIterative([
          [1, 2],
          [3, 4],
        ]),
        5
      );
      assert.equal(
        traceFloatIterative([
          [1.5, 2, -3],
          [4, -2.25, 6],
          [7, 8, 0.75],
        ]),
        0
      );
    });

    it('computes trace of identity and zero matrices', () => {
      const n = 5;
      const identity = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
      );
      const zero = Array.from({ length: n }, () => new Array(n).fill(0));
      assert.equal(traceFloatIterative(identity), n);
      assert.equal(traceFloatIterative(zero), 0);
    });

    it('computes trace of a larger matrix accurately', () => {
      const n = 20;
      const m = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? (i + 1) * 0.5 : i - j))
      );
      // Sum of 0.5 * (1 + 2 + ... + 20) = 0.5 * 210 = 105
      assert.equal(traceFloatIterative(m), 105);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for an empty 0x0 matrix', () => {
      assert.equal(traceFloatIterative([]), 0);
    });

    it('handles negative zero and extreme finite float64 magnitudes', () => {
      assert.equal(
        traceFloatIterative([
          [-0, 1],
          [2, -0],
        ]),
        0
      );
      assert.equal(
        traceFloatIterative([
          [2 ** 500, 0],
          [0, 2 ** 501],
        ]),
        3 * 2 ** 500
      );
      assert.equal(
        traceFloatIterative([
          [1e150, 0],
          [0, 2e150],
        ]),
        1e150 + 2e150
      );
      assert.equal(
        traceFloatIterative([
          [Number.MIN_VALUE, 0],
          [0, Number.MIN_VALUE],
        ]),
        2 * Number.MIN_VALUE
      );
    });

    it('does not mutate the input matrix', () => {
      const original = [
        [1.25, -2.5],
        [3.75, 4.5],
      ];
      const snapshot = structuredClone(original);
      assert.equal(traceFloatIterative(original), 5.75);
      assert.deepEqual(original, snapshot);
    });
  });

  describe('input validation', () => {
    it('rejects non-array top-level inputs', () => {
      for (const bad of [null, undefined, 42, '[[1]]', {}, true]) {
        assert.throws(() => traceFloatIterative(bad), TypeError);
      }
    });

    it('rejects non-array rows and sparse outer arrays', () => {
      assert.throws(() => traceFloatIterative([1, 2]), TypeError);
      assert.throws(() => traceFloatIterative([[1, 2], null]), TypeError);
      // eslint-disable-next-line no-sparse-arrays
      assert.throws(() => traceFloatIterative([, [1, 2]]), TypeError);
    });

    it('rejects rectangular and ragged matrices', () => {
      assert.throws(
        () =>
          traceFloatIterative([
            [1, 2, 3],
            [4, 5, 6],
          ]),
        RangeError
      );
      assert.throws(() => traceFloatIterative([[1], [2]]), RangeError);
      assert.throws(
        () =>
          traceFloatIterative([
            [1, 2],
            [3],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          traceFloatIterative([
            [1, 2],
            [3, 4, 5],
          ]),
        RangeError
      );
    });

    it('rejects non-number elements on and off the diagonal', () => {
      assert.throws(
        () =>
          traceFloatIterative([
            ['1', 0],
            [0, 1],
          ]),
        TypeError
      );
      assert.throws(
        () =>
          traceFloatIterative([
            [1, null],
            [0, 1],
          ]),
        TypeError
      );
      assert.throws(
        () =>
          traceFloatIterative([
            [1, undefined],
            [0, 1],
          ]),
        TypeError
      );
      assert.throws(
        () =>
          traceFloatIterative([
            [1, 2n],
            [0, 1],
          ]),
        TypeError
      );
      // Sparse row
      const sparseRow = new Array(2);
      sparseRow[0] = 1;
      assert.throws(() => traceFloatIterative([sparseRow, [0, 1]]), TypeError);
    });

    it('rejects non-finite float64 values on and off the diagonal', () => {
      assert.throws(
        () =>
          traceFloatIterative([
            [Number.NaN, 0],
            [0, 1],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          traceFloatIterative([
            [1, Number.POSITIVE_INFINITY],
            [0, 1],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          traceFloatIterative([
            [1, 0],
            [Number.NEGATIVE_INFINITY, 1],
          ]),
        RangeError
      );
    });
  });

  describe('algebraic cross-checks', () => {
    const A = [
      [2.5, -1.25, 3.0],
      [0.5, 4.75, -2.0],
      [-1.0, 2.25, 1.5],
    ];
    const B = [
      [-0.75, 1.5, 2.25],
      [3.25, -2.0, 0.5],
      [1.75, -0.5, 4.0],
    ];

    it('satisfies linearity: tr(alpha*A + beta*B) = alpha*tr(A) + beta*tr(B)', () => {
      const sum = matLinearComb(A, B, 1, 1);
      assert.ok(
        Math.abs(
          traceFloatIterative(sum) -
            (traceFloatIterative(A) + traceFloatIterative(B))
        ) < 1e-12
      );

      const alpha = 2.75;
      const beta = -1.5;
      const comb = matLinearComb(A, B, alpha, beta);
      assert.ok(
        Math.abs(
          traceFloatIterative(comb) -
            (alpha * traceFloatIterative(A) + beta * traceFloatIterative(B))
        ) < 1e-12
      );
    });

    it('satisfies cyclic property: tr(A * B) = tr(B * A)', () => {
      const ab = matMul(A, B);
      const ba = matMul(B, A);
      assert.ok(
        Math.abs(traceFloatIterative(ab) - traceFloatIterative(ba)) < 1e-12
      );
    });

    it('satisfies transpose invariance: tr(A^T) = tr(A)', () => {
      assert.equal(traceFloatIterative(matTranspose(A)), traceFloatIterative(A));
    });

    it('satisfies similarity invariance: tr(P * A * P^-1) = tr(A)', () => {
      // Unimodular upper/lower product with exact integer inverse
      const P = [
        [1, 2, -1],
        [0, 1, 3],
        [0, 0, 1],
      ];
      const Pinv = [
        [1, -2, 7],
        [0, 1, -3],
        [0, 0, 1],
      ];
      const similar = matMul(matMul(P, A), Pinv);
      assert.ok(
        Math.abs(traceFloatIterative(similar) - traceFloatIterative(A)) < 1e-12
      );
    });
  });
});
