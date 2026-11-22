import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorMask32Series } from './xorMask32Series.js';

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check vectors.
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

/**
 * Independent bit-by-bit reference implementation using mod-2 bit addition
 * and positional binary reconstruction without bitwise XOR.
 */
function bitByBitXor(a, b) {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let aw = a[i];
    let bw = b[i];
    let word = 0;
    let bitWeight = 1;
    for (let bit = 0; bit < 32; bit++) {
      const bitA = aw % 2;
      const bitB = bw % 2;
      if ((bitA + bitB) % 2 === 1) {
        word += bitWeight;
      }
      aw = Math.floor(aw / 2);
      bw = Math.floor(bw / 2);
      bitWeight *= 2;
    }
    out[i] = word >>> 0;
  }
  return out;
}

describe('xorMask32Series', () => {
  describe('normal cases', () => {
    it('computes XOR for single-word masks including high bit 31', () => {
      const a = new Uint32Array([0xaaaaaaaa]);
      const b = new Uint32Array([0x55555555]);
      const res = xorMask32Series(a, b);
      assert.ok(res instanceof Uint32Array);
      assert.deepEqual(res, new Uint32Array([0xffffffff]));

      const c = new Uint32Array([0x80000001]);
      const d = new Uint32Array([0x80000000]);
      assert.deepEqual(xorMask32Series(c, d), new Uint32Array([0x00000001]));
    });

    it('computes XOR across multi-word bitmasks', () => {
      const a = new Uint32Array([0x12345678, 0xfedcba98, 0x0f0f0f0f, 0x80000000]);
      const b = new Uint32Array([0x87654321, 0x01234567, 0xf0f0f0f0, 0x7fffffff]);
      const expected = new Uint32Array([
        (0x12345678 ^ 0x87654321) >>> 0,
        (0xfedcba98 ^ 0x01234567) >>> 0,
        (0x0f0f0f0f ^ 0xf0f0f0f0) >>> 0,
        (0x80000000 ^ 0x7fffffff) >>> 0,
      ]);
      assert.deepEqual(xorMask32Series(a, b), expected);
    });

    it('returns a fresh Uint32Array and does not mutate inputs', () => {
      const a = new Uint32Array([0xdeadbeef, 0xcafebabe]);
      const b = new Uint32Array([0x0badf00d, 0x1337c0de]);
      const aSnap = new Uint32Array(a);
      const bSnap = new Uint32Array(b);

      const res = xorMask32Series(a, b);
      assert.notEqual(res, a);
      assert.notEqual(res, b);
      assert.deepEqual(a, aSnap);
      assert.deepEqual(b, bSnap);
    });

    it('handles subarray views with non-zero byte offsets', () => {
      const bufA = new Uint32Array([0x11111111, 0xdeadbeef, 0x22222222, 0x33333333]);
      const bufB = new Uint32Array([0x44444444, 0x55555555, 0xcafebabe, 0x66666666]);
      const subA = bufA.subarray(1, 3);
      const subB = bufB.subarray(2, 4);

      const res = xorMask32Series(subA, subB);
      assert.deepEqual(
        res,
        new Uint32Array([
          (0xdeadbeef ^ 0xcafebabe) >>> 0,
          (0x22222222 ^ 0x66666666) >>> 0,
        ])
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty Uint32Array inputs', () => {
      const a = new Uint32Array(0);
      const b = new Uint32Array(0);
      const res = xorMask32Series(a, b);
      assert.ok(res instanceof Uint32Array);
      assert.equal(res.length, 0);
      assert.notEqual(res, a);
      assert.notEqual(res, b);
    });

    it('satisfies zero identity xor(a, 0) === a and xor(0, 0) === 0', () => {
      const zeros = new Uint32Array([0, 0, 0]);
      const a = new Uint32Array([0x00000000, 0x80000000, 0xffffffff]);

      assert.deepEqual(xorMask32Series(zeros, zeros), zeros);
      assert.deepEqual(xorMask32Series(a, zeros), a);
      assert.deepEqual(xorMask32Series(zeros, a), a);
    });

    it('satisfies all-ones complement xor(a, 0xFFFFFFFF) === ~a >>> 0', () => {
      const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);
      const a = new Uint32Array([0x00000000, 0x80000001, 0x0f0f0f0f]);
      const expected = new Uint32Array([
        (~0x00000000) >>> 0,
        (~0x80000001) >>> 0,
        (~0x0f0f0f0f) >>> 0,
      ]);
      assert.deepEqual(xorMask32Series(a, ones), expected);
    });

    it('returns all zeros for identical or aliased masks xor(a, a) === 0', () => {
      const a = new Uint32Array([0x00000001, 0x40000000, 0x80000000, 0xffffffff]);
      const zeros = new Uint32Array(4);
      assert.deepEqual(xorMask32Series(a, a), zeros);
      assert.deepEqual(xorMask32Series(a, new Uint32Array(a)), zeros);
    });

    it('correctly handles every individual bit position 0..31', () => {
      const a = new Uint32Array(32);
      const b = new Uint32Array(32);
      for (let k = 0; k < 32; k++) {
        a[k] = (1 << k) >>> 0;
        b[k] = k % 2 === 0 ? 0 : (1 << k) >>> 0;
      }
      const res = xorMask32Series(a, b);
      for (let k = 0; k < 32; k++) {
        const expected = k % 2 === 0 ? (1 << k) >>> 0 : 0;
        assert.equal(res[k], expected);
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError when first argument is not a Uint32Array', () => {
      const valid = new Uint32Array([1, 2]);
      const invalidInputs = [
        null,
        undefined,
        42,
        '12',
        {},
        [1, 2],
        new Int32Array([1, 2]),
        new Uint16Array([1, 2]),
        new Uint8Array([1, 2]),
        new BigUint64Array([1n, 2n]),
      ];
      for (const bad of invalidInputs) {
        assert.throws(() => xorMask32Series(bad, valid), TypeError);
      }
    });

    it('throws TypeError when second argument is not a Uint32Array', () => {
      const valid = new Uint32Array([1, 2]);
      const invalidInputs = [
        null,
        undefined,
        0,
        '12',
        {},
        [1, 2],
        new Int32Array([1, 2]),
        new Uint16Array([1, 2]),
        new Uint8Array([1, 2]),
      ];
      for (const bad of invalidInputs) {
        assert.throws(() => xorMask32Series(valid, bad), TypeError);
      }
    });

    it('throws RangeError when lengths do not match', () => {
      assert.throws(
        () => xorMask32Series(new Uint32Array(2), new Uint32Array(3)),
        RangeError
      );
      assert.throws(
        () => xorMask32Series(new Uint32Array(0), new Uint32Array(1)),
        RangeError
      );
      assert.throws(
        () => xorMask32Series(new Uint32Array(5), new Uint32Array(0)),
        RangeError
      );
    });
  });

  describe('cross-checks and algebraic identities', () => {
    it('matches direct (a[i] ^ b[i]) >>> 0, disjoint-difference identity, and bit-by-bit reference', () => {
      const next = makePrng(0x20261122);
      const len = 64;
      const a = new Uint32Array(len);
      const b = new Uint32Array(len);
      for (let i = 0; i < len; i++) {
        a[i] = next();
        b[i] = next();
      }
      // Include boundary words explicitly
      a[0] = 0x00000000;
      b[0] = 0xffffffff;
      a[1] = 0x80000000;
      b[1] = 0x80000000;
      a[2] = 0x7fffffff;
      b[2] = 0x80000000;

      const res = xorMask32Series(a, b);
      const bitRef = bitByBitXor(a, b);

      for (let i = 0; i < len; i++) {
        const direct = (a[i] ^ b[i]) >>> 0;
        const symmetricDiff = ((a[i] & ~b[i]) | (~a[i] & b[i])) >>> 0;
        assert.equal(res[i], direct, `direct XOR mismatch at word ${i}`);
        assert.equal(res[i], symmetricDiff, `symmetric-diff mismatch at word ${i}`);
        assert.equal(res[i], bitRef[i], `bit-by-bit mismatch at word ${i}`);
      }
    });

    it('satisfies self-inverse, commutativity, and associativity', () => {
      const next = makePrng(0x9e3779b9);
      const len = 32;
      const a = new Uint32Array(len);
      const b = new Uint32Array(len);
      const c = new Uint32Array(len);
      for (let i = 0; i < len; i++) {
        a[i] = next();
        b[i] = next();
        c[i] = next();
      }

      // Self-inverse: xor(xor(a, b), b) === a and xor(a, xor(a, b)) === b
      const ab = xorMask32Series(a, b);
      assert.deepEqual(xorMask32Series(ab, b), a);
      assert.deepEqual(xorMask32Series(a, ab), b);

      // Commutativity: xor(a, b) === xor(b, a)
      assert.deepEqual(ab, xorMask32Series(b, a));

      // Associativity: xor(xor(a, b), c) === xor(a, xor(b, c))
      assert.deepEqual(
        xorMask32Series(ab, c),
        xorMask32Series(a, xorMask32Series(b, c))
      );
    });
  });
});
