import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionMask32Series } from './intersectionMask32Series.js';

/**
 * Reference bit-series expansion: sum_{k=0}^{31} bit_k(x) * bit_k(y) * 2^k
 */
function bitSeriesAnd32(x, y) {
  let sum = 0;
  let weight = 1;
  let ux = x >>> 0;
  let uy = y >>> 0;
  for (let k = 0; k < 32; k++) {
    const bx = ux % 2;
    const by = uy % 2;
    if (bx === 1 && by === 1) {
      sum += weight;
    }
    ux = Math.floor(ux / 2);
    uy = Math.floor(uy / 2);
    weight *= 2;
  }
  return sum;
}

/**
 * Convert a Uint32Array bitmask into a Set of active bit indices.
 */
function maskToSet(mask) {
  const result = new Set();
  for (let w = 0; w < mask.length; w++) {
    const word = mask[w];
    for (let b = 0; b < 32; b++) {
      if (((word >>> b) & 1) === 1) {
        result.add(w * 32 + b);
      }
    }
  }
  return result;
}

/**
 * Convert a Set of bit indices back into a Uint32Array of the given word length.
 */
function setToMask(set, wordCount) {
  const out = new Uint32Array(wordCount);
  for (const idx of set) {
    const w = Math.floor(idx / 32);
    const b = idx % 32;
    out[w] = (out[w] | (1 << b)) >>> 0;
  }
  return out;
}

/**
 * Deterministic PRNG (mulberry32) for reproducible cross-check tests.
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

describe('intersectionMask32Series', () => {
  it('computes single-word and multi-word intersections accurately', () => {
    const a = new Uint32Array([0b11001010, 0xf0f0f0f0, 0x12345678]);
    const b = new Uint32Array([0b10101100, 0x3c3c3c3c, 0x87654321]);
    const result = intersectionMask32Series(a, b);

    assert.ok(result instanceof Uint32Array);
    assert.deepEqual(result, new Uint32Array([0b10001000, 0x30303030, 0x02244220]));
  });

  it('handles high-bit (0x80000000) and full-word (0xFFFFFFFF) patterns without signed overflow', () => {
    const a = new Uint32Array([0xffffffff, 0x80000000, 0x80000001, 0x7fffffff]);
    const b = new Uint32Array([0xffffffff, 0x80000000, 0x80000000, 0x80000000]);
    const result = intersectionMask32Series(a, b);

    assert.deepEqual(result, new Uint32Array([0xffffffff, 0x80000000, 0x80000000, 0x00000000]));
  });

  it('supports variadic n-ary intersection across three or more masks', () => {
    const a = new Uint32Array([0xffffffff, 0x00ff00ff, 0xaaaa5555]);
    const b = new Uint32Array([0xf0f0f0f0, 0x0f0f0f0f, 0xffff0000]);
    const c = new Uint32Array([0x33333333, 0x000f000f, 0x0000ffff]);
    const d = new Uint32Array([0x11111111, 0xffffffff, 0xffffffff]);

    const result = intersectionMask32Series(a, b, c, d);
    assert.deepEqual(result, new Uint32Array([0x10101010, 0x000f000f, 0x00000000]));
  });

  it('handles empty Uint32Array masks', () => {
    const a = new Uint32Array(0);
    const b = new Uint32Array(0);
    const result = intersectionMask32Series(a, b);

    assert.ok(result instanceof Uint32Array);
    assert.equal(result.length, 0);
    assert.notEqual(result, a);
    assert.notEqual(result, b);
  });

  it('satisfies Boolean algebra laws: idempotence, disjointness, annihilator, identity, commutativity, associativity', () => {
    const a = new Uint32Array([0xdeadbeef, 0x13579bdf, 0x00000000]);
    const b = new Uint32Array([0xcafebabe, 0x2468ace0, 0xffffffff]);
    const c = new Uint32Array([0x89abcdef, 0xfedcba98, 0x55aa55aa]);
    const zeros = new Uint32Array([0x00000000, 0x00000000, 0x00000000]);
    const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]);

    // Idempotence and distinct return buffer
    const aa = intersectionMask32Series(a, a);
    assert.deepEqual(aa, a);
    assert.notEqual(aa, a);

    // Disjoint complementary words
    const altA = new Uint32Array([0xaaaaaaaa, 0xffff0000]);
    const altB = new Uint32Array([0x55555555, 0x0000ffff]);
    assert.deepEqual(intersectionMask32Series(altA, altB), new Uint32Array([0, 0]));

    // Annihilator (0) and identity (all-ones)
    assert.deepEqual(intersectionMask32Series(a, zeros), zeros);
    assert.deepEqual(intersectionMask32Series(a, ones), a);

    // Commutativity
    assert.deepEqual(intersectionMask32Series(a, b), intersectionMask32Series(b, a));

    // Associativity
    const left = intersectionMask32Series(intersectionMask32Series(a, b), c);
    const right = intersectionMask32Series(a, intersectionMask32Series(b, c));
    const direct = intersectionMask32Series(a, b, c);
    assert.deepEqual(left, right);
    assert.deepEqual(left, direct);
  });

  it('does not mutate inputs, including subarray views over a shared ArrayBuffer', () => {
    const backing = new Uint32Array([0xff00ff00, 0x0f0f0f0f, 0xf0f0f0f0, 0x00ff00ff]);
    const snapshot = new Uint32Array(backing);
    const viewA = backing.subarray(0, 3);
    const viewB = backing.subarray(1, 4);

    const result = intersectionMask32Series(viewA, viewB);

    assert.deepEqual(result, new Uint32Array([0x0f000f00, 0x00000000, 0x00f000f0]));
    assert.deepEqual(backing, snapshot);
  });

  it('throws TypeError for missing or non-Uint32Array arguments', () => {
    const valid = new Uint32Array([1, 2]);

    assert.throws(() => intersectionMask32Series(), TypeError);
    assert.throws(() => intersectionMask32Series(valid), TypeError);

    const badValues = [
      null,
      undefined,
      42,
      '1234',
      [1, 2],
      { length: 2, 0: 1, 1: 2 },
      new Int32Array([1, 2]),
      new Uint16Array([1, 2]),
      new Uint8Array([1, 2]),
      new BigUint64Array([1n, 2n]),
    ];

    for (const bad of badValues) {
      assert.throws(() => intersectionMask32Series(bad, valid), TypeError);
      assert.throws(() => intersectionMask32Series(valid, bad), TypeError);
      assert.throws(() => intersectionMask32Series(valid, valid, bad), TypeError);
    }
  });

  it('throws RangeError on mismatched bitmask lengths', () => {
    const a = new Uint32Array([1, 2, 3]);
    const b = new Uint32Array([1, 2]);
    const c = new Uint32Array([1, 2, 3, 4]);

    assert.throws(() => intersectionMask32Series(a, b), RangeError);
    assert.throws(() => intersectionMask32Series(b, a), RangeError);
    assert.throws(() => intersectionMask32Series(a, a, c), RangeError);
    assert.throws(() => intersectionMask32Series(new Uint32Array(0), b), RangeError);
  });

  it('cross-checks against bitwise AND, De Morgan identity, and bit-series expansion over pseudorandom inputs', () => {
    const rng = makeRng(0x5eed2026);
    const wordCount = 16;

    for (let trial = 0; trial < 50; trial++) {
      const a = new Uint32Array(wordCount);
      const b = new Uint32Array(wordCount);
      for (let i = 0; i < wordCount; i++) {
        a[i] = rng();
        b[i] = rng();
      }

      const actual = intersectionMask32Series(a, b);
      for (let i = 0; i < wordCount; i++) {
        const expectedBitwise = (a[i] & b[i]) >>> 0;
        const expectedDeMorgan = (~((~a[i]) | (~b[i]))) >>> 0;
        const expectedSeries = bitSeriesAnd32(a[i], b[i]);

        assert.equal(actual[i], expectedBitwise);
        assert.equal(actual[i], expectedDeMorgan);
        assert.equal(actual[i], expectedSeries);
      }
    }
  });

  it('cross-checks against explicit JS Set intersection over element indices', () => {
    const rng = makeRng(0xc0ffee42);
    const wordCount = 6; // 192-bit universe

    for (let trial = 0; trial < 20; trial++) {
      const masks = Array.from({ length: 3 }, () => {
        const arr = new Uint32Array(wordCount);
        for (let i = 0; i < wordCount; i++) {
          arr[i] = rng();
        }
        return arr;
      });

      const sets = masks.map(maskToSet);
      const setIntersection = new Set(
        [...sets[0]].filter((el) => sets[1].has(el) && sets[2].has(el))
      );
      const expectedMask = setToMask(setIntersection, wordCount);
      const actualMask = intersectionMask32Series(...masks);

      assert.deepEqual(actualMask, expectedMask);
    }
  });
});
