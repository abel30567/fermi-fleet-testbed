import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceBitsetIterative } from './setDifferenceBitsetIterative.js';

/**
 * Independent helper: convert a non-negative BigInt bitset to a JS Set of bit indices.
 */
function bitsetToSet(bits) {
  const result = new Set();
  let cur = bits;
  let index = 0;
  while (cur > 0n) {
    if ((cur & 1n) === 1n) {
      result.add(index);
    }
    cur >>= 1n;
    index += 1;
  }
  return result;
}

/**
 * Independent helper: convert an iterable of non-negative integer indices to a BigInt bitset.
 */
function setToBitset(indices) {
  let result = 0n;
  for (const idx of indices) {
    result |= 1n << BigInt(idx);
  }
  return result;
}

/**
 * Independent helper: count set bits (popcount) of a non-negative BigInt.
 */
function popcount(bits) {
  let cur = bits;
  let count = 0;
  while (cur > 0n) {
    cur &= cur - 1n;
    count += 1;
  }
  return count;
}

/**
 * Deterministic PRNG (xorshift64*) for reproducible multi-word test vectors.
 */
function createBitsetGenerator(seed = 0x9e3779b97f4a7c15n) {
  let state = seed;
  const mask64 = (1n << 64n) - 1n;
  const nextWord = () => {
    state ^= state >> 12n;
    state = (state ^ ((state << 25n) & mask64)) & mask64;
    state ^= state >> 27n;
    return (state * 0x2545f4914f6cdd1dn) & mask64;
  };
  return (words) => {
    let val = 0n;
    for (let i = 0; i < words; i += 1) {
      val = (val << 64n) | nextWord();
    }
    return val;
  };
}

describe('setDifferenceBitsetIterative', () => {
  describe('normal cases', () => {
    it('computes basic overlapping bitset differences', () => {
      // A = {1, 2, 4} = 0b10110n, B = {2, 3} = 0b01100n => A \ B = {1, 4} = 0b10010n
      assert.equal(setDifferenceBitsetIterative(0b10110n, 0b01100n), 0b10010n);
      // B \ A = {3} = 0b01000n (non-commutative)
      assert.equal(setDifferenceBitsetIterative(0b01100n, 0b10110n), 0b01000n);
    });

    it('returns A unchanged when A and B are disjoint', () => {
      const a = 0b10101010n;
      const b = 0b01010101n;
      assert.equal(setDifferenceBitsetIterative(a, b), a);
      assert.equal(setDifferenceBitsetIterative(b, a), b);
    });

    it('returns 0n when A is a subset of B', () => {
      const a = 0b00101010n;
      const b = 0b11111111n;
      assert.equal(setDifferenceBitsetIterative(a, b), 0n);
    });

    it('computes exact difference when B is a strict subset of A', () => {
      const a = 0b11110011n;
      const b = 0b01100001n;
      assert.equal(setDifferenceBitsetIterative(a, b), a ^ b);
    });

    it('handles multi-word bitsets spanning 64-bit, 128-bit, and 256-bit boundaries', () => {
      const a = (1n << 260n) | (1n << 128n) | (1n << 127n) | (1n << 64n) | (1n << 63n) | 0b101n;
      const b = (1n << 128n) | (1n << 63n) | 0b001n;
      const expected = (1n << 260n) | (1n << 127n) | (1n << 64n) | 0b100n;
      assert.equal(setDifferenceBitsetIterative(a, b), expected);
    });

    it('handles asymmetric widths where A is much wider than B', () => {
      const a = (1n << 500n) | (1n << 300n) | (1n << 10n) | 1n;
      const b = (1n << 10n) | (1n << 5n);
      const expected = (1n << 500n) | (1n << 300n) | 1n;
      assert.equal(setDifferenceBitsetIterative(a, b), expected);
    });

    it('handles asymmetric widths where B is much wider than A', () => {
      const a = (1n << 12n) | (1n << 3n) | 1n;
      const b = (1n << 1000n) | (1n << 500n) | (1n << 3n);
      const expected = (1n << 12n) | 1n;
      assert.equal(setDifferenceBitsetIterative(a, b), expected);
    });
  });

  describe('edge and boundary cases', () => {
    it('handles empty bitsets (0n)', () => {
      assert.equal(setDifferenceBitsetIterative(0n, 0n), 0n);
      assert.equal(setDifferenceBitsetIterative(0n, 0b11111n), 0n);
      assert.equal(setDifferenceBitsetIterative(0n, 1n << 512n), 0n);
      assert.equal(setDifferenceBitsetIterative(0b11111n, 0n), 0b11111n);
      assert.equal(setDifferenceBitsetIterative(1n << 512n, 0n), 1n << 512n);
    });

    it('returns 0n for identical bitsets including large multi-word values', () => {
      assert.equal(setDifferenceBitsetIterative(1n, 1n), 0n);
      const large = ((1n << 256n) - 1n) ^ (1n << 100n);
      assert.equal(setDifferenceBitsetIterative(large, large), 0n);
    });

    it('handles exact 64-bit word boundary masks', () => {
      const full64 = (1n << 64n) - 1n;
      const full128 = (1n << 128n) - 1n;

      assert.equal(setDifferenceBitsetIterative(full64, 1n << 63n), (1n << 63n) - 1n);
      assert.equal(setDifferenceBitsetIterative(full128, full64), full64 << 64n);
      assert.equal(setDifferenceBitsetIterative(full64, full128), 0n);
      assert.equal(setDifferenceBitsetIterative(1n << 64n, full64), 1n << 64n);
    });

    it('handles very wide arbitrary-width bitsets (10,000+ bits)', () => {
      const a = setToBitset([0, 63, 64, 127, 128, 511, 512, 4095, 4096, 10000]);
      const b = setToBitset([63, 128, 511, 4096, 9999]);
      const expected = setToBitset([0, 64, 127, 512, 4095, 10000]);
      assert.equal(setDifferenceBitsetIterative(a, b), expected);
    });
  });

  describe('input validation', () => {
    const invalidTypes = [
      0,
      1,
      42,
      NaN,
      Infinity,
      -Infinity,
      '0',
      '1n',
      true,
      false,
      null,
      undefined,
      {},
      [],
      Object(1n),
    ];

    it('throws TypeError when argument "a" is not a bigint', () => {
      for (const bad of invalidTypes) {
        assert.throws(
          () => setDifferenceBitsetIterative(bad, 0n),
          { name: 'TypeError' },
          `Expected TypeError for a=${String(bad)}`,
        );
      }
    });

    it('throws TypeError when argument "b" is not a bigint', () => {
      for (const bad of invalidTypes) {
        assert.throws(
          () => setDifferenceBitsetIterative(0n, bad),
          { name: 'TypeError' },
          `Expected TypeError for b=${String(bad)}`,
        );
      }
    });

    it('throws TypeError when arguments are missing', () => {
      assert.throws(() => setDifferenceBitsetIterative(), { name: 'TypeError' });
      assert.throws(() => setDifferenceBitsetIterative(1n), { name: 'TypeError' });
    });

    it('throws RangeError when argument "a" or "b" is a negative bigint', () => {
      const negatives = [-1n, -2n, -64n, -(1n << 64n), -(1n << 256n)];
      for (const neg of negatives) {
        assert.throws(
          () => setDifferenceBitsetIterative(neg, 0n),
          { name: 'RangeError' },
          `Expected RangeError for a=${neg}`,
        );
        assert.throws(
          () => setDifferenceBitsetIterative(0n, neg),
          { name: 'RangeError' },
          `Expected RangeError for b=${neg}`,
        );
        assert.throws(
          () => setDifferenceBitsetIterative(neg, neg),
          { name: 'RangeError' },
          `Expected RangeError for a=b=${neg}`,
        );
      }
    });
  });

  describe('independent cross-checks and set-algebra identities', () => {
    it('matches independent JS Set difference across deterministic multi-word vectors', () => {
      const nextBits = createBitsetGenerator(0x123456789abcdef1n);
      const widths = [1, 2, 3, 5, 8];

      for (const wA of widths) {
        for (const wB of widths) {
          const a = nextBits(wA);
          const b = nextBits(wB);

          const actual = setDifferenceBitsetIterative(a, b);

          // Independent JS Set computation
          const setA = bitsetToSet(a);
          const setB = bitsetToSet(b);
          const expectedSet = new Set([...setA].filter((elem) => !setB.has(elem)));
          const expectedFromSet = setToBitset(expectedSet);

          assert.equal(actual, expectedFromSet);
          // Independent native bitwise complement formula
          assert.equal(actual, a & ~b);
        }
      }
    });

    it('satisfies fundamental set-algebra and popcount identities', () => {
      const nextBits = createBitsetGenerator(0xfedcba9876543211n);

      for (let i = 0; i < 20; i += 1) {
        const a = nextBits((i % 5) + 1);
        const b = nextBits(((i + 2) % 5) + 1);
        const c = nextBits(((i + 4) % 5) + 1);

        const diffAB = setDifferenceBitsetIterative(a, b);
        const diffBA = setDifferenceBitsetIterative(b, a);
        const interAB = a & b;

        // Partition identity: (A \ B) ∪ (A ∩ B) = A and (A \ B) ∩ (A ∩ B) = ∅
        assert.equal(diffAB | interAB, a);
        assert.equal(diffAB & interAB, 0n);

        // Disjointness from B: (A \ B) ∩ B = ∅
        assert.equal(diffAB & b, 0n);

        // Symmetric difference: (A \ B) ∪ (B \ A) = A Δ B
        assert.equal(diffAB | diffBA, a ^ b);

        // Sequential removal: A \ (B ∪ C) = (A \ B) \ C
        assert.equal(
          setDifferenceBitsetIterative(a, b | c),
          setDifferenceBitsetIterative(diffAB, c),
        );

        // Right-distributivity over union: (A ∪ B) \ C = (A \ C) ∪ (B \ C)
        assert.equal(
          setDifferenceBitsetIterative(a | b, c),
          setDifferenceBitsetIterative(a, c) | setDifferenceBitsetIterative(b, c),
        );

        // Cardinality identity: |A \ B| + |A ∩ B| = |A|
        assert.equal(popcount(diffAB) + popcount(interAB), popcount(a));
      }
    });
  });
});
