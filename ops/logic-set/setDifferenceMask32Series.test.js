import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceMask32Series } from './setDifferenceMask32Series.js';

/**
 * Helper: decode a Uint32Array bitmask into an explicit Set<number> of bit indices.
 */
function maskToSet(mask) {
  const out = new Set();
  for (let w = 0; w < mask.length; w += 1) {
    const word = mask[w];
    for (let bit = 0; bit < 32; bit += 1) {
      if (((word >>> bit) & 1) === 1) {
        out.add(w * 32 + bit);
      }
    }
  }
  return out;
}

/**
 * Helper: encode a Set<number> of bit indices into a Uint32Array of given word length.
 */
function setToMask(set, wordLength) {
  const mask = new Uint32Array(wordLength);
  for (const idx of set) {
    const w = Math.floor(idx / 32);
    const bit = idx % 32;
    mask[w] = (mask[w] | (1 << bit)) >>> 0;
  }
  return mask;
}

/**
 * Helper: deterministic xorshift32 PRNG for repeatable cross-check tests.
 */
function makePrng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

describe('setDifferenceMask32Series', () => {
  describe('normal cases', () => {
    it('computes single-word set differences accurately', () => {
      const a = new Uint32Array([0b11010110]);
      const b = new Uint32Array([0b10110010]);
      const diff = setDifferenceMask32Series(a, b);

      assert.ok(diff instanceof Uint32Array);
      assert.deepEqual(diff, new Uint32Array([0b01000100]));
    });

    it('handles multi-word masks with partial overlap, disjointness, and subsets', () => {
      const a = new Uint32Array([0xf0f0f0f0, 0x12345678, 0x00ff00ff, 0xaaaaaaaa]);
      const b = new Uint32Array([0x0f0f0f0f, 0x12345678, 0xffffffff, 0x00000000]);
      const diff = setDifferenceMask32Series(a, b);

      assert.deepEqual(
        diff,
        new Uint32Array([0xf0f0f0f0, 0x00000000, 0x00000000, 0xaaaaaaaa])
      );
    });

    it('preserves high bit (bit 31) unsigned semantics', () => {
      const a = new Uint32Array([0x80000000, 0x80000001, 0xffffffff]);
      const b = new Uint32Array([0x00000000, 0x00000001, 0x7fffffff]);
      const diff = setDifferenceMask32Series(a, b);

      assert.deepEqual(
        diff,
        new Uint32Array([0x80000000, 0x80000000, 0x80000000])
      );
    });
  });

  describe('edge cases and immutability', () => {
    it('handles empty Uint32Array masks', () => {
      const a = new Uint32Array(0);
      const b = new Uint32Array(0);
      const diff = setDifferenceMask32Series(a, b);

      assert.ok(diff instanceof Uint32Array);
      assert.equal(diff.length, 0);
      assert.notEqual(diff, a);
      assert.notEqual(diff, b);
    });

    it('satisfies empty-set and universal-set boundaries', () => {
      const empty = new Uint32Array([0x00000000, 0x00000000]);
      const full = new Uint32Array([0xffffffff, 0xffffffff]);
      const mixed = new Uint32Array([0xdeadbeef, 0x01234567]);

      // A \ ∅ = A
      assert.deepEqual(setDifferenceMask32Series(mixed, empty), mixed);
      // ∅ \ B = ∅
      assert.deepEqual(setDifferenceMask32Series(empty, mixed), empty);
      // A \ U = ∅
      assert.deepEqual(setDifferenceMask32Series(mixed, full), empty);
      // U \ ∅ = U
      assert.deepEqual(setDifferenceMask32Series(full, empty), full);
      // U \ A = ~A
      assert.deepEqual(
        setDifferenceMask32Series(full, mixed),
        new Uint32Array([(~0xdeadbeef) >>> 0, (~0x01234567) >>> 0])
      );
    });

    it('returns zero mask when both arguments alias the same Uint32Array without mutating it', () => {
      const a = new Uint32Array([0x89abcdef, 0x00000001, 0xffffffff]);
      const snapshot = new Uint32Array(a);
      const diff = setDifferenceMask32Series(a, a);

      assert.deepEqual(diff, new Uint32Array([0, 0, 0]));
      assert.deepEqual(a, snapshot);
      assert.notEqual(diff, a);
    });

    it('does not mutate inputs and returns a fresh Uint32Array even when B is all zeros', () => {
      const a = new Uint32Array([0x13579bdf, 0x2468ace0]);
      const b = new Uint32Array([0x00000000, 0x00000000]);
      const copyA = new Uint32Array(a);
      const copyB = new Uint32Array(b);

      const diff = setDifferenceMask32Series(a, b);
      assert.deepEqual(diff, a);
      assert.notEqual(diff, a);
      assert.notEqual(diff, b);

      diff[0] = 0;
      assert.deepEqual(a, copyA);
      assert.deepEqual(b, copyB);
    });

    it('supports Uint32Array subarray views with non-zero byteOffset', () => {
      const backing = new Uint32Array([0x11111111, 0xff00ff00, 0x0f0f0f0f, 0x22222222]);
      const viewA = backing.subarray(1, 3);
      const viewB = new Uint32Array([0x00ffff00, 0x00ff00ff]);
      const diff = setDifferenceMask32Series(viewA, viewB);

      assert.deepEqual(diff, new Uint32Array([0xff000000, 0x0f000f00]));
    });
  });

  describe('input validation', () => {
    it('throws TypeError when maskA or maskB is not a Uint32Array', () => {
      const valid = new Uint32Array([1, 2]);
      const invalidValues = [
        null,
        undefined,
        [1, 2],
        new Int32Array([1, 2]),
        new Uint16Array([1, 2]),
        new Uint8Array([1, 2]),
        new BigUint64Array([1n, 2n]),
        { 0: 1, 1: 2, length: 2 },
        42,
        '12'
      ];

      for (const bad of invalidValues) {
        assert.throws(() => setDifferenceMask32Series(bad, valid), TypeError);
        assert.throws(() => setDifferenceMask32Series(valid, bad), TypeError);
      }
    });

    it('throws RangeError when maskA and maskB have different lengths', () => {
      assert.throws(
        () => setDifferenceMask32Series(new Uint32Array(0), new Uint32Array(1)),
        RangeError
      );
      assert.throws(
        () => setDifferenceMask32Series(new Uint32Array(3), new Uint32Array(2)),
        RangeError
      );
      assert.throws(
        () => setDifferenceMask32Series(new Uint32Array(1), new Uint32Array(4)),
        RangeError
      );
    });
  });

  describe('independent cross-checks and algebraic identities', () => {
    it('matches explicit Set<number> difference and direct (a[i] & ~b[i]) >>> 0 across pseudo-random masks', () => {
      const rand = makePrng(0x20261122);
      const lengths = [1, 2, 3, 5, 8];

      for (const len of lengths) {
        for (let trial = 0; trial < 20; trial += 1) {
          const a = new Uint32Array(len);
          const b = new Uint32Array(len);
          for (let i = 0; i < len; i += 1) {
            a[i] = rand();
            b[i] = rand();
          }

          const actual = setDifferenceMask32Series(a, b);

          // 1. Direct bitwise reference: (a[i] & ~b[i]) >>> 0
          const directRef = new Uint32Array(len);
          // 2. Alternative closed-form identity: ((a[i] | b[i]) ^ b[i]) >>> 0
          const unionXorRef = new Uint32Array(len);
          for (let i = 0; i < len; i += 1) {
            directRef[i] = (a[i] & ~b[i]) >>> 0;
            unionXorRef[i] = ((a[i] | b[i]) ^ b[i]) >>> 0;
          }

          assert.deepEqual(actual, directRef);
          assert.deepEqual(actual, unionXorRef);

          // 3. Explicit Set<number> reference
          const setA = maskToSet(a);
          const setB = maskToSet(b);
          const expectedSet = new Set();
          for (const elem of setA) {
            if (!setB.has(elem)) {
              expectedSet.add(elem);
            }
          }

          assert.deepEqual(maskToSet(actual), expectedSet);
          assert.deepEqual(actual, setToMask(expectedSet, len));
        }
      }
    });

    it('satisfies Boolean set-difference algebraic laws', () => {
      const rand = makePrng(0x9e3779b9);
      const len = 6;
      const a = new Uint32Array(len);
      const b = new Uint32Array(len);
      const c = new Uint32Array(len);
      for (let i = 0; i < len; i += 1) {
        a[i] = rand();
        b[i] = rand();
        c[i] = rand();
      }

      const aMinusB = setDifferenceMask32Series(a, b);
      const bMinusA = setDifferenceMask32Series(b, a);
      const aInterB = new Uint32Array(len);
      const bUnionC = new Uint32Array(len);
      const aXorB = new Uint32Array(len);
      for (let i = 0; i < len; i += 1) {
        aInterB[i] = (a[i] & b[i]) >>> 0;
        bUnionC[i] = (b[i] | c[i]) >>> 0;
        aXorB[i] = (a[i] ^ b[i]) >>> 0;
      }

      // Partition law: (A \ B) ∪ (A ∩ B) = A and (A \ B) ∩ (A ∩ B) = ∅
      for (let i = 0; i < len; i += 1) {
        assert.equal(((aMinusB[i] | aInterB[i]) >>> 0), a[i]);
        assert.equal(((aMinusB[i] & aInterB[i]) >>> 0), 0);
      }

      // Double-difference law: A \ (A \ B) = A ∩ B
      assert.deepEqual(setDifferenceMask32Series(a, aMinusB), aInterB);

      // Chained-difference law: A \ (B ∪ C) = (A \ B) \ C
      assert.deepEqual(
        setDifferenceMask32Series(a, bUnionC),
        setDifferenceMask32Series(aMinusB, c)
      );

      // Symmetric difference law: (A \ B) ∪ (B \ A) = A △ B
      const symDiff = new Uint32Array(len);
      for (let i = 0; i < len; i += 1) {
        symDiff[i] = (aMinusB[i] | bMinusA[i]) >>> 0;
      }
      assert.deepEqual(symDiff, aXorB);
    });
  });
});
