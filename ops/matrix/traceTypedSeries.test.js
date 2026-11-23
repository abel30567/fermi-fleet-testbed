import test from 'node:test';
import assert from 'node:assert/strict';
import { traceTypedSeries } from './traceTypedSeries.js';

/**
 * Helper to transpose an n x n row-major Float64Array matrix.
 * @param {Float64Array} a
 * @param {number} n
 * @returns {Float64Array}
 */
function transpose(a, n) {
  const out = new Float64Array(n * n);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      out[c * n + r] = a[r * n + c];
    }
  }
  return out;
}

/**
 * Helper to multiply two n x n row-major Float64Array matrices.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} n
 * @returns {Float64Array}
 */
function matmul(a, b, n) {
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < n; k += 1) {
      const aik = a[i * n + k];
      for (let j = 0; j < n; j += 1) {
        out[i * n + j] += aik * b[k * n + j];
      }
    }
  }
  return out;
}

/**
 * Helper to compute linear combination alpha * A + beta * B.
 * @param {number} alpha
 * @param {Float64Array} a
 * @param {number} beta
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function linearCombination(alpha, a, beta, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = alpha * a[i] + beta * b[i];
  }
  return out;
}

test('normal cases: 1x1, 2x2, 3x3, and 4x4 matrices', () => {
  assert.equal(traceTypedSeries(new Float64Array([7.5])), 7.5);
  assert.equal(traceTypedSeries(new Float64Array([7.5]), 1), 7.5);

  const m2 = new Float64Array([
    1, 2,
    3, 4,
  ]);
  assert.equal(traceTypedSeries(m2), 5);
  assert.equal(traceTypedSeries(m2, 2), 5);

  const m3 = new Float64Array([
    2, 9, 4,
    7, 5, 3,
    6, 1, 8,
  ]);
  assert.equal(traceTypedSeries(m3), 15);
  assert.equal(traceTypedSeries(m3, 3), 15);

  const m4 = new Float64Array([
    1.25, 0, 0, 99,
    0, 2.5, 0, 0,
    0, 0, 3.75, 0,
    -50, 0, 0, 4.5,
  ]);
  assert.equal(traceTypedSeries(m4), 12);
  assert.equal(traceTypedSeries(m4, 4), 12);
});

test('normal cases: identity, zero matrix, and negative values', () => {
  const n = 5;
  const identity = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    identity[i * n + i] = 1;
  }
  assert.equal(traceTypedSeries(identity), n);

  const zeros = new Float64Array(16);
  assert.equal(traceTypedSeries(zeros), 0);

  const negatives = new Float64Array([
    -3.5, 10, 20,
    30, -4.25, 40,
    50, 60, -2.25,
  ]);
  assert.equal(traceTypedSeries(negatives), -10);
});

test('compensated summation accuracy on ill-conditioned diagonal series', () => {
  // Naive left-to-right sum of [1e16, 1, -1e16] loses the 1; compensated summation preserves it.
  const cancel = new Float64Array([
    1e16, 0, 0,
    0, 1, 0,
    0, 0, -1e16,
  ]);
  assert.equal(traceTypedSeries(cancel), 1);

  // Sum 1000 diagonal entries of 0.1 (1000x1000 matrix = 1e6 elements, 8 MB).
  const dim = 1000;
  const repeated = new Float64Array(dim * dim);
  for (let i = 0; i < dim; i += 1) {
    repeated[i * dim + i] = 0.1;
  }
  assert.ok(Math.abs(traceTypedSeries(repeated, dim) - 100) <= 1e-13);
});

test('edge cases: empty Float64Array', () => {
  const empty = new Float64Array(0);
  assert.equal(traceTypedSeries(empty), 0);
  assert.equal(traceTypedSeries(empty, 0), 0);
});

test('edge cases: non-square length and mismatched n throw RangeError', () => {
  assert.throws(() => traceTypedSeries(new Float64Array([1, 2, 3])), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(5)), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), 3), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(9), 2), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(0), 1), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), -2), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), 2.5), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), Number.NaN), RangeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), Number.POSITIVE_INFINITY), RangeError);
});

test('edge cases: invalid input types throw TypeError', () => {
  assert.throws(() => traceTypedSeries([1, 2, 3, 4]), TypeError);
  assert.throws(() => traceTypedSeries(new Float32Array([1, 2, 3, 4])), TypeError);
  assert.throws(() => traceTypedSeries(new Int32Array([1, 2, 3, 4])), TypeError);
  assert.throws(() => traceTypedSeries(null), TypeError);
  assert.throws(() => traceTypedSeries(undefined), TypeError);
  assert.throws(() => traceTypedSeries({ length: 4 }), TypeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), '2'), TypeError);
  assert.throws(() => traceTypedSeries(new Float64Array(4), null), TypeError);
});

test('edge cases: NaN and Infinity handling', () => {
  const withNaN = new Float64Array([
    1, 0,
    0, Number.NaN,
  ]);
  assert.ok(Number.isNaN(traceTypedSeries(withNaN)));

  const withPosInf = new Float64Array([
    Number.POSITIVE_INFINITY, 0,
    0, 42,
  ]);
  assert.equal(traceTypedSeries(withPosInf), Number.POSITIVE_INFINITY);

  const withNegInf = new Float64Array([
    10, 0,
    0, Number.NEGATIVE_INFINITY,
  ]);
  assert.equal(traceTypedSeries(withNegInf), Number.NEGATIVE_INFINITY);

  const oppositeInfs = new Float64Array([
    Number.POSITIVE_INFINITY, 0,
    0, Number.NEGATIVE_INFINITY,
  ]);
  assert.ok(Number.isNaN(traceTypedSeries(oppositeInfs)));

  // Off-diagonal non-finite values should not corrupt the diagonal trace.
  const offDiagNonFinite = new Float64Array([
    3, Number.NaN,
    Number.POSITIVE_INFINITY, 4,
  ]);
  assert.equal(traceTypedSeries(offDiagNonFinite), 7);

  // Overflow of finite diagonal values produces Infinity cleanly.
  const overflow = new Float64Array([
    1e308, 0,
    0, 1e308,
  ]);
  assert.equal(traceTypedSeries(overflow), Number.POSITIVE_INFINITY);
});

test('cross-checks: linearity, transpose invariance, and cyclic property tr(AB) = tr(BA)', () => {
  const n = 4;
  const A = new Float64Array([
    2.5, -1.25, 3.0, 0.5,
    4.0, 1.5, -2.0, 6.25,
    -3.5, 0.75, 5.0, -1.0,
    1.25, 2.0, -4.5, 3.25,
  ]);
  const B = new Float64Array([
    -1.0, 2.25, 0.5, -3.0,
    3.5, 4.0, -1.5, 2.0,
    0.25, -2.5, 1.75, 4.5,
    -2.0, 1.0, 3.25, -0.75,
  ]);

  // 1. Linearity: tr(alpha * A + beta * B) = alpha * tr(A) + beta * tr(B)
  const alpha = 3.25;
  const beta = -2.5;
  const combined = linearCombination(alpha, A, beta, B);
  const lhsLinearity = traceTypedSeries(combined, n);
  const rhsLinearity = alpha * traceTypedSeries(A, n) + beta * traceTypedSeries(B, n);
  assert.ok(Math.abs(lhsLinearity - rhsLinearity) <= 1e-12);

  // 2. Transpose invariance: tr(A^T) = tr(A)
  assert.equal(traceTypedSeries(transpose(A, n), n), traceTypedSeries(A, n));
  assert.equal(traceTypedSeries(transpose(B, n), n), traceTypedSeries(B, n));

  // 3. Cyclic property: tr(A * B) = tr(B * A)
  const AB = matmul(A, B, n);
  const BA = matmul(B, A, n);
  const trAB = traceTypedSeries(AB, n);
  const trBA = traceTypedSeries(BA, n);
  assert.ok(Math.abs(trAB - trBA) <= 1e-11);
});
