import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductFloatIterative } from './crossProductFloatIterative.js';

/**
 * Independent 3D dot product helper for cross-checks.
 * @param {number[]} u
 * @param {number[]} v
 * @returns {number}
 */
function dot(u, v) {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

/**
 * Independent cross product via brute-force 3D Levi-Civita tensor contraction:
 *   (a × b)_i = sum_{j=0..2} sum_{k=0..2} eps_{ijk} * a_j * b_k
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function leviCivitaCross(a, b) {
  const eps = (i, j, k) => {
    if (i === j || j === k || i === k) return 0;
    if ((i === 0 && j === 1 && k === 2) || (i === 1 && j === 2 && k === 0) || (i === 2 && j === 0 && k === 1)) {
      return 1;
    }
    return -1;
  };
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    let sum = 0;
    for (let j = 0; j < 3; j += 1) {
      for (let k = 0; k < 3; k += 1) {
        const sign = eps(i, j, k);
        if (sign !== 0) {
          sum += sign * a[j] * b[k];
        }
      }
    }
    out[i] = sum;
  }
  return out;
}

/**
 * Independent 3x3 determinant via cofactor expansion along the first row.
 * @param {number[]} r0
 * @param {number[]} r1
 * @param {number[]} r2
 * @returns {number}
 */
function det3x3(r0, r1, r2) {
  return (
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
  );
}

/**
 * Deterministic LCG pseudo-random generator in [-range, range].
 * @param {number} seed
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return (range = 100) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return ((state / 0xffffffff) * 2 - 1) * range;
  };
}

/**
 * Assert two 3D vectors are equal within an absolute + relative tolerance.
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [tol=1e-10]
 */
function assertVecClose(actual, expected, tol = 1e-10) {
  assert.equal(actual.length, 3);
  for (let i = 0; i < 3; i += 1) {
    const scale = Math.max(1, Math.abs(actual[i]), Math.abs(expected[i]));
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tol * scale,
      `component ${i}: expected ${actual[i]} to be close to ${expected[i]} (tol=${tol * scale})`
    );
  }
}

describe('crossProductFloatIterative', () => {
  describe('normal cases', () => {
    it('computes right-handed standard basis cross products', () => {
      const i = [1, 0, 0];
      const j = [0, 1, 0];
      const k = [0, 0, 1];

      assert.deepEqual(crossProductFloatIterative(i, j), k);
      assert.deepEqual(crossProductFloatIterative(j, k), i);
      assert.deepEqual(crossProductFloatIterative(k, i), j);

      assert.deepEqual(crossProductFloatIterative(j, i), [0, 0, -1]);
      assert.deepEqual(crossProductFloatIterative(k, j), [-1, 0, 0]);
      assert.deepEqual(crossProductFloatIterative(i, k), [0, -1, 0]);
    });

    it('computes cross product of general integer vectors', () => {
      assert.deepEqual(crossProductFloatIterative([1, 2, 3], [4, 5, 6]), [-3, 6, -3]);
      assert.deepEqual(crossProductFloatIterative([3, -3, 1], [4, 9, 2]), [-15, -2, 39]);
      assert.deepEqual(crossProductFloatIterative([-2, 5, -7], [3, -1, 4]), [13, -13, -13]);
    });

    it('computes cross product of fractional float64 vectors', () => {
      const result = crossProductFloatIterative([0.5, -1.25, 2.5], [1.5, 0.75, -0.5]);
      // x = (-1.25)*(-0.5) - (2.5)*(0.75) = 0.625 - 1.875 = -1.25
      // y = (2.5)*(1.5) - (0.5)*(-0.5) = 3.75 - (-0.25) = 4.0
      // z = (0.5)*(0.75) - (-1.25)*(1.5) = 0.375 - (-1.875) = 2.25
      assert.deepEqual(result, [-1.25, 4, 2.25]);
    });

    it('does not mutate input vectors and returns a new array', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      const res = crossProductFloatIterative(a, b);
      assert.deepEqual(a, [1, 2, 3]);
      assert.deepEqual(b, [4, 5, 6]);
      assert.notEqual(res, a);
      assert.notEqual(res, b);
    });
  });

  describe('edge cases', () => {
    it('returns zero vector when either operand is the zero vector', () => {
      assertVecClose(crossProductFloatIterative([0, 0, 0], [1, 2, 3]), [0, 0, 0], 0);
      assertVecClose(crossProductFloatIterative([1, 2, 3], [0, 0, 0]), [0, 0, 0], 0);
      assertVecClose(crossProductFloatIterative([0, 0, 0], [0, 0, 0]), [0, 0, 0], 0);
    });

    it('returns zero vector for identical, parallel, and anti-parallel vectors', () => {
      assertVecClose(crossProductFloatIterative([2, -5, 7], [2, -5, 7]), [0, 0, 0], 0);
      assertVecClose(crossProductFloatIterative([1.5, -2.5, 4], [3, -5, 8]), [0, 0, 0], 0);
      assertVecClose(crossProductFloatIterative([1, -2, 3], [-4, 8, -12]), [0, 0, 0], 0);
    });

    it('handles negative zero components without throwing', () => {
      const res = crossProductFloatIterative([-0, -0, -0], [1, -2, 3]);
      assert.equal(res.length, 3);
      for (const c of res) {
        assert.equal(c === 0, true);
      }
    });

    it('handles subnormal and very small float64 values', () => {
      const tiny = Number.MIN_VALUE;
      const res = crossProductFloatIterative([tiny, 0, 0], [0, 1, 0]);
      assert.deepEqual(res, [0, 0, tiny]);

      const underflow = crossProductFloatIterative([tiny, 0, 0], [0, tiny, 0]);
      assert.deepEqual(underflow, [0, 0, 0]);
    });

    it('handles large float64 values following IEEE-754 overflow semantics', () => {
      const big = 1e200;
      const res = crossProductFloatIterative([big, 0, 0], [0, big, 0]);
      assert.equal(res[0], 0);
      assert.equal(res[1], 0);
      assert.equal(res[2], Infinity);
    });

    it('handles mixed-magnitude values near float64 precision limits', () => {
      const res = crossProductFloatIterative([1e150, 1e-150, 0], [0, 1e-150, 1e150]);
      // x = 1e-150 * 1e150 - 0 = 1
      // y = 0 - 1e150 * 1e150 = -1e300
      // z = 1e150 * 1e-150 - 0 = 1
      assertVecClose(res, [1, -1e300, 1], 1e-12);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when arguments are not arrays', () => {
      assert.throws(() => crossProductFloatIterative(null, [1, 2, 3]), TypeError);
      assert.throws(() => crossProductFloatIterative([1, 2, 3], undefined), TypeError);
      assert.throws(() => crossProductFloatIterative('123', [1, 2, 3]), TypeError);
      assert.throws(() => crossProductFloatIterative({ 0: 1, 1: 2, 2: 3 }, [1, 2, 3]), TypeError);
      assert.throws(() => crossProductFloatIterative([1, 2, 3], 42), TypeError);
      assert.throws(() => crossProductFloatIterative(new Float64Array([1, 2, 3]), [1, 2, 3]), TypeError);
    });

    it('throws RangeError when vector length is not 3', () => {
      assert.throws(() => crossProductFloatIterative([], [1, 2, 3]), RangeError);
      assert.throws(() => crossProductFloatIterative([1, 2], [1, 2, 3]), RangeError);
      assert.throws(() => crossProductFloatIterative([1, 2, 3], [1, 2, 3, 4]), RangeError);
    });

    it('throws TypeError for non-number elements or sparse arrays', () => {
      assert.throws(() => crossProductFloatIterative(['1', 2, 3], [4, 5, 6]), TypeError);
      assert.throws(() => crossProductFloatIterative([1, null, 3], [4, 5, 6]), TypeError);
      assert.throws(() => crossProductFloatIterative([1, 2, 3], [4, undefined, 6]), TypeError);
      assert.throws(() => crossProductFloatIterative([1n, 2, 3], [4, 5, 6]), TypeError);
      // eslint-disable-next-line no-sparse-arrays
      assert.throws(() => crossProductFloatIterative([1, , 3], [4, 5, 6]), TypeError);
      assert.throws(() => crossProductFloatIterative(new Array(3), [4, 5, 6]), TypeError);
    });

    it('throws RangeError for NaN and ±Infinity elements', () => {
      assert.throws(() => crossProductFloatIterative([NaN, 2, 3], [4, 5, 6]), RangeError);
      assert.throws(() => crossProductFloatIterative([1, 2, 3], [4, NaN, 6]), RangeError);
      assert.throws(() => crossProductFloatIterative([Infinity, 2, 3], [4, 5, 6]), RangeError);
      assert.throws(() => crossProductFloatIterative([1, 2, 3], [4, 5, -Infinity]), RangeError);
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches brute-force Levi-Civita tensor contraction across 50 deterministic random pairs', () => {
      const rand = makeRng(0x5eed1234);
      for (let t = 0; t < 50; t += 1) {
        const a = [rand(100), rand(100), rand(100)];
        const b = [rand(100), rand(100), rand(100)];
        const actual = crossProductFloatIterative(a, b);
        const expected = leviCivitaCross(a, b);
        assertVecClose(actual, expected, 1e-12);
      }
    });

    it('satisfies orthogonality, anti-commutativity, and Lagrange identity', () => {
      const rand = makeRng(0xdeadbeef);
      for (let t = 0; t < 30; t += 1) {
        const a = [rand(50), rand(50), rand(50)];
        const b = [rand(50), rand(50), rand(50)];
        const ab = crossProductFloatIterative(a, b);
        const ba = crossProductFloatIterative(b, a);

        // Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
        const scale = Math.hypot(...a) * Math.hypot(...b) * Math.hypot(...ab) || 1;
        assert.ok(Math.abs(dot(ab, a)) <= 1e-11 * scale);
        assert.ok(Math.abs(dot(ab, b)) <= 1e-11 * scale);

        // Anti-commutativity: a × b = -(b × a)
        assertVecClose(ab, [-ba[0], -ba[1], -ba[2]], 1e-14);

        // Lagrange's identity: ||a × b||^2 = ||a||^2 ||b||^2 - (a · b)^2
        const lhs = dot(ab, ab);
        const rhs = dot(a, a) * dot(b, b) - dot(a, b) ** 2;
        const lagrangeScale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
        assert.ok(Math.abs(lhs - rhs) <= 1e-11 * lagrangeScale);
      }
    });

    it('satisfies Jacobi identity, bilinearity, and scalar triple product = 3x3 determinant', () => {
      const rand = makeRng(0x13579bdf);
      for (let t = 0; t < 20; t += 1) {
        const a = [rand(20), rand(20), rand(20)];
        const b = [rand(20), rand(20), rand(20)];
        const c = [rand(20), rand(20), rand(20)];
        const alpha = rand(5);
        const beta = rand(5);

        // Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
        const t1 = crossProductFloatIterative(a, crossProductFloatIterative(b, c));
        const t2 = crossProductFloatIterative(b, crossProductFloatIterative(c, a));
        const t3 = crossProductFloatIterative(c, crossProductFloatIterative(a, b));
        const jacobiSum = [t1[0] + t2[0] + t3[0], t1[1] + t2[1] + t3[1], t1[2] + t2[2] + t3[2]];
        const jacobiScale = Math.max(1, Math.hypot(...t1), Math.hypot(...t2), Math.hypot(...t3));
        assertVecClose(jacobiSum, [0, 0, 0], 1e-11 * jacobiScale);

        // Bilinearity: a × (αb + βc) = α(a × b) + β(a × c)
        const combo = [alpha * b[0] + beta * c[0], alpha * b[1] + beta * c[1], alpha * b[2] + beta * c[2]];
        const lhs = crossProductFloatIterative(a, combo);
        const ab = crossProductFloatIterative(a, b);
        const ac = crossProductFloatIterative(a, c);
        const rhs = [alpha * ab[0] + beta * ac[0], alpha * ab[1] + beta * ac[1], alpha * ab[2] + beta * ac[2]];
        assertVecClose(lhs, rhs, 1e-11);

        // Scalar triple product: (a × b) · c = det([a, b, c])
        const triple = dot(ab, c);
        const det = det3x3(a, b, c);
        const detScale = Math.max(1, Math.abs(triple), Math.abs(det));
        assert.ok(Math.abs(triple - det) <= 1e-11 * detScale);
      }
    });
  });
});
