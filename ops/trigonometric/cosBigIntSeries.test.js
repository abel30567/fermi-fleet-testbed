import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosBigIntSeries } from './cosBigIntSeries.js';

const SCALE = 10n ** 18n;

/**
 * Helper to compute `round((a * b) / SCALE)` for fixed-point BigInt values.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function mulFixed(a, b) {
  const prod = a * b;
  const half = SCALE / 2n;
  return prod >= 0n ? (prod + half) / SCALE : -((-prod + half) / SCALE);
}

/**
 * Helper for BigInt absolute value.
 * @param {bigint} v
 * @returns {bigint}
 */
function absBigInt(v) {
  return v < 0n ? -v : v;
}

describe('cosBigIntSeries', () => {
  describe('exact and known 18-digit reference values', () => {
    it('returns exact 10^18 for 0n', () => {
      assert.equal(cosBigIntSeries(0n), 10n ** 18n);
    });

    it('matches known 18-digit values for cos(1), cos(2), cos(3), cos(10)', () => {
      assert.equal(cosBigIntSeries(1n), 540302305868139717n);
      assert.equal(cosBigIntSeries(2n), -416146836547142387n);
      assert.equal(cosBigIntSeries(3n), -989992496600445457n);
      assert.equal(cosBigIntSeries(10n), -839071529076452452n);
    });

    it('matches known 18-digit values for large integer radians', () => {
      assert.equal(cosBigIntSeries(1000000n), 936752127533144787n);
      assert.equal(cosBigIntSeries(-1000000n), 936752127533144787n);
    });

    it('computes exact range reduction for huge BigInt radians beyond Number.MAX_SAFE_INTEGER', () => {
      // cos(10^30) = -0.995931194405395702394248587997...
      assert.equal(cosBigIntSeries(10n ** 30n), -995931194405395702n);
      assert.equal(cosBigIntSeries(-(10n ** 30n)), -995931194405395702n);
    });
  });

  describe('mathematical identities and cross-checks', () => {
    it('satisfies even symmetry cos(-x) === cos(x)', () => {
      const inputs = [1n, 2n, 3n, 7n, 10n, 42n, 355n, 1000000n, 12345678901234567890n];
      for (const x of inputs) {
        assert.equal(
          cosBigIntSeries(-x),
          cosBigIntSeries(x),
          `Expected cos(-${x}) === cos(${x})`
        );
      }
    });

    it('agrees with Math.cos(Number(x)) within float64 precision for moderate x', () => {
      const inputs = [-100n, -17n, -3n, -1n, 0n, 1n, 2n, 3n, 5n, 10n, 25n, 100n, 1000n];
      for (const x of inputs) {
        const actual = cosBigIntSeries(x);
        const expectedApprox = BigInt(Math.round(Math.cos(Number(x)) * 1e18));
        // float64 has ~15-17 significant decimal digits; allow 1e-13 tolerance (100000n)
        const diff = absBigInt(actual - expectedApprox);
        assert.ok(
          diff <= 100000n,
          `Mismatch vs Math.cos(${x}): actual=${actual}, Math.cos≈${expectedApprox}, diff=${diff}`
        );
      }
    });

    it('satisfies double-angle identity cos(2x) ≈ 2*cos^2(x) - 1', () => {
      const inputs = [0n, 1n, 2n, 3n, 5n, 10n, 123n, 1000000n, 10n ** 20n];
      for (const x of inputs) {
        const cx = cosBigIntSeries(x);
        const c2x = cosBigIntSeries(2n * x);
        const rhs = 2n * mulFixed(cx, cx) - SCALE;
        const diff = absBigInt(c2x - rhs);
        assert.ok(
          diff <= 3n,
          `Double-angle failed for x=${x}: cos(2x)=${c2x}, 2cos^2(x)-1=${rhs}, diff=${diff}`
        );
      }
    });

    it('satisfies triple-angle identity cos(3x) ≈ 4*cos^3(x) - 3*cos(x)', () => {
      const inputs = [1n, 2n, 7n, 31n, 500000n];
      for (const x of inputs) {
        const cx = cosBigIntSeries(x);
        const cx2 = mulFixed(cx, cx);
        const cx3 = mulFixed(cx2, cx);
        const rhs = 4n * cx3 - 3n * cx;
        const c3x = cosBigIntSeries(3n * x);
        const diff = absBigInt(c3x - rhs);
        assert.ok(
          diff <= 8n,
          `Triple-angle failed for x=${x}: cos(3x)=${c3x}, rhs=${rhs}, diff=${diff}`
        );
      }
    });

    it('satisfies product-to-sum identity cos(a+b) + cos(a-b) ≈ 2*cos(a)*cos(b)', () => {
      const pairs = [
        [1n, 2n],
        [3n, 7n],
        [10n, 25n],
        [1000000n, 314159n],
      ];
      for (const [a, b] of pairs) {
        const lhs = cosBigIntSeries(a + b) + cosBigIntSeries(a - b);
        const rhs = 2n * mulFixed(cosBigIntSeries(a), cosBigIntSeries(b));
        const diff = absBigInt(lhs - rhs);
        assert.ok(
          diff <= 3n,
          `Product-to-sum failed for (${a}, ${b}): lhs=${lhs}, rhs=${rhs}, diff=${diff}`
        );
      }
    });

    it('stays strictly within [-10^18, 10^18] for all tested inputs', () => {
      for (let i = -50n; i <= 50n; i += 1n) {
        const val = cosBigIntSeries(i);
        assert.ok(val >= -SCALE && val <= SCALE, `Out of range for ${i}: ${val}`);
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-BigInt inputs', () => {
      const invalidInputs = [
        0,
        1,
        -1,
        3.14,
        NaN,
        Infinity,
        -Infinity,
        '0',
        '1',
        null,
        undefined,
        true,
        false,
        {},
        [],
        Symbol('x'),
      ];
      for (const bad of invalidInputs) {
        assert.throws(
          () => cosBigIntSeries(bad),
          { name: 'TypeError' },
          `Expected TypeError for input ${String(bad)}`
        );
      }
    });
  });
});
