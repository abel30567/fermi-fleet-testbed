import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulTypedSeries } from './matMulTypedSeries.js';

function assertCloseArray(actual, expected, eps = 1e-12) {
  assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
  assert.equal(actual.length, expected.length, 'array lengths must match');
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= eps,
      `mismatch at index ${i}: got ${actual[i]}, expected ${expected[i]}`
    );
  }
}

function transpose(mat, rows, cols) {
  const out = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      out[j * rows + i] = mat[i * cols + j];
    }
  }
  return out;
}

function trace(mat, n) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += mat[i * n + i];
  }
  return sum;
}

function identity(n) {
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    out[i * n + i] = 1;
  }
  return out;
}

describe('matMulTypedSeries', () => {
  describe('normal cases', () => {
    it('multiplies 1x1 matrices with explicit and inferred dimensions', () => {
      const a = new Float64Array([3.5]);
      const b = new Float64Array([-2]);

      assertCloseArray(matMulTypedSeries(a, b, 1, 1, 1), new Float64Array([-7]));
      assertCloseArray(matMulTypedSeries(a, b), new Float64Array([-7]));
    });

    it('multiplies square 2x2 and 3x3 matrices with explicit and inferred dimensions', () => {
      const a2 = new Float64Array([1, 2, 3, 4]);
      const b2 = new Float64Array([5, 6, 7, 8]);
      const expected2 = new Float64Array([19, 22, 43, 50]);

      assertCloseArray(matMulTypedSeries(a2, b2, 2, 2, 2), expected2);
      assertCloseArray(matMulTypedSeries(a2, b2), expected2);

      const a3 = new Float64Array([1, 2, 3, 0, 1, 4, 5, 6, 0]);
      const b3 = new Float64Array([-2, 1, 0, 3, 0, -1, 4, 2, 5]);
      const expected3 = new Float64Array([16, 7, 13, 19, 8, 19, 8, 5, -6]);

      assertCloseArray(matMulTypedSeries(a3, b3, 3, 3, 3), expected3);
      assertCloseArray(matMulTypedSeries(a3, b3), expected3);
    });

    it('multiplies rectangular matrices (2x3 * 3x2, 3x2 * 2x4, dot and outer products)', () => {
      const a = new Float64Array([1, 2, 3, 4, 5, 6]); // 2x3
      const b = new Float64Array([7, 8, 9, 10, 11, 12]); // 3x2
      assertCloseArray(
        matMulTypedSeries(a, b, 2, 3, 2),
        new Float64Array([58, 64, 139, 154])
      );

      // Row vector (1x4) * column vector (4x1) -> 1x1 inner product
      const row = new Float64Array([1.5, -2, 0.5, 4]);
      const col = new Float64Array([2, 3, -6, 0.25]);
      assertCloseArray(matMulTypedSeries(row, col, 1, 4, 1), new Float64Array([-5]));

      // Column vector (3x1) * row vector (1x3) -> 3x3 outer product
      const u = new Float64Array([2, -1, 3]);
      const v = new Float64Array([4, 5, -2]);
      assertCloseArray(
        matMulTypedSeries(u, v, 3, 1, 3),
        new Float64Array([8, 10, -4, -4, -5, 2, 12, 15, -6])
      );
    });

    it('does not mutate input Float64Arrays and returns a fresh Float64Array', () => {
      const a = new Float64Array([1, 2, 3, 4]);
      const b = new Float64Array([5, 6, 7, 8]);
      const aSnap = new Float64Array(a);
      const bSnap = new Float64Array(b);

      const res = matMulTypedSeries(a, b);
      assert.notEqual(res, a);
      assert.notEqual(res, b);
      assert.deepEqual(a, aSnap);
      assert.deepEqual(b, bSnap);
    });
  });

  describe('edge cases and validation', () => {
    it('handles zero matrices and identity matrices', () => {
      const a = new Float64Array([1.25, -3.5, 4, 0, 2.5, -1]); // 2x3
      const zero3x2 = new Float64Array(6);
      const zero2x2 = new Float64Array(4);
      const i2 = identity(2);
      const i3 = identity(3);

      assertCloseArray(matMulTypedSeries(a, zero3x2, 2, 3, 2), zero2x2);
      assertCloseArray(matMulTypedSeries(zero2x2, a, 2, 2, 3), new Float64Array(6));
      assertCloseArray(matMulTypedSeries(i2, a, 2, 2, 3), a);
      assertCloseArray(matMulTypedSeries(a, i3, 2, 3, 3), a);

      const sq = new Float64Array([2, -1, 0, 5, 3, 4, -2, 1, 7]);
      assertCloseArray(matMulTypedSeries(sq, i3), sq);
      assertCloseArray(matMulTypedSeries(i3, sq), sq);
    });

    it('rejects non-Float64Array inputs with TypeError', () => {
      const valid = new Float64Array([1, 2, 3, 4]);
      const invalidInputs = [
        [1, 2, 3, 4],
        new Float32Array([1, 2, 3, 4]),
        new Int32Array([1, 2, 3, 4]),
        null,
        undefined,
        42,
        '1234',
        { length: 4 },
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => matMulTypedSeries(bad, valid, 2, 2, 2), TypeError);
        assert.throws(() => matMulTypedSeries(valid, bad, 2, 2, 2), TypeError);
      }
    });

    it('rejects invalid, partial, non-positive, or non-integer dimensions', () => {
      const a = new Float64Array([1, 2, 3, 4]);
      const b = new Float64Array([5, 6, 7, 8]);

      // Partial dimension specifications
      assert.throws(() => matMulTypedSeries(a, b, 2), TypeError);
      assert.throws(() => matMulTypedSeries(a, b, 2, 2), TypeError);
      assert.throws(() => matMulTypedSeries(a, b, undefined, 2, 2), TypeError);

      // Non-number dimensions
      assert.throws(() => matMulTypedSeries(a, b, '2', 2, 2), TypeError);
      assert.throws(() => matMulTypedSeries(a, b, 2, null, 2), TypeError);

      // Non-positive dimensions
      assert.throws(() => matMulTypedSeries(a, b, 0, 2, 2), RangeError);
      assert.throws(() => matMulTypedSeries(a, b, 2, 0, 2), RangeError);
      assert.throws(() => matMulTypedSeries(a, b, 2, 2, 0), RangeError);
      assert.throws(() => matMulTypedSeries(a, b, -2, 2, 2), RangeError);

      // Non-integer / non-finite dimensions
      assert.throws(() => matMulTypedSeries(a, b, 1.5, 2, 2), RangeError);
      assert.throws(() => matMulTypedSeries(a, b, NaN, 2, 2), RangeError);
      assert.throws(() => matMulTypedSeries(a, b, Infinity, 2, 2), RangeError);
    });

    it('rejects dimension mismatches and un-inferable square inputs', () => {
      const a4 = new Float64Array([1, 2, 3, 4]);
      const b6 = new Float64Array([1, 2, 3, 4, 5, 6]);
      const empty = new Float64Array(0);

      // Explicit length mismatches
      assert.throws(() => matMulTypedSeries(a4, b6, 2, 2, 2), RangeError);
      assert.throws(() => matMulTypedSeries(b6, a4, 2, 2, 2), RangeError);
      assert.throws(() => matMulTypedSeries(a4, a4, 2, 3, 2), RangeError);

      // Inferred square failures
      assert.throws(() => matMulTypedSeries(empty, empty), RangeError);
      assert.throws(() => matMulTypedSeries(a4, b6), RangeError);
      assert.throws(() => matMulTypedSeries(b6, b6), RangeError);
    });
  });

  describe('mathematical identities cross-checks', () => {
    it('satisfies associativity: (A * B) * C === A * (B * C)', () => {
      const A = new Float64Array([1.2, -0.5, 2.3, 0.7, 3.1, -1.4]); // 2x3
      const B = new Float64Array([
        0.4, -2.1, 1.5, 0.8,
        -1.3, 0.9, 2.2, -0.6,
        3.0, 1.1, -0.7, 2.5,
      ]); // 3x4
      const C = new Float64Array([
        2.0, -1.0,
        0.5, 1.5,
        -2.5, 0.25,
        1.2, 3.4,
      ]); // 4x2

      const AB = matMulTypedSeries(A, B, 2, 3, 4);
      const lhs = matMulTypedSeries(AB, C, 2, 4, 2);

      const BC = matMulTypedSeries(B, C, 3, 4, 2);
      const rhs = matMulTypedSeries(A, BC, 2, 3, 2);

      assertCloseArray(lhs, rhs, 1e-11);
    });

    it('satisfies transpose identity: (A * B)^T === B^T * A^T', () => {
      const A = new Float64Array([1.5, -2.2, 0.3, 4.1, -0.8, 2.7]); // 2x3
      const B = new Float64Array([
        -1.1, 0.4, 3.2, -0.5,
        2.6, -1.9, 0.7, 1.3,
        0.2, 2.8, -1.4, 0.9,
      ]); // 3x4

      const AB = matMulTypedSeries(A, B, 2, 3, 4);
      const lhs = transpose(AB, 2, 4); // 4x2

      const Bt = transpose(B, 3, 4); // 4x3
      const At = transpose(A, 2, 3); // 3x2
      const rhs = matMulTypedSeries(Bt, At, 4, 3, 2); // 4x2

      assertCloseArray(lhs, rhs, 1e-11);
    });

    it('satisfies cyclic trace identity: tr(A * B) === tr(B * A)', () => {
      const A = new Float64Array([
        1.1, -2.3, 0.5, 3.4,
        -0.7, 4.2, 1.8, -1.5,
      ]); // 2x4
      const B = new Float64Array([
        0.9, -1.2,
        2.5, 0.6,
        -3.1, 1.4,
        0.8, 2.2,
      ]); // 4x2

      const AB = matMulTypedSeries(A, B, 2, 4, 2); // 2x2
      const BA = matMulTypedSeries(B, A, 4, 2, 4); // 4x4

      const trAB = trace(AB, 2);
      const trBA = trace(BA, 4);

      assert.ok(
        Math.abs(trAB - trBA) <= 1e-11,
        `expected tr(AB)=${trAB} to equal tr(BA)=${trBA}`
      );
    });
  });
});
