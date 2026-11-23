import test from 'node:test';
import assert from 'node:assert/strict';
import { addTypedRecursive } from './addTypedRecursive.js';

/**
 * Simple iterative reference implementation for independent cross-checking.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceAdd(a, b) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] + b[i];
  }
  return out;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check inputs.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('adds positive numbers of even length', () => {
  const a = new Float64Array([1, 2, 3, 4]);
  const b = new Float64Array([10, 20, 30, 40]);
  const result = addTypedRecursive(a, b);

  assert.ok(result instanceof Float64Array);
  assert.deepStrictEqual(result, new Float64Array([11, 22, 33, 44]));
});

test('adds floating-point numbers of odd length', () => {
  const a = new Float64Array([0.5, 1.25, 2.75, 3.5, 4.125]);
  const b = new Float64Array([1.5, 2.75, 0.25, 6.5, 0.875]);
  const result = addTypedRecursive(a, b);

  assert.deepStrictEqual(result, new Float64Array([2, 4, 3, 10, 5]));
});

test('handles empty Float64Array inputs', () => {
  const a = new Float64Array(0);
  const b = new Float64Array(0);
  const result = addTypedRecursive(a, b);

  assert.ok(result instanceof Float64Array);
  assert.strictEqual(result.length, 0);
  assert.notStrictEqual(result, a);
  assert.notStrictEqual(result, b);
});

test('handles single-element Float64Array inputs', () => {
  const a = new Float64Array([42.5]);
  const b = new Float64Array([-12.5]);
  const result = addTypedRecursive(a, b);

  assert.deepStrictEqual(result, new Float64Array([30]));
});

test('handles negative values and cancellation to zero', () => {
  const a = new Float64Array([-5, -10.5, 7.25, -0, 0]);
  const b = new Float64Array([-3, 10.5, -7.25, -0, -0]);
  const result = addTypedRecursive(a, b);

  assert.strictEqual(result[0], -8);
  assert.strictEqual(result[1], 0);
  assert.strictEqual(result[2], 0);
  assert.ok(Object.is(result[3], -0));
  assert.ok(Object.is(result[4], 0));
});

test('handles non-finite values (NaN, Infinity, -Infinity) and overflow', () => {
  const a = new Float64Array([
    NaN,
    1,
    Infinity,
    -Infinity,
    Infinity,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
  ]);
  const b = new Float64Array([
    5,
    NaN,
    1,
    -1,
    -Infinity,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
  ]);
  const result = addTypedRecursive(a, b);

  assert.ok(Number.isNaN(result[0]));
  assert.ok(Number.isNaN(result[1]));
  assert.strictEqual(result[2], Infinity);
  assert.strictEqual(result[3], -Infinity);
  assert.ok(Number.isNaN(result[4]));
  assert.strictEqual(result[5], Infinity);
  assert.strictEqual(result[6], -Infinity);
});

test('does not mutate inputs and supports aliased inputs (a === b)', () => {
  const a = new Float64Array([1.5, -2.5, 3.5]);
  const b = new Float64Array([4.5, 5.5, -6.5]);
  const aCopy = new Float64Array(a);
  const bCopy = new Float64Array(b);

  const sum = addTypedRecursive(a, b);
  assert.deepStrictEqual(a, aCopy);
  assert.deepStrictEqual(b, bCopy);
  assert.notStrictEqual(sum, a);
  assert.notStrictEqual(sum, b);

  const doubled = addTypedRecursive(a, a);
  assert.deepStrictEqual(doubled, new Float64Array([3, -5, 7]));
  assert.deepStrictEqual(a, aCopy);
});

test('supports Float64Array subarray views with non-zero byteOffset', () => {
  const bufA = new Float64Array([99, 1, 2, 3, 4, 99]);
  const bufB = new Float64Array([88, 10, 20, 30, 40, 88]);
  const viewA = bufA.subarray(1, 5);
  const viewB = bufB.subarray(1, 5);

  const result = addTypedRecursive(viewA, viewB);
  assert.deepStrictEqual(result, new Float64Array([11, 22, 33, 44]));
});

test('throws TypeError for invalid non-Float64Array inputs', () => {
  const valid = new Float64Array([1, 2]);
  const invalidValues = [
    null,
    undefined,
    42,
    '12',
    [1, 2],
    { length: 2, 0: 1, 1: 2 },
    new Float32Array([1, 2]),
    new Int32Array([1, 2]),
    new ArrayBuffer(16),
  ];

  for (const invalid of invalidValues) {
    assert.throws(() => addTypedRecursive(invalid, valid), TypeError);
    assert.throws(() => addTypedRecursive(valid, invalid), TypeError);
  }
  assert.throws(() => addTypedRecursive(), TypeError);
});

test('throws RangeError for mismatched lengths', () => {
  assert.throws(
    () => addTypedRecursive(new Float64Array([1, 2]), new Float64Array([1])),
    RangeError
  );
  assert.throws(
    () => addTypedRecursive(new Float64Array(0), new Float64Array([1])),
    RangeError
  );
  assert.throws(
    () => addTypedRecursive(new Float64Array(5), new Float64Array(6)),
    RangeError
  );
});

test('cross-check against iterative reference across many sizes and random inputs', () => {
  const rand = createPrng(0x20261123);
  const sizes = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65, 127, 128,
    129, 255, 256, 257, 1000, 4097, 16384,
  ];

  for (const n of sizes) {
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = (rand() - 0.5) * 1e6;
      b[i] = (rand() - 0.5) * 1e6;
    }

    const actual = addTypedRecursive(a, b);
    const expected = referenceAdd(a, b);

    assert.strictEqual(actual.length, expected.length);
    for (let i = 0; i < n; i++) {
      assert.ok(
        Object.is(actual[i], expected[i]),
        `mismatch at size=${n}, index=${i}: ${actual[i]} !== ${expected[i]}`
      );
    }
  }
});

test('satisfies commutativity (a + b === b + a) on randomized vectors', () => {
  const rand = createPrng(0xdeadbeef);
  const a = new Float64Array(513);
  const b = new Float64Array(513);
  for (let i = 0; i < a.length; i++) {
    a[i] = (rand() - 0.5) * 1e4;
    b[i] = (rand() - 0.5) * 1e4;
  }

  assert.deepStrictEqual(addTypedRecursive(a, b), addTypedRecursive(b, a));
});
