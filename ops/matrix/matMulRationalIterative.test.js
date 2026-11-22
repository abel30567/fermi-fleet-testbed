import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulRationalIterative } from './matMulRationalIterative.js';

/** Helper to construct a rational literal concisely. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Helper to verify every entry in a matrix is in canonical lowest terms. */
function assertCanonicalMatrix(matrix) {
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const { num, den } = matrix[i][j];
      assert.equal(typeof num, 'bigint');
      assert.equal(typeof den, 'bigint');
      assert.ok(den > 0n, `den must be > 0n at [${i}][${j}], got ${den}`);
      if (num === 0n) {
        assert.equal(den, 1n, `zero must be 0n/1n at [${i}][${j}]`);
      } else {
        let x = num < 0n ? -num : num;
        let y = den;
        while (y !== 0n) {
          const t = x % y;
          x = y;
          y = t;
        }
        assert.equal(x, 1n, `entry [${i}][${j}] = ${num}/${den} is not reduced`);
      }
    }
  }
}

/** Independent helper: matrix transpose. */
function transpose(m) {
  return m[0].map((_, j) => m.map((row) => row[j]));
}

/** Independent helper: floating-point matrix multiplication. */
function matMulFloat(a, b) {
  const m = a.length;
  const n = a[0].length;
  const p = b[0].length;
  const out = Array.from({ length: m }, () => new Array(p).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += (Number(a[i][k].num) / Number(a[i][k].den)) *
          (Number(b[k][j].num) / Number(b[k][j].den));
      }
      out[i][j] = sum;
    }
  }
  return out;
}

describe('matMulRationalIterative', () => {
  it('multiplies 1x1 rational matrices and reduces the result', () => {
    const a = [[q(6, 35)]];
    const b = [[q(14, 9)]];
    const res = matMulRationalIterative(a, b);
    assertCanonicalMatrix(res);
    assert.deepEqual(res, [[q(4, 15)]]);
  });

  it('multiplies square matrices with integer and fractional entries', () => {
    const a = [
      [q(1, 2), q(-2, 3)],
      [q(3, 4), q(5, 6)],
    ];
    const b = [
      [q(4, 5), q(1, 3)],
      [q(-3, 2), q(2, 5)],
    ];
    // [0][0] = 1/2*4/5 + (-2/3)*(-3/2) = 2/5 + 1 = 7/5
    // [0][1] = 1/2*1/3 + (-2/3)*(2/5) = 1/6 - 4/15 = -1/10
    // [1][0] = 3/4*4/5 + 5/6*(-3/2) = 3/5 - 5/4 = -13/20
    // [1][1] = 3/4*1/3 + 5/6*2/5 = 1/4 + 1/3 = 7/12
    const res = matMulRationalIterative(a, b);
    assertCanonicalMatrix(res);
    assert.deepEqual(res, [
      [q(7, 5), q(-1, 10)],
      [q(-13, 20), q(7, 12)],
    ]);
  });

  it('multiplies rectangular matrices (2x3 * 3x2, 1x4 * 4x1, 3x1 * 1x3)', () => {
    const a = [
      [q(1, 2), q(2, 3), q(-1, 4)],
      [q(0, 1), q(-3, 5), q(4, 7)],
    ];
    const b = [
      [q(2, 1), q(-1, 3)],
      [q(3, 2), q(5, 6)],
      [q(4, 1), q(0, 1)],
    ];
    // [0][0] = 1 + 1 - 1 = 1
    // [0][1] = -1/6 + 5/9 + 0 = 7/18
    // [1][0] = 0 - 9/10 + 16/7 = (-63 + 160)/70 = 97/70
    // [1][1] = 0 - 1/2 + 0 = -1/2
    const prod = matMulRationalIterative(a, b);
    assertCanonicalMatrix(prod);
    assert.deepEqual(prod, [
      [q(1, 1), q(7, 18)],
      [q(97, 70), q(-1, 2)],
    ]);

    // Row vector (1x4) * column vector (4x1) -> 1x1
    const row = [[q(1, 2), q(1, 3), q(1, 4), q(1, 5)]];
    const col = [[q(2, 1)], [q(3, 1)], [q(4, 1)], [q(5, 1)]];
    const dot = matMulRationalIterative(row, col);
    assertCanonicalMatrix(dot);
    assert.deepEqual(dot, [[q(4, 1)]]);

    // Outer product (3x1) * (1x3) -> 3x3
    const u = [[q(1, 2)], [q(-2, 3)], [q(0, 1)]];
    const v = [[q(3, 4), q(-6, 5), q(2, 1)]];
    const outer = matMulRationalIterative(u, v);
    assertCanonicalMatrix(outer);
    assert.deepEqual(outer, [
      [q(3, 8), q(-3, 5), q(1, 1)],
      [q(-1, 2), q(4, 5), q(-4, 3)],
      [q(0, 1), q(0, 1), q(0, 1)],
    ]);
  });

  it('preserves matrices under left and right identity multiplication', () => {
    const a = [
      [q(3, 7), q(-5, 11), q(0, 1)],
      [q(-1, 2), q(8, 9), q(13, 4)],
    ];
    const id2 = [
      [q(1), q(0)],
      [q(0), q(1)],
    ];
    const id3 = [
      [q(1), q(0), q(0)],
      [q(0), q(1), q(0)],
      [q(0), q(0), q(1)],
    ];

    const left = matMulRationalIterative(id2, a);
    const right = matMulRationalIterative(a, id3);
    assertCanonicalMatrix(left);
    assertCanonicalMatrix(right);
    assert.deepEqual(left, a);
    assert.deepEqual(right, a);
  });

  it('produces canonical zero matrix when multiplying by a zero matrix', () => {
    const a = [
      [q(5, 6), q(-7, 8)],
      [q(9, 10), q(11, 12)],
      [q(-1, 3), q(2, 5)],
    ];
    const z2x2 = [
      [q(0, 1), q(0, 1)],
      [q(0, 1), q(0, 1)],
    ];
    const z2x3 = [
      [q(0, 1), q(0, 1), q(0, 1)],
      [q(0, 1), q(0, 1), q(0, 1)],
    ];

    const az = matMulRationalIterative(a, z2x2);
    assertCanonicalMatrix(az);
    assert.deepEqual(az, [
      [q(0, 1), q(0, 1)],
      [q(0, 1), q(0, 1)],
      [q(0, 1), q(0, 1)],
    ]);

    const za = matMulRationalIterative(z2x3, a);
    assertCanonicalMatrix(za);
    assert.deepEqual(za, [
      [q(0, 1), q(0, 1)],
      [q(0, 1), q(0, 1)],
    ]);
  });

  it('normalizes unreduced inputs and negative denominators without mutating inputs', () => {
    const a = [
      [{ num: 4n, den: -6n }, { num: 0n, den: -9n }],
      [{ num: -6n, den: -8n }, { num: 10n, den: 15n }],
    ];
    const b = [
      [{ num: -9n, den: 12n }, { num: 3n, den: -3n }],
      [{ num: 2n, den: -4n }, { num: -0n, den: 7n }],
    ];
    const snapshotA = a.map((row) => row.map((c) => ({ ...c })));
    const snapshotB = b.map((row) => row.map((c) => ({ ...c })));

    // a normalizes to [[-2/3, 0], [3/4, 2/3]]
    // b normalizes to [[-3/4, -1], [-1/2, 0]]
    // a*b = [[1/2, 2/3], [-9/16 - 1/3, -3/4]] = [[1/2, 2/3], [-43/48, -3/4]]
    const res = matMulRationalIterative(a, b);
    assertCanonicalMatrix(res);
    assert.deepEqual(res, [
      [q(1, 2), q(2, 3)],
      [q(-43, 48), q(-3, 4)],
    ]);
    assert.deepEqual(a, snapshotA);
    assert.deepEqual(b, snapshotB);
  });

  it('handles exact cancellation to zero and very large BigInt entries', () => {
    const big = 10n ** 40n;
    const a = [
      [{ num: big + 1n, den: 3n }, { num: -big - 1n, den: 6n }],
    ];
    const b = [
      [{ num: 1n, den: 2n }],
      [{ num: 1n, den: 1n }],
    ];
    // (big+1)/6 + (-(big+1))/6 = 0/1
    const res = matMulRationalIterative(a, b);
    assertCanonicalMatrix(res);
    assert.deepEqual(res, [[{ num: 0n, den: 1n }]]);

    // Non-zero large BigInt product that exceeds IEEE-754 double precision
    const c = [[{ num: big, den: 1n }, { num: 1n, den: big }]];
    const d = [[{ num: 1n, den: big }], [{ num: big, den: 1n }]];
    const res2 = matMulRationalIterative(c, d);
    assertCanonicalMatrix(res2);
    assert.deepEqual(res2, [[{ num: 2n, den: 1n }]]);
  });

  it('cross-check: satisfies associativity (A*B)*C === A*(B*C)', () => {
    const a = [
      [q(1, 2), q(-2, 3), q(3, 5)],
      [q(-4, 7), q(5, 6), q(-1, 9)],
    ]; // 2x3
    const b = [
      [q(2, 3), q(-1, 4), q(0, 1), q(5, 2)],
      [q(-3, 5), q(7, 8), q(1, 3), q(-2, 7)],
      [q(4, 9), q(1, 2), q(-5, 6), q(3, 4)],
    ]; // 3x4
    const c = [
      [q(3, 2), q(-5, 4)],
      [q(1, 7), q(2, 3)],
      [q(-4, 5), q(6, 11)],
      [q(0, 1), q(-1, 2)],
    ]; // 4x2

    const left = matMulRationalIterative(matMulRationalIterative(a, b), c);
    const right = matMulRationalIterative(a, matMulRationalIterative(b, c));
    assertCanonicalMatrix(left);
    assertCanonicalMatrix(right);
    assert.deepEqual(left, right);
  });

  it('cross-check: satisfies transpose identity (A*B)^T === B^T * A^T', () => {
    const a = [
      [q(1, 3), q(-2, 5), q(4, 7)],
      [q(5, 2), q(0, 1), q(-3, 4)],
    ];
    const b = [
      [q(-1, 2), q(3, 8)],
      [q(7, 6), q(-2, 3)],
      [q(5, 9), q(1, 4)],
    ];

    const abT = transpose(matMulRationalIterative(a, b));
    const bTaT = matMulRationalIterative(transpose(b), transpose(a));
    assertCanonicalMatrix(bTaT);
    assert.deepEqual(abT, bTaT);
  });

  it('cross-check: exact 3x3 Hilbert matrix times its exact inverse equals identity', () => {
    const hilbert3 = [
      [q(1, 1), q(1, 2), q(1, 3)],
      [q(1, 2), q(1, 3), q(1, 4)],
      [q(1, 3), q(1, 4), q(1, 5)],
    ];
    const hilbert3Inv = [
      [q(9), q(-36), q(30)],
      [q(-36), q(192), q(-180)],
      [q(30), q(-180), q(180)],
    ];
    const id3 = [
      [q(1), q(0), q(0)],
      [q(0), q(1), q(0)],
      [q(0), q(0), q(1)],
    ];

    const prod = matMulRationalIterative(hilbert3, hilbert3Inv);
    assertCanonicalMatrix(prod);
    assert.deepEqual(prod, id3);
  });

  it('cross-check: matches independent floating-point matrix multiplication within 1e-12', () => {
    const a = [
      [q(1, 7), q(-3, 11), q(5, 13), q(2, 3)],
      [q(-4, 9), q(7, 5), q(-1, 6), q(8, 17)],
      [q(11, 4), q(-2, 19), q(3, 8), q(-5, 12)],
    ];
    const b = [
      [q(2, 5), q(-7, 3)],
      [q(9, 13), q(4, 11)],
      [q(-3, 7), q(5, 9)],
      [q(6, 17), q(-1, 4)],
    ];

    const exact = matMulRationalIterative(a, b);
    assertCanonicalMatrix(exact);
    const approx = matMulFloat(a, b);

    assert.equal(exact.length, approx.length);
    for (let i = 0; i < exact.length; i++) {
      assert.equal(exact[i].length, approx[i].length);
      for (let j = 0; j < exact[i].length; j++) {
        const rationalAsFloat = Number(exact[i][j].num) / Number(exact[i][j].den);
        assert.ok(
          Math.abs(rationalAsFloat - approx[i][j]) < 1e-12,
          `mismatch at [${i}][${j}]: ${rationalAsFloat} vs ${approx[i][j]}`
        );
      }
    }
  });

  it('throws TypeError or RangeError on invalid inputs', () => {
    const valid1x1 = [[q(1, 1)]];
    const valid2x2 = [
      [q(1), q(2)],
      [q(3), q(4)],
    ];

    // Non-array matrices
    assert.throws(() => matMulRationalIterative(null, valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative(valid1x1, undefined), TypeError);
    assert.throws(() => matMulRationalIterative('not a matrix', valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative(valid1x1, 42), TypeError);

    // Empty matrices / empty rows
    assert.throws(() => matMulRationalIterative([], valid1x1), RangeError);
    assert.throws(() => matMulRationalIterative(valid1x1, []), RangeError);
    assert.throws(() => matMulRationalIterative([[]], valid1x1), RangeError);
    assert.throws(() => matMulRationalIterative(valid1x1, [[]]), RangeError);

    // Non-array rows
    assert.throws(() => matMulRationalIterative([q(1)], valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative([[q(1)], null], valid1x1), TypeError);

    // Ragged matrices
    assert.throws(
      () => matMulRationalIterative([[q(1), q(2)], [q(3)]], valid2x2),
      RangeError
    );
    assert.throws(
      () => matMulRationalIterative(valid2x2, [[q(1)], [q(2), q(3)]]),
      RangeError
    );

    // Invalid rational entries
    assert.throws(() => matMulRationalIterative([[null]], valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative([[{ num: 1, den: 2n }]], valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative([[{ num: 1n, den: 2 }]], valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative([[[1n, 2n]]], valid1x1), TypeError);
    assert.throws(() => matMulRationalIterative([[{ num: 1n }]], valid1x1), TypeError);

    // Zero denominators
    assert.throws(
      () => matMulRationalIterative([[{ num: 1n, den: 0n }]], valid1x1),
      RangeError
    );
    assert.throws(
      () => matMulRationalIterative(valid1x1, [[{ num: 0n, den: 0n }]]),
      RangeError
    );

    // Incompatible inner dimensions
    const m2x3 = [
      [q(1), q(2), q(3)],
      [q(4), q(5), q(6)],
    ];
    assert.throws(() => matMulRationalIterative(m2x3, valid2x2), RangeError);
    assert.throws(() => matMulRationalIterative(m2x3, m2x3), RangeError);
  });
});
