import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeComplexSeries } from './transposeComplexSeries.js';

const c = (re, im = 0) => ({ re, im });

const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

function matMulComplex(A, B) {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;
  const out = Array.from({ length: m }, () => new Array(n));
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sum = c(0, 0);
      for (let t = 0; t < k; t += 1) {
        sum = cAdd(sum, cMul(A[i][t], B[t][j]));
      }
      out[i][j] = sum;
    }
  }
  return out;
}

function matLinearCombComplex(alpha, A, beta, B) {
  return A.map((row, i) =>
    row.map((val, j) => cAdd(cMul(alpha, val), cMul(beta, B[i][j])))
  );
}

function assertComplexMatrixClose(actual, expected, tol = 1e-12) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    assert.equal(actual[i].length, expected[i].length);
    for (let j = 0; j < expected[i].length; j += 1) {
      assert.ok(
        Math.abs(actual[i][j].re - expected[i][j].re) <= tol,
        `re mismatch at [${i}][${j}]: ${actual[i][j].re} vs ${expected[i][j].re}`
      );
      assert.ok(
        Math.abs(actual[i][j].im - expected[i][j].im) <= tol,
        `im mismatch at [${i}][${j}]: ${actual[i][j].im} vs ${expected[i][j].im}`
      );
    }
  }
}

describe('transposeComplexSeries', () => {
  it('transposes a 2x2 complex matrix without conjugating', () => {
    const M = [
      [c(1, 2), c(3, -4)],
      [c(-5, 6), c(0, -1)],
    ];
    assert.deepEqual(transposeComplexSeries(M), [
      [c(1, 2), c(-5, 6)],
      [c(3, -4), c(0, -1)],
    ]);
  });

  it('transposes a rectangular 2x3 complex matrix to 3x2', () => {
    const M = [
      [c(1, -1), c(2, 3), c(-0.5, 0.25)],
      [c(4, 0), c(0, 5), c(-7, -8)],
    ];
    assert.deepEqual(transposeComplexSeries(M), [
      [c(1, -1), c(4, 0)],
      [c(2, 3), c(0, 5)],
      [c(-0.5, 0.25), c(-7, -8)],
    ]);
  });

  it('transposes row vectors to column vectors and vice versa', () => {
    const rowVec = [[c(1, 2), c(3, 4), c(5, 6)]];
    const colVec = [[c(1, 2)], [c(3, 4)], [c(5, 6)]];
    assert.deepEqual(transposeComplexSeries(rowVec), colVec);
    assert.deepEqual(transposeComplexSeries(colVec), rowVec);
  });

  it('handles 1x1 singleton matrices and does not mutate the input', () => {
    const M = [[c(2.5, -3.5)]];
    const T = transposeComplexSeries(M);
    assert.deepEqual(T, [[c(2.5, -3.5)]]);
    assert.notEqual(T, M);
    assert.notEqual(T[0][0], M[0][0]);
    T[0][0].re = 999;
    T[0][0].im = -999;
    assert.deepEqual(M, [[c(2.5, -3.5)]]);
  });

  it('handles empty matrices and zero-column matrices', () => {
    assert.deepEqual(transposeComplexSeries([]), []);
    assert.deepEqual(transposeComplexSeries([[], []]), []);
  });

  it('validates matrix structure and complex entries', () => {
    assert.throws(() => transposeComplexSeries(null), TypeError);
    assert.throws(() => transposeComplexSeries(undefined), TypeError);
    assert.throws(() => transposeComplexSeries(42), TypeError);
    assert.throws(() => transposeComplexSeries({}), TypeError);
    assert.throws(() => transposeComplexSeries(['not-a-row']), TypeError);

    // Ragged matrix
    assert.throws(
      () => transposeComplexSeries([[c(1, 0), c(2, 0)], [c(3, 0)]]),
      RangeError
    );

    // Invalid complex elements
    assert.throws(() => transposeComplexSeries([[null]]), TypeError);
    assert.throws(() => transposeComplexSeries([[1]]), TypeError);
    assert.throws(() => transposeComplexSeries([[{ re: 1 }]]), TypeError);
    assert.throws(
      () => transposeComplexSeries([[{ re: '1', im: 0 }]]),
      TypeError
    );
    assert.throws(
      () => transposeComplexSeries([[{ re: Number.NaN, im: 0 }]]),
      RangeError
    );
    assert.throws(
      () => transposeComplexSeries([[{ re: 0, im: Number.POSITIVE_INFINITY }]]),
      RangeError
    );
    assert.throws(
      () => transposeComplexSeries([[{ re: Number.NEGATIVE_INFINITY, im: 0 }]]),
      RangeError
    );
  });

  it('cross-check: involution (A^T)^T === A', () => {
    const A = [
      [c(1.1, -2.2), c(3.3, 4.4), c(-5.5, 0)],
      [c(0, 6.6), c(-7.7, -8.8), c(9.9, 1.5)],
    ];
    assert.deepEqual(transposeComplexSeries(transposeComplexSeries(A)), A);
  });

  it('cross-check: complex linearity (a*A + b*B)^T === a*A^T + b*B^T', () => {
    const alpha = c(2, -3);
    const beta = c(-1.5, 0.5);
    const A = [
      [c(1, 2), c(-3, 4), c(0.5, -1)],
      [c(2, 0), c(-1, -2), c(3, 1)],
    ];
    const B = [
      [c(-2, 1), c(4, -2), c(1.5, 3)],
      [c(0, -3), c(2, 5), c(-4, 0.5)],
    ];

    const lhs = transposeComplexSeries(matLinearCombComplex(alpha, A, beta, B));
    const rhs = matLinearCombComplex(
      alpha,
      transposeComplexSeries(A),
      beta,
      transposeComplexSeries(B)
    );
    assertComplexMatrixClose(lhs, rhs);
  });

  it('cross-check: product reversal (A * B)^T === B^T * A^T', () => {
    const A = [
      [c(1, -2), c(0.5, 3), c(-4, 1)],
      [c(2, 1), c(-1, 0), c(3, -2)],
    ];
    const B = [
      [c(2, 0), c(-1, 3), c(0, 2), c(1, 1)],
      [c(-3, 1), c(2, -1), c(4, 0), c(-2, 2)],
      [c(1, -1), c(0, -2), c(-1, 3), c(3, 0)],
    ];

    const lhs = transposeComplexSeries(matMulComplex(A, B));
    const rhs = matMulComplex(
      transposeComplexSeries(B),
      transposeComplexSeries(A)
    );
    assertComplexMatrixClose(lhs, rhs);
  });

  it('cross-check: real/imaginary split Re(A)^T + i*Im(A)^T === A^T', () => {
    const A = [
      [c(1, 7), c(2, 8), c(3, 9)],
      [c(4, 10), c(5, 11), c(6, 12)],
    ];
    const realTranspose = (M) =>
      M[0].map((_, j) => M.map((row) => row[j]));
    const rePart = realTranspose(A.map((r) => r.map((x) => x.re)));
    const imPart = realTranspose(A.map((r) => r.map((x) => x.im)));
    const recombined = rePart.map((row, i) =>
      row.map((reVal, j) => ({ re: reVal, im: imPart[i][j] }))
    );

    assert.deepEqual(transposeComplexSeries(A), recombined);
  });
});
