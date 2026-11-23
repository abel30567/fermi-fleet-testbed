import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectionTypedSeries } from './projectionTypedSeries.js';

function assertCloseArray(actual, expected, tol = 1e-12) {
  assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
  assert.equal(actual.length, expected.length, 'length mismatch');
  for (let i = 0; i < expected.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    const scale = Math.max(1, Math.abs(expected[i]));
    assert.ok(
      diff <= tol * scale,
      `index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`
    );
  }
}

function dot(u, v) {
  let sum = 0;
  for (let i = 0; i < u.length; i++) {
    sum += u[i] * v[i];
  }
  return sum;
}

describe('projectionTypedSeries', () => {
  it('computes known 2D and 3D vector projections', () => {
    // proj_[3, 4]([1, 2]) = (11 / 25) * [3, 4] = [1.32, 1.76]
    const p2 = projectionTypedSeries(
      new Float64Array([1, 2]),
      new Float64Array([3, 4])
    );
    assertCloseArray(p2, [1.32, 1.76]);

    // proj_[1, 1, 1]([1, 2, 3]) = (6 / 3) * [1, 1, 1] = [2, 2, 2]
    const p3 = projectionTypedSeries(
      new Float64Array([1, 2, 3]),
      new Float64Array([1, 1, 1])
    );
    assertCloseArray(p3, [2, 2, 2]);
  });

  it('returns zero vector for orthogonal vectors without negative zeros', () => {
    const a = new Float64Array([1, 0, -2]);
    const b = new Float64Array([2, 5, 1]);
    const res = projectionTypedSeries(a, b);
    assertCloseArray(res, [0, 0, 0]);
    for (let i = 0; i < res.length; i++) {
      assert.ok(Object.is(res[i], 0), `expected +0 at index ${i}`);
    }
  });

  it('returns a equal vector for parallel vectors and handles same-reference input', () => {
    const a = new Float64Array([3, -6, 9]);
    const b = new Float64Array([1, -2, 3]);
    const res = projectionTypedSeries(a, b);
    assertCloseArray(res, [3, -6, 9]);

    const selfProj = projectionTypedSeries(a, a);
    assert.notEqual(selfProj, a);
    assertCloseArray(selfProj, [3, -6, 9]);
  });

  it('handles negative scaling and obtuse angles', () => {
    // Anti-parallel: proj_[-2, 4]([1, -2]) = [1, -2]
    const anti = projectionTypedSeries(
      new Float64Array([1, -2]),
      new Float64Array([-2, 4])
    );
    assertCloseArray(anti, [1, -2]);

    // Obtuse angle: a = [-1, 0], b = [1, 1] => (-1 / 2) * [1, 1] = [-0.5, -0.5]
    const obtuse = projectionTypedSeries(
      new Float64Array([-1, 0]),
      new Float64Array([1, 1])
    );
    assertCloseArray(obtuse, [-0.5, -0.5]);
  });

  it('handles 1D vectors and zero input vector a', () => {
    const oneD = projectionTypedSeries(
      new Float64Array([-7.5]),
      new Float64Array([2.5])
    );
    assertCloseArray(oneD, [-7.5]);

    const zeroA = projectionTypedSeries(
      new Float64Array([-0, 0, -0]),
      new Float64Array([4, -5, 6])
    );
    assertCloseArray(zeroA, [0, 0, 0]);
    for (let i = 0; i < zeroA.length; i++) {
      assert.ok(Object.is(zeroA[i], 0));
    }
  });

  it('does not mutate input Float64Arrays', () => {
    const a = new Float64Array([5, -3, 2, 1]);
    const b = new Float64Array([1, 2, -1, 4]);
    const aCopy = new Float64Array(a);
    const bCopy = new Float64Array(b);

    const res = projectionTypedSeries(a, b);
    assert.notEqual(res, a);
    assert.notEqual(res, b);
    assert.deepEqual(a, aCopy);
    assert.deepEqual(b, bCopy);
  });

  it('remains numerically stable across extreme scales without overflow or underflow', () => {
    // Very large b (b·b would overflow Float64 without scaling)
    const largeB = projectionTypedSeries(
      new Float64Array([1, 2]),
      new Float64Array([3e200, 4e200])
    );
    assertCloseArray(largeB, [1.32, 1.76]);

    // Very small b (b·b would underflow to 0 without scaling)
    const smallB = projectionTypedSeries(
      new Float64Array([1, 2]),
      new Float64Array([3e-200, 4e-200])
    );
    assertCloseArray(smallB, [1.32, 1.76]);

    // Very large a and small b
    const largeA = projectionTypedSeries(
      new Float64Array([1e200, 2e200]),
      new Float64Array([3e-200, 4e-200])
    );
    assertCloseArray(largeA, [1.32e200, 1.76e200]);

    // Very small a and large b
    const smallA = projectionTypedSeries(
      new Float64Array([1e-200, 2e-200]),
      new Float64Array([3e200, 4e200])
    );
    assertCloseArray(smallA, [1.32e-200, 1.76e-200]);
  });

  it('rejects invalid input types, empty arrays, mismatched lengths, zero target, and non-finite values', () => {
    const valid = new Float64Array([1, 2]);

    // Type validation
    assert.throws(() => projectionTypedSeries([1, 2], valid), TypeError);
    assert.throws(() => projectionTypedSeries(valid, [1, 2]), TypeError);
    assert.throws(() => projectionTypedSeries(new Float32Array([1, 2]), valid), TypeError);
    assert.throws(() => projectionTypedSeries(valid, new Int32Array([1, 2])), TypeError);
    assert.throws(() => projectionTypedSeries(null, valid), TypeError);
    assert.throws(() => projectionTypedSeries(valid, undefined), TypeError);

    // Empty & mismatched lengths
    assert.throws(() => projectionTypedSeries(new Float64Array(0), new Float64Array(0)), RangeError);
    assert.throws(() => projectionTypedSeries(new Float64Array([1]), new Float64Array([1, 2])), RangeError);
    assert.throws(() => projectionTypedSeries(new Float64Array([1, 2, 3]), valid), RangeError);

    // Zero target vector
    assert.throws(() => projectionTypedSeries(valid, new Float64Array([0, 0])), RangeError);
    assert.throws(() => projectionTypedSeries(new Float64Array([0, 0]), new Float64Array([-0, -0])), RangeError);

    // Non-finite values
    assert.throws(() => projectionTypedSeries(new Float64Array([NaN, 1]), valid), RangeError);
    assert.throws(() => projectionTypedSeries(valid, new Float64Array([Infinity, 1])), RangeError);
    assert.throws(() => projectionTypedSeries(new Float64Array([-Infinity, 1]), valid), RangeError);
  });

  it('satisfies residual orthogonality, idempotence, Pythagorean theorem, linearity, and scale invariance', () => {
    const vectors = [
      [
        new Float64Array([3.5, -1.2, 4.8, 0.7, -2.3]),
        new Float64Array([-0.9, 2.4, 1.1, -3.6, 0.5]),
      ],
      [
        new Float64Array(Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.7) * (i + 1))),
        new Float64Array(Array.from({ length: 64 }, (_, i) => Math.cos(i * 1.3) - 0.25)),
      ],
    ];

    for (const [a, b] of vectors) {
      const p = projectionTypedSeries(a, b);
      const residual = new Float64Array(a.length);
      for (let i = 0; i < a.length; i++) {
        residual[i] = a[i] - p[i];
      }

      // 1. Residual orthogonality: (a - proj_b(a)) · b == 0
      const normA = Math.sqrt(dot(a, a));
      const normB = Math.sqrt(dot(b, b));
      assert.ok(
        Math.abs(dot(residual, b)) <= 1e-11 * normA * normB,
        'residual must be orthogonal to b'
      );

      // 2. Idempotence: proj_b(proj_b(a)) == proj_b(a)
      const pp = projectionTypedSeries(p, b);
      assertCloseArray(pp, p, 1e-12);

      // 3. Pythagorean theorem: ||proj_b(a)||^2 + ||a - proj_b(a)||^2 == ||a||^2
      const normPSq = dot(p, p);
      const normResSq = dot(residual, residual);
      const normASq = dot(a, a);
      assert.ok(
        Math.abs((normPSq + normResSq) - normASq) <= 1e-11 * normASq,
        'Pythagorean identity must hold'
      );

      // 4. Scale invariance in b: proj_{k*b}(a) == proj_b(a) for k != 0
      for (const k of [-7.5, 0.125, 42]) {
        const kb = new Float64Array(b.length);
        for (let i = 0; i < b.length; i++) kb[i] = k * b[i];
        assertCloseArray(projectionTypedSeries(a, kb), p, 1e-12);
      }
    }

    // 5. Linearity in a: proj_b(c1*a1 + c2*a2) == c1*proj_b(a1) + c2*proj_b(a2)
    const a1 = new Float64Array([1.5, -2.0, 3.25, 0.5]);
    const a2 = new Float64Array([-0.75, 4.0, -1.5, 2.25]);
    const b = new Float64Array([2.0, 1.0, -3.0, 0.5]);
    const c1 = 2.5;
    const c2 = -1.75;
    const combo = new Float64Array(a1.length);
    for (let i = 0; i < a1.length; i++) combo[i] = c1 * a1[i] + c2 * a2[i];

    const pCombo = projectionTypedSeries(combo, b);
    const p1 = projectionTypedSeries(a1, b);
    const p2 = projectionTypedSeries(a2, b);
    const expected = new Float64Array(a1.length);
    for (let i = 0; i < a1.length; i++) expected[i] = c1 * p1[i] + c2 * p2[i];

    assertCloseArray(pCombo, expected, 1e-12);
  });
});
