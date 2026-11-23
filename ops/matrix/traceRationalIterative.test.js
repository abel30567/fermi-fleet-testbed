import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceRationalIterative } from './traceRationalIterative.js';

/** Helper to construct a rational literal concisely in tests. */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Exact rational helpers for independent cross-check properties. */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function norm(num, den) {
  if (num === 0n) return { num: 0n, den: 1n };
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

function addR(a, b) {
  return norm(a.num * b.den + b.num * a.den, a.den * b.den);
}

function mulR(a, b) {
  return norm(a.num * b.num, a.den * b.den);
}

function matAdd(A, B) {
  return A.map((row, i) => row.map((v, j) => addR(v, B[i][j])));
}

function matScale(c, A) {
  return A.map((row) => row.map((v) => mulR(c, v)));
}

function matMul(A, B) {
  const n = A.length;
  const out = Array.from({ length: n }, () => Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = r(0, 1);
      for (let k = 0; k < n; k++) {
        sum = addR(sum, mulR(A[i][k], B[k][j]));
      }
      out[i][j] = sum;
    }
  }
  return out;
}

function matTranspose(A) {
  const n = A.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A[j][i]));
}

describe('traceRationalIterative', () => {
  it('computes trace of a 2x2 rational matrix in lowest terms', () => {
    const A = [
      [r(1, 2), r(3, 4)],
      [r(5, 6), r(1, 3)],
    ];
    assert.deepEqual(traceRationalIterative(A), r(5, 6));
  });

  it('computes trace of a 3x3 matrix with mixed signs and reduces to lowest terms', () => {
    const A = [
      [r(2, 3), r(1, 5), r(-7, 2)],
      [r(4, 9), r(-5, 6), r(3, 1)],
      [r(0, 1), r(8, 7), r(1, 2)],
    ];
    // 2/3 - 5/6 + 1/2 = 4/6 - 5/6 + 3/6 = 2/6 = 1/3
    assert.deepEqual(traceRationalIterative(A), r(1, 3));
  });

  it('handles unreduced inputs and negative denominators', () => {
    const A = [
      [r(6, -9), r(4, 8)],
      [r(-2, -6), r(-10, -15)],
    ];
    // -2/3 + 2/3 = 0/1
    assert.deepEqual(traceRationalIterative(A), r(0, 1));
  });

  it('handles 1x1 edge cases (positive, negative, zero, unreduced)', () => {
    assert.deepEqual(traceRationalIterative([[r(7, 11)]]), r(7, 11));
    assert.deepEqual(traceRationalIterative([[r(-6, -9)]]), r(2, 3));
    assert.deepEqual(traceRationalIterative([[r(6, -9)]]), r(-2, 3));
    assert.deepEqual(traceRationalIterative([[r(0, -5)]]), r(0, 1));
  });

  it('returns canonical { num: 0n, den: 1n } when diagonal sums to zero', () => {
    const A = [
      [r(1, 2), r(9, 1), r(2, 3)],
      [r(-4, 5), r(-1, 3), r(7, 8)],
      [r(3, 7), r(5, 2), r(-1, 6)],
    ];
    assert.deepEqual(traceRationalIterative(A), r(0, 1));
  });

  it('preserves exact precision with large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
    const big = 10n ** 30n;
    const A = [
      [{ num: big + 1n, den: 3n }, r(0, 1)],
      [r(0, 1), { num: 2n * big + 2n, den: 3n }],
    ];
    // (3*big + 3) / 3 = big + 1
    assert.deepEqual(traceRationalIterative(A), { num: big + 1n, den: 1n });
  });

  it('rejects empty, non-array, non-square, and ragged matrices', () => {
    assert.throws(() => traceRationalIterative([]), RangeError);
    assert.throws(() => traceRationalIterative(null), TypeError);
    assert.throws(() => traceRationalIterative('not a matrix'), TypeError);
    assert.throws(() => traceRationalIterative([r(1, 1)]), TypeError);
    assert.throws(
      () => traceRationalIterative([[r(1, 1), r(2, 1)]]),
      RangeError,
    );
    assert.throws(
      () => traceRationalIterative([[r(1, 1)], [r(2, 1)]]),
      RangeError,
    );
    assert.throws(
      () =>
        traceRationalIterative([
          [r(1, 1), r(2, 1)],
          [r(3, 1)],
        ]),
      RangeError,
    );
  });

  it('rejects invalid rational entries on and off the main diagonal', () => {
    // Non-bigint fields on diagonal
    assert.throws(() => traceRationalIterative([[{ num: 1, den: 2n }]]), TypeError);
    assert.throws(() => traceRationalIterative([[{ num: 1n, den: 2 }]]), TypeError);
    // Zero denominator on diagonal
    assert.throws(() => traceRationalIterative([[{ num: 1n, den: 0n }]]), RangeError);
    // Invalid off-diagonal entry (null or zero denominator)
    assert.throws(
      () =>
        traceRationalIterative([
          [r(1, 1), null],
          [r(0, 1), r(1, 1)],
        ]),
      TypeError,
    );
    assert.throws(
      () =>
        traceRationalIterative([
          [r(1, 1), { num: 5n, den: 0n }],
          [r(0, 1), r(1, 1)],
        ]),
      RangeError,
    );
  });

  it('satisfies linearity: tr(A + B) = tr(A) + tr(B) and tr(c*A) = c*tr(A)', () => {
    const A = [
      [r(1, 7), r(-2, 3), r(5, 11)],
      [r(4, 9), r(3, 5), r(-1, 2)],
      [r(7, 13), r(2, 17), r(-8, 19)],
    ];
    const B = [
      [r(-3, 4), r(1, 2), r(9, 10)],
      [r(5, 6), r(-7, 8), r(3, 11)],
      [r(2, 3), r(-4, 5), r(11, 12)],
    ];
    const c = r(-13, 17);

    assert.deepEqual(
      traceRationalIterative(matAdd(A, B)),
      addR(traceRationalIterative(A), traceRationalIterative(B)),
    );
    assert.deepEqual(
      traceRationalIterative(matScale(c, A)),
      mulR(c, traceRationalIterative(A)),
    );
  });

  it('satisfies cyclic and transpose properties: tr(AB) = tr(BA) and tr(A^T) = tr(A)', () => {
    const A = [
      [r(3, 5), r(-1, 4), r(7, 6)],
      [r(2, 3), r(5, 8), r(-9, 10)],
      [r(-4, 7), r(1, 2), r(11, 12)],
    ];
    const B = [
      [r(-2, 9), r(4, 5), r(-3, 7)],
      [r(7, 4), r(-1, 3), r(5, 6)],
      [r(3, 8), r(9, 11), r(-2, 5)],
    ];

    assert.deepEqual(
      traceRationalIterative(matMul(A, B)),
      traceRationalIterative(matMul(B, A)),
    );
    assert.deepEqual(
      traceRationalIterative(matTranspose(A)),
      traceRationalIterative(A),
    );
  });
});
