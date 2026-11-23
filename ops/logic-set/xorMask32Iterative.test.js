import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorMask32Iterative } from './xorMask32Iterative.js';

/**
 * Helper: packs a Uint32Array (little-endian 32-bit words) into a non-negative BigInt.
 * @param {Uint32Array} words
 * @returns {bigint}
 */
function uint32ArrayToBigInt(words) {
  let value = 0n;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    value = (value << 32n) | BigInt(words[i]);
  }
  return value;
}

/**
 * Helper: unpacks a non-negative BigInt into a Uint32Array of `length` 32-bit words.
 * @param {bigint} value
 * @param {number} length
 * @returns {Uint32Array}
 */
function bigIntToUint32Array(value, length) {
  const out = new Uint32Array(length);
  let remaining = value;
  for (let i = 0; i < length; i += 1) {
    out[i] = Number(remaining & 0xffffffffn);
    remaining >>= 32n;
  }
  return out;
}

/**
 * Deterministic PRNG (xorshift32) for reproducible property tests.
 * @param {number} seed
 * @param {number} length
 * @returns {Uint32Array}
 */
function deterministicWords(seed, length) {
  let state = seed >>> 0 || 1;
  const out = new Uint32Array(length);
  for (let i = 0; i < length; i += 1) {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    out[i] = state >>> 0;
  }
  return out;
}

describe('xorMask32Iterative', () => {
  it('computes bitwise XOR for single-word and multi-word Uint32Arrays', () => {
    const a = new Uint32Array([0x0f0f0f0f, 0xaaaaaaaa, 0x12345678, 0xffffffff]);
    const b = new Uint32Array([0x00ff00ff, 0x55555555, 0x87654321, 0x00000000]);
    const expected = new Uint32Array([0x0ff00ff0, 0xffffffff, 0x95511559, 0xffffffff]);

    const result = xorMask32Iterative(a, b);
    assert.ok(result instanceof Uint32Array);
    assert.deepEqual(result, expected);
  });

  it('preserves identity when XORed with an all-zero mask', () => {
    const a = new Uint32Array([0, 1, 0x7fffffff, 0x80000000, 0xffffffff]);
    const zeros = new Uint32Array(a.length);

    assert.deepEqual(xorMask32Iterative(a, zeros), a);
    assert.deepEqual(xorMask32Iterative(zeros, a), a);
  });

  it('handles empty Uint32Array inputs', () => {
    const a = new Uint32Array(0);
    const b = new Uint32Array(0);
    const result = xorMask32Iterative(a, b);

    assert.ok(result instanceof Uint32Array);
    assert.equal(result.length, 0);
    assert.notEqual(result, a);
    assert.notEqual(result, b);
  });

  it('produces all zeros on self-XOR (same reference and equal copy)', () => {
    const a = new Uint32Array([0x00000000, 0x00000001, 0x80000000, 0xdeadbeef, 0xffffffff]);
    const copy = new Uint32Array(a);
    const zeros = new Uint32Array(a.length);

    const sameRefResult = xorMask32Iterative(a, a);
    assert.deepEqual(sameRefResult, zeros);
    assert.notEqual(sameRefResult, a);

    const copyResult = xorMask32Iterative(a, copy);
    assert.deepEqual(copyResult, zeros);
  });

  it('handles high bit (0x80000000) without signed 32-bit overflow artifacts', () => {
    const a = new Uint32Array([0x80000000, 0x80000000, 0x80000000, 0x7fffffff]);
    const b = new Uint32Array([0x00000000, 0x80000000, 0x7fffffff, 0xffffffff]);

    const result = xorMask32Iterative(a, b);
    assert.equal(result[0], 0x80000000);
    assert.equal(result[1], 0x00000000);
    assert.equal(result[2], 0xffffffff);
    assert.equal(result[3], 0x80000000);
  });

  it('handles Uint32Array subarrays with non-zero byteOffset', () => {
    const backing = new Uint32Array([0x11111111, 0xf0f0f0f0, 0x80000001, 0x0f0f0f0f, 0x80000002, 0x22222222]);
    const a = backing.subarray(1, 3); // [0xf0f0f0f0, 0x80000001]
    const b = backing.subarray(3, 5); // [0x0f0f0f0f, 0x80000002]

    const result = xorMask32Iterative(a, b);
    assert.deepEqual(result, new Uint32Array([0xffffffff, 0x00000003]));
  });

  it('does not mutate inputs and returns an independent Uint32Array', () => {
    const a = new Uint32Array([0x12345678, 0x9abcdef0]);
    const b = new Uint32Array([0xfedcba98, 0x76543210]);
    const aSnapshot = new Uint32Array(a);
    const bSnapshot = new Uint32Array(b);

    const result = xorMask32Iterative(a, b);
    assert.notEqual(result, a);
    assert.notEqual(result, b);
    assert.deepEqual(a, aSnapshot);
    assert.deepEqual(b, bSnapshot);

    result[0] = 0;
    result[1] = 0;
    assert.deepEqual(a, aSnapshot);
    assert.deepEqual(b, bSnapshot);
  });

  it('throws TypeError for non-Uint32Array inputs', () => {
    const valid = new Uint32Array([1, 2]);
    const invalidInputs = [
      null,
      undefined,
      [1, 2],
      new Int32Array([1, 2]),
      new Uint8Array([1, 2]),
      new Uint16Array([1, 2]),
      new BigUint64Array([1n, 2n]),
      new ArrayBuffer(8),
      42,
      '12',
      { length: 2, 0: 1, 1: 2 },
    ];

    for (const bad of invalidInputs) {
      assert.throws(() => xorMask32Iterative(bad, valid), { name: 'TypeError' });
      assert.throws(() => xorMask32Iterative(valid, bad), { name: 'TypeError' });
    }
  });

  it('throws RangeError when Uint32Array lengths differ', () => {
    assert.throws(
      () => xorMask32Iterative(new Uint32Array([1, 2]), new Uint32Array([1, 2, 3])),
      { name: 'RangeError' },
    );
    assert.throws(
      () => xorMask32Iterative(new Uint32Array(0), new Uint32Array([0])),
      { name: 'RangeError' },
    );
    assert.throws(
      () => xorMask32Iterative(new Uint32Array([0]), new Uint32Array(0)),
      { name: 'RangeError' },
    );
  });

  it('satisfies algebraic laws: involution, commutativity, and associativity', () => {
    for (const length of [0, 1, 7, 32, 129]) {
      const a = deterministicWords(0x13579bdf + length, length);
      const b = deterministicWords(0x2468ace0 + length, length);
      const c = deterministicWords(0xdeadbeef + length, length);

      // Involution: xor(xor(a, b), b) == a
      assert.deepEqual(xorMask32Iterative(xorMask32Iterative(a, b), b), a);
      assert.deepEqual(xorMask32Iterative(a, xorMask32Iterative(a, b)), b);

      // Commutativity: xor(a, b) == xor(b, a)
      assert.deepEqual(xorMask32Iterative(a, b), xorMask32Iterative(b, a));

      // Associativity: xor(xor(a, b), c) == xor(a, xor(b, c))
      assert.deepEqual(
        xorMask32Iterative(xorMask32Iterative(a, b), c),
        xorMask32Iterative(a, xorMask32Iterative(b, c)),
      );
    }
  });

  it('matches independent BigInt bitwise XOR across varied sizes and bit patterns', () => {
    const cases = [
      [new Uint32Array(0), new Uint32Array(0)],
      [new Uint32Array([0x80000000]), new Uint32Array([0xffffffff])],
      [
        new Uint32Array([0x00000000, 0x80000000, 0x7fffffff, 0xffffffff]),
        new Uint32Array([0xffffffff, 0x80000000, 0x80000000, 0x00000001]),
      ],
      [deterministicWords(101, 16), deterministicWords(202, 16)],
      [deterministicWords(303, 65), deterministicWords(404, 65)],
    ];

    for (const [a, b] of cases) {
      const actual = xorMask32Iterative(a, b);
      const expectedBigInt = uint32ArrayToBigInt(a) ^ uint32ArrayToBigInt(b);
      const expected = bigIntToUint32Array(expectedBigInt, a.length);
      assert.deepEqual(actual, expected);
    }
  });
});
