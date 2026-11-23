import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceBitsetIterative } from './setDifferenceBitsetIterative.js';

/**
 * Helper: converts a non-negative BigInt bitset to a JS Set of bit indices.
 * @param {bigint} bits
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bits) {
  const indices = new Set();
  let cur = bits;
  let idx = 0;
  while (cur > 0n) {
    if ((cur & 1n) === 1n) {
      indices.add(idx);
    }
    cur >>= 1n;
    idx += 1;
  }
  return indices;
}

/**
 * Helper: converts a JS Set (or iterable) of non-negative bit indices to a BigInt bitset.
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
  let bits = 0n;
  for (const idx of indices) {
    bits |= 1n << BigInt(idx);
  }
  return bits;
}

/**
 * Independent reference implementation via JS Set difference over bit indices.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function setDifferenceViaSet(a, b) {
  const setA = bitsetToIndexSet(a);
  const setB = bitsetToIndexSet(b);
  const diff = new Set();
  for (const elem of setA) {
    if (!setB.has(elem)) {
      diff.add(elem);
    }
  }
  return indexSetToBitset(diff);
}

describe('setDifferenceBitsetIterative', () => {
  describe('normal cases', () => {
    it('computes difference of overlapping small bitsets', () => {
      assert.equal(setDifferenceBitsetIterative(0b1101n, 0b0111n), 0b1000n);
      assert.equal(setDifferenceBitsetIterative(0b111100n, 0b101010n), 0b010100n);
      assert.equal(setDifferenceBitsetIterative(0xffn, 0x0fn), 0xf0n);
    });

    it('removes a proper subset cleanly', () => {
      assert.equal(setDifferenceBitsetIterative(0b11111n, 0b01010n), 0b10101n);
    });

    it('returns 0n when A is a proper subset of B', () => {
      assert.equal(setDifferenceBitsetIterative(0b01010n, 0b11111n), 0n);
    });

    it('handles single-bit sets', () => {
      assert.equal(setDifferenceBitsetIterative(1n, 0n), 1n);
      assert.equal(setDifferenceBitsetIterative(1n, 1n), 0n);
      assert.equal(setDifferenceBitsetIterative(1n << 10n, 1n << 9n), 1n << 10n);
      assert.equal(setDifferenceBitsetIterative(1n << 10n, 1n << 10n), 0n);
    });
  });

  describe('edge cases', () => {
    it('returns 0n when A is 0n', () => {
      assert.equal(setDifferenceBitsetIterative(0n, 0n), 0n);
      assert.equal(setDifferenceBitsetIterative(0n, 1n), 0n);
      assert.equal(setDifferenceBitsetIterative(0n, (1n << 300n) - 1n), 0n);
    });

    it('returns A unchanged when B is 0n', () => {
      assert.equal(setDifferenceBitsetIterative(0b101101n, 0n), 0b101101n);
      const wide = (1n << 300n) | (1n << 127n) | 1n;
      assert.equal(setDifferenceBitsetIterative(wide, 0n), wide);
    });

    it('returns 0n when A === B', () => {
      for (const val of [0n, 1n, 42n, 0xdeadbeefcafebaben, (1n << 512n) | (1n << 257n) | 7n]) {
        assert.equal(setDifferenceBitsetIterative(val, val), 0n);
      }
    });

    it('returns A unchanged when A and B are disjoint', () => {
      const evenBits = 0x5555555555555555n;
      const oddBits = 0xaaaaaaaaaaaaaaaan;
      assert.equal(setDifferenceBitsetIterative(evenBits, oddBits), evenBits);
      assert.equal(setDifferenceBitsetIterative(oddBits, evenBits), oddBits);
    });

    it('demonstrates non-commutativity (A \\ B !== B \\ A in general)', () => {
      const a = 0b110010n;
      const b = 0b011011n;
      const ab = setDifferenceBitsetIterative(a, b);
      const ba = setDifferenceBitsetIterative(b, a);
      assert.equal(ab, 0b100000n);
      assert.equal(ba, 0b001001n);
      assert.notEqual(ab, ba);
    });

    it('handles arbitrary-width bitsets exceeding 256 bits', () => {
      const a = (1n << 512n) | (1n << 384n) | (1n << 257n) | (1n << 128n) | 0b10101n;
      const b = (1n << 600n) | (1n << 384n) | (1n << 256n) | (1n << 128n) | 0b00100n;
      const expected = (1n << 512n) | (1n << 257n) | 0b10001n;
      assert.equal(setDifferenceBitsetIterative(a, b), expected);
    });

    it('handles dense >256-bit masks where B is wider than A and vice versa', () => {
      const dense300 = (1n << 300n) - 1n;
      const dense400 = (1n << 400n) - 1n;
      assert.equal(setDifferenceBitsetIterative(dense300, dense400), 0n);
      assert.equal(
        setDifferenceBitsetIterative(dense400, dense300),
        dense400 ^ dense300,
      );
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-BigInt first argument', () => {
      for (const bad of [0, 1, 42, NaN, Infinity, '1', true, false, null, undefined, {}, [], Symbol('x')]) {
        assert.throws(() => setDifferenceBitsetIterative(bad, 0n), TypeError);
      }
    });

    it('throws TypeError for non-BigInt second argument', () => {
      for (const bad of [0, 1, 42, NaN, Infinity, '1', true, false, null, undefined, {}, [], Symbol('x')]) {
        assert.throws(() => setDifferenceBitsetIterative(0n, bad), TypeError);
      }
    });

    it('throws RangeError for negative BigInt arguments', () => {
      assert.throws(() => setDifferenceBitsetIterative(-1n, 0n), RangeError);
      assert.throws(() => setDifferenceBitsetIterative(0n, -1n), RangeError);
      assert.throws(() => setDifferenceBitsetIterative(-5n, -3n), RangeError);
      assert.throws(() => setDifferenceBitsetIterative(-(1n << 300n), 1n), RangeError);
      assert.throws(() => setDifferenceBitsetIterative(1n, -(1n << 300n)), RangeError);
    });
  });

  describe('independent cross-checks', () => {
    it('matches native bitwise (a & ~b) and JS Set difference across structured and pseudo-random inputs', () => {
      // Deterministic LCG for reproducible pseudo-random BigInts up to ~350 bits
      let state = 0x123456789abcdef1n;
      const mask64 = (1n << 64n) - 1n;
      function nextBigInt(chunks) {
        let out = 0n;
        for (let i = 0; i < chunks; i++) {
          state = (state * 6364136223846793005n + 1442695040888963407n) & mask64;
          out = (out << 64n) | state;
        }
        return out;
      }

      const pairs = [
        [0n, 0n],
        [0n, 0xabcdef1234567890n],
        [0xabcdef1234567890n, 0n],
        [(1n << 320n) | (1n << 255n) | 1n, (1n << 320n) | (1n << 100n)],
      ];

      for (let i = 0; i < 40; i++) {
        const chunksA = (i % 6) + 1; // 64 to 384 bits
        const chunksB = ((i * 3) % 6) + 1;
        pairs.push([nextBigInt(chunksA), nextBigInt(chunksB)]);
      }

      for (const [a, b] of pairs) {
        const actual = setDifferenceBitsetIterative(a, b);
        const viaBitwise = a & ~b;
        const viaSet = setDifferenceViaSet(a, b);

        assert.equal(actual, viaBitwise);
        assert.equal(actual, viaSet);
        // Set algebra identities:
        // (A \ B) ∩ B = ∅
        assert.equal(actual & b, 0n);
        // (A \ B) ⊆ A
        assert.equal(actual & ~a, 0n);
        // (A \ B) ∪ (A ∩ B) = A
        assert.equal(actual | (a & b), a);
      }
    });
  });
});
