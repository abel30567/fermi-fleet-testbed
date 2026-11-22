import { describe, it } from 'node:test';
import assert from 'node:assert';
import { multiplyBigIntIterative } from './multiplyBigIntIterative.js';

describe('multiplyBigIntIterative', () => {
  it('multiplies normal positive BigInts', () => {
    assert.strictEqual(multiplyBigIntIterative(2n, 3n), 6n);
    assert.strictEqual(multiplyBigIntIterative(6n, 7n), 42n);
    assert.strictEqual(multiplyBigIntIterative(123n, 456n), 56088n);
    assert.strictEqual(multiplyBigIntIterative(999999n, 1000001n), 999999999999n);
    assert.strictEqual(multiplyBigIntIterative(104729n, 1299709n), 136117223861n);
  });

  it('handles zero edge cases', () => {
    assert.strictEqual(multiplyBigIntIterative(0n, 0n), 0n);
    assert.strictEqual(multiplyBigIntIterative(0n, 42n), 0n);
    assert.strictEqual(multiplyBigIntIterative(42n, 0n), 0n);
    assert.strictEqual(multiplyBigIntIterative(0n, -999999999999999999999n), 0n);
    assert.strictEqual(multiplyBigIntIterative(-999999999999999999999n, 0n), 0n);
  });

  it('handles identity and sign-flip edge cases (1n and -1n)', () => {
    assert.strictEqual(multiplyBigIntIterative(1n, 1n), 1n);
    assert.strictEqual(multiplyBigIntIterative(1n, 9876543210123456789n), 9876543210123456789n);
    assert.strictEqual(multiplyBigIntIterative(9876543210123456789n, 1n), 9876543210123456789n);
    assert.strictEqual(multiplyBigIntIterative(-1n, 1n), -1n);
    assert.strictEqual(multiplyBigIntIterative(1n, -1n), -1n);
    assert.strictEqual(multiplyBigIntIterative(-1n, -1n), 1n);
    assert.strictEqual(multiplyBigIntIterative(-1n, 123456789n), -123456789n);
    assert.strictEqual(multiplyBigIntIterative(123456789n, -1n), -123456789n);
    assert.strictEqual(multiplyBigIntIterative(-1n, -123456789n), 123456789n);
  });

  it('handles negative values in all sign combinations', () => {
    assert.strictEqual(multiplyBigIntIterative(-7n, 8n), -56n);
    assert.strictEqual(multiplyBigIntIterative(7n, -8n), -56n);
    assert.strictEqual(multiplyBigIntIterative(-7n, -8n), 56n);
    assert.strictEqual(multiplyBigIntIterative(-123456789n, 987654321n), -121932631112635269n);
    assert.strictEqual(multiplyBigIntIterative(-123456789n, -987654321n), 121932631112635269n);
  });

  it('handles very large BigInts (> 2^128)', () => {
    const pow128 = 1n << 128n;
    const pow256 = 1n << 256n;
    const mersenne127 = (1n << 127n) - 1n;
    const hugeA = (1n << 200n) + 0xdeadbeefcafebabe123456789abcdef0n;
    const hugeB = (1n << 180n) + 0xfedcba9876543210fedcba9876543210n;

    assert.strictEqual(multiplyBigIntIterative(pow128, pow128), pow256);
    assert.strictEqual(multiplyBigIntIterative(pow128 + 1n, pow128 - 1n), pow256 - 1n);
    assert.strictEqual(multiplyBigIntIterative(-pow128, pow128), -pow256);
    assert.strictEqual(multiplyBigIntIterative(-pow128, -pow128), pow256);
    assert.strictEqual(multiplyBigIntIterative(mersenne127, mersenne127), mersenne127 * mersenne127);
    assert.strictEqual(multiplyBigIntIterative(hugeA, hugeB), hugeA * hugeB);
    assert.strictEqual(multiplyBigIntIterative(hugeA, 3n), hugeA * 3n);
    assert.strictEqual(multiplyBigIntIterative(3n, hugeA), 3n * hugeA);
    assert.strictEqual(multiplyBigIntIterative(10n ** 60n, 10n ** 60n), 10n ** 120n);
  });

  it('throws TypeError on invalid non-BigInt inputs', () => {
    const invalidValues = [
      0,
      1,
      42,
      -5,
      3.14,
      NaN,
      Infinity,
      -Infinity,
      '10',
      '0n',
      null,
      undefined,
      true,
      false,
      {},
      [],
      Symbol('x'),
    ];

    for (const bad of invalidValues) {
      assert.throws(() => multiplyBigIntIterative(bad, 1n), TypeError);
      assert.throws(() => multiplyBigIntIterative(1n, bad), TypeError);
    }

    assert.throws(() => multiplyBigIntIterative(), TypeError);
    assert.throws(() => multiplyBigIntIterative(1n), TypeError);
    assert.throws(() => multiplyBigIntIterative(2, 3), TypeError);
  });

  it('cross-checks against native * operator across diverse values', () => {
    const samples = [
      0n,
      1n,
      -1n,
      2n,
      -2n,
      3n,
      -17n,
      255n,
      256n,
      -1024n,
      65537n,
      (1n << 64n) - 1n,
      -(1n << 64n),
      (1n << 128n) + 123456789012345678901234567890n,
      -((1n << 192n) - 98765432109876543210987654321n),
      (1n << 300n) - 1n,
    ];

    for (const a of samples) {
      for (const b of samples) {
        assert.strictEqual(
          multiplyBigIntIterative(a, b),
          a * b,
          `Mismatch for a=${a}, b=${b}`
        );
      }
    }
  });

  it('satisfies algebraic laws (commutativity, associativity, distributivity)', () => {
    const triples = [
      [3n, 5n, 7n],
      [-11n, 13n, -19n],
      [0n, 12345n, -67890n],
      [1n << 130n, (1n << 129n) - 1n, -((1n << 128n) + 42n)],
      [10n ** 50n + 7n, -(10n ** 45n + 3n), 10n ** 40n + 11n],
    ];

    for (const [a, b, c] of triples) {
      // Commutativity: a * b === b * a
      assert.strictEqual(
        multiplyBigIntIterative(a, b),
        multiplyBigIntIterative(b, a)
      );

      // Associativity: (a * b) * c === a * (b * c)
      assert.strictEqual(
        multiplyBigIntIterative(multiplyBigIntIterative(a, b), c),
        multiplyBigIntIterative(a, multiplyBigIntIterative(b, c))
      );

      // Distributive law: a * (b + c) === a * b + a * c
      assert.strictEqual(
        multiplyBigIntIterative(a, b + c),
        multiplyBigIntIterative(a, b) + multiplyBigIntIterative(a, c)
      );
    }
  });
});
