import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andBitsetIterative } from './andBitsetIterative.js';

/**
 * Independent reference helper: converts a non-negative BigInt to a Set of active bit positions.
 * @param {bigint} value
 * @returns {Set<number>}
 */
function bigintToBitSet(value) {
  const bits = new Set();
  const bin = value.toString(2);
  if (value === 0n) return bits;
  for (let i = 0; i < bin.length; i++) {
    if (bin[bin.length - 1 - i] === '1') {
      bits.add(i);
    }
  }
  return bits;
}

/**
 * Independent reference helper: converts a Set of bit positions back to a BigInt.
 * @param {Set<number>} bits
 * @returns {bigint}
 */
function bitSetToBigint(bits) {
  let result = 0n;
  for (const pos of bits) {
    result += 1n << BigInt(pos);
  }
  return result;
}

/**
 * Independent set-intersection computation over bitsets via JS Set<number>.
 * @param {...bigint} values
 * @returns {bigint}
 */
function referenceSetIntersection(...values) {
  const sets = values.map(bigintToBitSet);
  const intersected = new Set();
  for (const bit of sets[0]) {
    if (sets.every((s) => s.has(bit))) {
      intersected.add(bit);
    }
  }
  return bitSetToBigint(intersected);
}

/**
 * Deterministic xorshift32 PRNG to construct arbitrary-width BigInt test vectors.
 * @param {number} seed
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return function nextUint32() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/**
 * Builds a deterministic BigInt of `wordCount` 32-bit chunks.
 * @param {() => number} nextUint32
 * @param {number} wordCount
 * @returns {bigint}
 */
function randomBigInt(nextUint32, wordCount) {
  let value = 0n;
  for (let i = 0; i < wordCount; i++) {
    value = (value << 32n) + BigInt(nextUint32());
  }
  return value;
}

describe('andBitsetIterative', () => {
  describe('normal cases', () => {
    it('computes bitwise AND of small two-operand bitsets', () => {
      assert.equal(andBitsetIterative(0b11010n, 0b10110n), 0b10010n);
      assert.equal(andBitsetIterative(0b1111n, 0b0101n), 0b0101n);
      assert.equal(andBitsetIterative(1n, 1n), 1n);
    });

    it('handles 32-bit signed/unsigned chunk boundaries accurately', () => {
      assert.equal(andBitsetIterative(0x80000000n, 0x80000000n), 0x80000000n);
      assert.equal(andBitsetIterative(0xffffffffn, 0xffffffffn), 0xffffffffn);
      assert.equal(andBitsetIterative(0xffffffffn, 0x80000001n), 0x80000001n);
      assert.equal(andBitsetIterative(0x100000000n, 0x100000000n), 0x100000000n);
      assert.equal(andBitsetIterative(0x1ffffffffn, 0x180000001n), 0x180000001n);
      assert.equal(
        andBitsetIterative(0xffffffff_ffffffffn, 0x80000000_80000000n),
        0x80000000_80000000n
      );
    });

    it('computes variadic AND over three or more bitsets', () => {
      assert.equal(andBitsetIterative(0b11111n, 0b11011n, 0b10111n), 0b10011n);
      assert.equal(
        andBitsetIterative(
          0xdeadbeef_cafebabe_12345678n,
          0xffff0000_ffffffff_ffff0000n,
          0x0fff0fff_0fff0fff_0fff0fffn,
          0xdeadbeef_0afebabe_02340000n
        ),
        0x0ead0000_0afe0abe_02340000n
      );
    });

    it('handles operands of differing bit widths', () => {
      const wide = (1n << 512n) + (1n << 256n) + 0xabcdef123456n;
      const narrow = 0x00ff00ff00ffn;
      assert.equal(andBitsetIterative(wide, narrow), 0x00cd00120056n);
      assert.equal(andBitsetIterative(narrow, wide), 0x00cd00120056n);
    });
  });

  describe('edge cases', () => {
    it('supports a single BigInt bitset (unary identity)', () => {
      assert.equal(andBitsetIterative(0n), 0n);
      assert.equal(andBitsetIterative(1n), 1n);
      const large = (1n << 1024n) - 1n;
      assert.equal(andBitsetIterative(large), large);
    });

    it('returns 0n when any operand is 0n', () => {
      const big = (1n << 200n) - 1n;
      assert.equal(andBitsetIterative(0n, 0n), 0n);
      assert.equal(andBitsetIterative(0n, big), 0n);
      assert.equal(andBitsetIterative(big, 0n), 0n);
      assert.equal(andBitsetIterative(big, 0n, big), 0n);
      assert.equal(andBitsetIterative(big, big, 0n), 0n);
    });

    it('returns 0n for disjoint bitsets', () => {
      const evenMask = BigInt('0x' + '55555555'.repeat(16));
      const oddMask = BigInt('0x' + 'aaaaaaaa'.repeat(16));
      assert.equal(andBitsetIterative(evenMask, oddMask), 0n);
    });

    it('handles very wide arbitrary-width bitsets (10,000+ bits)', () => {
      const a = (1n << 10000n) + (1n << 4096n) + (1n << 63n) + (1n << 31n) + 1n;
      const b = (1n << 10000n) + (1n << 4095n) + (1n << 63n) + (1n << 32n) + 1n;
      const expected = (1n << 10000n) + (1n << 63n) + 1n;
      assert.equal(andBitsetIterative(a, b), expected);
    });

    it('strips high zero chunks cleanly when only low bits overlap', () => {
      const a = (1n << 500n) + 0b101n;
      const b = (1n << 499n) + 0b011n;
      assert.equal(andBitsetIterative(a, b), 1n);
    });
  });

  describe('input validation', () => {
    it('throws RangeError when called with zero arguments', () => {
      assert.throws(() => andBitsetIterative(), RangeError);
    });

    it('throws RangeError for negative BigInt bitsets in any position', () => {
      assert.throws(() => andBitsetIterative(-1n), RangeError);
      assert.throws(() => andBitsetIterative(-1n, 5n), RangeError);
      assert.throws(() => andBitsetIterative(5n, -1n), RangeError);
      // Must validate even when earlier operand is 0n
      assert.throws(() => andBitsetIterative(0n, -42n), RangeError);
      assert.throws(() => andBitsetIterative(0n, 1n, -(1n << 100n)), RangeError);
    });

    it('throws TypeError for non-BigInt arguments in any position', () => {
      const invalidValues = [0, 1, 42, NaN, Infinity, '1', true, null, undefined, {}, [1n], Symbol('s')];
      for (const bad of invalidValues) {
        assert.throws(() => andBitsetIterative(bad), TypeError);
        assert.throws(() => andBitsetIterative(1n, bad), TypeError);
        // Must validate even when earlier operand is 0n
        assert.throws(() => andBitsetIterative(0n, bad), TypeError);
      }
    });
  });

  describe('independent cross-checks and algebraic identities', () => {
    it('matches independent JS Set<number> intersection reference', () => {
      const a = (1n << 130n) + (1n << 64n) + (1n << 63n) + (1n << 32n) + (1n << 31n) + (1n << 7n) + 1n;
      const b = (1n << 130n) + (1n << 65n) + (1n << 63n) + (1n << 31n) + (1n << 5n) + 1n;
      const c = (1n << 130n) + (1n << 63n) + (1n << 31n) + (1n << 2n);

      assert.equal(andBitsetIterative(a, b), referenceSetIntersection(a, b));
      assert.equal(andBitsetIterative(a, b, c), referenceSetIntersection(a, b, c));
    });

    it('matches native BigInt & and algebraic laws across deterministic wide test vectors', () => {
      const nextUint32 = createPrng(0x1234abcd);

      for (let trial = 0; trial < 40; trial++) {
        const wA = (trial % 12) + 1;
        const wB = ((trial * 3) % 12) + 1;
        const wC = ((trial * 7) % 12) + 1;
        const a = randomBigInt(nextUint32, wA);
        const b = randomBigInt(nextUint32, wB);
        const c = randomBigInt(nextUint32, wC);

        // Cross-check against native BigInt &
        const expectedAB = a & b;
        const expectedABC = a & b & c;
        const actualAB = andBitsetIterative(a, b);
        const actualBA = andBitsetIterative(b, a);
        const actualABC = andBitsetIterative(a, b, c);

        assert.equal(actualAB, expectedAB);
        assert.equal(actualABC, expectedABC);

        // Commutativity
        assert.equal(actualAB, actualBA);

        // Associativity
        assert.equal(andBitsetIterative(actualAB, c), actualABC);
        assert.equal(andBitsetIterative(a, andBitsetIterative(b, c)), actualABC);

        // Idempotence
        assert.equal(andBitsetIterative(a, a), a);

        // De Morgan's law over finite width W = max(wA, wB) * 32 bits:
        // a AND b === ~((~a) OR (~b)) within mask M
        const maxWords = Math.max(wA, wB);
        const mask = (1n << BigInt(maxWords * 32)) - 1n;
        const deMorgan = mask ^ ((mask ^ a) | (mask ^ b));
        assert.equal(actualAB, deMorgan);
      }
    });
  });
});
