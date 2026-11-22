import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionMask32Iterative } from './intersectionMask32Iterative.js';

/**
 * Independent reference: converts a Uint32Array bitmask into a Set of active bit indices.
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToIndexSet(mask) {
  const indices = new Set();
  for (let wordIndex = 0; wordIndex < mask.length; wordIndex += 1) {
    let word = mask[wordIndex];
    for (let bit = 0; bit < 32; bit += 1) {
      if ((word & 1) === 1) {
        indices.add(wordIndex * 32 + bit);
      }
      word >>>= 1;
    }
  }
  return indices;
}

/**
 * Independent reference: computes the set intersection of two JS Sets.
 * @param {Set<number>} setA
 * @param {Set<number>} setB
 * @returns {Set<number>}
 */
function setIntersection(setA, setB) {
  const out = new Set();
  for (const value of setA) {
    if (setB.has(value)) {
      out.add(value);
    }
  }
  return out;
}

/**
 * Deterministic 32-bit PRNG (xorshift32) for reproducible property tests.
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

describe('intersectionMask32Iterative', () => {
  it('handles empty Uint32Array inputs', () => {
    const emptyA = new Uint32Array(0);
    const emptyB = new Uint32Array(0);
    const nonEmpty = new Uint32Array([0xffffffff, 0x12345678]);

    const resBothEmpty = intersectionMask32Iterative(emptyA, emptyB);
    assert.ok(resBothEmpty instanceof Uint32Array);
    assert.equal(resBothEmpty.length, 0);
    assert.notEqual(resBothEmpty, emptyA);
    assert.notEqual(resBothEmpty, emptyB);

    const resLeftEmpty = intersectionMask32Iterative(emptyA, nonEmpty);
    assert.equal(resLeftEmpty.length, 0);

    const resRightEmpty = intersectionMask32Iterative(nonEmpty, emptyB);
    assert.equal(resRightEmpty.length, 0);
  });

  it('computes intersection for equal-length disjoint, overlapping, and identical bitsets', () => {
    const a = new Uint32Array([0b10101010, 0x0f0f0f0f, 0x12345678]);
    const disjoint = new Uint32Array([0b01010101, 0xf0f0f0f0, 0xedcba987]);
    const overlap = new Uint32Array([0b11001100, 0x00ff00ff, 0x0f0f0f0f]);

    assert.deepEqual(
      intersectionMask32Iterative(a, disjoint),
      new Uint32Array([0, 0, 0]),
    );
    assert.deepEqual(
      intersectionMask32Iterative(a, overlap),
      new Uint32Array([0b10001000, 0x000f000f, 0x02040608]),
    );
    assert.deepEqual(intersectionMask32Iterative(a, a), a);
  });

  it('handles different-length bitsets by returning length Math.min(a.length, b.length)', () => {
    const shorter = new Uint32Array([0x00ff00ff, 0x80000001]);
    const longer = new Uint32Array([0x0f0f0f0f, 0xffffffff, 0xffffffff, 0xdeadbeef]);

    const resAB = intersectionMask32Iterative(shorter, longer);
    assert.equal(resAB.length, 2);
    assert.deepEqual(resAB, new Uint32Array([0x000f000f, 0x80000001]));

    const resBA = intersectionMask32Iterative(longer, shorter);
    assert.equal(resBA.length, 2);
    assert.deepEqual(resBA, new Uint32Array([0x000f000f, 0x80000001]));
  });

  it('preserves unsigned 32-bit semantics on high-bit words (0x80000000, 0xFFFFFFFF)', () => {
    const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0x7fffffff]);
    const b = new Uint32Array([0x80000000, 0xffffffff, 0xffffffff, 0x80000000]);

    const res = intersectionMask32Iterative(a, b);
    assert.deepEqual(
      res,
      new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0x00000000]),
    );
    assert.equal(res[0], 2147483648);
    assert.equal(res[1], 4294967295);
    assert.equal(res[2], 2147483649);
    assert.equal(res[3], 0);
  });

  it('satisfies commutativity, associativity, and idempotence', () => {
    const a = new Uint32Array([0xf0f0f0f0, 0x81818181, 0x12345678, 0xffffffff]);
    const b = new Uint32Array([0xcccc3333, 0x800000ff, 0x9abcdef0]);
    const c = new Uint32Array([0xaaaaaaaa, 0xffffffff]);

    // Commutativity
    assert.deepEqual(
      intersectionMask32Iterative(a, b),
      intersectionMask32Iterative(b, a),
    );
    assert.deepEqual(
      intersectionMask32Iterative(b, c),
      intersectionMask32Iterative(c, b),
    );

    // Associativity: (a ∩ b) ∩ c === a ∩ (b ∩ c)
    const leftAssoc = intersectionMask32Iterative(
      intersectionMask32Iterative(a, b),
      c,
    );
    const rightAssoc = intersectionMask32Iterative(
      a,
      intersectionMask32Iterative(b, c),
    );
    assert.deepEqual(leftAssoc, rightAssoc);

    // Idempotence: a ∩ a === a
    assert.deepEqual(intersectionMask32Iterative(a, a), a);
    assert.deepEqual(intersectionMask32Iterative(c, c), c);
  });

  it('does not mutate inputs and returns a fresh Uint32Array instance', () => {
    const a = new Uint32Array([0x11223344, 0x55667788]);
    const b = new Uint32Array([0xff00ff00, 0x00ff00ff]);
    const aCopy = new Uint32Array(a);
    const bCopy = new Uint32Array(b);

    const result = intersectionMask32Iterative(a, b);
    assert.notEqual(result, a);
    assert.notEqual(result, b);

    // Mutate result and verify inputs are unaffected
    result[0] = 0xffffffff;
    result[1] = 0xffffffff;
    assert.deepEqual(a, aCopy);
    assert.deepEqual(b, bCopy);

    // Self-intersection also returns a distinct array
    const selfResult = intersectionMask32Iterative(a, a);
    assert.notEqual(selfResult, a);
    selfResult[0] = 0;
    assert.deepEqual(a, aCopy);
  });

  it('works with Uint32Array subarray views with non-zero byteOffset', () => {
    const backing = new Uint32Array([0xffffffff, 0x12345678, 0x8000000f, 0xdeadbeef]);
    const subA = backing.subarray(1, 3); // [0x12345678, 0x8000000f]
    const subB = backing.subarray(2, 4); // [0x8000000f, 0xdeadbeef]

    const res = intersectionMask32Iterative(subA, subB);
    assert.deepEqual(
      res,
      new Uint32Array([(0x12345678 & 0x8000000f) >>> 0, (0x8000000f & 0xdeadbeef) >>> 0]),
    );
  });

  it('throws TypeError on invalid inputs', () => {
    const valid = new Uint32Array([1, 2, 3]);
    const invalidValues = [
      undefined,
      null,
      42,
      '123',
      true,
      {},
      [1, 2, 3],
      { length: 2, 0: 1, 1: 2 },
      new Int32Array([1, 2, 3]),
      new Uint16Array([1, 2, 3]),
      new Uint8Array([1, 2, 3]),
      new BigUint64Array([1n, 2n]),
      new ArrayBuffer(12),
    ];

    for (const invalid of invalidValues) {
      assert.throws(
        () => intersectionMask32Iterative(invalid, valid),
        TypeError,
        `Expected TypeError when first arg is ${Object.prototype.toString.call(invalid)}`,
      );
      assert.throws(
        () => intersectionMask32Iterative(valid, invalid),
        TypeError,
        `Expected TypeError when second arg is ${Object.prototype.toString.call(invalid)}`,
      );
    }

    assert.throws(() => intersectionMask32Iterative(), TypeError);
    assert.throws(() => intersectionMask32Iterative(valid), TypeError);
  });

  it('matches an independent Set<number> of bit indices across randomized bitmasks', () => {
    const rng = makeRng(0x23c0ffee);

    for (let trial = 0; trial < 100; trial += 1) {
      const lenA = rng() % 12;
      const lenB = rng() % 12;
      const a = new Uint32Array(lenA);
      const b = new Uint32Array(lenB);

      for (let i = 0; i < lenA; i += 1) {
        a[i] = rng();
      }
      for (let i = 0; i < lenB; i += 1) {
        b[i] = rng();
      }

      const actualMask = intersectionMask32Iterative(a, b);
      assert.equal(actualMask.length, Math.min(lenA, lenB));

      const actualIndices = maskToIndexSet(actualMask);
      const expectedIndices = setIntersection(maskToIndexSet(a), maskToIndexSet(b));

      assert.deepEqual(actualIndices, expectedIndices);
    }
  });
});
