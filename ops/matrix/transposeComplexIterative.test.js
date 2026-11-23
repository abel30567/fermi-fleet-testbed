import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeComplexIterative } from './transposeComplexIterative.js';

/**
 * Helper to create a complex number object.
 * @param {number} re
 * @param {number} im
 */
const c = (re, im) => ({ re, im });

/**
 * Complex addition.
 */
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });

/**
 * Complex multiplication.
 */
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

/**
 * Independent complex matrix multiplication for algebraic cross-checks.
 */
function matMulComplex(A, B) {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;
  const out = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      let sum = c(0, 0);
      for (let p = 0; p < k; p++) {
        sum = cAdd(sum, cMul(A[i][p], B[p][j]));
      }
      row.push(sum);
    }
    out.push(row);
  }
  return out;
}

/**
 * Independent functional reference transpose for cross-checking.
 */
function referenceTranspose(matrix) {
  if (matrix.length === 0 || matrix[0].length === 0) return [];
  return matrix[0].map((_, j) =>
    matrix.map((row) => ({ re: row[j].re, im: row[j].im }))
  );
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible matrix generation.
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIntComplexMatrix(rows, cols, rng) {
  const m = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const re = Math.floor(rng() * 21) - 10;
      const im = Math.floor(rng() * 21) - 10;
      row.push(c(re, im));
    }
    m.push(row);
  }
  return m;
}

describe('transposeComplexIterative', () => {
  describe('normal cases', () => {
    it('transposes a 2x2 complex matrix without conjugating imaginary parts', () => {
      const A = [
        [c(1, 2), c(3, -4)],
        [c(-5, 6), c(7, 8)],
      ];
      const expected = [
        [c(1, 2), c(-5, 6)],
        [c(3, -4), c(7, 8)],
      ];
      assert.deepStrictEqual(transposeComplexIterative(A), expected);
    });

    it('transposes a rectangular 2x3 matrix to 3x2', () => {
      const A = [
        [c(1, -1), c(2, 0), c(0, 3)],
        [c(-4.5, 2.25), c(5, -6), c(7.5, 8.5)],
      ];
      const expected = [
        [c(1, -1), c(-4.5, 2.25)],
        [c(2, 0), c(5, -6)],
        [c(0, 3), c(7.5, 8.5)],
      ];
      assert.deepStrictEqual(transposeComplexIterative(A), expected);
    });

    it('transposes a rectangular 3x2 matrix to 2x3', () => {
      const A = [
        [c(1, 0), c(0, 1)],
        [c(2, 3), c(4, 5)],
        [c(-6, -7), c(8, -9)],
      ];
      const expected = [
        [c(1, 0), c(2, 3), c(-6, -7)],
        [c(0, 1), c(4, 5), c(8, -9)],
      ];
      assert.deepStrictEqual(transposeComplexIterative(A), expected);
    });

    it('transposes row and column vectors', () => {
      const rowVec = [[c(1, 2), c(3, 4), c(5, 6)]];
      const colVec = [[c(1, 2)], [c(3, 4)], [c(5, 6)]];
      assert.deepStrictEqual(transposeComplexIterative(rowVec), colVec);
      assert.deepStrictEqual(transposeComplexIterative(colVec), rowVec);
    });

    it('transposes a 1x1 matrix', () => {
      const A = [[c(-3.14, 2.71)]];
      assert.deepStrictEqual(transposeComplexIterative(A), [[c(-3.14, 2.71)]]);
    });

    it('returns freshly allocated cell objects and does not mutate input', () => {
      const original = [
        [c(1, 2), c(3, 4)],
        [c(5, 6), c(7, 8)],
      ];
      const snapshot = structuredClone(original);
      const result = transposeComplexIterative(original);

      assert.deepStrictEqual(original, snapshot);
      assert.notStrictEqual(result[0][0], original[0][0]);
      assert.notStrictEqual(result[1][0], original[0][1]);

      result[0][1].re = 999;
      result[0][1].im = -999;
      assert.deepStrictEqual(original, snapshot);
    });

    it('strips extra properties from input complex objects', () => {
      const A = [[{ re: 1, im: -2, extra: 'ignored' }]];
      const result = transposeComplexIterative(A);
      assert.deepStrictEqual(result, [[{ re: 1, im: -2 }]]);
      assert.deepStrictEqual(Object.keys(result[0][0]), ['re', 'im']);
    });
  });

  describe('edge cases', () => {
    it('handles empty matrix []', () => {
      assert.deepStrictEqual(transposeComplexIterative([]), []);
    });

    it('handles matrices with zero columns', () => {
      assert.deepStrictEqual(transposeComplexIterative([[]]), []);
      assert.deepStrictEqual(transposeComplexIterative([[], [], []]), []);
    });

    it('handles zero and purely real/imaginary entries', () => {
      const A = [
        [c(0, 0), c(0, -5)],
        [c(4, 0), c(0, 0)],
      ];
      const expected = [
        [c(0, 0), c(4, 0)],
        [c(0, -5), c(0, 0)],
      ];
      assert.deepStrictEqual(transposeComplexIterative(A), expected);
    });

    it('throws TypeError for non-array matrix inputs', () => {
      for (const bad of [null, undefined, 42, 'matrix', {}, { re: 1, im: 2 }]) {
        assert.throws(() => transposeComplexIterative(bad), TypeError);
      }
    });

    it('throws TypeError for non-array rows or sparse row arrays', () => {
      assert.throws(() => transposeComplexIterative([123]), TypeError);
      assert.throws(() => transposeComplexIterative([[c(1, 0)], null]), TypeError);
      assert.throws(() => transposeComplexIterative([[], 'bad']), TypeError);

      const sparseRows = new Array(2);
      sparseRows[0] = [c(1, 0)];
      assert.throws(() => transposeComplexIterative(sparseRows), TypeError);
    });

    it('throws RangeError for jagged (non-rectangular) matrices', () => {
      const jagged = [
        [c(1, 0), c(2, 0)],
        [c(3, 0)],
      ];
      assert.throws(() => transposeComplexIterative(jagged), RangeError);

      const jaggedEmptyFirst = [[], [c(1, 0)]];
      assert.throws(() => transposeComplexIterative(jaggedEmptyFirst), RangeError);
    });

    it('throws TypeError for invalid complex entries or sparse cells', () => {
      const badEntries = [
        null,
        undefined,
        5,
        '1+2i',
        [1, 2],
        { re: 1 },
        { im: 2 },
        { re: '1', im: 2 },
        { re: 1, im: null },
      ];
      for (const entry of badEntries) {
        assert.throws(() => transposeComplexIterative([[entry]]), TypeError);
      }

      const sparseRow = new Array(2);
      sparseRow[0] = c(1, 2);
      assert.throws(() => transposeComplexIterative([sparseRow]), TypeError);
    });

    it('throws RangeError for non-finite re or im values', () => {
      const nonFinite = [
        c(NaN, 0),
        c(0, NaN),
        c(Infinity, 1),
        c(1, -Infinity),
      ];
      for (const entry of nonFinite) {
        assert.throws(() => transposeComplexIterative([[entry]]), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies involution (A^T)^T === A across varied shapes', () => {
      const rng = makeRng(20261123);
      const shapes = [
        [1, 1],
        [1, 7],
        [7, 1],
        [4, 4],
        [5, 9],
        [12, 8],
      ];
      for (const [rows, cols] of shapes) {
        const A = randomIntComplexMatrix(rows, cols, rng);
        const AT = transposeComplexIterative(A);
        assert.strictEqual(AT.length, cols);
        assert.strictEqual(AT[0].length, rows);
        assert.deepStrictEqual(transposeComplexIterative(AT), A);
      }
    });

    it('matches independent functional reference transpose on random matrices', () => {
      const rng = makeRng(424242);
      for (const [rows, cols] of [
        [3, 5],
        [6, 2],
        [10, 10],
        [15, 7],
      ]) {
        const A = randomIntComplexMatrix(rows, cols, rng);
        assert.deepStrictEqual(
          transposeComplexIterative(A),
          referenceTranspose(A)
        );
      }
    });

    it('satisfies product reversal identity (A * B)^T === B^T * A^T', () => {
      const rng = makeRng(987654);
      const A = randomIntComplexMatrix(4, 3, rng);
      const B = randomIntComplexMatrix(3, 5, rng);

      const lhs = transposeComplexIterative(matMulComplex(A, B));
      const rhs = matMulComplex(
        transposeComplexIterative(B),
        transposeComplexIterative(A)
      );

      assert.deepStrictEqual(lhs, rhs);
    });

    it('satisfies complex linearity (alpha*A + beta*B)^T === alpha*A^T + beta*B^T', () => {
      const rng = makeRng(13579);
      const A = randomIntComplexMatrix(4, 5, rng);
      const B = randomIntComplexMatrix(4, 5, rng);
      const alpha = c(2, -3);
      const beta = c(-1, 4);

      const linComb = (X, Y) =>
        X.map((row, i) =>
          row.map((val, j) => cAdd(cMul(alpha, val), cMul(beta, Y[i][j])))
        );

      const lhs = transposeComplexIterative(linComb(A, B));
      const rhs = linComb(
        transposeComplexIterative(A),
        transposeComplexIterative(B)
      );

      assert.deepStrictEqual(lhs, rhs);
    });
  });
});
