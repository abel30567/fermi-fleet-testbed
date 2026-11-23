import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductTypedSeries } from './dotProductTypedSeries.js';

/**
 * Independent reference: squared Euclidean norm ||v||^2.
 * @param {Float64Array} v
 * @returns {number}
 */
function normSquared(v) {
  let acc = 0;
  for (let i = 0; i < v.length; i += 1) {
    acc += v[i] * v[i];
  }
  return acc;
}

/**
 * Independent reference via the polarization identity:
 *   a · b = 0.25 * (||a + b||^2 - ||a - b||^2)
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number}
 */
function dotViaPolarization(a, b) {
  const sum = new Float64Array(a.length);
  const diff = new Float64Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    sum[i] = a[i] + b[i];
    diff[i] = a[i] - b[i];
  }
  return 0.25 * (normSquared(sum) - normSquared(diff));
}

describe('dotProductTypedSeries', () => {
  it('computes dot product for standard positive vectors', () => {
    const a = new Float64Array([1, 2, 3]);
    const b = new Float64Array([4, 5, 6]);
    assert.equal(dotProductTypedSeries(a, b), 32);
  });

  it('handles single-element vectors', () => {
    const a = new Float64Array([7.5]);
    const b = new Float64Array([-2]);
    assert.equal(dotProductTypedSeries(a, b), -15);
  });

  it('returns 0 for empty Float64Array inputs', () => {
    const a = new Float64Array(0);
    const b = new Float64Array(0);
    assert.equal(dotProductTypedSeries(a, b), 0);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float64Array([1, 0, -1, 0]);
    const b = new Float64Array([0, 5, 0, -3]);
    assert.equal(dotProductTypedSeries(a, b), 0);

    const u = new Float64Array([3, 4]);
    const v = new Float64Array([-4, 3]);
    assert.equal(dotProductTypedSeries(u, v), 0);
  });

  it('handles negative values and signed zero normalization', () => {
    const a = new Float64Array([-1, -2, -3, 4]);
    const b = new Float64Array([2, -3, 4, -5]);
    // -2 + 6 - 12 - 20 = -28
    assert.equal(dotProductTypedSeries(a, b), -28);

    const z1 = new Float64Array([-0]);
    const z2 = new Float64Array([1]);
    assert.ok(Object.is(dotProductTypedSeries(z1, z2), 0));
  });

  it('preserves precision in ill-conditioned cancellation series (Kahan/Dot2 advantage)', () => {
    // Naive summation loses the +1 term because 1e16 + 1 rounds back to 1e16.
    const a = new Float64Array([1e16, 1, -1e16]);
    const b = new Float64Array([1, 1, 1]);
    assert.equal(dotProductTypedSeries(a, b), 1);

    // Closed-form geometric series identity:
    // sum_{k=0}^{n-1} r^k * r^k = (1 - r^(2n)) / (1 - r^2) for r = 0.5
    const n = 20;
    const g = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
      g[k] = 0.5 ** k;
    }
    const expected = (1 - 0.25 ** n) / (1 - 0.25);
    assert.ok(Math.abs(dotProductTypedSeries(g, g) - expected) < 1e-15);
  });

  it('propagates NaN and Infinity per IEEE 754 semantics', () => {
    const withNaN = new Float64Array([1, NaN, 3]);
    const ones = new Float64Array([1, 1, 1]);
    assert.ok(Number.isNaN(dotProductTypedSeries(withNaN, ones)));

    const withInf = new Float64Array([Infinity, 1, 2]);
    assert.equal(dotProductTypedSeries(withInf, ones), Infinity);

    const withNegInf = new Float64Array([-Infinity, 1, 2]);
    assert.equal(dotProductTypedSeries(withNegInf, ones), -Infinity);

    const oppositeInf = new Float64Array([Infinity, -Infinity]);
    const twoOnes = new Float64Array([1, 1]);
    assert.ok(Number.isNaN(dotProductTypedSeries(oppositeInf, twoOnes)));

    const infZero = new Float64Array([Infinity, 1]);
    const zeroOne = new Float64Array([0, 1]);
    assert.ok(Number.isNaN(dotProductTypedSeries(infZero, zeroOne)));
  });

  it('throws TypeError for non-Float64Array inputs', () => {
    const valid = new Float64Array([1, 2]);
    const invalidInputs = [
      [1, 2],
      new Float32Array([1, 2]),
      new Int32Array([1, 2]),
      null,
      undefined,
      42,
      '12',
      { length: 2, 0: 1, 1: 2 },
    ];

    for (const bad of invalidInputs) {
      assert.throws(() => dotProductTypedSeries(bad, valid), TypeError);
      assert.throws(() => dotProductTypedSeries(valid, bad), TypeError);
    }
  });

  it('throws RangeError for mismatched lengths', () => {
    const a = new Float64Array([1, 2, 3]);
    const b = new Float64Array([1, 2]);
    assert.throws(() => dotProductTypedSeries(a, b), RangeError);
  });

  it('cross-checks against the polarization identity, commutativity, and bilinearity', () => {
    const a = new Float64Array([1.25, -3.5, 4.75, 0.5, -2.125, 6.0]);
    const b = new Float64Array([-0.75, 2.25, 1.5, -4.0, 3.375, -1.25]);
    const c = new Float64Array([0.5, 1.0, -2.0, 3.5, -1.5, 2.25]);

    const ab = dotProductTypedSeries(a, b);
    const ba = dotProductTypedSeries(b, a);
    const polarized = dotViaPolarization(a, b);

    // Polarization identity: a · b = 0.25 * (||a + b||^2 - ||a - b||^2)
    assert.ok(Math.abs(ab - polarized) < 1e-12);

    // Commutativity: a · b === b · a
    assert.equal(ab, ba);

    // Bilinearity: (alpha * a + beta * c) · b === alpha * (a · b) + beta * (c · b)
    const alpha = 2.5;
    const beta = -1.75;
    const comb = new Float64Array(a.length);
    for (let i = 0; i < a.length; i += 1) {
      comb[i] = alpha * a[i] + beta * c[i];
    }
    const lhs = dotProductTypedSeries(comb, b);
    const rhs = alpha * dotProductTypedSeries(a, b) + beta * dotProductTypedSeries(c, b);
    assert.ok(Math.abs(lhs - rhs) < 1e-12);
  });

  it('matches closed-form arithmetic sum-of-squares identity sum_{k=1}^n k^2 = n(n+1)(2n+1)/6', () => {
    const n = 1000;
    const seq = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      seq[i] = i + 1;
    }
    const expected = (n * (n + 1) * (2 * n + 1)) / 6;
    assert.equal(dotProductTypedSeries(seq, seq), expected);
  });
});
