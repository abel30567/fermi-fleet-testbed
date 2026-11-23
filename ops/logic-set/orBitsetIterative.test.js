import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orBitsetIterative } from './orBitsetIterative.js';

/**
 * Extracts the set of 0-based bit indices set to 1 in a non-negative BigInt.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
  const indices = new Set();
  const bin = bitset.toString(2);
  for (let i = 0; i < bin.length; i += 1) {
    if (bin[bin.length - 1 - i] === '1') {
      indices.add(i);
    }
  }
  return indices;
}

/**
 * Reconstructs a non-negative BigInt from a set of 0-based bit indices.
 *
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
  let acc = 0n;
  for (const idx of indices) {
    acc += 1n << BigInt(idx);
  }
  return acc;
}

describe('orBitsetIterative', () => {
  it('handles zero bitsets (identity and absorbing zero cases)', () => {
    assert.equal(orBitsetIterative(0n, 0n), 0n);
    assert.equal(orBitsetIterative(0n, 0b10101n), 0b10101n);
    assert.equal(orBitsetIterative(0b10101n, 0n), 0b10101n);
  });

  it('computes OR of disjoint bitsets', () => {
    assert.equal(orBitsetIterative(0b1010n, 0b0101n), 0b1111n);
    assert.equal(orBitsetIterative(0x00ff00ffn, 0xff00ff00n), 0xffffffffn);
    assert.equal(orBitsetIterative(1n << 0n, 1n << 100n), (1n << 100n) + 1n);
  });

  it('computes OR of overlapping and identical bitsets', () => {
    assert.equal(orBitsetIterative(0b1100n, 0b1010n), 0b1110n);
    assert.equal(orBitsetIterative(0xdeadbeefn, 0xdeadbeefn), 0xdeadbeefn);
    assert.equal(orBitsetIterative(0xffffn, 0x00ffn), 0xffffn);
  });

  it('handles 32-bit chunk sign-bit boundaries accurately (bit 31, 63, 95)', () => {
    const bit31 = 1n << 31n;
    const bit32 = 1n << 32n;
    const bit63 = 1n << 63n;
    const bit95 = 1n << 95n;

    assert.equal(orBitsetIterative(bit31, 0n), bit31);
    assert.equal(orBitsetIterative(0n, bit31), bit31);
    assert.equal(orBitsetIterative(bit31, bit32), bit31 | bit32);
    assert.equal(orBitsetIterative(bit31 | bit63, bit63 | bit95), bit31 | bit63 | bit95);
    assert.equal(orBitsetIterative(0xffffffffn, 0x80000000n), 0xffffffffn);
  });

  it('handles arbitrary-width bitsets exceeding 256 bits and asymmetric widths', () => {
    const a = (1n << 300n) + (1n << 256n) + (1n << 127n) + 0x123456789abcdef0n;
    const b = (1n << 512n) + (1n << 300n) + (1n << 64n) + 0x0fedcba987654321n;
    assert.equal(orBitsetIterative(a, b), a | b);

    const wide = (1n << 1024n) - 1n;
    const narrow = 0b101101n;
    assert.equal(orBitsetIterative(wide, narrow), wide);
    assert.equal(orBitsetIterative(narrow, wide), wide);

    const veryWideA = (1n << 2049n) + (1n << 1025n) + (1n << 513n) + 1n;
    const veryWideB = (1n << 2048n) + (1n << 1024n) + (1n << 512n) + 2n;
    assert.equal(orBitsetIterative(veryWideA, veryWideB), veryWideA | veryWideB);
  });

  it('satisfies algebraic properties: commutativity, idempotence, associativity', () => {
    const a = 0x123456789abcdef0fedcba9876543210n;
    const b = 0xa5a5a5a55a5a5a5a0f0f0f0ff0f0f0f0aabbccddn;
    const c = (1n << 400n) + 0xdeadbeefcafebabefeedfacen;

    assert.equal(orBitsetIterative(a, b), orBitsetIterative(b, a));
    assert.equal(orBitsetIterative(a, a), a);
    assert.equal(
      orBitsetIterative(orBitsetIterative(a, b), c),
      orBitsetIterative(a, orBitsetIterative(b, c)),
    );
  });

  it('cross-checks against native BigInt OR and Set union of bit indices', () => {
    // Deterministic PRNG (LCG) for reproducible multi-width test vectors
    let seed = 0x13579bdfn;
    const nextBigInt = (bits) => {
      let acc = 0n;
      for (let i = 0; i < bits; i += 32) {
        seed = (seed * 1664525n + 1013904223n) & 0xffffffffn;
        acc = (acc << 32n) + seed;
      }
      return acc;
    };

    const widths = [0, 1, 8, 31, 32, 33, 64, 128, 257, 513];
    for (const widthA of widths) {
      for (const widthB of widths) {
        const a = widthA === 0 ? 0n : nextBigInt(widthA);
        const b = widthB === 0 ? 0n : nextBigInt(widthB);

        const actual = orBitsetIterative(a, b);
        const expectedNative = a | b;
        assert.equal(actual, expectedNative);

        const unionIndices = new Set([...bitsetToIndexSet(a), ...bitsetToIndexSet(b)]);
        const expectedFromSet = indexSetToBitset(unionIndices);
        assert.equal(actual, expectedFromSet);
        assert.deepEqual(bitsetToIndexSet(actual), unionIndices);
      }
    }
  });

  it('rejects non-BigInt inputs with TypeError', () => {
    const invalidValues = [
      0,
      1,
      42,
      NaN,
      Infinity,
      '0',
      '101',
      true,
      false,
      null,
      undefined,
      {},
      [],
      Symbol('bit'),
    ];

    for (const bad of invalidValues) {
      assert.throws(() => orBitsetIterative(bad, 0n), TypeError);
      assert.throws(() => orBitsetIterative(0n, bad), TypeError);
    }

    assert.throws(() => orBitsetIterative(), TypeError);
    assert.throws(() => orBitsetIterative(1n), TypeError);
  });

  it('rejects negative BigInt inputs with RangeError', () => {
    assert.throws(() => orBitsetIterative(-1n, 0n), RangeError);
    assert.throws(() => orBitsetIterative(0n, -1n), RangeError);
    assert.throws(() => orBitsetIterative(-1n, -1n), RangeError);
    assert.throws(() => orBitsetIterative(-(1n << 300n), 5n), RangeError);
    assert.throws(() => orBitsetIterative(5n, -(1n << 300n)), RangeError);
  });
});
