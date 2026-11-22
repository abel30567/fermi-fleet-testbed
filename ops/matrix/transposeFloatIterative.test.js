import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeFloatIterative } from './transposeFloatIterative.js';

/**
 * Deterministic PRNG (Mulberry32) for reproducible floating-point test matrices.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Independent functional reference implementation of matrix transpose.
 * @param {number[][]} m
 * @returns {number[][]}
 */
function referenceTranspose(m) {
  return m[0].map((_, colIdx) => m.map((row) => row[colIdx]));
}

describe('transposeFloatIterative', () => {
  describe('normal cases', () => {
    it('transposes a square matrix', () => {
      const input = [
        [1.5, -2.25, 3.75],
        [4.0, 5.125, -6.5],
        [7.25, 8.5, 9.0],
      ];
      const expected = [
        [1.5, 4.0, 7.25],
        [-2.25, 5.125, 8.5],
        [3.75, -6.5, 9.0],
      ];
      assert.deepStrictEqual(transposeFloatIterative(input), expected);
    });

    it('transposes rectangular matrices (wide and tall)', () => {
      const wide = [
        [1.1, 2.2, 3.3],
        [4.4, 5.5, 6.6],
      ];
      const expectedTall = [
        [1.1, 4.4],
        [2.2, 5.5],
        [3.3, 6.6],
      ];
      assert.deepStrictEqual(transposeFloatIterative(wide), expectedTall);
      assert.deepStrictEqual(transposeFloatIterative(expectedTall), wide);
    });

    it('transposes a row vector into a column vector', () => {
      const rowVector = [[0.25, -1.5, 2.75, 42.0]];
      const expected = [[0.25], [-1.5], [2.75], [42.0]];
      assert.deepStrictEqual(transposeFloatIterative(rowVector), expected);
    });

    it('transposes a column vector into a row vector', () => {
      const colVector = [[0.25], [-1.5], [2.75], [42.0]];
      const expected = [[0.25, -1.5, 2.75, 42.0]];
      assert.deepStrictEqual(transposeFloatIterative(colVector), expected);
    });

    it('leaves values invariant for a symmetric matrix while returning a new matrix', () => {
      const symmetric = [
        [1.0, 2.5, -3.5],
        [2.5, 4.0, 5.25],
        [-3.5, 5.25, 6.0],
      ];
      const transposed = transposeFloatIterative(symmetric);
      assert.deepStrictEqual(transposed, symmetric);
      assert.notStrictEqual(transposed, symmetric);
      for (let i = 0; i < symmetric.length; i += 1) {
        assert.notStrictEqual(transposed[i], symmetric[i]);
      }
    });

    it('does not mutate the input matrix and isolates output mutations', () => {
      const input = [
        [1.5, 2.5],
        [3.5, 4.5],
        [5.5, 6.5],
      ];
      const snapshot = structuredClone(input);

      const output = transposeFloatIterative(input);
      assert.deepStrictEqual(input, snapshot);

      output[0][0] = 999.0;
      output.push([0, 0, 0]);
      assert.deepStrictEqual(input, snapshot);
    });
  });

  describe('edge cases', () => {
    it('transposes a 1x1 matrix', () => {
      const input = [[Math.PI]];
      const result = transposeFloatIterative(input);
      assert.deepStrictEqual(result, [[Math.PI]]);
      assert.notStrictEqual(result, input);
      assert.notStrictEqual(result[0], input[0]);
    });

    it('preserves special IEEE-754 float64 values (NaN, +/-Infinity, -0, extremes)', () => {
      const input = [
        [NaN, Infinity, -Infinity],
        [-0, 0, Number.MAX_VALUE],
        [Number.MIN_VALUE, -Number.MAX_VALUE, Number.EPSILON],
      ];

      const result = transposeFloatIterative(input);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].length, 3);
      assert.ok(Number.isNaN(result[0][0]));
      assert.ok(Object.is(result[0][1], -0));
      assert.strictEqual(result[0][2], Number.MIN_VALUE);
      assert.strictEqual(result[1][0], Infinity);
      assert.ok(Object.is(result[1][1], 0));
      assert.strictEqual(result[1][2], -Number.MAX_VALUE);
      assert.strictEqual(result[2][0], -Infinity);
      assert.strictEqual(result[2][1], Number.MAX_VALUE);
      assert.strictEqual(result[2][2], Number.EPSILON);
    });

    it('throws RangeError for empty matrices', () => {
      assert.throws(() => transposeFloatIterative([]), RangeError);
      assert.throws(() => transposeFloatIterative([[]]), RangeError);
      assert.throws(() => transposeFloatIterative([[], []]), RangeError);
    });

    it('throws RangeError for ragged matrices', () => {
      assert.throws(
        () =>
          transposeFloatIterative([
            [1, 2],
            [3],
          ]),
        RangeError,
      );
      assert.throws(
        () =>
          transposeFloatIterative([
            [1],
            [2, 3],
          ]),
        RangeError,
      );
      assert.throws(
        () =>
          transposeFloatIterative([
            [1, 2, 3],
            [4, 5, 6],
            [],
          ]),
        RangeError,
      );
    });

    it('throws TypeError for non-2D-array inputs', () => {
      const invalidInputs = [
        null,
        undefined,
        42,
        'matrix',
        true,
        { 0: [1, 2], length: 1 },
        new Float64Array([1, 2, 3]),
        [1, 2, 3],
        [[1, 2], 'not-a-row'],
        [[1, 2], null],
        [[1, 2], new Float64Array([3, 4])],
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => transposeFloatIterative(bad), TypeError);
      }
    });

    it('throws TypeError for non-number elements including sparse holes', () => {
      const sparseRow = [1, , 3]; // eslint-disable-line no-sparse-arrays
      const invalidElementMatrices = [
        [['1', 2]],
        [[1, null]],
        [[1, undefined]],
        [[true, 0]],
        [[1n, 2n]],
        [[{}, 1]],
        [[Symbol('x'), 1]],
        // eslint-disable-next-line no-new-wrappers
        [[new Number(1), 2]],
        [sparseRow],
      ];

      for (const bad of invalidElementMatrices) {
        assert.throws(() => transposeFloatIterative(bad), TypeError);
      }
    });
  });

  describe('cross-checks against independent computations', () => {
    it('satisfies involution transpose(transpose(M)) === M and M[i][j] === T[j][i] across shapes', () => {
      const rng = createRng(0x5eed1234);
      const shapes = [
        [1, 1],
        [1, 7],
        [7, 1],
        [2, 5],
        [5, 2],
        [4, 4],
        [6, 9],
        [9, 6],
      ];

      for (const [rows, cols] of shapes) {
        const m = Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => (rng() - 0.5) * 1e6),
        );

        const t = transposeFloatIterative(m);

        assert.strictEqual(t.length, cols);
        for (let j = 0; j < cols; j += 1) {
          assert.strictEqual(t[j].length, rows);
          for (let i = 0; i < rows; i += 1) {
            assert.ok(Object.is(t[j][i], m[i][j]));
          }
        }

        // Cross-check against independent functional reference implementation
        assert.deepStrictEqual(t, referenceTranspose(m));

        // Involution property: (M^T)^T === M
        const tt = transposeFloatIterative(t);
        assert.deepStrictEqual(tt, m);
      }
    });

    it('satisfies linearity (A + B)^T === A^T + B^T for exact dyadic float64 matrices', () => {
      const a = [
        [0.5, -1.25, 2.0],
        [3.5, 0.25, -4.75],
      ];
      const b = [
        [1.5, 2.25, -0.5],
        [-1.5, 0.75, 4.75],
      ];

      const sum = a.map((row, i) => row.map((val, j) => val + b[i][j]));
      const lhs = transposeFloatIterative(sum);

      const aT = transposeFloatIterative(a);
      const bT = transposeFloatIterative(b);
      const rhs = aT.map((row, i) => row.map((val, j) => val + bT[i][j]));

      assert.deepStrictEqual(lhs, rhs);
    });
  });
});
