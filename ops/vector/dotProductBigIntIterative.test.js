import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductBigIntIterative } from './dotProductBigIntIterative.js';

describe('dotProductBigIntIterative', () => {
  describe('normal cases', () => {
    it('computes dot product of standard positive vectors', () => {
      assert.equal(dotProductBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]), 32n);
    });

    it('computes dot product of single-element vectors', () => {
      assert.equal(dotProductBigIntIterative([7n], [9n]), 63n);
      assert.equal(dotProductBigIntIterative([-7n], [9n]), -63n);
    });

    it('returns 0n when paired with a zero vector', () => {
      assert.equal(dotProductBigIntIterative([10n, -20n, 30n], [0n, 0n, 0n]), 0n);
      assert.equal(dotProductBigIntIterative([0n, 0n, 0n], [10n, -20n, 30n]), 0n);
    });

    it('does not mutate input arrays', () => {
      const a = [2n, -4n, 6n];
      const b = [1n, 3n, -5n];
      const aCopy = [...a];
      const bCopy = [...b];
      assert.equal(dotProductBigIntIterative(a, b), -40n);
      assert.deepEqual(a, aCopy);
      assert.deepEqual(b, bCopy);
    });
  });

  describe('edge cases', () => {
    it('returns 0n for empty vectors', () => {
      assert.equal(dotProductBigIntIterative([], []), 0n);
    });

    it('returns 0n for orthogonal vectors', () => {
      assert.equal(dotProductBigIntIterative([1n, 0n], [0n, 1n]), 0n);
      assert.equal(dotProductBigIntIterative([3n, -4n], [4n, 3n]), 0n);
      assert.equal(dotProductBigIntIterative([1n, 2n, -3n, 4n], [2n, -1n, 4n, 3n]), 0n);
    });

    it('handles negative and mixed-sign components accurately', () => {
      assert.equal(dotProductBigIntIterative([-1n, -2n, -3n], [-4n, -5n, -6n]), 32n);
      assert.equal(dotProductBigIntIterative([-1n, 2n, -3n], [4n, -5n, 6n]), -32n);
      assert.equal(dotProductBigIntIterative([5n, -5n, 5n, -5n], [1n, 1n, 1n, 1n]), 0n);
    });

    it('handles very large BigInts exceeding 2^128 without precision loss', () => {
      const two128 = 1n << 128n;
      const two160 = 1n << 160n;
      const a = [two128 + 1n, -(two160 + 3n), two128 + 7n];
      const b = [two128 + 2n, two160 + 5n, -(two128 + 11n)];

      const expected =
        (two128 + 1n) * (two128 + 2n) +
        -(two160 + 3n) * (two160 + 5n) +
        (two128 + 7n) * -(two128 + 11n);

      assert.equal(dotProductBigIntIterative(a, b), expected);

      // Verify exact low-order bits are preserved even when high-order terms cancel
      const cancelA = [two160, 1n, -two160];
      const cancelB = [two160, 42n, two160];
      assert.equal(dotProductBigIntIterative(cancelA, cancelB), 42n);
    });
  });

  describe('input validation', () => {
    it('throws RangeError on mismatched vector lengths', () => {
      assert.throws(() => dotProductBigIntIterative([1n, 2n], [1n]), RangeError);
      assert.throws(() => dotProductBigIntIterative([], [0n]), RangeError);
      assert.throws(() => dotProductBigIntIterative([1n], []), RangeError);
    });

    it('throws TypeError for non-array arguments', () => {
      const invalidInputs = [
        null,
        undefined,
        42,
        42n,
        '123',
        { 0: 1n, length: 1 },
        new BigInt64Array([1n, 2n]),
      ];

      for (const invalid of invalidInputs) {
        assert.throws(() => dotProductBigIntIterative(invalid, [1n]), TypeError);
        assert.throws(() => dotProductBigIntIterative([1n], invalid), TypeError);
      }
    });

    it('throws TypeError for non-BigInt elements in either vector', () => {
      const badElements = [1, 0, NaN, '1', null, undefined, true, {}, []];

      for (const bad of badElements) {
        assert.throws(() => dotProductBigIntIterative([1n, bad], [1n, 2n]), TypeError);
        assert.throws(() => dotProductBigIntIterative([1n, 2n], [1n, bad]), TypeError);
      }

      // Sparse arrays with holes must also be rejected
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [1n, , 3n];
      assert.throws(() => dotProductBigIntIterative(sparse, [1n, 2n, 3n]), TypeError);
      assert.throws(() => dotProductBigIntIterative([1n, 2n, 3n], sparse), TypeError);
    });
  });

  describe('algebraic properties and independent cross-checks', () => {
    const vectors = [
      [3n, -7n, 11n, 0n, 19n],
      [-5n, 13n, -2n, 8n, -17n],
      [(1n << 130n) + 17n, -(1n << 129n) - 3n, 999999999999999999999n, 0n, -(1n << 140n) + 1n],
      [-(1n << 132n) + 5n, (1n << 128n) + 9n, -123456789012345678901n, 77n, (1n << 135n) - 11n],
    ];

    it('satisfies commutativity: a · b === b · a', () => {
      for (const a of vectors) {
        for (const b of vectors) {
          assert.equal(dotProductBigIntIterative(a, b), dotProductBigIntIterative(b, a));
        }
      }
    });

    it('satisfies bilinearity: (a + b) · c === (a · c) + (b · c) and (k*a) · b === k*(a · b)', () => {
      const [a, b, c] = vectors;
      const aPlusB = a.map((val, i) => val + b[i]);

      assert.equal(
        dotProductBigIntIterative(aPlusB, c),
        dotProductBigIntIterative(a, c) + dotProductBigIntIterative(b, c)
      );

      const scalar = -(1n << 129n) + 37n;
      const scaledA = a.map((val) => scalar * val);
      assert.equal(
        dotProductBigIntIterative(scaledA, c),
        scalar * dotProductBigIntIterative(a, c)
      );
    });

    it('satisfies Cauchy-Schwarz inequality: (a · b)^2 <= (a · a) * (b · b)', () => {
      for (const a of vectors) {
        for (const b of vectors) {
          const ab = dotProductBigIntIterative(a, b);
          const aa = dotProductBigIntIterative(a, a);
          const bb = dotProductBigIntIterative(b, b);
          assert.ok(ab * ab <= aa * bb, 'Expected Cauchy-Schwarz inequality to hold');
        }
      }

      // Equality holds for collinear vectors
      const base = vectors[2];
      const collinear = base.map((val) => -13n * val);
      const ab = dotProductBigIntIterative(base, collinear);
      const aa = dotProductBigIntIterative(base, base);
      const bb = dotProductBigIntIterative(collinear, collinear);
      assert.equal(ab * ab, aa * bb);
    });

    it('matches an independent recursive divide-and-conquer reference implementation', () => {
      const refDot = (u, v, start = 0, end = u.length) => {
        const len = end - start;
        if (len === 0) return 0n;
        if (len === 1) return u[start] * v[start];
        const mid = start + (len >> 1);
        return refDot(u, v, start, mid) + refDot(u, v, mid, end);
      };

      // Deterministic pseudo-random large BigInt vectors via LCG
      let state = 0x123456789abcdef0123456789abcdef1n;
      const modulus = 1n << 160n;
      const nextBig = () => {
        state = (state * 6364136223846793005n + 1442695040888963407n) % modulus;
        return state - (1n << 159n);
      };

      for (const size of [0, 1, 2, 7, 33, 128]) {
        const u = Array.from({ length: size }, nextBig);
        const v = Array.from({ length: size }, nextBig);
        assert.equal(dotProductBigIntIterative(u, v), refDot(u, v));
      }
    });
  });
});
