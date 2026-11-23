import test from 'node:test';
import assert from 'node:assert/strict';
import { transposeBigIntIterative } from './transposeBigIntIterative.js';

test('transposeBigIntIterative: rectangular 2x3 matrix', () => {
  const A = [
    [1n, 2n, 3n],
    [4n, 5n, 6n],
  ];
  assert.deepEqual(transposeBigIntIterative(A), [
    [1n, 4n],
    [2n, 5n],
    [3n, 6n],
  ]);
});

test('transposeBigIntIterative: square matrix', () => {
  const A = [
    [1n, -2n, 3n],
    [4n, 0n, -6n],
    [7n, 8n, 9n],
  ];
  assert.deepEqual(transposeBigIntIterative(A), [
    [1n, 4n, 7n],
    [-2n, 0n, 8n],
    [3n, -6n, 9n],
  ]);
});

test('transposeBigIntIterative: 1x1, row vector, and column vector', () => {
  assert.deepEqual(transposeBigIntIterative([[42n]]), [[42n]]);
  assert.deepEqual(transposeBigIntIterative([[1n, 2n, 3n, 4n]]), [
    [1n],
    [2n],
    [3n],
    [4n],
  ]);
  assert.deepEqual(transposeBigIntIterative([[1n], [2n], [3n]]), [
    [1n, 2n, 3n],
  ]);
});

test('transposeBigIntIterative: large BigInt values preserve exact precision', () => {
  const big1 = 10n ** 36n + 1234567890123456789n;
  const big2 = -(10n ** 40n + 9876543210987654321n);
  const A = [
    [big1, 0n],
    [big2, 10n ** 18n],
  ];
  const T = transposeBigIntIterative(A);
  assert.deepEqual(T, [
    [big1, big2],
    [0n, 10n ** 18n],
  ]);
});

test('transposeBigIntIterative: does not mutate input matrix', () => {
  const A = [
    [1n, 2n],
    [3n, 4n],
  ];
  const copy = A.map((r) => [...r]);
  const T = transposeBigIntIterative(A);
  T[0][1] = 999n;
  assert.deepEqual(A, copy);
});

test('transposeBigIntIterative: cross-check involution (A^T)^T === A and (AB)^T === B^T A^T', () => {
  const matMul = (X, Y) =>
    X.map((row) =>
      Y[0].map((_, j) => row.reduce((acc, v, k) => acc + v * Y[k][j], 0n)),
    );

  const A = [
    [2n, -3n, 5n],
    [7n, 11n, -13n],
  ];
  const B = [
    [17n, -19n],
    [23n, 29n],
    [-31n, 37n],
  ];

  assert.deepEqual(transposeBigIntIterative(transposeBigIntIterative(A)), A);
  assert.deepEqual(
    transposeBigIntIterative(matMul(A, B)),
    matMul(transposeBigIntIterative(B), transposeBigIntIterative(A)),
  );
});

test('transposeBigIntIterative: rejects invalid inputs', () => {
  assert.throws(() => transposeBigIntIterative(null), TypeError);
  assert.throws(() => transposeBigIntIterative('not-a-matrix'), TypeError);
  assert.throws(() => transposeBigIntIterative([]), RangeError);
  assert.throws(() => transposeBigIntIterative([[]]), RangeError);
  assert.throws(() => transposeBigIntIterative([[1n, 2n], [3n]]), RangeError);
  assert.throws(() => transposeBigIntIterative([[1, 2]]), TypeError);
  assert.throws(() => transposeBigIntIterative([1n, 2n]), TypeError);
});
