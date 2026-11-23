import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionTypedMemo } from './projectionTypedMemo.js';

/**
 * Helper to assert two Float64Arrays are element-wise approximately equal.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [eps=1e-12]
 */
function assertVecClose(actual, expected, eps = 1e-12) {
  assert.ok(actual instanceof Float64Array, 'Result must be a Float64Array');
  assert.equal(actual.length, expected.length, 'Vector lengths must match');
  for (let i = 0; i < expected.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    const tol = eps * Math.max(1, Math.abs(expected[i]));
    assert.ok(
      diff <= tol,
      `Index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${diff} > tol ${tol})`
    );
  }
}

/**
 * Naive independent dot product helper for cross-checks.
 *
 * @param {Float64Array} u
 * @param {Float64Array} v
 * @returns {number}
 */
function dotProduct(u, v) {
  let sum = 0;
  for (let i = 0; i < u.length; i++) {
    sum += u[i] * v[i];
  }
  return sum;
}

/**
 * Naive independent vector projection for cross-checks.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceProjection(a, b) {
  const scalar = dotProduct(a, b) / dotProduct(b, b);
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = scalar * b[i];
  }
  return out;
}

test('projectionTypedMemo: normal 1D, 2D, 3D, and higher-dimensional cases', () => {
  // 1D
  assertVecClose(
    projectionTypedMemo(new Float64Array([5]), new Float64Array([-2])),
    [5]
  );

  // 2D onto x-axis
  assertVecClose(
    projectionTypedMemo(new Float64Array([3, 4]), new Float64Array([1, 0])),
    [3, 0]
  );

  // 2D general: ((1*3 + 2*4) / (9 + 16)) * [3, 4] = (11/25) * [3, 4] = [1.32, 1.76]
  assertVecClose(
    projectionTypedMemo(new Float64Array([1, 2]), new Float64Array([3, 4])),
    [1.32, 1.76]
  );

  // 3D with negative components: dot = -2 + 6 - 12 = -8, b·b = 1 + 4 + 9 = 14
  assertVecClose(
    projectionTypedMemo(
      new Float64Array([-2, 3, -4]),
      new Float64Array([1, 2, 3])
    ),
    [-8 / 14, -16 / 14, -24 / 14]
  );

  // 6D vector
  const a6 = new Float64Array([2, -1, 4, 0, -3, 5]);
  const b6 = new Float64Array([1, 2, -1, 3, 1, -2]);
  assertVecClose(projectionTypedMemo(a6, b6), referenceProjection(a6, b6));

  // Subarray views over a shared ArrayBuffer
  const buf = new Float64Array([99, 1, 2, -99, 3, 4, 88]);
  const aView = buf.subarray(1, 3);
  const bView = buf.subarray(4, 6);
  assertVecClose(projectionTypedMemo(aView, bView), [1.32, 1.76]);
});

test('projectionTypedMemo: edge cases (orthogonal, parallel, antiparallel, zero source, negative zero, extreme scales)', () => {
  // Orthogonal vectors -> exact zero vector (+0, not -0)
  const ortho = projectionTypedMemo(
    new Float64Array([1, 0, -1]),
    new Float64Array([1, 5, 1])
  );
  assert.deepStrictEqual(ortho, new Float64Array([0, 0, 0]));
  for (let i = 0; i < ortho.length; i++) {
    assert.ok(Object.is(ortho[i], 0), `Expected +0 at index ${i}`);
  }

  // Parallel vectors (same direction) -> equals a
  const b = new Float64Array([2, -3, 6]);
  const aParallel = new Float64Array([6, -9, 18]);
  assertVecClose(projectionTypedMemo(aParallel, b), aParallel);

  // Antiparallel vectors (opposite direction) -> equals a
  const aAnti = new Float64Array([-4, 6, -12]);
  assertVecClose(projectionTypedMemo(aAnti, b), aAnti);

  // Zero source vector -> zero vector
  const zeroSrc = projectionTypedMemo(
    new Float64Array([0, -0, 0]),
    new Float64Array([-3, 4, -5])
  );
  assert.deepStrictEqual(zeroSrc, new Float64Array([0, 0, 0]));

  // Extreme large target vector (would overflow naive b·b)
  const hugeA = new Float64Array([3, 4]);
  const hugeB = new Float64Array([3e200, 4e200]);
  assertVecClose(projectionTypedMemo(hugeA, hugeB), [3, 4], 1e-12);

  // Extreme small target vector (would underflow naive b·b to 0)
  const tinyA = new Float64Array([1, 2]);
  const tinyB = new Float64Array([3e-200, 4e-200]);
  assertVecClose(projectionTypedMemo(tinyA, tinyB), [1.32, 1.76], 1e-12);
});

test('projectionTypedMemo: strict input validation errors', () => {
  const valid = new Float64Array([1, 2]);

  // Zero target vector throws RangeError
  assert.throws(
    () => projectionTypedMemo(valid, new Float64Array([0, 0])),
    RangeError
  );
  assert.throws(
    () => projectionTypedMemo(valid, new Float64Array([-0, 0])),
    RangeError
  );

  // Empty vectors throw RangeError
  assert.throws(
    () => projectionTypedMemo(new Float64Array([]), new Float64Array([])),
    RangeError
  );

  // Mismatched lengths throw RangeError
  assert.throws(
    () => projectionTypedMemo(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
    RangeError
  );

  // Non-finite elements throw RangeError
  assert.throws(
    () => projectionTypedMemo(new Float64Array([NaN, 1]), valid),
    RangeError
  );
  assert.throws(
    () => projectionTypedMemo(valid, new Float64Array([Infinity, 1])),
    RangeError
  );
  assert.throws(
    () => projectionTypedMemo(new Float64Array([-Infinity, 1]), valid),
    RangeError
  );

  // Invalid types throw TypeError
  const invalidValues = [
    [1, 2],
    new Float32Array([1, 2]),
    new Int32Array([1, 2]),
    null,
    undefined,
    '1,2',
    42,
    { 0: 1, 1: 2, length: 2 },
  ];

  for (const bad of invalidValues) {
    assert.throws(() => projectionTypedMemo(bad, valid), TypeError);
    assert.throws(() => projectionTypedMemo(valid, bad), TypeError);
  }
});

test('projectionTypedMemo: memoization, cache immutability, and value-based keying', () => {
  const a = new Float64Array([4, 5, 6]);
  const b = new Float64Array([1, 0, 1]);

  const first = projectionTypedMemo(a, b);
  assertVecClose(first, [5, 0, 5]);

  // Mutate the returned Float64Array to verify cache immutability
  first[0] = -999999;
  first[1] = 123456;
  first[2] = 777777;

  const second = projectionTypedMemo(a, b);
  assert.notStrictEqual(second, first, 'Must return a fresh Float64Array instance');
  assertVecClose(second, [5, 0, 5]);

  // Distinct Float64Array instances with identical contents produce identical results
  const third = projectionTypedMemo(
    new Float64Array([4, 5, 6]),
    new Float64Array([1, 0, 1])
  );
  assert.notStrictEqual(third, second);
  assertVecClose(third, [5, 0, 5]);

  // Mutating input arrays in place must NOT return stale cached results
  a[0] = 10;
  const afterMutA = projectionTypedMemo(a, b);
  assertVecClose(afterMutA, [8, 0, 8]);

  b[1] = 2;
  const afterMutB = projectionTypedMemo(a, b);
  assertVecClose(afterMutB, referenceProjection(a, b));

  // Verify bounded cache continues working cleanly past eviction threshold (> 1024 entries)
  const target = new Float64Array([3, 4]);
  for (let i = 1; i <= 1100; i++) {
    const src = new Float64Array([i, -i * 0.5]);
    const res = projectionTypedMemo(src, target);
    const expectedScalar = (i * 3 - i * 0.5 * 4) / 25;
    assertVecClose(res, [expectedScalar * 3, expectedScalar * 4]);
  }
});

test('projectionTypedMemo: independent mathematical cross-checks', () => {
  // Deterministic PRNG (LCG) for reproducible multi-dimensional vectors
  let seed = 0x12345678;
  const nextVal = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 20 - 10;
  };

  for (const dim of [2, 3, 5, 12]) {
    for (let trial = 0; trial < 10; trial++) {
      const a = new Float64Array(dim);
      const a2 = new Float64Array(dim);
      const b = new Float64Array(dim);
      for (let i = 0; i < dim; i++) {
        a[i] = nextVal();
        a2[i] = nextVal();
        b[i] = nextVal();
      }
      // Guarantee b is non-zero
      b[0] += b[0] >= 0 ? 1 : -1;

      const proj = projectionTypedMemo(a, b);

      // 1. Cross-check against naive reference implementation
      const ref = referenceProjection(a, b);
      assertVecClose(proj, ref, 1e-11);

      // 2. Residual (a - proj_b(a)) is orthogonal to b
      const residual = new Float64Array(dim);
      for (let i = 0; i < dim; i++) {
        residual[i] = a[i] - proj[i];
      }
      const residualDotB = dotProduct(residual, b);
      const scale = Math.sqrt(dotProduct(a, a) * dotProduct(b, b)) + 1;
      assert.ok(
        Math.abs(residualDotB) <= 1e-11 * scale,
        `Residual not orthogonal to b: dot=${residualDotB}`
      );

      // 3. Idempotence: proj_b(proj_b(a)) === proj_b(a)
      const projTwice = projectionTypedMemo(proj, b);
      assertVecClose(projTwice, proj, 1e-11);

      // 4. Pythagorean identity: ||proj||^2 + ||residual||^2 === ||a||^2
      const lhs = dotProduct(proj, proj) + dotProduct(residual, residual);
      const rhs = dotProduct(a, a);
      assert.ok(
        Math.abs(lhs - rhs) <= 1e-10 * (rhs + 1),
        `Pythagorean identity failed: ${lhs} vs ${rhs}`
      );

      // 5. Scale invariance in b: proj_{k*b}(a) === proj_b(a) for non-zero k
      const k = -3.5;
      const kb = new Float64Array(dim);
      for (let i = 0; i < dim; i++) {
        kb[i] = k * b[i];
      }
      assertVecClose(projectionTypedMemo(a, kb), proj, 1e-11);

      // 6. Linearity in a: proj_b(c1*a + c2*a2) === c1*proj_b(a) + c2*proj_b(a2)
      const c1 = 2.25;
      const c2 = -1.75;
      const combo = new Float64Array(dim);
      for (let i = 0; i < dim; i++) {
        combo[i] = c1 * a[i] + c2 * a2[i];
      }
      const projCombo = projectionTypedMemo(combo, b);
      const projA2 = projectionTypedMemo(a2, b);
      const expectedCombo = new Float64Array(dim);
      for (let i = 0; i < dim; i++) {
        expectedCombo[i] = c1 * proj[i] + c2 * projA2[i];
      }
      assertVecClose(projCombo, expectedCombo, 1e-10);
    }
  }
});
