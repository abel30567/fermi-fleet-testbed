import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyBigIntSeries } from './multiplyBigIntSeries.js';

describe('multiplyBigIntSeries', () => {
  describe('normal cases', () => {
    it('multiplies small positive integers accurately', () => {
      assert.equal(multiplyBigIntSeries(1n, 1n), 1n);
      assert.equal(multiplyBigIntSeries(6n, 7n), 42n);
      assert.equal(multiplyBigIntSeries(13n, 17n), 221n);
      assert.equal(multiplyBigIntSeries(12345n, 67890n), 838102050n);
    });

    it('handles negative and mixed-sign operands', () => {
      assert.equal(multiplyBigIntSeries(-6n, 7n), -42n);
      assert.equal(multiplyBigIntSeries(6n, -7n), -42n);
      assert.equal(multiplyBigIntSeries(-6n, -7n), 42n);
      assert.equal(multiplyBigIntSeries(-1n, 99999999999999999999n), -99999999999999999999n);
      assert.equal(multiplyBigIntSeries(-1n, -1n), 1n);
    });

    it('handles powers of two and asymmetric magnitudes', () => {
      assert.equal(multiplyBigIntSeries(1n << 64n, 1n << 64n), 1n << 128n);
      assert.equal(multiplyBigIntSeries(3n, 1n << 200n), 3n * (1n << 200n));
      assert.equal(multiplyBigIntSeries(1n << 200n, 3n), (1n << 200n) * 3n);
    });
  });

  describe('edge cases', () => {
    it('returns 0n when either or both operands are 0n', () => {
      assert.equal(multiplyBigIntSeries(0n, 0n), 0n);
      assert.equal(multiplyBigIntSeries(0n, 12345678901234567890n), 0n);
      assert.equal(multiplyBigIntSeries(-12345678901234567890n, 0n), 0n);
      assert.equal(multiplyBigIntSeries(-0n, 5n), 0n);
    });

    it('handles Mersenne numbers (all-ones bit patterns) and large 256-bit / 512-bit BigInts', () => {
      const m256 = (1n << 256n) - 1n;
      const m127 = (1n << 127n) - 1n;
      assert.equal(multiplyBigIntSeries(m256, m256), m256 * m256);
      assert.equal(multiplyBigIntSeries(m256, -m127), m256 * -m127);

      const bigA = 0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n;
      const bigB = 0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0n;
      assert.equal(multiplyBigIntSeries(bigA, bigB), bigA * bigB);
      assert.equal(multiplyBigIntSeries(-bigA, bigB), -bigA * bigB);
      assert.equal(multiplyBigIntSeries(-bigA, -bigB), bigA * bigB);

      const big512 = (1n << 512n) + 123456789012345678901234567890n;
      assert.equal(multiplyBigIntSeries(big512, bigA), big512 * bigA);
    });

    it('supports fixed-point 10^18 scaled BigInt arithmetic cleanly', () => {
      const SCALE = 10n ** 18n;
      const a = 3n * SCALE + 141592653589793238n; // ~pi * 10^18
      const b = 2n * SCALE;
      assert.equal(multiplyBigIntSeries(a, b) / SCALE, 6283185307179586476n);
    });
  });

  describe('input validation', () => {
    const invalidValues = [
      0,
      42,
      -3.14,
      NaN,
      Infinity,
      -Infinity,
      '123',
      '123n',
      true,
      false,
      null,
      undefined,
      {},
      [1n],
      Symbol('1'),
      Object(1n),
    ];

    it('throws TypeError when first argument is not a bigint', () => {
      for (const bad of invalidValues) {
        assert.throws(
          () => multiplyBigIntSeries(bad, 1n),
          { name: 'TypeError' },
          `Expected TypeError for a=${String(bad)}`
        );
      }
    });

    it('throws TypeError when second argument is not a bigint', () => {
      for (const bad of invalidValues) {
        assert.throws(
          () => multiplyBigIntSeries(1n, bad),
          { name: 'TypeError' },
          `Expected TypeError for b=${String(bad)}`
        );
      }
    });

    it('throws TypeError when called with missing arguments', () => {
      assert.throws(() => multiplyBigIntSeries(), { name: 'TypeError' });
      assert.throws(() => multiplyBigIntSeries(10n), { name: 'TypeError' });
    });
  });

  describe('algebraic identities and independent cross-checks', () => {
    const samples = [
      0n,
      1n,
      -1n,
      2n,
      -17n,
      255n,
      -65537n,
      10n ** 18n,
      -(10n ** 18n) + 7n,
      (1n << 128n) - 159n,
      -((1n << 255n) - 19n),
      0x9e3779b97f4a7c15f39cc0605cedc8341082276bf3a27251f86c6a11d0c18e95n,
      -0xc0ffee123456789abcdef0123456789abcdef0123456789abcdef0123456789an,
    ];

    it('matches native a * b across all sample pairs', () => {
      for (const a of samples) {
        for (const b of samples) {
          assert.equal(multiplyBigIntSeries(a, b), a * b);
        }
      }
    });

    it('satisfies commutativity: f(a, b) === f(b, a)', () => {
      for (const a of samples) {
        for (const b of samples) {
          assert.equal(multiplyBigIntSeries(a, b), multiplyBigIntSeries(b, a));
        }
      }
    });

    it('satisfies distributivity: a*(b + c) === a*b + a*c', () => {
      for (let i = 0; i < samples.length; i++) {
        const a = samples[i];
        const b = samples[(i + 3) % samples.length];
        const c = samples[(i + 7) % samples.length];
        assert.equal(
          multiplyBigIntSeries(a, b + c),
          multiplyBigIntSeries(a, b) + multiplyBigIntSeries(a, c)
        );
      }
    });

    it('satisfies associativity: (a*b)*c === a*(b*c)', () => {
      for (let i = 0; i < samples.length; i++) {
        const a = samples[i];
        const b = samples[(i + 4) % samples.length];
        const c = samples[(i + 9) % samples.length];
        assert.equal(
          multiplyBigIntSeries(multiplyBigIntSeries(a, b), c),
          multiplyBigIntSeries(a, multiplyBigIntSeries(b, c))
        );
      }
    });

    it('matches the quarter-square identity: ((a + b)^2 - (a - b)^2) / 4', () => {
      for (const a of samples) {
        for (const b of samples) {
          const sum = a + b;
          const diff = a - b;
          const quarterSquare = (sum ** 2n - diff ** 2n) / 4n;
          assert.equal(multiplyBigIntSeries(a, b), quarterSquare);
        }
      }
    });
  });
});
