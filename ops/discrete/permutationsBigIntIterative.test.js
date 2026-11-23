import test from 'node:test';
import assert from 'node:assert/strict';
import { permutationsBigIntIterative } from './permutationsBigIntIterative.js';

test('permutationsBigIntIterative: standard small values', () => {
  assert.equal(permutationsBigIntIterative(5n, 3n), 60n);
  assert.equal(permutationsBigIntIterative(6n, 2n), 30n);
  assert.equal(permutationsBigIntIterative(10n, 4n), 5040n);
});

test('permutationsBigIntIterative: edge cases k=0, k=1, k=n, k>n, n=0', () => {
  assert.equal(permutationsBigIntIterative(0n, 0n), 1n);
  assert.equal(permutationsBigIntIterative(0n, 1n), 0n);
  assert.equal(permutationsBigIntIterative(7n, 0n), 1n);
  assert.equal(permutationsBigIntIterative(7n, 1n), 7n);
  assert.equal(permutationsBigIntIterative(5n, 5n), 120n);
  assert.equal(permutationsBigIntIterative(5n, 6n), 0n);
  assert.equal(permutationsBigIntIterative(5n, 100n), 0n);
});

test('permutationsBigIntIterative: large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
  const p30_15 = permutationsBigIntIterative(30n, 15n);
  assert.equal(p30_15, 202843204931727360000n);
  const bigN = 10n ** 18n;
  assert.equal(permutationsBigIntIterative(bigN, 2n), bigN * (bigN - 1n));
});

test('permutationsBigIntIterative: cross-check against factorial ratio n! / (n - k)!', () => {
  const factorial = (m) => {
    let acc = 1n;
    for (let i = 2n; i <= m; i++) acc *= i;
    return acc;
  };
  for (let n = 0n; n <= 20n; n++) {
    for (let k = 0n; k <= n; k++) {
      const expected = factorial(n) / factorial(n - k);
      assert.equal(permutationsBigIntIterative(n, k), expected);
    }
  }
});

test('permutationsBigIntIterative: cross-check recurrence P(n, k) = n * P(n - 1, k - 1)', () => {
  for (let n = 1n; n <= 15n; n++) {
    for (let k = 1n; k <= n; k++) {
      assert.equal(
        permutationsBigIntIterative(n, k),
        n * permutationsBigIntIterative(n - 1n, k - 1n),
      );
    }
  }
});

test('permutationsBigIntIterative: rejects invalid inputs', () => {
  assert.throws(() => permutationsBigIntIterative(5, 3n), TypeError);
  assert.throws(() => permutationsBigIntIterative(5n, 3), TypeError);
  assert.throws(() => permutationsBigIntIterative('5', 3n), TypeError);
  assert.throws(() => permutationsBigIntIterative(null, 0n), TypeError);
  assert.throws(() => permutationsBigIntIterative(-1n, 0n), RangeError);
  assert.throws(() => permutationsBigIntIterative(5n, -1n), RangeError);
  assert.throws(() => permutationsBigIntIterative(-5n, -2n), RangeError);
});
