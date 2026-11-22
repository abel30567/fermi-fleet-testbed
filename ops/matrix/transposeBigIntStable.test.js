import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeBigIntStable, SCALE } from './transposeBigIntStable.js';

/**
 * Independent naive reference transpose for cross-checking cache-blocked results.
 * @param {bigint[][]} m
 * @returns {bigint[][]}
 */
function naiveTranspose(m) {
  const rows = m.length;
  const cols = m[0].length;
  return Array.from({ length: cols }, (_, j) =>
    Array.from({ length: rows }, (_, i) => m[i][j])
  );
}

/**
 * Independent exact BigInt matrix multiplication A (m x k) * B (k x n).
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function exactMatMul(a, b) {
  const m = a.length;
  const k = a[0].length;
  const n = b[0].length;
  const out = Array.from({ length: m }, () => new Array(n).fill(0n));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let acc = 0n;
      for (let p = 0; p < k; p++) {
        acc += a[i][p] * b[p][j];
      }
      out[i][j] = acc;
    }
  }
  return out;
}

/**
 * Computes exact sum, L1 norm, and squared Frobenius norm of a BigInt matrix.
 * @param {bigint[][]} m
 */
function matrixInvariants(m) {
  let sum = 0n;
  let l1 = 0n;
  let frobSq = 0n;
  for (const row of m) {
    for (const v of row) {
      sum += v;
      l1 += v < 0n ? -v : v;
      frobSq += v * v;
    }
  }
  return { sum, l1, frobSq };
}

/**
 * Deterministic LCG generator producing large signed BigInts.
 * @param {number} rows
 * @param {number} cols
 * @param {bigint} [seed]
 * @returns {bigint[][]}
 */
function generateDeterministicMatrix(rows, cols, seed = 1234567890123456789n) {
  let state = seed;
  const mod = 1n << 128n;
  const mult = 6364136223846793005n;
  const inc = 1442695040888963407n;
  const mat = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      state = (state * mult + inc) % mod;
      // Signed 128-bit values well beyond Number.MAX_SAFE_INTEGER
      const signed = state - (1n << 127n);
      row.push(signed);
    }
    mat.push(row);
  }
  return mat;
}

describe('transposeBigIntStable', () => {
  it('exports SCALE = 10n ** 18n', () => {
    assert.equal(SCALE, 10n ** 18n);
  });

  it('transposes standard square and rectangular matrices', () => {
    const sq = [
      [1n, 2n, 3n],
      [4n, 5n, 6n],
      [7n, 8n, 9n],
    ];
    assert.deepEqual(transposeBigIntStable(sq), [
      [1n, 4n, 7n],
      [2n, 5n, 8n],
      [3n, 6n, 9n],
    ]);

    const rect2x3 = [
      [10n, 20n, 30n],
      [40n, 50n, 60n],
    ];
    assert.deepEqual(transposeBigIntStable(rect2x3), [
      [10n, 40n],
      [20n, 50n],
      [30n, 60n],
    ]);

    const rect3x2 = [
      [-1n, 2n],
      [0n, -4n],
      [5n, 6n],
    ];
    assert.deepEqual(transposeBigIntStable(rect3x2), [
      [-1n, 0n, 5n],
      [2n, -4n, 6n],
    ]);
  });

  it('handles 1x1, 1xN, and Nx1 edge-case shapes', () => {
    assert.deepEqual(transposeBigIntStable([[0n]]), [[0n]]);
    assert.deepEqual(transposeBigIntStable([[-42n]]), [[-42n]]);

    const rowVec = [[1n, -2n, 3n, -4n, 5n]];
    assert.deepEqual(transposeBigIntStable(rowVec), [
      [1n],
      [-2n],
      [3n],
      [-4n],
      [5n],
    ]);

    const colVec = [[10n], [20n], [30n], [40n]];
    assert.deepEqual(transposeBigIntStable(colVec), [[10n, 20n, 30n, 40n]]);
  });

  it('preserves arbitrary-precision negative, huge, and SCALE-fixed-point BigInts losslessly', () => {
    const hugePos = (1n << 256n) + 12345678901234567890123456789n;
    const hugeNeg = -((10n ** 80n) + 9876543210987654321n);
    const fixedPi = 3141592653589793238n; // ~pi * 10^18
    const fixedNegHalf = -(SCALE / 2n);

    const m = [
      [hugePos, fixedPi, 0n],
      [hugeNeg, fixedNegHalf, BigInt(Number.MAX_SAFE_INTEGER) + 999999n],
    ];

    const t = transposeBigIntStable(m, { scale: SCALE });
    assert.deepEqual(t, [
      [hugePos, hugeNeg],
      [fixedPi, fixedNegHalf],
      [0n, BigInt(Number.MAX_SAFE_INTEGER) + 999999n],
    ]);
  });

  it('is strictly immutable and does not alias input arrays', () => {
    const original = [
      [1n, 2n],
      [3n, 4n],
    ];
    const snapshot = original.map((r) => [...r]);
    const transposed = transposeBigIntStable(original);

    assert.deepEqual(original, snapshot);
    assert.notEqual(transposed, original);
    assert.notEqual(transposed[0], original[0]);
    assert.notEqual(transposed[1], original[1]);

    transposed[0][1] = 9999n;
    assert.deepEqual(original, snapshot);
  });

  it('matches naive reference across multiple cache-blocking tile sizes on large matrices', () => {
    const large = generateDeterministicMatrix(71, 53);
    const expected = naiveTranspose(large);

    for (const blockSize of [1, 2, 7, 16, 32, 64, 128]) {
      const actual = transposeBigIntStable(large, { blockSize, scale: SCALE });
      assert.equal(actual.length, 53);
      assert.equal(actual[0].length, 71);
      assert.deepEqual(actual, expected);
    }
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies double-transpose involution (A^T)^T = A', () => {
      const shapes = [
        [1, 1],
        [1, 9],
        [9, 1],
        [5, 8],
        [37, 41],
      ];
      for (const [r, c] of shapes) {
        const a = generateDeterministicMatrix(r, c, BigInt(r * 100 + c));
        const att = transposeBigIntStable(transposeBigIntStable(a));
        assert.deepEqual(att, a);
      }
    });

    it('preserves exact sum, L1 norm, squared Frobenius norm, and square trace', () => {
      const rect = generateDeterministicMatrix(40, 29, 777n);
      const rectT = transposeBigIntStable(rect);

      const invA = matrixInvariants(rect);
      const invAT = matrixInvariants(rectT);
      assert.equal(invAT.sum, invA.sum);
      assert.equal(invAT.l1, invA.l1);
      assert.equal(invAT.frobSq, invA.frobSq);

      const sq = generateDeterministicMatrix(35, 35, 999n);
      const sqT = transposeBigIntStable(sq);
      let traceA = 0n;
      let traceAT = 0n;
      for (let i = 0; i < 35; i++) {
        traceA += sq[i][i];
        traceAT += sqT[i][i];
      }
      assert.equal(traceAT, traceA);
    });

    it('satisfies linearity (c*A + d*B)^T = c*A^T + d*B^T', () => {
      const a = generateDeterministicMatrix(6, 5, 11n);
      const b = generateDeterministicMatrix(6, 5, 22n);
      const c = -17n * SCALE;
      const d = 23n * SCALE;

      const combined = a.map((row, i) => row.map((v, j) => c * v + d * b[i][j]));
      const lhs = transposeBigIntStable(combined);

      const aT = transposeBigIntStable(a);
      const bT = transposeBigIntStable(b);
      const rhs = aT.map((row, i) => row.map((v, j) => c * v + d * bT[i][j]));

      assert.deepEqual(lhs, rhs);
    });

    it('satisfies product reversal identity (A * B)^T = B^T * A^T', () => {
      const a = generateDeterministicMatrix(5, 7, 101n);
      const b = generateDeterministicMatrix(7, 4, 202n);

      const lhs = transposeBigIntStable(exactMatMul(a, b));
      const rhs = exactMatMul(transposeBigIntStable(b), transposeBigIntStable(a));

      assert.deepEqual(lhs, rhs);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array matrix inputs', () => {
      for (const bad of [null, undefined, 42, 42n, '[[1n]]', {}, true]) {
        assert.throws(() => transposeBigIntStable(bad), TypeError);
      }
    });

    it('throws RangeError for empty matrices or empty rows', () => {
      assert.throws(() => transposeBigIntStable([]), RangeError);
      assert.throws(() => transposeBigIntStable([[]]), RangeError);
      assert.throws(() => transposeBigIntStable([[], []]), RangeError);
    });

    it('throws RangeError for ragged / non-rectangular matrices', () => {
      assert.throws(
        () =>
          transposeBigIntStable([
            [1n, 2n],
            [3n],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          transposeBigIntStable([
            [1n],
            [2n, 3n],
          ]),
        RangeError
      );
    });

    it('throws TypeError for non-array rows or non-BigInt entries', () => {
      assert.throws(() => transposeBigIntStable([1n, 2n]), TypeError);
      assert.throws(() => transposeBigIntStable([[1n], null]), TypeError);
      assert.throws(() => transposeBigIntStable([[1, 2n]]), TypeError);
      assert.throws(() => transposeBigIntStable([[1n, '2']]), TypeError);
      assert.throws(() => transposeBigIntStable([[1n, null]]), TypeError);
      assert.throws(() => transposeBigIntStable([[1n, undefined]]), TypeError);
      assert.throws(() => transposeBigIntStable([[NaN]]), TypeError);
      assert.throws(() => transposeBigIntStable([[Infinity]]), TypeError);
      assert.throws(() => transposeBigIntStable([[true]]), TypeError);
    });

    it('throws TypeError for sparse arrays and sparse rows', () => {
      const sparseMatrix = new Array(2);
      sparseMatrix[0] = [1n, 2n];
      assert.throws(() => transposeBigIntStable(sparseMatrix), TypeError);

      const sparseRow = new Array(2);
      sparseRow[0] = 1n;
      assert.throws(() => transposeBigIntStable([sparseRow]), TypeError);
    });

    it('validates options, options.blockSize, and options.scale strictly', () => {
      const m = [[1n, 2n]];

      // Invalid options container
      assert.throws(() => transposeBigIntStable(m, null), TypeError);
      assert.throws(() => transposeBigIntStable(m, []), TypeError);
      assert.throws(() => transposeBigIntStable(m, 32), TypeError);

      // Invalid blockSize
      assert.throws(() => transposeBigIntStable(m, { blockSize: 32n }), TypeError);
      assert.throws(() => transposeBigIntStable(m, { blockSize: '8' }), TypeError);
      assert.throws(() => transposeBigIntStable(m, { blockSize: 0 }), RangeError);
      assert.throws(() => transposeBigIntStable(m, { blockSize: -4 }), RangeError);
      assert.throws(() => transposeBigIntStable(m, { blockSize: 1.5 }), RangeError);
      assert.throws(() => transposeBigIntStable(m, { blockSize: NaN }), RangeError);
      assert.throws(() => transposeBigIntStable(m, { blockSize: Infinity }), RangeError);
      assert.throws(
        () => transposeBigIntStable(m, { blockSize: Number.MAX_SAFE_INTEGER + 1 }),
        RangeError
      );

      // Invalid scale
      assert.throws(() => transposeBigIntStable(m, { scale: 1e18 }), TypeError);
      assert.throws(() => transposeBigIntStable(m, { scale: '1000' }), TypeError);
      assert.throws(() => transposeBigIntStable(m, { scale: 0n }), RangeError);
      assert.throws(() => transposeBigIntStable(m, { scale: -10n }), RangeError);
    });
  });
});
