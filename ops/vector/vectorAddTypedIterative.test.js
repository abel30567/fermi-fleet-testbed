import test from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddTypedIterative } from './vectorAddTypedIterative.js';

test('adds positive and decimal Float64Array vectors element-wise', () => {
  const a = new Float64Array([1, 2.5, 3.25, 4]);
  const b = new Float64Array([10, 0.5, 1.75, 6]);
  const result = vectorAddTypedIterative(a, b);

  assert.ok(result instanceof Float64Array);
  assert.deepStrictEqual(result, new Float64Array([11, 3, 5, 10]));
});

test('adds negative and mixed-sign vectors without mutating inputs', () => {
  const a = new Float64Array([-5, 0, 3.5, -1.25]);
  const b = new Float64Array([5, -2.5, -3.5, -0.75]);
  const aCopy = new Float64Array(a);
  const bCopy = new Float64Array(b);

  const result = vectorAddTypedIterative(a, b);

  assert.deepStrictEqual(result, new Float64Array([0, -2.5, 0, -2]));
  assert.notEqual(result, a);
  assert.notEqual(result, b);
  assert.deepStrictEqual(a, aCopy);
  assert.deepStrictEqual(b, bCopy);
});

test('handles empty and single-element Float64Arrays', () => {
  const emptyResult = vectorAddTypedIterative(new Float64Array(0), new Float64Array(0));
  assert.ok(emptyResult instanceof Float64Array);
  assert.equal(emptyResult.length, 0);

  const singleResult = vectorAddTypedIterative(new Float64Array([42.5]), new Float64Array([-2.5]));
  assert.deepStrictEqual(singleResult, new Float64Array([40]));
});

test('handles special IEEE 754 values (Infinity, -Infinity, NaN, -0, extremes)', () => {
  const a = new Float64Array([Infinity, -Infinity, Infinity, NaN, -0, Number.MAX_VALUE]);
  const b = new Float64Array([1, -1, -Infinity, 5, -0, Number.MAX_VALUE]);
  const result = vectorAddTypedIterative(a, b);

  assert.equal(result[0], Infinity);
  assert.equal(result[1], -Infinity);
  assert.ok(Number.isNaN(result[2]));
  assert.ok(Number.isNaN(result[3]));
  assert.ok(Object.is(result[4], -0));
  assert.equal(result[5], Infinity);
});

test('handles subarray views with non-zero byteOffset and aliased inputs', () => {
  const backing = new Float64Array([100, 1, 2, 3, 4, 5, 200]);
  const viewA = backing.subarray(1, 4); // [1, 2, 3]
  const viewB = backing.subarray(3, 6); // [3, 4, 5]

  assert.deepStrictEqual(vectorAddTypedIterative(viewA, viewB), new Float64Array([4, 6, 8]));
  assert.deepStrictEqual(vectorAddTypedIterative(viewA, viewA), new Float64Array([2, 4, 6]));
});

test('throws TypeError for non-Float64Array arguments', () => {
  const valid = new Float64Array([1, 2]);
  const invalidValues = [
    [1, 2],
    new Float32Array([1, 2]),
    new Int32Array([1, 2]),
    null,
    undefined,
    42,
    '12',
    { 0: 1, 1: 2, length: 2 },
  ];

  for (const invalid of invalidValues) {
    assert.throws(() => vectorAddTypedIterative(invalid, valid), TypeError);
    assert.throws(() => vectorAddTypedIterative(valid, invalid), TypeError);
  }
});

test('throws RangeError for mismatched Float64Array lengths', () => {
  assert.throws(
    () => vectorAddTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
    RangeError
  );
  assert.throws(
    () => vectorAddTypedIterative(new Float64Array([1]), new Float64Array(0)),
    RangeError
  );
});

test('cross-checks against independent Array.prototype.map reference and algebraic laws', () => {
  // Deterministic linear congruential generator for reproducible test data
  let state = 0x12345678;
  const nextFloat = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state / 0x100000000 - 0.5) * 1e6;
  };

  for (const length of [0, 1, 7, 64, 513]) {
    const a = new Float64Array(length);
    const b = new Float64Array(length);
    const zero = new Float64Array(length);
    const negA = new Float64Array(length);

    for (let i = 0; i < length; i += 1) {
      a[i] = nextFloat();
      b[i] = nextFloat();
      negA[i] = -a[i];
    }

    const actual = vectorAddTypedIterative(a, b);
    const expected = Float64Array.from(Array.from(a).map((val, idx) => val + b[idx]));

    assert.deepStrictEqual(actual, expected);
    // Commutativity: a + b === b + a
    assert.deepStrictEqual(actual, vectorAddTypedIterative(b, a));
    // Additive identity: a + 0 === a
    assert.deepStrictEqual(vectorAddTypedIterative(a, zero), a);
    // Additive inverse: a + (-a) === 0
    assert.deepStrictEqual(vectorAddTypedIterative(a, negA), zero);
  }
});
