import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductTypedSeries } from './crossProductTypedSeries.js';

/**
 * Helper to assert two Float64Arrays are element-wise close within tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [eps=1e-12]
 */
function assertCloseArray(actual, expected, eps = 1e-12) {
  assert.ok(actual instanceof Float64Array, 'Result must be a Float64Array');
  assert.equal(actual.length, expected.length, 'Array lengths must match');
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= eps,
      `Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}`
    );
  }
}

/**
 * Independent 3D dot product helper for identity cross-checks.
 *
 * @param {Float64Array} u
 * @param {Float64Array} v
 * @param {number} offset
 * @returns {number}
 */
function dot3(u, v, offset) {
  return (
    u[offset] * v[offset] +
    u[offset + 1] * v[offset + 1] +
    u[offset + 2] * v[offset + 2]
  );
}

/**
 * Independent Levi-Civita tensor contraction: (a x b)_i = sum_{j,k} eps_{ijk} a_j b_k.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} offset
 * @returns {[number, number, number]}
 */
function leviCivitaCross3(a, b, offset) {
  const va = [a[offset], a[offset + 1], a[offset + 2]];
  const vb = [b[offset], b[offset + 1], b[offset + 2]];
  const eps = (i, j, k) => {
    if (i === j || j === k || i === k) return 0;
    return ((j - i) * (k - i) * (k - j)) / 2;
  };
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        const sign = eps(i, j, k);
        if (sign !== 0) sum += sign * va[j] * vb[k];
      }
    }
    out[i] = sum;
  }
  return out;
}

describe('crossProductTypedSeries', () => {
  describe('standard basis and normal cases', () => {
    it('satisfies standard right-handed basis identities (i × j = k, j × k = i, k × i = j)', () => {
      const i = new Float64Array([1, 0, 0]);
      const j = new Float64Array([0, 1, 0]);
      const k = new Float64Array([0, 0, 1]);

      assertCloseArray(crossProductTypedSeries(i, j), [0, 0, 1]);
      assertCloseArray(crossProductTypedSeries(j, k), [1, 0, 0]);
      assertCloseArray(crossProductTypedSeries(k, i), [0, 1, 0]);

      assertCloseArray(crossProductTypedSeries(j, i), [0, 0, -1]);
      assertCloseArray(crossProductTypedSeries(k, j), [-1, 0, 0]);
      assertCloseArray(crossProductTypedSeries(i, k), [0, -1, 0]);
    });

    it('computes cross product for a single general 3D vector pair', () => {
      const a = new Float64Array([2, 3, 4]);
      const b = new Float64Array([5, 6, 7]);
      // (3*7 - 4*6, 4*5 - 2*7, 2*6 - 3*5) = (-3, 6, -3)
      const res = crossProductTypedSeries(a, b);
      assertCloseArray(res, [-3, 6, -3]);
    });

    it('computes cross products over a flat packed series of multiple 3D vectors', () => {
      const a = new Float64Array([
        1, 0, 0,
        2, 3, 4,
        -1.5, 2.5, -3.5,
      ]);
      const b = new Float64Array([
        0, 1, 0,
        5, 6, 7,
        4.0, -2.0, 1.0,
      ]);
      // 3rd pair: (2.5*1 - (-3.5)*(-2), (-3.5)*4 - (-1.5)*1, (-1.5)*(-2) - 2.5*4)
      //         = (2.5 - 7, -14 + 1.5, 3 - 10) = (-4.5, -12.5, -7)
      const res = crossProductTypedSeries(a, b);
      assertCloseArray(res, [
        0, 0, 1,
        -3, 6, -3,
        -4.5, -12.5, -7,
      ]);
    });

    it('does not mutate inputs and works with Float64Array subarrays', () => {
      const bufA = new Float64Array([99, 1, 2, 3, 4, 5, 6, 88]);
      const bufB = new Float64Array([77, 7, 8, 9, 10, 11, 12, 66]);
      const a = bufA.subarray(1, 7);
      const b = bufB.subarray(1, 7);

      const snapshotA = Float64Array.from(a);
      const snapshotB = Float64Array.from(b);

      const res = crossProductTypedSeries(a, b);
      assert.notEqual(res, a);
      assert.notEqual(res, b);
      assertCloseArray(res, [-6, 12, -6, -6, 12, -6]);
      assert.deepStrictEqual(a, snapshotA);
      assert.deepStrictEqual(b, snapshotB);
    });
  });

  describe('edge cases and input validation', () => {
    it('handles empty Float64Array inputs', () => {
      const a = new Float64Array(0);
      const b = new Float64Array(0);
      const res = crossProductTypedSeries(a, b);
      assert.ok(res instanceof Float64Array);
      assert.equal(res.length, 0);
    });

    it('returns zero vectors for parallel, anti-parallel, identical, and zero vectors', () => {
      const a = new Float64Array([
        3, -4, 5,
        1.5, 2.5, -3.5,
        0, 0, 0,
        7, 8, 9,
      ]);
      const b = new Float64Array([
        6, -8, 10,       // parallel (2 * a)
        -4.5, -7.5, 10.5, // anti-parallel (-3 * a)
        1, 2, 3,          // zero x v
        0, 0, 0,          // v x zero
      ]);
      const res = crossProductTypedSeries(a, b);
      assertCloseArray(res, [
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
      ]);
    });

    it('throws TypeError when inputs are not Float64Array instances', () => {
      const valid = new Float64Array([1, 2, 3]);
      const invalidInputs = [
        [1, 2, 3],
        new Float32Array([1, 2, 3]),
        new Int32Array([1, 2, 3]),
        null,
        undefined,
        '123',
        42,
        { length: 3, 0: 1, 1: 2, 2: 3 },
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => crossProductTypedSeries(bad, valid), TypeError);
        assert.throws(() => crossProductTypedSeries(valid, bad), TypeError);
      }
      assert.throws(() => crossProductTypedSeries(valid), TypeError);
    });

    it('throws RangeError when input lengths do not match', () => {
      assert.throws(
        () => crossProductTypedSeries(new Float64Array(3), new Float64Array(6)),
        RangeError
      );
      assert.throws(
        () => crossProductTypedSeries(new Float64Array(0), new Float64Array(3)),
        RangeError
      );
    });

    it('throws RangeError when input length is not divisible by 3', () => {
      for (const badLen of [1, 2, 4, 5, 7, 8]) {
        assert.throws(
          () =>
            crossProductTypedSeries(
              new Float64Array(badLen),
              new Float64Array(badLen)
            ),
          RangeError
        );
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    const count = 20;
    const a = new Float64Array(count * 3);
    const b = new Float64Array(count * 3);
    const c = new Float64Array(count * 3);

    // Deterministic non-trivial test vectors
    for (let i = 0; i < count * 3; i++) {
      a[i] = Math.sin(i * 1.3 + 0.5) * 10;
      b[i] = Math.cos(i * 2.1 - 0.7) * 10;
      c[i] = Math.sin(i * 0.7 + 1.9) * 10;
    }

    it('matches explicit Levi-Civita tensor contraction across a series', () => {
      const res = crossProductTypedSeries(a, b);
      for (let k = 0; k < count; k++) {
        const off = k * 3;
        const expected = leviCivitaCross3(a, b, off);
        for (let d = 0; d < 3; d++) {
          assert.ok(Math.abs(res[off + d] - expected[d]) <= 1e-11);
        }
      }
    });

    it('satisfies orthogonality: (a × b) · a = 0 and (a × b) · b = 0', () => {
      const axb = crossProductTypedSeries(a, b);
      for (let k = 0; k < count; k++) {
        const off = k * 3;
        assert.ok(Math.abs(dot3(axb, a, off)) <= 1e-9);
        assert.ok(Math.abs(dot3(axb, b, off)) <= 1e-9);
      }
    });

    it('satisfies anti-commutativity: a × b = -(b × a)', () => {
      const axb = crossProductTypedSeries(a, b);
      const bxa = crossProductTypedSeries(b, a);
      for (let i = 0; i < axb.length; i++) {
        assert.ok(Math.abs(axb[i] + bxa[i]) <= 1e-12);
      }
    });

    it("satisfies Lagrange's identity: ||a × b||^2 = ||a||^2 ||b||^2 - (a · b)^2", () => {
      const axb = crossProductTypedSeries(a, b);
      for (let k = 0; k < count; k++) {
        const off = k * 3;
        const lhs = dot3(axb, axb, off);
        const normA2 = dot3(a, a, off);
        const normB2 = dot3(b, b, off);
        const ab = dot3(a, b, off);
        const rhs = normA2 * normB2 - ab * ab;
        assert.ok(
          Math.abs(lhs - rhs) <= 1e-8 * Math.max(1, Math.abs(rhs)),
          `Lagrange mismatch at vector ${k}: lhs=${lhs}, rhs=${rhs}`
        );
      }
    });

    it('satisfies Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
      const t1 = crossProductTypedSeries(a, crossProductTypedSeries(b, c));
      const t2 = crossProductTypedSeries(b, crossProductTypedSeries(c, a));
      const t3 = crossProductTypedSeries(c, crossProductTypedSeries(a, b));
      for (let i = 0; i < t1.length; i++) {
        assert.ok(Math.abs(t1[i] + t2[i] + t3[i]) <= 1e-8);
      }
    });

    it('satisfies bilinearity: a × (b + c) = (a × b) + (a × c)', () => {
      const bPlusC = new Float64Array(b.length);
      for (let i = 0; i < b.length; i++) bPlusC[i] = b[i] + c[i];

      const lhs = crossProductTypedSeries(a, bPlusC);
      const axb = crossProductTypedSeries(a, b);
      const axc = crossProductTypedSeries(a, c);
      for (let i = 0; i < lhs.length; i++) {
        assert.ok(Math.abs(lhs[i] - (axb[i] + axc[i])) <= 1e-10);
      }
    });
  });
});
