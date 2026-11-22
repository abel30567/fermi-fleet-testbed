import test from 'node:test';
import assert from 'node:assert/strict';
import { subtractBigIntSeries } from './subtractBigIntSeries.js';

const SCALE = 10n ** 18n;

test('normal cases across all sign combinations', () => {
  assert.equal(subtractBigIntSeries(10n, 3n), 7n);
  assert.equal(subtractBigIntSeries(3n, 10n), -7n);
  assert.equal(subtractBigIntSeries(-10n, -3n), -7n);
  assert.equal(subtractBigIntSeries(-3n, -10n), 7n);
  assert.equal(subtractBigIntSeries(10n, -3n), 13n);
  assert.equal(subtractBigIntSeries(-10n, 3n), -13n);
  assert.equal(subtractBigIntSeries(42n, 42n), 0n);
  assert.equal(subtractBigIntSeries(-42n, -42n), 0n);
});

test('fixed-point BigInt values scaled by 10^18', () => {
  const onePointFive = 15n * 10n ** 17n;
  const zeroPointSevenFive = 75n * 10n ** 16n;
  assert.equal(
    subtractBigIntSeries(onePointFive, zeroPointSevenFive),
    zeroPointSevenFive,
  );

  const piScaled = 3_141592653589793238n;
  const eScaled = 2_718281828459045235n;
  assert.equal(
    subtractBigIntSeries(piScaled, eScaled),
    423310825130748003n,
  );
  assert.equal(
    subtractBigIntSeries(eScaled, piScaled),
    -423310825130748003n,
  );
  assert.equal(subtractBigIntSeries(SCALE, 1n), 999999999999999999n);
});

test('edge cases: zeros, powers of two, and full borrow/carry cascades', () => {
  assert.equal(subtractBigIntSeries(0n, 0n), 0n);
  assert.equal(subtractBigIntSeries(0n, 1n), -1n);
  assert.equal(subtractBigIntSeries(0n, -1n), 1n);
  assert.equal(subtractBigIntSeries(1n, 0n), 1n);
  assert.equal(subtractBigIntSeries(-1n, 0n), -1n);

  // Full borrow cascade across 256 bits: 2^256 - 1
  const pow256 = 1n << 256n;
  const mask256 = pow256 - 1n;
  assert.equal(subtractBigIntSeries(pow256, 1n), mask256);
  assert.equal(subtractBigIntSeries(1n, pow256), -mask256);
  assert.equal(subtractBigIntSeries(-pow256, -1n), -mask256);
  assert.equal(subtractBigIntSeries(-1n, -pow256), mask256);

  // Full carry cascade across 256 bits: (2^256 - 1) - (-1) = 2^256
  assert.equal(subtractBigIntSeries(mask256, -1n), pow256);
  assert.equal(subtractBigIntSeries(-mask256, 1n), -pow256);

  // Adjacent values around 2^128 and 2^512
  const pow512 = 1n << 512n;
  assert.equal(subtractBigIntSeries(pow512, pow512 - 1n), 1n);
  assert.equal(subtractBigIntSeries(pow512 - 1n, pow512), -1n);
});

test('invalid inputs throw TypeError', () => {
  const invalidValues = [
    0,
    1,
    -1,
    3.14,
    NaN,
    Infinity,
    -Infinity,
    '1',
    '0',
    null,
    undefined,
    true,
    false,
    {},
    [],
    Symbol('1'),
    Object(1n),
  ];

  for (const bad of invalidValues) {
    assert.throws(
      () => subtractBigIntSeries(bad, 1n),
      { name: 'TypeError' },
      `Expected TypeError for a=${String(bad)}`,
    );
    assert.throws(
      () => subtractBigIntSeries(1n, bad),
      { name: 'TypeError' },
      `Expected TypeError for b=${String(bad)}`,
    );
  }

  assert.throws(() => subtractBigIntSeries(), { name: 'TypeError' });
  assert.throws(() => subtractBigIntSeries(1n), { name: 'TypeError' });
});

test('cross-check against native subtraction, anticommutativity, and inverse identity on huge 256-bit+ BigInts', () => {
  const samples = [
    0n,
    1n,
    -1n,
    2n,
    -2n,
    255n,
    -256n,
    SCALE,
    -SCALE,
    (1n << 64n) - 1n,
    -(1n << 64n),
    (1n << 128n) + 0xdeadbeefcafebabe1234567890abcdefn,
    -((1n << 128n) + 0x112233445566778899aabbccddeeff00n),
    (1n << 256n) - 1n,
    -(1n << 256n),
    0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n,
    -0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn,
    (1n << 512n) + (1n << 256n) + 1n,
    -((1n << 512n) - (1n << 128n) + 7n),
  ];

  for (const a of samples) {
    for (const b of samples) {
      const diff = subtractBigIntSeries(a, b);
      // 1. Exact agreement with native BigInt subtraction
      assert.equal(diff, a - b, `Native mismatch for a=${a}, b=${b}`);
      // 2. Anticommutativity: sub(a, b) === -sub(b, a)
      assert.equal(
        diff,
        -subtractBigIntSeries(b, a),
        `Anticommutativity failed for a=${a}, b=${b}`,
      );
      // 3. Additive inverse identity: sub(a, b) + b === a
      assert.equal(
        diff + b,
        a,
        `Inverse identity failed for a=${a}, b=${b}`,
      );
    }
  }
});

test('cross-check telescoping sum identity and pseudo-random 256-bit BigInts', () => {
  // Deterministic 256-bit LCG/xorshift generator
  let state = 0x243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89n;
  const mask256 = (1n << 256n) - 1n;
  const nextSigned256 = () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask256;
    state ^= state >> 13n;
    state = (state * 0x9e3779b97f4a7c15f39cc0605cedc835n) & mask256;
    return (state & (1n << 255n)) !== 0n ? state - (1n << 256n) : state;
  };

  const seq = Array.from({ length: 40 }, () => nextSigned256());

  // Telescoping sum: sum_{i=0}^{n-2} (seq[i+1] - seq[i]) === seq[n-1] - seq[0]
  let telescopingSum = 0n;
  for (let i = 0; i < seq.length - 1; i++) {
    const stepDiff = subtractBigIntSeries(seq[i + 1], seq[i]);
    assert.equal(stepDiff, seq[i + 1] - seq[i]);
    assert.equal(stepDiff, -subtractBigIntSeries(seq[i], seq[i + 1]));
    assert.equal(stepDiff + seq[i], seq[i + 1]);
    telescopingSum += stepDiff;
  }
  assert.equal(
    telescopingSum,
    subtractBigIntSeries(seq[seq.length - 1], seq[0]),
  );
});
