import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andMask32Series } from './andMask32Series.js';

/**
 * Independent direct word-by-word reference using built-in bitwise AND.
 */
function directWordAnd(a, b) {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = (a[i] & b[i]) >>> 0;
  }
  return out;
}

/**
 * Independent bit-by-bit reference using arithmetic bit extraction (no bitwise ops).
 */
function bitByBitAnd(a, b) {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    let aw = a[i];
    let bw = b[i];
    let acc = 0;
    let weight = 1;
    for (let k = 0; k < 32; k += 1) {
      const bitA = aw % 2;
      const bitB = bw % 2;
      if (bitA === 1 && bitB === 1) {
        acc += weight;
      }
      aw = (aw - bitA) / 2;
      bw = (bw - bitB) / 2;
      weight *= 2;
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Independent De Morgan reference: ~(~a | ~b) >>> 0.
 */
function deMorganAnd(a, b) {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = (~(~a[i] | ~b[i])) >>> 0;
  }
  return out;
}

/**
 * Deterministic LCG / xorshift32 PRNG for reproducible multi-word tests.
 */
function makeDeterministicMask(length, seed) {
  const arr = new Uint32Array(length);
  let x = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    arr[i] = x >>> 0;
  }
  return arr;
}

describe('andMask32Series', () => {
  it('computes expected bitwise AND for normal single- and multi-word masks', () => {
    const a = new Uint32Array([0x12345678, 0xaaaaaaaa, 0xf0f0f0f0, 0xdeadbeef]);
    const b = new Uint32Array([0x9abcdef0, 0x55555555, 0x0ff00ff0, 0xcafebabe]);
    const expected = new Uint32Array([0x12345670, 0x00000000, 0x00f000f0, 0xcaacbaae]);

    const result = andMask32Series(a, b);
    assert.ok(result instanceof Uint32Array);
    assert.notEqual(result, a);
    assert.notEqual(result, b);
    assert.deepEqual(result, expected);
  });

  it('handles unsigned 32-bit boundary values including high bit (0x80000000) and 0xFFFFFFFF', () => {
    const boundary = [
      0x00000000,
      0x00000001,
      0x0000ffff,
      0x7fffffff,
      0x80000000,
      0x80000001,
      0xaaaaaaaa,
      0x55555555,
      0xfffffffe,
      0xffffffff,
    ];

    const n = boundary.length * boundary.length;
    const a = new Uint32Array(n);
    const b = new Uint32Array(n);
    let idx = 0;
    for (const av of boundary) {
      for (const bv of boundary) {
        a[idx] = av;
        b[idx] = bv;
        idx += 1;
      }
    }

    const result = andMask32Series(a, b);
    assert.deepEqual(result, directWordAnd(a, b));
    assert.deepEqual(result, bitByBitAnd(a, b));
    assert.deepEqual(result, deMorganAnd(a, b));
  });

  it('handles all 32 single-bit positions accurately', () => {
    const ones = new Uint32Array(32);
    const allBits = new Uint32Array(32).fill(0xffffffff);
    const rotated = new Uint32Array(32);
    for (let k = 0; k < 32; k += 1) {
      ones[k] = (1 << k) >>> 0;
      rotated[k] = (1 << ((k + 1) % 32)) >>> 0;
    }

    assert.deepEqual(andMask32Series(ones, allBits), ones);
    assert.deepEqual(andMask32Series(ones, ones), ones);
    assert.deepEqual(andMask32Series(ones, rotated), new Uint32Array(32));
  });

  it('handles empty Uint32Array inputs and returns a new Uint32Array', () => {
    const a = new Uint32Array(0);
    const b = new Uint32Array(0);
    const result = andMask32Series(a, b);
    assert.ok(result instanceof Uint32Array);
    assert.equal(result.length, 0);
    assert.notEqual(result, a);
    assert.notEqual(result, b);
  });

  it('does not mutate inputs and handles aliased arguments (a === b) and subarrays', () => {
    const backing = new Uint32Array([0x11111111, 0x80000001, 0xffffffff, 0x0f0f0f0f, 0x99999999]);
    const subA = backing.subarray(1, 4);
    const subB = new Uint32Array([0x80000000, 0x12345678, 0xf0f0f0f0]);
    const snapshotBacking = new Uint32Array(backing);
    const snapshotB = new Uint32Array(subB);

    const resSub = andMask32Series(subA, subB);
    assert.deepEqual(resSub, new Uint32Array([0x80000000, 0x12345678, 0x00000000]));
    assert.deepEqual(backing, snapshotBacking);
    assert.deepEqual(subB, snapshotB);

    const resSelf = andMask32Series(subA, subA);
    assert.notEqual(resSelf, subA);
    assert.deepEqual(resSelf, new Uint32Array([0x80000001, 0xffffffff, 0x0f0f0f0f]));
  });

  it('cross-checks large pseudo-random bitmasks against direct AND, bit-by-bit, and De Morgan', () => {
    const a = makeDeterministicMask(512, 0x12345678);
    const b = makeDeterministicMask(512, 0x9e3779b9);

    const actual = andMask32Series(a, b);
    assert.deepEqual(actual, directWordAnd(a, b));
    assert.deepEqual(actual, bitByBitAnd(a, b));
    assert.deepEqual(actual, deMorganAnd(a, b));
  });

  it('satisfies Boolean algebra and Boolean ring identities', () => {
    const len = 64;
    const a = makeDeterministicMask(len, 0xabcdef01);
    const b = makeDeterministicMask(len, 0x10203040);
    const c = makeDeterministicMask(len, 0xfedcba98);
    const zero = new Uint32Array(len);
    const ones = new Uint32Array(len).fill(0xffffffff);
    const notA = a.map((w) => (~w) >>> 0);

    // Commutativity: a & b == b & a
    assert.deepEqual(andMask32Series(a, b), andMask32Series(b, a));

    // Associativity: (a & b) & c == a & (b & c)
    assert.deepEqual(
      andMask32Series(andMask32Series(a, b), c),
      andMask32Series(a, andMask32Series(b, c))
    );

    // Idempotence, identity, annihilator, complement
    assert.deepEqual(andMask32Series(a, a), a);
    assert.deepEqual(andMask32Series(a, ones), a);
    assert.deepEqual(andMask32Series(a, zero), zero);
    assert.deepEqual(andMask32Series(a, notA), zero);

    // Boolean ring distributivity over XOR: a & (b ^ c) == (a & b) ^ (a & c)
    const bXorC = b.map((w, i) => (w ^ c[i]) >>> 0);
    const lhs = andMask32Series(a, bXorC);
    const ab = andMask32Series(a, b);
    const ac = andMask32Series(a, c);
    const rhs = ab.map((w, i) => (w ^ ac[i]) >>> 0);
    assert.deepEqual(lhs, rhs);
  });

  it('throws TypeError for non-Uint32Array arguments', () => {
    const valid = new Uint32Array([1, 2]);
    const invalidInputs = [
      null,
      undefined,
      [1, 2],
      new Int32Array([1, 2]),
      new Uint16Array([1, 2]),
      new Uint8Array([1, 2]),
      new BigUint64Array([1n, 2n]),
      42,
      'mask',
      { length: 2, 0: 1, 1: 2 },
    ];

    for (const bad of invalidInputs) {
      assert.throws(() => andMask32Series(bad, valid), TypeError);
      assert.throws(() => andMask32Series(valid, bad), TypeError);
    }
  });

  it('throws RangeError for mismatched Uint32Array lengths', () => {
    assert.throws(
      () => andMask32Series(new Uint32Array(2), new Uint32Array(3)),
      RangeError
    );
    assert.throws(
      () => andMask32Series(new Uint32Array(0), new Uint32Array(1)),
      RangeError
    );
    assert.throws(
      () => andMask32Series(new Uint32Array(5), new Uint32Array(4)),
      RangeError
    );
  });
});
