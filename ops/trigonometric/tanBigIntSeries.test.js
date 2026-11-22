import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tanBigIntSeries } from './tanBigIntSeries.js';

const SCALE = 10n ** 18n;

/**
 * Independent computation of `tan(x) * 10^18` for small integer `x` via
 * Lambert's continued fraction:
 *   tan(x) = x / (1 - x^2 / (3 - x^2 / (5 - x^2 / (7 - ...))))
 * using exact BigInt rational arithmetic (independent of pi and sin/cos series).
 *
 * @param {bigint} x
 * @param {number} depth
 * @returns {bigint}
 */
function tanContinuedFraction(x, depth = 40) {
  const x2 = x * x;
  let num = 0n;
  let den = 1n;

  for (let k = depth; k >= 1; k -= 1) {
    const odd = BigInt(2 * k + 1);
    const nextNum = x2 * den;
    const nextDen = odd * den - num;
    num = nextNum;
    den = nextDen;
  }

  // Final step: x / (1 - num / den) = (x * den) / (den - num)
  let totalNum = x * den;
  let totalDen = den - num;
  if (totalDen < 0n) {
    totalNum = -totalNum;
    totalDen = -totalDen;
  }

  const neg = totalNum < 0n;
  const absNum = (neg ? -totalNum : totalNum) * SCALE;
  const rounded = (2n * absNum + totalDen) / (2n * totalDen);
  return neg ? -rounded : rounded;
}

/**
 * Computes the fixed-point angle-addition RHS:
 *   (tanA + tanB) / (1 - tanA * tanB)
 * scaled by SCALE = 10^18.
 *
 * @param {bigint} tanA - Fixed-point tan(a) scaled by 10^18.
 * @param {bigint} tanB - Fixed-point tan(b) scaled by 10^18.
 * @returns {bigint}
 */
function fixedPointTanAdd(tanA, tanB) {
  let num = (tanA + tanB) * SCALE * SCALE;
  let den = SCALE * SCALE - tanA * tanB;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const neg = num < 0n;
  const absNum = neg ? -num : num;
  const rounded = (2n * absNum + den) / (2n * den);
  return neg ? -rounded : rounded;
}

describe('tanBigIntSeries', () => {
  describe('base and known 18-digit exact values', () => {
    it('returns exact 0n for tan(0n)', () => {
      assert.equal(tanBigIntSeries(0n), 0n);
    });

    it('matches known 18-digit values for tan(1), tan(2), tan(10)', () => {
      assert.equal(tanBigIntSeries(1n), 1557407724654902231n);
      assert.equal(tanBigIntSeries(2n), -2185039863261518992n);
      assert.equal(tanBigIntSeries(10n), 648360827459086671n);
    });

    it('matches known 18-digit values for additional integers including near-pole and near-pi', () => {
      assert.equal(tanBigIntSeries(3n), -142546543074277805n);
      // 11 ≈ 7 * pi / 2 (near an odd multiple of pi/2, large magnitude)
      assert.equal(tanBigIntSeries(11n), -225950846454195142026n);
      // 22 ≈ 7 * pi (near an integer multiple of pi, small magnitude)
      assert.equal(tanBigIntSeries(22n), 8851656041684461n);
      // 355 ≈ 113 * pi (famous rational approximation 355/113 ≈ pi)
      assert.equal(tanBigIntSeries(355n), 30144353373184n);
    });
  });

  describe('odd symmetry', () => {
    it('satisfies tan(-x) === -tan(x) exactly across small, near-pole, and large inputs', () => {
      const inputs = [
        0n,
        1n,
        2n,
        3n,
        10n,
        11n,
        22n,
        344n,
        355n,
        51819n,
        10n ** 25n,
        10n ** 40n + 123456789n,
      ];

      for (const x of inputs) {
        assert.equal(
          tanBigIntSeries(-x),
          -tanBigIntSeries(x),
          `Expected tan(-${x}) === -tan(${x})`,
        );
      }
    });
  });

  describe('cross-check against Math.tan(Number(x))', () => {
    it('agrees with Math.tan across [-50, 50] and challenging integers', () => {
      const samples = [];
      for (let i = -50n; i <= 50n; i += 1n) {
        samples.push(i);
      }
      // 344 ≈ 219 * pi/2, 51819 ≈ 32989 * pi/2 (very close to poles), 355 ≈ 113 * pi
      samples.push(344n, 355n, 1000n, -1000n, 51819n, 1000000n);

      for (const x of samples) {
        const expected = Math.tan(Number(x));
        const actual = Number(tanBigIntSeries(x)) / 1e18;
        const tol = Math.max(1e-12, Math.abs(expected) * 1e-12);
        assert.ok(
          Math.abs(actual - expected) <= tol,
          `Mismatch for x=${x}: actual=${actual}, Math.tan=${expected}, diff=${Math.abs(actual - expected)}`,
        );
      }
    });
  });

  describe('cross-check against trigonometric identities', () => {
    it('satisfies double-angle identity tan(2x) ≈ 2*tan(x) / (1 - tan^2(x))', () => {
      const inputs = [
        1n,
        2n,
        3n,
        5n,
        10n,
        17n,
        -7n,
        -10n,
        100n,
        // Huge BigInt arguments far beyond Number.MAX_SAFE_INTEGER
        10n ** 25n,
        10n ** 40n + 7n,
      ];

      for (const x of inputs) {
        const tx = tanBigIntSeries(x);
        const t2x = tanBigIntSeries(2n * x);
        const rhs = fixedPointTanAdd(tx, tx);

        // Propagation of 0.5-ULP rounding error in tan(x) through 2t/(1-t^2)
        // scales by roughly 2*(1 + tan^2(2x)) <= O(max(1, |tan(2x)|^2)).
        const absT2x = t2x < 0n ? -t2x : t2x;
        const magInt = absT2x / SCALE + 1n;
        const tolerance = 10n * magInt * magInt;
        const diff = t2x >= rhs ? t2x - rhs : rhs - t2x;

        assert.ok(
          diff <= tolerance,
          `Double-angle mismatch for x=${x}: tan(2x)=${t2x}, rhs=${rhs}, diff=${diff}, tol=${tolerance}`,
        );
      }
    });

    it('satisfies angle-addition identity tan(a + b) ≈ (tan(a) + tan(b)) / (1 - tan(a)*tan(b))', () => {
      const pairs = [
        [1n, 2n],
        [3n, 7n],
        [10n, -4n],
        [-15n, 23n],
        [10n ** 30n, 1n],
        [10n ** 30n, 10n ** 30n + 3n],
      ];

      for (const [a, b] of pairs) {
        const ta = tanBigIntSeries(a);
        const tb = tanBigIntSeries(b);
        const tab = tanBigIntSeries(a + b);
        const rhs = fixedPointTanAdd(ta, tb);

        const absTab = tab < 0n ? -tab : tab;
        const magInt = absTab / SCALE + 1n;
        const tolerance = 10n * magInt * magInt;
        const diff = tab >= rhs ? tab - rhs : rhs - tab;

        assert.ok(
          diff <= tolerance,
          `Angle-addition mismatch for (${a}, ${b}): tan(a+b)=${tab}, rhs=${rhs}, diff=${diff}, tol=${tolerance}`,
        );
      }
    });
  });

  describe('independent continued-fraction cross-check', () => {
    it('matches Lambert continued fraction for tan(1), tan(2), tan(3), tan(5)', () => {
      for (const x of [1n, 2n, 3n, 5n, -4n]) {
        assert.equal(
          tanBigIntSeries(x),
          tanContinuedFraction(x, 60),
          `Continued fraction mismatch for x=${x}`,
        );
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-BigInt inputs', () => {
      const invalidInputs = [
        0,
        1,
        -1,
        1.5,
        NaN,
        Infinity,
        -Infinity,
        '0',
        '1',
        true,
        false,
        null,
        undefined,
        {},
        [],
        [1n],
        Symbol('x'),
        () => 1n,
      ];

      for (const value of invalidInputs) {
        assert.throws(
          () => tanBigIntSeries(value),
          TypeError,
          `Expected TypeError for ${String(value)}`,
        );
      }

      assert.throws(() => tanBigIntSeries(), TypeError);
    });
  });
});
