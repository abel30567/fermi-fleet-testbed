import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orMask32Iterative } from './orMask32Iterative.js';

/**
 * Independent reference helper: converts a Uint32Array bitmask into a Set of
 * active bit indices (0-based, little-endian bit order within each 32-bit word).
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
  const bits = new Set();
  for (let w = 0; w < mask.length; w++) {
    const word = mask[w];
    for (let b = 0; b < 32; b++) {
      if (((word >>> b) & 1) === 1) {
        bits.add(w * 32 + b);
      }
    }
  }
  return bits;
}

/**
 * Independent reference helper: builds a Uint32Array bitmask of `wordLength`
 * words from a Set of active bit indices.
 *
 * @param {Set<number>} bits
 * @param {number} wordLength
 * @returns {Uint32Array}
 */
function bitSetToMask(bits, wordLength) {
  const mask = new Uint32Array(wordLength);
  for (const idx of bits) {
    const w = Math.floor(idx / 32);
    const b = idx % 32;
    mask[w] = (mask[w] + (2 ** b)) >>> 0;
  }
  return mask;
}

/**
 * Independent reference helper: De Morgan's law bitwise OR via NOT and AND:
 * a | b === ~(~a & ~b).
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function orViaDeMorgan(a, b) {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const notA = (~a[i]) >>> 0;
    const notB = (~b[i]) >>> 0;
    const andNot = (notA & notB) >>> 0;
    out[i] = (~andNot) >>> 0;
  }
  return out;
}

/**
 * Deterministic PRNG (xorshift32) for repeatable property tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    return state >>> 0;
  };
}

describe('orMask32Iterative', () => {
  describe('normal cases', () => {
    it('computes bitwise OR for single-word masks', () => {
      const a = new Uint32Array([0b1010_0101]);
      const b = new Uint32Array([0b1100_0011]);
      const result = orMask32Iterative(a, b);

      assert.ok(result instanceof Uint32Array);
      assert.deepEqual(result, new Uint32Array([0b1110_0111]));
    });

    it('computes bitwise OR for multi-word masks', () => {
      const a = new Uint32Array([0x0f0f0f0f, 0x00ff00ff, 0x12345678, 0x00000000]);
      const b = new Uint32Array([0xf0f0f0f0, 0x0000ffff, 0x87654321, 0xdeadbeef]);
      const result = orMask32Iterative(a, b);

      assert.deepEqual(
        result,
        new Uint32Array([0xffffffff, 0x00ffffff, 0x97755779, 0xdeadbeef])
      );
    });

    it('handles high-bit unsigned 32-bit values (0x80000000, 0xFFFFFFFF)', () => {
      const a = new Uint32Array([0x80000000, 0x7fffffff, 0x80000000, 0xffffffff]);
      const b = new Uint32Array([0x00000001, 0x80000000, 0x80000000, 0x00000000]);
      const result = orMask32Iterative(a, b);

      assert.deepEqual(
        result,
        new Uint32Array([0x80000001, 0xffffffff, 0x80000000, 0xffffffff])
      );
      assert.equal(result[0], 2147483649);
      assert.equal(result[1], 4294967295);
    });

    it('works correctly on Uint32Array subarray views with non-zero byteOffset', () => {
      const backing = new Uint32Array([0xffffffff, 0x0000000f, 0x00f00000, 0x11111111]);
      const viewA = backing.subarray(1, 3);
      const viewB = new Uint32Array([0x000000f0, 0x0f000000]);
      const result = orMask32Iterative(viewA, viewB);

      assert.deepEqual(result, new Uint32Array([0x000000ff, 0x0ff00000]));
    });
  });

  describe('edge cases and algebraic identities', () => {
    it('handles empty Uint32Array inputs', () => {
      const a = new Uint32Array(0);
      const b = new Uint32Array(0);
      const result = orMask32Iterative(a, b);

      assert.ok(result instanceof Uint32Array);
      assert.equal(result.length, 0);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
    });

    it('satisfies zero identity (a | 0 = a and 0 | a = a)', () => {
      const a = new Uint32Array([0x00000000, 0x80000001, 0xabcdef12, 0xffffffff]);
      const zero = new Uint32Array(a.length);

      assert.deepEqual(orMask32Iterative(a, zero), a);
      assert.deepEqual(orMask32Iterative(zero, a), a);
    });

    it('satisfies all-ones annihilator (a | ~0 = ~0)', () => {
      const a = new Uint32Array([0x00000000, 0x12345678, 0x80000000, 0xffffffff]);
      const allOnes = new Uint32Array(a.length).fill(0xffffffff);

      assert.deepEqual(orMask32Iterative(a, allOnes), allOnes);
      assert.deepEqual(orMask32Iterative(allOnes, a), allOnes);
    });

    it('satisfies idempotence, commutativity, and associativity', () => {
      const a = new Uint32Array([0x80001234, 0x0f0f0f0f, 0x55555555]);
      const b = new Uint32Array([0x00ff00ff, 0xf000000f, 0x33333333]);
      const c = new Uint32Array([0x12345678, 0x80000001, 0x0000ffff]);

      assert.deepEqual(orMask32Iterative(a, a), a);
      assert.deepEqual(orMask32Iterative(a, b), orMask32Iterative(b, a));
      assert.deepEqual(
        orMask32Iterative(orMask32Iterative(a, b), c),
        orMask32Iterative(a, orMask32Iterative(b, c))
      );
    });

    it('does not mutate inputs and always returns a new Uint32Array', () => {
      const a = new Uint32Array([0x11223344, 0x80000000]);
      const b = new Uint32Array([0x55667788, 0x00000001]);
      const aCopy = new Uint32Array(a);
      const bCopy = new Uint32Array(b);

      const result = orMask32Iterative(a, b);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
      assert.deepEqual(a, aCopy);
      assert.deepEqual(b, bCopy);

      // Mutating result must not affect inputs
      result[0] = 0;
      assert.deepEqual(a, aCopy);
      assert.deepEqual(b, bCopy);

      // Even when the same reference is passed for both arguments
      const selfResult = orMask32Iterative(a, a);
      assert.notEqual(selfResult, a);
      assert.deepEqual(selfResult, aCopy);
    });
  });

  describe('invalid inputs', () => {
    const valid = new Uint32Array([1, 2]);
    const invalidTypes = [
      null,
      undefined,
      [1, 2],
      new Int32Array([1, 2]),
      new Uint8Array([1, 2]),
      new Uint16Array([1, 2]),
      new BigUint64Array([1n, 2n]),
      new ArrayBuffer(8),
      42,
      'mask',
      { length: 2, 0: 1, 1: 2 },
    ];

    it('throws TypeError when first argument is not a Uint32Array', () => {
      for (const bad of invalidTypes) {
        assert.throws(() => orMask32Iterative(bad, valid), TypeError);
      }
    });

    it('throws TypeError when second argument is not a Uint32Array', () => {
      for (const bad of invalidTypes) {
        assert.throws(() => orMask32Iterative(valid, bad), TypeError);
      }
    });

    it('throws RangeError when bitmask lengths differ', () => {
      assert.throws(
        () => orMask32Iterative(new Uint32Array(0), new Uint32Array(1)),
        RangeError
      );
      assert.throws(
        () => orMask32Iterative(new Uint32Array(3), new Uint32Array(2)),
        RangeError
      );
      assert.throws(
        () => orMask32Iterative(new Uint32Array([1]), new Uint32Array([1, 2, 3])),
        RangeError
      );
    });
  });

  describe('cross-checks against independent reference implementations', () => {
    it('matches independent bit-index Set union reference across varied lengths', () => {
      const rng = makeRng(0x20261122);
      const lengths = [0, 1, 2, 3, 5, 8, 16];

      for (const len of lengths) {
        for (let trial = 0; trial < 10; trial++) {
          const a = new Uint32Array(len);
          const b = new Uint32Array(len);
          for (let i = 0; i < len; i++) {
            a[i] = rng();
            b[i] = rng();
          }

          const actual = orMask32Iterative(a, b);
          const setA = maskToBitSet(a);
          const setB = maskToBitSet(b);
          const expectedSet = new Set([...setA, ...setB]);

          assert.deepEqual(maskToBitSet(actual), expectedSet);
          assert.deepEqual(actual, bitSetToMask(expectedSet, len));
        }
      }
    });

    it("matches De Morgan's law ~(~a & ~b) across edge and random patterns", () => {
      const rng = makeRng(0xdeadc0de);
      const edgeA = new Uint32Array([
        0x00000000, 0xffffffff, 0x80000000, 0x7fffffff, 0x00000001, 0xaaaaaaaa,
      ]);
      const edgeB = new Uint32Array([
        0xffffffff, 0x00000000, 0x7fffffff, 0x80000000, 0xfffffffe, 0x55555555,
      ]);

      assert.deepEqual(orMask32Iterative(edgeA, edgeB), orViaDeMorgan(edgeA, edgeB));

      for (let trial = 0; trial < 20; trial++) {
        const len = (trial % 7) + 1;
        const a = new Uint32Array(len);
        const b = new Uint32Array(len);
        for (let i = 0; i < len; i++) {
          a[i] = rng();
          b[i] = rng();
        }
        assert.deepEqual(orMask32Iterative(a, b), orViaDeMorgan(a, b));
      }
    });
  });
});
