import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionMask32Series } from './intersectionMask32Series.js';

/**
 * Converts a Uint32Array bitmask into an explicit Set of active global bit indices.
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
  const indices = new Set();
  for (let w = 0; w < mask.length; w++) {
    const word = mask[w];
    for (let b = 0; b < 32; b++) {
      if (((word >>> b) & 1) === 1) {
        indices.add(w * 32 + b);
      }
    }
  }
  return indices;
}

/**
 * Computes explicit Set<number> intersection.
 * @param {Set<number>} setA
 * @param {Set<number>} setB
 * @returns {Set<number>}
 */
function intersectSets(setA, setB) {
  const out = new Set();
  for (const idx of setA) {
    if (setB.has(idx)) {
      out.add(idx);
    }
  }
  return out;
}

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check vectors.
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    return state >>> 0;
  };
}

describe('intersectionMask32Series', () => {
  it('computes basic single-word and multi-word intersections', () => {
    const a = new Uint32Array([0b1101_0110, 0xf0f0_a5a5, 0x1234_5678]);
    const b = new Uint32Array([0b1011_0100, 0x0ff0_5aa5, 0x8765_4321]);
    const res = intersectionMask32Series(a, b);

    assert.ok(res instanceof Uint32Array);
    assert.deepEqual(res, new Uint32Array([0b1001_0100, 0x00f0_00a5, 0x0224_4220]));
  });

  it('handles edge cases: empty masks, zeros, all-ones, and high bit (bit 31)', () => {
    assert.deepEqual(
      intersectionMask32Series(new Uint32Array(0), new Uint32Array(0)),
      new Uint32Array(0)
    );

    const boundaryPairs = [
      [0x0000_0000, 0x0000_0000, 0x0000_0000],
      [0x0000_0000, 0xffff_ffff, 0x0000_0000],
      [0xffff_ffff, 0x0000_0000, 0x0000_0000],
      [0xffff_ffff, 0xffff_ffff, 0xffff_ffff],
      [0x8000_0000, 0x8000_0000, 0x8000_0000],
      [0x8000_0000, 0x7fff_ffff, 0x0000_0000],
      [0x8000_0000, 0x0000_0000, 0x0000_0000],
      [0x8000_0001, 0x8000_0000, 0x8000_0000],
      [0xaaaa_aaaa, 0x5555_5555, 0x0000_0000],
      [0xaaaa_aaaa, 0xffff_ffff, 0xaaaa_aaaa],
      [0x7fff_ffff, 0xffff_ffff, 0x7fff_ffff],
    ];

    const a = new Uint32Array(boundaryPairs.map(([x]) => x));
    const b = new Uint32Array(boundaryPairs.map(([, y]) => y));
    const expected = new Uint32Array(boundaryPairs.map(([, , z]) => z));

    assert.deepEqual(intersectionMask32Series(a, b), expected);
  });

  it('handles every individual bit position 0..31 accurately', () => {
    for (let bit = 0; bit < 32; bit++) {
      const single = (1 << bit) >>> 0;
      const all = 0xffff_ffff;
      const complement = (~single) >>> 0;

      assert.deepEqual(
        intersectionMask32Series(new Uint32Array([single]), new Uint32Array([single])),
        new Uint32Array([single])
      );
      assert.deepEqual(
        intersectionMask32Series(new Uint32Array([single]), new Uint32Array([all])),
        new Uint32Array([single])
      );
      assert.deepEqual(
        intersectionMask32Series(new Uint32Array([single]), new Uint32Array([complement])),
        new Uint32Array([0])
      );
    }
  });

  it('does not mutate inputs and returns a fresh Uint32Array (including when a === b and on subarrays)', () => {
    const a = new Uint32Array([0xdead_beef, 0xcafe_babe]);
    const b = new Uint32Array([0x0f0f_f0f0, 0x5555_aaaa]);
    const aCopy = new Uint32Array(a);
    const bCopy = new Uint32Array(b);

    const res = intersectionMask32Series(a, b);
    assert.notEqual(res, a);
    assert.notEqual(res, b);
    assert.deepEqual(a, aCopy);
    assert.deepEqual(b, bCopy);

    const selfRes = intersectionMask32Series(a, a);
    assert.notEqual(selfRes, a);
    assert.deepEqual(selfRes, a);

    // Subarray views with non-zero byteOffset
    const backing = new Uint32Array([0xffff_ffff, 0x1357_9bdf, 0x2468_ace0, 0x0000_0000]);
    const viewA = backing.subarray(1, 3);
    const viewB = backing.subarray(0, 2);
    assert.deepEqual(
      intersectionMask32Series(viewA, viewB),
      new Uint32Array([(0x1357_9bdf & 0xffff_ffff) >>> 0, (0x2468_ace0 & 0x1357_9bdf) >>> 0])
    );
  });

  it('throws TypeError for non-Uint32Array inputs and RangeError for mismatched lengths', () => {
    const valid = new Uint32Array([1, 2]);
    const invalidInputs = [
      null,
      undefined,
      42,
      '123',
      {},
      [1, 2],
      new Int32Array([1, 2]),
      new Uint8Array([1, 2]),
      new Uint16Array([1, 2]),
      new BigUint64Array([1n, 2n]),
    ];

    for (const bad of invalidInputs) {
      assert.throws(() => intersectionMask32Series(bad, valid), TypeError);
      assert.throws(() => intersectionMask32Series(valid, bad), TypeError);
    }

    assert.throws(
      () => intersectionMask32Series(new Uint32Array([1]), new Uint32Array([1, 2])),
      RangeError
    );
    assert.throws(
      () => intersectionMask32Series(new Uint32Array(0), new Uint32Array(1)),
      RangeError
    );
  });

  it('cross-checks against explicit Set<number> intersection, direct a[i] & b[i], and De Morgan identity', () => {
    const nextRand = createPrng(0x9e37_79b9);

    for (let trial = 0; trial < 40; trial++) {
      const len = (trial % 8) + 1;
      const a = new Uint32Array(len);
      const b = new Uint32Array(len);
      for (let i = 0; i < len; i++) {
        a[i] = nextRand();
        b[i] = nextRand();
      }

      const result = intersectionMask32Series(a, b);

      // 1. Cross-check against direct bitwise AND and De Morgan's law
      for (let i = 0; i < len; i++) {
        const directAnd = (a[i] & b[i]) >>> 0;
        const deMorgan = (~((~a[i]) | (~b[i]))) >>> 0;
        assert.equal(result[i], directAnd);
        assert.equal(result[i], deMorgan);
      }

      // 2. Cross-check against explicit Set<number> intersection of set bit indices
      const expectedSet = intersectSets(maskToBitSet(a), maskToBitSet(b));
      const actualSet = maskToBitSet(result);
      assert.deepEqual(actualSet, expectedSet);
    }
  });

  it('satisfies Boolean algebra laws (commutativity, associativity, idempotence, identity, annihilation)', () => {
    const nextRand = createPrng(0x1234_5678);
    const a = new Uint32Array([nextRand(), nextRand(), nextRand(), nextRand()]);
    const b = new Uint32Array([nextRand(), nextRand(), nextRand(), nextRand()]);
    const c = new Uint32Array([nextRand(), nextRand(), nextRand(), nextRand()]);
    const zeros = new Uint32Array(4);
    const ones = new Uint32Array(4).fill(0xffff_ffff);

    // Commutativity: a ∩ b == b ∩ a
    assert.deepEqual(intersectionMask32Series(a, b), intersectionMask32Series(b, a));

    // Associativity: (a ∩ b) ∩ c == a ∩ (b ∩ c)
    assert.deepEqual(
      intersectionMask32Series(intersectionMask32Series(a, b), c),
      intersectionMask32Series(a, intersectionMask32Series(b, c))
    );

    // Idempotence: a ∩ a == a
    assert.deepEqual(intersectionMask32Series(a, a), a);

    // Identity: a ∩ U == a
    assert.deepEqual(intersectionMask32Series(a, ones), a);

    // Annihilation: a ∩ ∅ == ∅
    assert.deepEqual(intersectionMask32Series(a, zeros), zeros);
  });
});
