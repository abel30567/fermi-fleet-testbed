import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeBigIntIterative } from './transposeBigIntIterative.js';

const SCALE = 10n ** 18n;

/**
 * Independent BigInt matrix addition helper for algebraic identity cross-checks.
 */
function matAdd(a, b) {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

/**
 * Independent BigInt scalar-matrix multiplication helper.
 */
function matScale(scalar, a) {
  return a.map((row) => row.map((val) => scalar * val));
}

/**
 * Independent BigInt matrix multiplication helper for product-reversal checks.
 */
function matMul(a, b) {
  const m = a.length;
  const k = a[0].length;
  const n = b[0].length;
  const out = Array.from({ length: m }, () => new Array(n).fill(0n));
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sum = 0n;
      for (let p = 0; p < k; p += 1) {
        sum += a[i][p] * b[p][j];
      }
      out[i][j] = sum;
    }
  }
  return out;
}

/**
 * Independent BigInt matrix-vector multiplication helper.
 */
function matVecMul(a, v) {
  return a.map((row) => row.reduce((acc, val, j) => acc + val * v[j], 0n));
}

/**
 * Independent BigInt dot product helper.
 */
function dot(u, v) {
  return u.reduce((acc, val, i) => acc + val * v[i], 0n);
}

describe('transposeBigIntIterative', () => {
  describe('normal cases', () => {
    it('transposes a 2x2 square matrix', () => {
      const m = [
        [1n, 2n],
        [3n, 4n],
      ];
      assert.deepEqual(transposeBigIntIterative(m), [
        [1n, 3n],
        [2n, 4n],
      ]);
    });

    it('transposes a 3x3 square matrix', () => {
      const m = [
        [1n, 2n, 3n],
        [4n, 5n, 6n],
        [7n, 8n, 9n],
      ];
      assert.deepEqual(transposeBigIntIterative(m), [
        [1n, 4n, 7n],
        [2n, 5n, 8n],
        [3n, 6n, 9n],
      ]);
    });

    it('transposes a 2x3 rectangular matrix into 3x2', () => {
      const m = [
        [1n, 2n, 3n],
        [4n, 5n, 6n],
      ];
      assert.deepEqual(transposeBigIntIterative(m), [
        [1n, 4n],
        [2n, 5n],
        [3n, 6n],
      ]);
    });

    it('transposes a 3x2 rectangular matrix into 2x3', () => {
      const m = [
        [10n, 20n],
        [30n, 40n],
        [50n, 60n],
      ];
      assert.deepEqual(transposeBigIntIterative(m), [
        [10n, 30n, 50n],
        [20n, 40n, 60n],
      ]);
    });

    it('transposes row vector (1xN) and column vector (Nx1)', () => {
      const rowVec = [[1n, 2n, 3n, 4n]];
      const colVec = [[1n], [2n], [3n], [4n]];
      assert.deepEqual(transposeBigIntIterative(rowVec), colVec);
      assert.deepEqual(transposeBigIntIterative(colVec), rowVec);
    });

    it('does not mutate the input matrix', () => {
      const original = [
        [1n, 2n, 3n],
        [4n, 5n, 6n],
      ];
      const snapshot = original.map((r) => [...r]);
      const transposed = transposeBigIntIterative(original);
      transposed[0][0] = 999n;
      assert.deepEqual(original, snapshot);
    });
  });

  describe('edge cases', () => {
    it('handles empty matrix []', () => {
      assert.deepEqual(transposeBigIntIterative([]), []);
    });

    it('handles matrix with empty rows [[], []]', () => {
      assert.deepEqual(transposeBigIntIterative([[], []]), []);
    });

    it('handles 1x1 matrix and returns a distinct array', () => {
      const single = [[42n]];
      const result = transposeBigIntIterative(single);
      assert.deepEqual(result, [[42n]]);
      assert.notEqual(result, single);
      assert.notEqual(result[0], single[0]);
    });

    it('handles zero matrices', () => {
      const zero = [
        [0n, 0n, 0n],
        [0n, 0n, 0n],
      ];
      assert.deepEqual(transposeBigIntIterative(zero), [
        [0n, 0n],
        [0n, 0n],
        [0n, 0n],
      ]);
    });

    it('handles negative and very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
      const big1 = (1n << 256n) - 1n;
      const big2 = -(10n ** 50n) - 7n;
      const big3 = 9007199254740993123456789n;
      const big4 = -42n;
      const m = [
        [big1, big2],
        [big3, big4],
      ];
      assert.deepEqual(transposeBigIntIterative(m), [
        [big1, big3],
        [big2, big4],
      ]);
    });

    it('preserves fixed-point BigInt values scaled by 10^18 exactly', () => {
      const fp = [
        [(3n * SCALE) / 2n, -SCALE / 4n, 7n * SCALE + 123456789012345678n],
        [0n, 100n * SCALE, -(5n * SCALE) / 8n],
      ];
      const expected = [
        [(3n * SCALE) / 2n, 0n],
        [-SCALE / 4n, 100n * SCALE],
        [7n * SCALE + 123456789012345678n, -(5n * SCALE) / 8n],
      ];
      assert.deepEqual(transposeBigIntIterative(fp), expected);
    });

    it('leaves identity and symmetric matrices unchanged and negates skew-symmetric matrices', () => {
      const identity = [
        [1n, 0n, 0n],
        [0n, 1n, 0n],
        [0n, 0n, 1n],
      ];
      assert.deepEqual(transposeBigIntIterative(identity), identity);

      const symmetric = [
        [2n, -3n, 5n],
        [-3n, 7n, 11n],
        [5n, 11n, -13n],
      ];
      assert.deepEqual(transposeBigIntIterative(symmetric), symmetric);

      const skew = [
        [0n, 4n, -9n],
        [-4n, 0n, 6n],
        [9n, -6n, 0n],
      ];
      assert.deepEqual(transposeBigIntIterative(skew), matScale(-1n, skew));
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array matrix inputs', () => {
      for (const invalid of [null, undefined, 123n, 42, 'matrix', {}, true]) {
        assert.throws(() => transposeBigIntIterative(invalid), TypeError);
      }
    });

    it('throws TypeError when any row is not an array', () => {
      assert.throws(() => transposeBigIntIterative([1n, 2n]), TypeError);
      assert.throws(() => transposeBigIntIterative([[1n, 2n], 'bad']), TypeError);
      assert.throws(() => transposeBigIntIterative([[1n], null]), TypeError);
    });

    it('throws RangeError for jagged matrices', () => {
      assert.throws(
        () =>
          transposeBigIntIterative([
            [1n, 2n],
            [3n],
          ]),
        RangeError,
      );
      assert.throws(() => transposeBigIntIterative([[], [1n]]), RangeError);
      assert.throws(
        () =>
          transposeBigIntIterative([
            [1n],
            [2n, 3n],
          ]),
        RangeError,
      );
    });

    it('throws TypeError when any element is not a BigInt (including sparse arrays)', () => {
      assert.throws(() => transposeBigIntIterative([[1, 2]]), TypeError);
      assert.throws(() => transposeBigIntIterative([[1n, '2']]), TypeError);
      assert.throws(() => transposeBigIntIterative([[1n, null]]), TypeError);
      assert.throws(() => transposeBigIntIterative([[1n, undefined]]), TypeError);
      assert.throws(() => transposeBigIntIterative([[1n, true]]), TypeError);
      assert.throws(() => transposeBigIntIterative([new Array(2)]), TypeError);
    });
  });

  describe('algebraic identity cross-checks', () => {
    it('satisfies involution (A^T)^T = A across rectangular and large-entry matrices', () => {
      const matrices = [
        [
          [1n, -2n, 3n, 4n, 5n],
          [6n, 7n, -8n, 9n, 10n],
          [11n, 12n, 13n, -14n, 15n],
        ],
        [
          [10n ** 30n + 1n, -(10n ** 25n)],
          [0n, 10n ** 18n],
          [-999999999999999999999n, 42n],
          [7n, -8n],
        ],
      ];

      for (const a of matrices) {
        assert.deepEqual(transposeBigIntIterative(transposeBigIntIterative(a)), a);
      }
    });

    it('satisfies linearity (A + B)^T = A^T + B^T and (cA)^T = c(A^T)', () => {
      const a = [
        [1n, -5n, 9n],
        [2n, 0n, -11n],
      ];
      const b = [
        [7n, 3n, -4n],
        [-8n, 6n, 12n],
      ];
      const c = -17n * SCALE;

      assert.deepEqual(
        transposeBigIntIterative(matAdd(a, b)),
        matAdd(transposeBigIntIterative(a), transposeBigIntIterative(b)),
      );

      assert.deepEqual(
        transposeBigIntIterative(matScale(c, a)),
        matScale(c, transposeBigIntIterative(a)),
      );
    });

    it('satisfies product reversal (A * B)^T = B^T * A^T', () => {
      const a = [
        [2n, -3n, 5n, 7n],
        [-11n, 13n, -17n, 19n],
        [23n, -29n, 31n, -37n],
      ]; // 3x4
      const b = [
        [1n, 4n],
        [-2n, 5n],
        [3n, -6n],
        [8n, 9n],
      ]; // 4x2

      const ab = matMul(a, b);
      const lhs = transposeBigIntIterative(ab);
      const rhs = matMul(transposeBigIntIterative(b), transposeBigIntIterative(a));

      assert.deepEqual(lhs, rhs);
    });

    it('satisfies adjoint bilinear identity x^T (A y) = (A^T x)^T y and trace preservation', () => {
      const a = [
        [3n, -1n, 4n, 1n],
        [5n, 9n, -2n, 6n],
        [-5n, 3n, 5n, -8n],
      ]; // 3x4
      const x = [10n, -20n, 30n]; // length 3
      const y = [7n, -3n, 11n, -13n]; // length 4

      const lhs = dot(x, matVecMul(a, y));
      const rhs = dot(matVecMul(transposeBigIntIterative(a), x), y);
      assert.equal(lhs, rhs);

      // Trace preservation for square matrix
      const sq = [
        [100n, 2n, -3n],
        [4n, -50n, 6n],
        [7n, 8n, 25n],
      ];
      const sqT = transposeBigIntIterative(sq);
      const traceSq = sq.reduce((acc, row, i) => acc + row[i], 0n);
      const traceSqT = sqT.reduce((acc, row, i) => acc + row[i], 0n);
      assert.equal(traceSq, traceSqT);
    });
  });
});
