import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantBigIntSeries } from './determinantBigIntSeries.js';

/**
 * Independent reference determinant via recursive Laplace cofactor expansion
 * along the first row. Used strictly for small-n cross-checks in tests.
 */
function laplaceDeterminant(m) {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  let sum = 0n;
  for (let col = 0; col < n; col++) {
    const val = m[0][col];
    if (val === 0n) continue;
    const minor = [];
    for (let r = 1; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) {
        if (c !== col) row.push(m[r][c]);
      }
      minor.push(row);
    }
    const term = val * laplaceDeterminant(minor);
    sum += col % 2 === 0 ? term : -term;
  }
  return sum;
}

/**
 * Exact BigInt matrix multiplication A * B for square n×n matrices.
 */
function matMul(a, b) {
  const n = a.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let acc = 0n;
      for (let k = 0; k < n; k++) {
        acc += a[i][k] * b[k][j];
      }
      return acc;
    })
  );
}

/**
 * Transpose of an n×n matrix.
 */
function transpose(m) {
  const n = m.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => m[j][i])
  );
}

describe('determinantBigIntSeries', () => {
  describe('normal cases (1×1 through 5×5)', () => {
    it('computes 1×1 determinants', () => {
      assert.equal(determinantBigIntSeries([[0n]]), 0n);
      assert.equal(determinantBigIntSeries([[42n]]), 42n);
      assert.equal(determinantBigIntSeries([[-99n]]), -99n);
    });

    it('computes 2×2 determinants', () => {
      assert.equal(
        determinantBigIntSeries([
          [3n, 8n],
          [4n, 6n],
        ]),
        -14n
      );
      assert.equal(
        determinantBigIntSeries([
          [-5n, 2n],
          [7n, -3n],
        ]),
        1n
      );
    });

    it('computes 3×3 determinants', () => {
      assert.equal(
        determinantBigIntSeries([
          [6n, 1n, 1n],
          [4n, -2n, 5n],
          [2n, 8n, 7n],
        ]),
        -306n
      );
      assert.equal(
        determinantBigIntSeries([
          [2n, -3n, 1n],
          [2n, 0n, -1n],
          [1n, 4n, 5n],
        ]),
        49n
      );
    });

    it('computes 4×4 determinants', () => {
      const m = [
        [3n, 2n, 0n, 1n],
        [4n, 0n, 1n, 2n],
        [3n, 0n, 2n, 1n],
        [9n, 2n, 3n, 1n],
      ];
      assert.equal(determinantBigIntSeries(m), 24n);
    });

    it('computes 5×5 determinants', () => {
      const m = [
        [2n, -1n, 0n, 3n, 1n],
        [1n, 4n, -2n, 0n, 5n],
        [3n, 0n, 1n, -1n, 2n],
        [-2n, 3n, 4n, 2n, -1n],
        [0n, 1n, -3n, 5n, 4n],
      ];
      assert.equal(determinantBigIntSeries(m), laplaceDeterminant(m));
      assert.equal(determinantBigIntSeries(m), 480n);
    });
  });

  describe('edge cases', () => {
    it('returns 0n for singular matrices', () => {
      // Linearly dependent rows (3×3)
      assert.equal(
        determinantBigIntSeries([
          [1n, 2n, 3n],
          [4n, 5n, 6n],
          [7n, 8n, 9n],
        ]),
        0n
      );

      // Zero column (4×4)
      assert.equal(
        determinantBigIntSeries([
          [1n, 0n, 2n, 3n],
          [4n, 0n, 5n, 6n],
          [7n, 0n, 8n, 9n],
          [10n, 0n, 11n, 13n],
        ]),
        0n
      );

      // Linearly dependent 4×4 where row 3 = row 0 + 2 * row 1 - row 2
      assert.equal(
        determinantBigIntSeries([
          [2n, -1n, 3n, 4n],
          [1n, 5n, -2n, 1n],
          [3n, 2n, 1n, -5n],
          [1n, 7n, -2n, 11n],
        ]),
        0n
      );

      // Rank-deficient 5×5 that only zeroes out at the final Bareiss step
      assert.equal(
        determinantBigIntSeries([
          [1n, 0n, 0n, 0n, 1n],
          [0n, 2n, 0n, 0n, 2n],
          [0n, 0n, 3n, 0n, 3n],
          [0n, 0n, 0n, 4n, 4n],
          [1n, 2n, 3n, 4n, 10n],
        ]),
        0n
      );
    });

    it('handles zero pivots requiring single and multiple row swaps', () => {
      // Zero at [0][0], requires swap at k = 0
      const swapAtStart = [
        [0n, 1n, 2n, 3n],
        [1n, 0n, 4n, 5n],
        [2n, 3n, 0n, 6n],
        [4n, 5n, 6n, 0n],
      ];
      assert.equal(
        determinantBigIntSeries(swapAtStart),
        laplaceDeterminant(swapAtStart)
      );

      // Permutation matrix (anti-diagonal 4×4): two swaps => det = +1n
      const antiDiag4 = [
        [0n, 0n, 0n, 1n],
        [0n, 0n, 1n, 0n],
        [0n, 1n, 0n, 0n],
        [1n, 0n, 0n, 0n],
      ];
      assert.equal(determinantBigIntSeries(antiDiag4), 1n);

      // Cyclic permutation 4×4 (3 swaps => det = -1n)
      const cyclic4 = [
        [0n, 1n, 0n, 0n],
        [0n, 0n, 1n, 0n],
        [0n, 0n, 0n, 1n],
        [1n, 0n, 0n, 0n],
      ];
      assert.equal(determinantBigIntSeries(cyclic4), -1n);

      // Zero pivot emerging at an interior Bareiss step (k = 1)
      const interiorZeroPivot = [
        [1n, 2n, 3n, 4n],
        [2n, 4n, 5n, 7n], // after k=0 elimination, a[1][1] becomes 0n
        [1n, 3n, 2n, 5n],
        [3n, 1n, 4n, 2n],
      ];
      assert.equal(
        determinantBigIntSeries(interiorZeroPivot),
        laplaceDeterminant(interiorZeroPivot)
      );
    });

    it('returns 1n for identity matrices of various sizes', () => {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const id = Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
        );
        assert.equal(determinantBigIntSeries(id), 1n);
      }
    });

    it('computes diagonal, upper-triangular, and lower-triangular matrices', () => {
      const diag = [
        [2n, 0n, 0n, 0n],
        [0n, -3n, 0n, 0n],
        [0n, 0n, 5n, 0n],
        [0n, 0n, 0n, -7n],
      ];
      assert.equal(determinantBigIntSeries(diag), 210n);

      const upper = [
        [2n, 9n, -4n, 7n, 11n],
        [0n, -3n, 8n, 1n, -2n],
        [0n, 0n, 5n, 6n, 3n],
        [0n, 0n, 0n, 4n, -9n],
        [0n, 0n, 0n, 0n, -1n],
      ];
      assert.equal(determinantBigIntSeries(upper), 120n);

      const lower = transpose(upper);
      assert.equal(determinantBigIntSeries(lower), 120n);
    });

    it('preserves exact precision for huge BigInts', () => {
      const base = 10n ** 30n;
      // 4×4 matrix with huge entries: upper-triangular plus elementary row operations
      // Start with diag(base+1, base+2, base+3, base+4) and apply unit-determinant row ops
      const d0 = base + 1n;
      const d1 = base + 2n;
      const d2 = base + 3n;
      const d3 = base + 4n;
      const expected = d0 * d1 * d2 * d3;

      const m = [
        [d0, 7n, -3n, 5n],
        [2n * d0, d1 + 14n, -6n + 11n, 10n - 2n],
        [-d0, -7n + 3n * d1, d2 + 3n + 33n, -5n - 6n + 13n],
        [3n * d0, 21n - d1, -9n - 11n + 2n * d2, d3 + 15n + 2n + 26n],
      ];
      // Verify via independent Laplace expansion and exact diagonal product
      assert.equal(determinantBigIntSeries(m), expected);
      assert.equal(determinantBigIntSeries(m), laplaceDeterminant(m));
    });

    it('does not mutate the input matrix', () => {
      const m = [
        [0n, 2n, -1n, 3n],
        [4n, -3n, 5n, 1n],
        [-2n, 1n, 4n, -5n],
        [3n, 0n, -2n, 6n],
      ];
      const snapshot = m.map((row) => row.slice());
      determinantBigIntSeries(m);
      assert.deepEqual(m, snapshot);
    });
  });

  describe('invalid inputs', () => {
    it('rejects non-array and empty inputs', () => {
      assert.throws(() => determinantBigIntSeries(null), TypeError);
      assert.throws(() => determinantBigIntSeries(undefined), TypeError);
      assert.throws(() => determinantBigIntSeries(42n), TypeError);
      assert.throws(() => determinantBigIntSeries('matrix'), TypeError);
      assert.throws(() => determinantBigIntSeries({}), TypeError);
      assert.throws(() => determinantBigIntSeries([]), RangeError);
      assert.throws(() => determinantBigIntSeries([[]]), RangeError);
    });

    it('rejects non-square and ragged matrices', () => {
      assert.throws(
        () =>
          determinantBigIntSeries([
            [1n, 2n, 3n],
            [4n, 5n, 6n],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          determinantBigIntSeries([
            [1n, 2n],
            [3n, 4n],
            [5n, 6n],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          determinantBigIntSeries([
            [1n, 2n],
            [3n],
          ]),
        RangeError
      );
    });

    it('rejects non-array rows and non-BigInt entries', () => {
      assert.throws(() => determinantBigIntSeries([1n, 2n]), TypeError);
      assert.throws(() => determinantBigIntSeries([[1]]), TypeError);
      assert.throws(
        () =>
          determinantBigIntSeries([
            [1n, 2n],
            [3n, 4],
          ]),
        TypeError
      );
      assert.throws(
        () =>
          determinantBigIntSeries([
            [1n, '2'],
            [3n, 4n],
          ]),
        TypeError
      );
      assert.throws(
        () =>
          determinantBigIntSeries([
            [1n, null],
            [3n, 4n],
          ]),
        TypeError
      );
    });
  });

  describe('mathematical cross-checks', () => {
    it('matches independent Laplace cofactor expansion across diverse 4×4 matrices', () => {
      const matrices = [
        [
          [5n, -2n, 3n, 1n],
          [0n, 4n, -1n, 2n],
          [-3n, 1n, 6n, -4n],
          [2n, -5n, 0n, 3n],
        ],
        [
          [-7n, 11n, -13n, 17n],
          [19n, -23n, 29n, -31n],
          [-37n, 41n, -43n, 47n],
          [53n, -59n, 61n, -67n],
        ],
        [
          [0n, 0n, 3n, -2n],
          [5n, 0n, 0n, 7n],
          [-4n, 6n, 0n, 0n],
          [0n, -8n, 9n, 0n],
        ],
      ];

      for (const m of matrices) {
        assert.equal(determinantBigIntSeries(m), laplaceDeterminant(m));
      }
    });

    it('satisfies the multiplicative identity det(A * B) === det(A) * det(B)', () => {
      const a4 = [
        [2n, -1n, 3n, 0n],
        [0n, 4n, -2n, 5n],
        [-3n, 1n, 0n, 2n],
        [1n, -2n, 4n, -1n],
      ];
      const b4 = [
        [0n, 3n, -1n, 2n],
        [5n, -2n, 1n, 4n],
        [2n, 0n, -3n, 1n],
        [-1n, 4n, 2n, -3n],
      ];
      assert.equal(
        determinantBigIntSeries(matMul(a4, b4)),
        determinantBigIntSeries(a4) * determinantBigIntSeries(b4)
      );

      const a5 = [
        [1n, -2n, 0n, 3n, -1n],
        [0n, 3n, -1n, 2n, 4n],
        [2n, 0n, 5n, -3n, 1n],
        [-1n, 4n, 2n, 0n, -2n],
        [3n, -1n, 1n, 4n, 2n],
      ];
      const b5 = [
        [0n, 1n, -3n, 2n, 5n],
        [4n, -1n, 2n, 0n, -3n],
        [-2n, 5n, 0n, 1n, 2n],
        [1n, 0n, 4n, -2n, 3n],
        [-3n, 2n, -1n, 5n, 0n],
      ];
      assert.equal(
        determinantBigIntSeries(matMul(a5, b5)),
        determinantBigIntSeries(a5) * determinantBigIntSeries(b5)
      );
    });

    it('satisfies transpose invariance and the Vandermonde determinant identity', () => {
      const xs = [-3n, -1n, 2n, 5n, 11n, 19n];
      const vandermonde = xs.map((x) =>
        xs.map((_, p) => x ** BigInt(p))
      );

      let expected = 1n;
      for (let i = 0; i < xs.length; i++) {
        for (let j = i + 1; j < xs.length; j++) {
          expected *= xs[j] - xs[i];
        }
      }

      const det = determinantBigIntSeries(vandermonde);
      assert.equal(det, expected);
      assert.equal(determinantBigIntSeries(transpose(vandermonde)), det);
    });
  });
});
