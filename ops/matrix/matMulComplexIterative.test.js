import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulComplexIterative } from './matMulComplexIterative.js';

const c = (re, im = 0) => ({ re, im });

function assertComplexMatrixClose(actual, expected, tol = 1e-12) {
  assert.equal(actual.length, expected.length, 'row count mismatch');
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`);
    for (let j = 0; j < expected[i].length; j++) {
      assert.ok(
        Math.abs(actual[i][j].re - expected[i][j].re) <= tol,
        `re mismatch at [${i}][${j}]: got ${actual[i][j].re}, expected ${expected[i][j].re}`
      );
      assert.ok(
        Math.abs(actual[i][j].im - expected[i][j].im) <= tol,
        `im mismatch at [${i}][${j}]: got ${actual[i][j].im}, expected ${expected[i][j].im}`
      );
    }
  }
}

/**
 * Independent reference via real 2x2 block isomorphism:
 * A = R_A + i I_A  <-->  Phi(A) = [[R_A, -I_A], [I_A, R_A]]
 * Phi(A * B) = Phi(A) * Phi(B)
 */
function realMatMul(A, B) {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;
  const out = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let p = 0; p < k; p++) {
        s += A[i][p] * B[p][j];
      }
      out[i][j] = s;
    }
  }
  return out;
}

function toRealBlock(M) {
  const rows = M.length;
  const cols = M[0].length;
  const block = Array.from({ length: 2 * rows }, () => new Array(2 * cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      block[i][j] = M[i][j].re;
      block[i][j + cols] = -M[i][j].im;
      block[i + rows][j] = M[i][j].im;
      block[i + rows][j + cols] = M[i][j].re;
    }
  }
  return block;
}

function fromRealBlock(block, rows, cols) {
  const M = Array.from({ length: rows }, () => new Array(cols));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      M[i][j] = c(block[i][j], block[i + rows][j]);
    }
  }
  return M;
}

function conjugateTranspose(M) {
  const rows = M.length;
  const cols = M[0].length;
  return Array.from({ length: cols }, (_, i) =>
    Array.from({ length: rows }, (_, j) => c(M[j][i].re, -M[j][i].im))
  );
}

describe('matMulComplexIterative', () => {
  describe('normal cases', () => {
    it('multiplies 1x1 complex matrices', () => {
      const a = [[c(3, 2)]];
      const b = [[c(1, -4)]];
      // (3 + 2i)(1 - 4i) = 3 - 12i + 2i + 8 = 11 - 10i
      assert.deepStrictEqual(matMulComplexIterative(a, b), [[c(11, -10)]]);
    });

    it('multiplies 2x2 complex matrices', () => {
      const a = [
        [c(1, 2), c(3, -1)],
        [c(0, 4), c(-2, 1)],
      ];
      const b = [
        [c(2, -1), c(0, 3)],
        [c(1, 1), c(4, -2)],
      ];
      // [0][0]: (1+2i)(2-i) + (3-i)(1+i) = (4+3i) + (4+2i) = 8+5i
      // [0][1]: (1+2i)(3i) + (3-i)(4-2i) = (-6+3i) + (10-10i) = 4-7i
      // [1][0]: (4i)(2-i) + (-2+i)(1+i) = (4+8i) + (-3-i) = 1+7i
      // [1][1]: (4i)(3i) + (-2+i)(4-2i) = (-12) + (-6+8i) = -18+8i
      assert.deepStrictEqual(matMulComplexIterative(a, b), [
        [c(8, 5), c(4, -7)],
        [c(1, 7), c(-18, 8)],
      ]);
    });

    it('multiplies rectangular matrices (2x3 * 3x2, 1x3 * 3x1, 3x1 * 1x3)', () => {
      const a = [
        [c(1, 1), c(2, 0), c(0, -1)],
        [c(-1, 2), c(0, 1), c(3, 1)],
      ];
      const b = [
        [c(2, 0), c(1, -1)],
        [c(0, 1), c(3, 2)],
        [c(1, 1), c(-1, 0)],
      ];
      // [0][0]: (1+i)(2) + (2)(i) + (-i)(1+i) = (2+2i) + 2i + (1-i) = 3+3i
      // [0][1]: (1+i)(1-i) + (2)(3+2i) + (-i)(-1) = 2 + (6+4i) + i = 8+5i
      // [1][0]: (-1+2i)(2) + (i)(i) + (3+i)(1+i) = (-2+4i) + (-1) + (2+4i) = -1+8i
      // [1][1]: (-1+2i)(1-i) + (i)(3+2i) + (3+i)(-1) = (1+3i) + (-2+3i) + (-3-i) = -4+5i
      assert.deepStrictEqual(matMulComplexIterative(a, b), [
        [c(3, 3), c(8, 5)],
        [c(-1, 8), c(-4, 5)],
      ]);

      // Row vector * column vector -> 1x1
      const row = [[c(1, 2), c(3, -1), c(0, 1)]];
      const col = [[c(2, 1)], [c(-1, 0)], [c(0, -1)]];
      // (1+2i)(2+i) + (3-i)(-1) + (i)(-i) = (0+5i) + (-3+i) + (1) = -2+6i
      assert.deepStrictEqual(matMulComplexIterative(row, col), [[c(-2, 6)]]);

      // Column vector * row vector -> 3x3 outer product
      assert.deepStrictEqual(matMulComplexIterative(col, row), [
        [c(0, 5), c(7, 1), c(-1, 2)],
        [c(-1, -2), c(-3, 1), c(0, -1)],
        [c(2, -1), c(-1, -3), c(1, 0)],
      ]);
    });

    it('satisfies Pauli matrix multiplication relations', () => {
      const sigmaX = [
        [c(0, 0), c(1, 0)],
        [c(1, 0), c(0, 0)],
      ];
      const sigmaY = [
        [c(0, 0), c(0, -1)],
        [c(0, 1), c(0, 0)],
      ];
      const sigmaZ = [
        [c(1, 0), c(0, 0)],
        [c(0, 0), c(-1, 0)],
      ];
      const I = [
        [c(1, 0), c(0, 0)],
        [c(0, 0), c(1, 0)],
      ];
      const iSigmaZ = [
        [c(0, 1), c(0, 0)],
        [c(0, 0), c(0, -1)],
      ];

      assert.deepStrictEqual(matMulComplexIterative(sigmaX, sigmaY), iSigmaZ);
      assert.deepStrictEqual(matMulComplexIterative(sigmaY, sigmaY), I);
      assert.deepStrictEqual(matMulComplexIterative(sigmaZ, sigmaZ), I);
    });
  });

  describe('edge cases and immutability', () => {
    it('handles identity and zero matrices and normalizes -0 to 0', () => {
      const a = [
        [c(-1, 0), c(0, -1)],
        [c(2, -3), c(0, 0)],
      ];
      const I = [
        [c(1, 0), c(0, 0)],
        [c(0, 0), c(1, 0)],
      ];
      const Z = [
        [c(0, 0), c(0, 0)],
        [c(0, 0), c(0, 0)],
      ];

      assert.deepStrictEqual(matMulComplexIterative(a, I), a);
      assert.deepStrictEqual(matMulComplexIterative(I, a), a);

      const zeroProd = matMulComplexIterative(a, Z);
      assert.deepStrictEqual(zeroProd, Z);
      for (const row of zeroProd) {
        for (const cell of row) {
          assert.ok(!Object.is(cell.re, -0), 're should not be -0');
          assert.ok(!Object.is(cell.im, -0), 'im should not be -0');
        }
      }
    });

    it('does not mutate input matrices or share object references', () => {
      const a = [[c(1, 2), c(3, 4)]];
      const b = [[c(5, 6)], [c(7, 8)]];
      const aCopy = structuredClone(a);
      const bCopy = structuredClone(b);

      const res = matMulComplexIterative(a, b);
      assert.deepStrictEqual(a, aCopy);
      assert.deepStrictEqual(b, bCopy);
      assert.notEqual(res[0][0], a[0][0]);
      assert.notEqual(res[0][0], b[0][0]);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array matrix or non-array row', () => {
      const valid = [[c(1, 0)]];
      for (const bad of [null, undefined, 42, 'matrix', {}]) {
        assert.throws(() => matMulComplexIterative(bad, valid), TypeError);
        assert.throws(() => matMulComplexIterative(valid, bad), TypeError);
      }
      assert.throws(() => matMulComplexIterative([123], valid), TypeError);
      assert.throws(() => matMulComplexIterative(valid, ['row']), TypeError);
    });

    it('throws RangeError for empty matrices or empty rows', () => {
      const valid = [[c(1, 0)]];
      assert.throws(() => matMulComplexIterative([], valid), RangeError);
      assert.throws(() => matMulComplexIterative(valid, []), RangeError);
      assert.throws(() => matMulComplexIterative([[]], valid), RangeError);
      assert.throws(() => matMulComplexIterative(valid, [[]]), RangeError);
    });

    it('throws RangeError for jagged matrices', () => {
      const jagged = [[c(1, 0), c(2, 0)], [c(3, 0)]];
      const valid = [[c(1, 0)], [c(2, 0)]];
      assert.throws(() => matMulComplexIterative(jagged, valid), RangeError);
      assert.throws(() => matMulComplexIterative([[c(1, 0), c(2, 0)]], jagged), RangeError);
    });

    it('throws RangeError for incompatible dimensions', () => {
      const a = [
        [c(1, 0), c(2, 0), c(3, 0)],
        [c(4, 0), c(5, 0), c(6, 0)],
      ];
      const b = [
        [c(1, 0), c(2, 0)],
        [c(3, 0), c(4, 0)],
      ];
      assert.throws(() => matMulComplexIterative(a, b), RangeError);
    });

    it('throws TypeError for malformed complex entries', () => {
      const valid = [[c(1, 0)]];
      const badCells = [null, undefined, 5, '1+2i', {}, { re: 1 }, { im: 2 }, { re: '1', im: 0 }, { re: 1, im: null }];
      for (const bad of badCells) {
        assert.throws(() => matMulComplexIterative([[bad]], valid), TypeError);
        assert.throws(() => matMulComplexIterative(valid, [[bad]]), TypeError);
      }
    });

    it('throws RangeError for non-finite complex components', () => {
      const valid = [[c(1, 0)]];
      const nonFinite = [
        c(NaN, 0),
        c(0, NaN),
        c(Infinity, 0),
        c(0, -Infinity),
      ];
      for (const bad of nonFinite) {
        assert.throws(() => matMulComplexIterative([[bad]], valid), RangeError);
        assert.throws(() => matMulComplexIterative(valid, [[bad]]), RangeError);
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches real 2x2 block matrix isomorphism Phi(A*B) = Phi(A)*Phi(B)', () => {
      // Deterministic pseudo-random generator (LCG) for reproducible test matrices
      let seed = 1337;
      const nextVal = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return ((seed / 0xffffffff) * 10) - 5;
      };
      const makeMatrix = (rows, cols) =>
        Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => c(nextVal(), nextVal()))
        );

      const A = makeMatrix(4, 5);
      const B = makeMatrix(5, 3);

      const actual = matMulComplexIterative(A, B);
      const expected = fromRealBlock(realMatMul(toRealBlock(A), toRealBlock(B)), 4, 3);

      assertComplexMatrixClose(actual, expected, 1e-11);
    });

    it('satisfies associativity (A*B)*C = A*(B*C) and conjugate transpose (A*B)^H = B^H * A^H', () => {
      const A = [
        [c(1.5, -0.5), c(-2, 3)],
        [c(0.25, 1), c(4, -1.5)],
      ];
      const B = [
        [c(-1, 2), c(0.5, 0.5), c(3, -1)],
        [c(2, -0.25), c(-3, 1), c(0, 2)],
      ];
      const C = [
        [c(1, 1)],
        [c(-2, 0.5)],
        [c(0.5, -3)],
      ];

      const leftAssoc = matMulComplexIterative(matMulComplexIterative(A, B), C);
      const rightAssoc = matMulComplexIterative(A, matMulComplexIterative(B, C));
      assertComplexMatrixClose(leftAssoc, rightAssoc, 1e-12);

      const abH = conjugateTranspose(matMulComplexIterative(A, B));
      const bHaH = matMulComplexIterative(conjugateTranspose(B), conjugateTranspose(A));
      assertComplexMatrixClose(abH, bHaH, 1e-12);
    });

    it('satisfies unitary DFT identity F * F^H = N * I for N = 4', () => {
      const N = 4;
      const F = Array.from({ length: N }, (_, j) =>
        Array.from({ length: N }, (_, k) => {
          const angle = (-2 * Math.PI * j * k) / N;
          return c(Math.cos(angle), Math.sin(angle));
        })
      );
      const FH = conjugateTranspose(F);
      const product = matMulComplexIterative(F, FH);
      const expected = Array.from({ length: N }, (_, i) =>
        Array.from({ length: N }, (_, j) => c(i === j ? N : 0, 0))
      );

      assertComplexMatrixClose(product, expected, 1e-12);
    });
  });
});
