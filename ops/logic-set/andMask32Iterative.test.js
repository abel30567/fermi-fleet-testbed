import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andMask32Iterative } from './andMask32Iterative.js';

/**
 * Independent reference helper: converts a Uint32Array bitmask into a Set of
 * active bit indices (wordIndex * 32 + bitOffset).
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
  const bits = new Set();
  for (let wordIndex = 0; wordIndex < mask.length; wordIndex += 1) {
    const word = mask[wordIndex];
    for (let bit = 0; bit < 32; bit += 1) {
      if (((word >>> bit) & 1) === 1) {
        bits.add(wordIndex * 32 + bit);
      }
    }
  }
  return bits;
}

/**
 * Independent reference helper: converts a Set of bit indices back to a
 * Uint32Array of the given word length.
 *
 * @param {Set<number>} bits
 * @param {number} wordLength
 * @returns {Uint32Array}
 */
function bitSetToMask(bits, wordLength) {
  const out = new Uint32Array(wordLength);
  for (const bitIndex of bits) {
    const wordIndex = Math.floor(bitIndex / 32);
    const bitOffset = bitIndex % 32;
    out[wordIndex] = (out[wordIndex] | (1 << bitOffset)) >>> 0;
  }
  return out;
}

/**
 * Independent Set-based intersection reference for two Uint32Array bitmasks.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceSetIntersectionMask(a, b) {
  const setA = maskToBitSet(a);
  const setB = maskToBitSet(b);
  const intersection = new Set();
  for (const bit of setA) {
    if (setB.has(bit)) {
      intersection.add(bit);
    }
  }
  return bitSetToMask(intersection, a.length);
}

describe('andMask32Iterative', () => {
  it('handles empty Uint32Array bitmasks', () => {
    const a = new Uint32Array(0);
    const b = new Uint32Array(0);
    const res = andMask32Iterative(a, b);

    assert.ok(res instanceof Uint32Array);
    assert.equal(res.length, 0);
    assert.notEqual(res, a);
    assert.notEqual(res, b);
    assert.deepEqual(res, new Uint32Array(0));
  });

  it('computes single-word bitwise AND accurately', () => {
    assert.deepEqual(
      andMask32Iterative(new Uint32Array([0b11001010]), new Uint32Array([0b10101100])),
      new Uint32Array([0b10001000])
    );
    assert.deepEqual(
      andMask32Iterative(new Uint32Array([0xaaaaaaaa]), new Uint32Array([0x55555555])),
      new Uint32Array([0x00000000])
    );
    assert.deepEqual(
      andMask32Iterative(new Uint32Array([0x12345678]), new Uint32Array([0x0f0f0f0f])),
      new Uint32Array([0x02040608])
    );
  });

  it('preserves high bit (bit 31 / 0x80000000 and 0xFFFFFFFF) without sign issues', () => {
    const highOnly = new Uint32Array([0x80000000]);
    const allOnes = new Uint32Array([0xffffffff]);
    const lower31 = new Uint32Array([0x7fffffff]);
    const mixedHigh = new Uint32Array([0x80000001]);

    const r1 = andMask32Iterative(highOnly, allOnes);
    assert.equal(r1[0], 0x80000000);
    assert.equal(r1[0], 2147483648);

    const r2 = andMask32Iterative(allOnes, allOnes);
    assert.equal(r2[0], 0xffffffff);
    assert.equal(r2[0], 4294967295);

    const r3 = andMask32Iterative(highOnly, lower31);
    assert.equal(r3[0], 0);

    const r4 = andMask32Iterative(mixedHigh, highOnly);
    assert.equal(r4[0], 0x80000000);
  });

  it('computes multi-word bitmasks accurately across word boundaries', () => {
    const a = new Uint32Array([0xffffffff, 0x80000001, 0x0f0f0f0f, 0xdeadbeef]);
    const b = new Uint32Array([0x12345678, 0x80000000, 0xf0f0f0f0, 0xffff0000]);
    const expected = new Uint32Array([0x12345678, 0x80000000, 0x00000000, 0xdead0000]);

    const res = andMask32Iterative(a, b);
    assert.deepEqual(res, expected);
  });

  it('satisfies all-zeros, all-ones, idempotence, commutativity, and associativity identities', () => {
    const a = new Uint32Array([0x89abcdef, 0x01234567, 0xfedcba98]);
    const b = new Uint32Array([0xaaaaaaaa, 0x80000001, 0x33333333]);
    const c = new Uint32Array([0x0f0f0f0f, 0xffffffff, 0x55555555]);
    const zeros = new Uint32Array([0x00000000, 0x00000000, 0x00000000]);
    const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);

    // All-zeros annihilator
    assert.deepEqual(andMask32Iterative(a, zeros), zeros);
    assert.deepEqual(andMask32Iterative(zeros, a), zeros);

    // All-ones identity
    assert.deepEqual(andMask32Iterative(a, ones), a);
    assert.deepEqual(andMask32Iterative(ones, a), a);

    // Idempotence (including same object reference)
    assert.deepEqual(andMask32Iterative(a, a), a);
    assert.notEqual(andMask32Iterative(a, a), a);

    // Commutativity
    assert.deepEqual(andMask32Iterative(a, b), andMask32Iterative(b, a));

    // Associativity
    assert.deepEqual(
      andMask32Iterative(andMask32Iterative(a, b), c),
      andMask32Iterative(a, andMask32Iterative(b, c))
    );
  });

  it('does not mutate inputs and returns an independent Uint32Array (including subarray views)', () => {
    const a = new Uint32Array([0xdeadbeef, 0x80000001, 0x12345678]);
    const b = new Uint32Array([0x00ff00ff, 0xffffffff, 0x87654321]);
    const aSnap = new Uint32Array(a);
    const bSnap = new Uint32Array(b);

    const res = andMask32Iterative(a, b);
    assert.notEqual(res, a);
    assert.notEqual(res, b);
    assert.notEqual(res.buffer, a.buffer);
    assert.notEqual(res.buffer, b.buffer);

    // Mutate result and confirm inputs are unaffected
    res[0] = 0;
    res[1] = 0;
    res[2] = 0;
    assert.deepEqual(a, aSnap);
    assert.deepEqual(b, bSnap);

    // Subarray views sharing a single underlying ArrayBuffer
    const shared = new Uint32Array([0x11111111, 0xf0f0f0f0, 0x8000ffff, 0x0f0f0f0f]);
    const viewA = shared.subarray(1, 3);
    const viewB = shared.subarray(2, 4);
    const subRes = andMask32Iterative(viewA, viewB);
    assert.deepEqual(subRes, new Uint32Array([0x8000f0f0, 0x00000f0f]));
    assert.deepEqual(shared, new Uint32Array([0x11111111, 0xf0f0f0f0, 0x8000ffff, 0x0f0f0f0f]));
  });

  it('throws TypeError when either argument is not a Uint32Array', () => {
    const valid = new Uint32Array([1, 2]);
    const invalidValues = [
      null,
      undefined,
      0,
      42,
      '123',
      true,
      [1, 2],
      { length: 2, 0: 1, 1: 2 },
      new Int32Array([1, 2]),
      new Uint16Array([1, 2]),
      new Uint8Array([1, 2]),
      new BigUint64Array([1n, 2n]),
      new ArrayBuffer(8),
    ];

    for (const invalid of invalidValues) {
      assert.throws(() => andMask32Iterative(invalid, valid), TypeError);
      assert.throws(() => andMask32Iterative(valid, invalid), TypeError);
    }
    assert.throws(() => andMask32Iterative(), TypeError);
    assert.throws(() => andMask32Iterative(valid), TypeError);
  });

  it('throws RangeError when Uint32Array lengths do not match', () => {
    assert.throws(
      () => andMask32Iterative(new Uint32Array(0), new Uint32Array(1)),
      RangeError
    );
    assert.throws(
      () => andMask32Iterative(new Uint32Array(3), new Uint32Array(2)),
      RangeError
    );
    assert.throws(
      () => andMask32Iterative(new Uint32Array(1), new Uint32Array(4)),
      RangeError
    );
  });

  it('matches an independent Set-based bit-index intersection reference across varied vectors', () => {
    // Deterministic xorshift32 PRNG for reproducible coverage across all 32 bit positions
    let state = 0x9e3779b9;
    function nextUint32() {
      state ^= (state << 13) >>> 0;
      state ^= state >>> 17;
      state ^= (state << 5) >>> 0;
      return state >>> 0;
    }

    const lengths = [0, 1, 2, 3, 5, 8, 16];
    for (const len of lengths) {
      for (let trial = 0; trial < 5; trial += 1) {
        const a = new Uint32Array(len);
        const b = new Uint32Array(len);
        for (let i = 0; i < len; i += 1) {
          a[i] = nextUint32();
          b[i] = nextUint32();
        }

        const actual = andMask32Iterative(a, b);
        const expected = referenceSetIntersectionMask(a, b);
        assert.deepEqual(actual, expected);

        // Also verify bit-set equality directly
        const actualBits = maskToBitSet(actual);
        const setA = maskToBitSet(a);
        const setB = maskToBitSet(b);
        const expectedBits = new Set([...setA].filter((bit) => setB.has(bit)));
        assert.deepEqual(actualBits, expectedBits);
      }
    }
  });
});
