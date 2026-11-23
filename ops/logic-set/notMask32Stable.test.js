import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { notMask32Stable } from './notMask32Stable.js';

/**
 * Independent bit-by-bit boolean oracle for bitwise NOT over a Uint32Array.
 *
 * @param {Uint32Array} words
 * @param {number} [bitLength]
 * @returns {Uint32Array}
 */
function referenceBitwiseNot(words, bitLength) {
  const totalBits = words.length * 32;
  const activeBits = bitLength === undefined ? totalBits : bitLength;
  const bits = new Array(totalBits).fill(false);

  for (let b = 0; b < activeBits; b += 1) {
    const w = Math.floor(b / 32);
    const offset = b % 32;
    const isSet = ((words[w] >>> offset) & 1) === 1;
    bits[b] = !isSet;
  }

  const out = new Uint32Array(words.length);
  for (let b = 0; b < totalBits; b += 1) {
    if (bits[b]) {
      const w = Math.floor(b / 32);
      const offset = b % 32;
      out[w] = (out[w] | (1 << offset)) >>> 0;
    }
  }
  return out;
}

describe('notMask32Stable', () => {
  it('computes bitwise NOT for normal single-word patterns', () => {
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x0f0f0f0f])),
      new Uint32Array([0xf0f0f0f0])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x12345678])),
      new Uint32Array([0xedcba987])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x55555555])),
      new Uint32Array([0xaaaaaaaa])
    );
  });

  it('handles empty Uint32Array with and without bitLength', () => {
    const empty = new Uint32Array(0);
    const out1 = notMask32Stable(empty);
    const out2 = notMask32Stable(empty, 0);

    assert.ok(out1 instanceof Uint32Array);
    assert.equal(out1.length, 0);
    assert.notEqual(out1, empty);

    assert.ok(out2 instanceof Uint32Array);
    assert.equal(out2.length, 0);
    assert.notEqual(out2, empty);
  });

  it('maps all zeros to 0xffffffff and all ones to 0x00000000', () => {
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000, 0x00000000])),
      new Uint32Array([0xffffffff, 0xffffffff])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0xffffffff, 0xffffffff])),
      new Uint32Array([0x00000000, 0x00000000])
    );
  });

  it('preserves unsigned 32-bit semantics around high bit 0x80000000', () => {
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x80000000, 0x7fffffff, 0x80000001])),
      new Uint32Array([0x7fffffff, 0x80000000, 0x7ffffffe])
    );
  });

  it('computes bitwise NOT across multi-word arrays', () => {
    const input = new Uint32Array([0x00000001, 0xdeadbeef, 0x80000000, 0x00ff00ff]);
    const expected = new Uint32Array([0xfffffffe, 0x21524110, 0x7fffffff, 0xff00ff00]);
    assert.deepEqual(notMask32Stable(input), expected);
  });

  it('masks trailing unused bits cleanly when optional bitLength is provided', () => {
    // 1 bit active
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000]), 1),
      new Uint32Array([0x00000001])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0xffffffff]), 1),
      new Uint32Array([0x00000000])
    );

    // 31 bits active (boundary where 1 << 31 would overflow signed int32)
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000]), 31),
      new Uint32Array([0x7fffffff])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x80000000]), 31),
      new Uint32Array([0x7fffffff])
    );

    // Exact word boundary (32 bits)
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x0000ffff]), 32),
      new Uint32Array([0xffff0000])
    );

    // Multi-word partial tail (33 and 50 bits)
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000, 0x00000000]), 33),
      new Uint32Array([0xffffffff, 0x00000001])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0xa5a5a5a5, 0x00000000]), 50),
      new Uint32Array([0x5a5a5a5a, 0x0003ffff])
    );

    // bitLength = 0 clears all words
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000, 0x12345678]), 0),
      new Uint32Array([0x00000000, 0x00000000])
    );

    // bitLength spanning fewer words than words.length zeroes trailing full words
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000, 0x00000000, 0x00000000]), 16),
      new Uint32Array([0x0000ffff, 0x00000000, 0x00000000])
    );
    assert.deepEqual(
      notMask32Stable(new Uint32Array([0x00000000, 0x00000000, 0x00000000]), 32),
      new Uint32Array([0xffffffff, 0x00000000, 0x00000000])
    );
  });

  it('does not mutate inputs and supports Uint32Array subarray views', () => {
    const backing = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444]);
    const view = backing.subarray(1, 3);
    const snapshot = new Uint32Array(backing);

    const out = notMask32Stable(view);
    assert.notEqual(out, view);
    assert.notEqual(out.buffer, backing.buffer);
    assert.deepEqual(out, new Uint32Array([0xdddddddd, 0xcccccccc]));
    assert.deepEqual(backing, snapshot);

    // Mutating output must not mutate input
    out[0] = 0;
    assert.deepEqual(backing, snapshot);
  });

  it('rejects invalid input types and out-of-range bitLength values', () => {
    const invalidWords = [
      null,
      undefined,
      [],
      [1, 2],
      new Int32Array([1]),
      new Uint16Array([1]),
      new Uint8Array([1]),
      '0101',
      42,
      {},
    ];
    for (const bad of invalidWords) {
      assert.throws(() => notMask32Stable(bad), TypeError);
    }

    const valid = new Uint32Array([0x12345678, 0x9abcdef0]);
    const invalidBitLengthTypes = [null, '32', true, false, 32n, {}, []];
    for (const bad of invalidBitLengthTypes) {
      assert.throws(() => notMask32Stable(valid, bad), TypeError);
    }

    const outOfRangeBitLengths = [
      -1,
      -32,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      65,
      100,
    ];
    for (const bad of outOfRangeBitLengths) {
      assert.throws(() => notMask32Stable(valid, bad), RangeError);
    }

    assert.throws(() => notMask32Stable(new Uint32Array(0), 1), RangeError);
  });

  it('satisfies double-negation involution NOT(NOT(a)) === a', () => {
    const samples = [
      new Uint32Array([]),
      new Uint32Array([0]),
      new Uint32Array([0xffffffff]),
      new Uint32Array([0x80000000, 0x7fffffff, 0x01234567, 0xfedcba98]),
    ];

    for (const a of samples) {
      const once = notMask32Stable(a);
      const twice = notMask32Stable(once);
      assert.deepEqual(twice, a);

      // Complement XOR original equals all 1s for every word
      for (let i = 0; i < a.length; i += 1) {
        assert.equal((a[i] ^ once[i]) >>> 0, 0xffffffff);
        assert.equal((a[i] & once[i]) >>> 0, 0x00000000);
      }
    }

    // Involution under bitLength when trailing bits are already cleared
    const masked = new Uint32Array([0xdeadbeef, 0x000003ff]);
    const bitLen = 42;
    assert.deepEqual(
      notMask32Stable(notMask32Stable(masked, bitLen), bitLen),
      masked
    );
  });

  it('matches an independent bit-by-bit boolean oracle across pseudo-random inputs', () => {
    // Deterministic LCG for reproducible test coverage
    let seed = 0x13579bdf;
    const nextUint32 = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };

    const wordCounts = [0, 1, 2, 3, 5];
    for (const wc of wordCounts) {
      const words = new Uint32Array(wc);
      for (let i = 0; i < wc; i += 1) {
        words[i] = nextUint32();
      }

      // Omitted bitLength
      assert.deepEqual(notMask32Stable(words), referenceBitwiseNot(words));

      // Representative bitLengths including boundaries
      const maxBits = wc * 32;
      const candidateLengths = new Set([
        0,
        1,
        17,
        31,
        32,
        33,
        63,
        64,
        95,
        96,
        maxBits - 1,
        maxBits,
      ]);

      for (const bl of candidateLengths) {
        if (bl >= 0 && bl <= maxBits) {
          assert.deepEqual(
            notMask32Stable(words, bl),
            referenceBitwiseNot(words, bl),
            `mismatch for wordCount=${wc}, bitLength=${bl}`
          );
        }
      }
    }
  });
});
