import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtDecimalStable } from './cbrtDecimalStable.js';

/**
 * Independent exact decimal parser into `{ num: bigint, den: bigint }`
 * with `den > 0n`, used exclusively by test cross-checks.
 */
function parseExactRational(str) {
  const s = str.trim();
  const match = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(s);
  assert.ok(match, `Test helper failed to parse decimal string: ${str}`);
  const [, sign, intPart = '', f1, f2, expStr] = match;
  const fracPart = f1 ?? f2 ?? '';
  const digits = BigInt((intPart + fracPart) || '0');
  const signedNum = sign === '-' ? -digits : digits;
  const exp = (expStr ? BigInt(expStr) : 0n) - BigInt(fracPart.length);
  if (exp >= 0n) {
    return { num: signedNum * (10n ** exp), den: 1n };
  }
  return { num: signedNum, den: 10n ** (-exp) };
}

/**
 * Independent half-ULP exact algebraic bracket verification:
 * Verifies `(y - 0.5 * 10^-p)^3 <= x <= (y + 0.5 * 10^-p)^3` using pure
 * exact BigInt rational arithmetic (zero floating-point operations).
 */
function assertWithinHalfUlp(inputStr, resultStr, precision) {
  const x = parseExactRational(inputStr);
  const y = parseExactRational(resultStr);

  // Express y +/- 1 / (2 * 10^p) over common denominator 2 * 10^p * y.den.
  const scale = 10n ** BigInt(precision);
  const commonDen = 2n * scale * y.den;
  const yScaled = y.num * 2n * scale;
  const loNum = yScaled - y.den;
  const hiNum = yScaled + y.den;

  // Compare lo^3 <= x <= hi^3  <=>  loNum^3 * x.den <= x.num * commonDen^3 <= hiNum^3 * x.den
  const loCube = loNum * loNum * loNum * x.den;
  const hiCube = hiNum * hiNum * hiNum * x.den;
  const xScaled = x.num * commonDen * commonDen * commonDen;

  assert.ok(
    loCube <= xScaled && xScaled <= hiCube,
    `Result ${resultStr} for cbrt(${inputStr}, ${precision}) failed exact half-ULP bracket check`,
  );
}

describe('cbrtDecimalStable', () => {
  describe('exact cubes and normal cases', () => {
    it('computes exact positive and negative integer cube roots', () => {
      assert.equal(cbrtDecimalStable('0'), '0');
      assert.equal(cbrtDecimalStable('1'), '1');
      assert.equal(cbrtDecimalStable('-1'), '-1');
      assert.equal(cbrtDecimalStable('8'), '2');
      assert.equal(cbrtDecimalStable('-8'), '-2');
      assert.equal(cbrtDecimalStable('27'), '3');
      assert.equal(cbrtDecimalStable('-27'), '-3');
      assert.equal(cbrtDecimalStable('64'), '4');
      assert.equal(cbrtDecimalStable('125'), '5');
      assert.equal(cbrtDecimalStable('1000'), '10');
      assert.equal(cbrtDecimalStable('-1000000'), '-100');
    });

    it('computes exact fractional decimal cube roots', () => {
      assert.equal(cbrtDecimalStable('0.125'), '0.5');
      assert.equal(cbrtDecimalStable('-0.008'), '-0.2');
      assert.equal(cbrtDecimalStable('0.000001'), '0.01');
      assert.equal(cbrtDecimalStable('15.625'), '2.5');
      assert.equal(cbrtDecimalStable('-3.375'), '-1.5');
      assert.equal(cbrtDecimalStable('0.000027'), '0.03');
    });

    it('matches known high-precision digits for irrational cube roots', () => {
      // cbrt(2) = 1.2599210498948731647672106072782283505702514647015079800819...
      assert.equal(cbrtDecimalStable('2'), '1.25992104989487316477');
      assert.equal(cbrtDecimalStable('2', 10), '1.2599210499');
      assert.equal(
        cbrtDecimalStable('2', 50),
        '1.25992104989487316476721060727822835057025146470151',
      );
      assert.equal(
        cbrtDecimalStable('-2', 50),
        '-1.25992104989487316476721060727822835057025146470151',
      );

      // cbrt(3) = 1.4422495703074083823216383107801095883918692534993505775464...
      assert.equal(
        cbrtDecimalStable('3', 40),
        '1.4422495703074083823216383107801095883919',
      );

      // cbrt(10) = 2.1544346900318837217592935665193504952593449421921085824892...
      assert.equal(
        cbrtDecimalStable('10', 30),
        '2.154434690031883721759293566519',
      );
    });

    it('supports scientific notation and flexible decimal formatting', () => {
      assert.equal(cbrtDecimalStable('1e3'), '10');
      assert.equal(cbrtDecimalStable('8e-3'), '0.2');
      assert.equal(cbrtDecimalStable('+2.7e+1'), '3');
      assert.equal(cbrtDecimalStable('-6.4E-2'), '-0.4');
      assert.equal(cbrtDecimalStable('  +00027.000  '), '3');
      assert.equal(cbrtDecimalStable('.125'), '0.5');
      assert.equal(cbrtDecimalStable('27.'), '3');
      assert.equal(cbrtDecimalStable('-.008'), '-0.2');
    });
  });

  describe('edge cases and numerical stability', () => {
    it('normalizes all zero forms to "0" without negative zero', () => {
      assert.equal(cbrtDecimalStable('-0'), '0');
      assert.equal(cbrtDecimalStable('+0'), '0');
      assert.equal(cbrtDecimalStable('0.00000'), '0');
      assert.equal(cbrtDecimalStable('-0.00000'), '0');
      assert.equal(cbrtDecimalStable('.0'), '0');
      assert.equal(cbrtDecimalStable('0.'), '0');
      assert.equal(cbrtDecimalStable('-0e-100'), '0');
      assert.equal(cbrtDecimalStable('0e+999999'), '0');
      // Tiny negative input that rounds to zero must never produce "-0".
      assert.equal(cbrtDecimalStable('-1e-100', 10), '0');
    });

    it('handles precision = 0', () => {
      assert.equal(cbrtDecimalStable('2', 0), '1');
      assert.equal(cbrtDecimalStable('4', 0), '2');
      assert.equal(cbrtDecimalStable('-4', 0), '-2');
      assert.equal(cbrtDecimalStable('27', 0), '3');
      assert.equal(cbrtDecimalStable('0.1', 0), '0');
      assert.equal(cbrtDecimalStable('0.2', 0), '1');
    });

    it('performs exact round-half-to-even on exact midpoints and near-ties', () => {
      // Exact ties at precision = 0:
      // cbrt(3.375) = 1.5 -> 2 (even); cbrt(15.625) = 2.5 -> 2 (even)
      assert.equal(cbrtDecimalStable('3.375', 0), '2');
      assert.equal(cbrtDecimalStable('15.625', 0), '2');
      assert.equal(cbrtDecimalStable('-3.375', 0), '-2');
      assert.equal(cbrtDecimalStable('-15.625', 0), '-2');

      // Exact ties at fractional precision = 1:
      // cbrt(0.003375) = 0.15 -> 0.2; cbrt(0.015625) = 0.25 -> 0.2
      assert.equal(cbrtDecimalStable('0.003375', 1), '0.2');
      assert.equal(cbrtDecimalStable('0.015625', 1), '0.2');

      // Table-maker's dilemma: values differing from an exact tie by 10^-30
      assert.equal(cbrtDecimalStable('15.625000000000000000000000000001', 0), '3');
      assert.equal(cbrtDecimalStable('15.624999999999999999999999999999', 0), '2');
      assert.equal(cbrtDecimalStable('3.375000000000000000000000000001', 0), '2');
      assert.equal(cbrtDecimalStable('3.374999999999999999999999999999', 0), '1');
    });

    it('propagates rounding carries cleanly across the decimal point', () => {
      assert.equal(cbrtDecimalStable('0.999999999999999999999999999999', 5), '1');
      assert.equal(cbrtDecimalStable('-0.999999999999999999999999999999', 5), '-1');
      assert.equal(cbrtDecimalStable('999.999999999999999999999999', 4), '10');
    });

    it('avoids IEEE-754 overflow and underflow on extreme magnitudes', () => {
      // Beyond Number.MAX_VALUE (~1.8e308)
      assert.equal(cbrtDecimalStable('8e600', 5), '2' + '0'.repeat(200));
      assert.equal(cbrtDecimalStable('-27e900', 5), '-3' + '0'.repeat(300));

      // Beyond Number.MIN_VALUE (~5e-324)
      assert.equal(cbrtDecimalStable('8e-360', 120), '0.' + '0'.repeat(119) + '2');
      assert.equal(cbrtDecimalStable('-27e-600', 200), '-0.' + '0'.repeat(199) + '3');

      // Extreme underflow shortcut (no excessive allocation)
      assert.equal(cbrtDecimalStable('1e-1000000', 20), '0');
      assert.equal(cbrtDecimalStable('-9.999e-1000000', 50), '0');
    });

    it('validates arguments and rejects malformed inputs', () => {
      assert.throws(() => cbrtDecimalStable(27), TypeError);
      assert.throws(() => cbrtDecimalStable(null), TypeError);
      assert.throws(() => cbrtDecimalStable(undefined), TypeError);
      assert.throws(() => cbrtDecimalStable(27n), TypeError);

      assert.throws(() => cbrtDecimalStable('27', '5'), TypeError);
      assert.throws(() => cbrtDecimalStable('27', null), TypeError);

      assert.throws(() => cbrtDecimalStable('27', -1), RangeError);
      assert.throws(() => cbrtDecimalStable('27', 1.5), RangeError);
      assert.throws(() => cbrtDecimalStable('27', Number.NaN), RangeError);
      assert.throws(() => cbrtDecimalStable('27', Number.POSITIVE_INFINITY), RangeError);

      for (const bad of ['', '   ', '.', '+.', '-', '+', 'abc', 'NaN', 'Infinity', '1.2.3', '1e', '1e+', 'e5', '1_000']) {
        assert.throws(() => cbrtDecimalStable(bad), RangeError, `Expected RangeError for "${bad}"`);
      }

      assert.throws(() => cbrtDecimalStable('2e10000000', 10), RangeError);
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies exact algebraic half-ULP error bounds across diverse inputs and precisions', () => {
      const cases = [
        ['2', 0],
        ['2', 15],
        ['2', 80],
        ['-7', 40],
        ['0.000123456789', 50],
        ['-987654321098765432109876543210.123456789', 35],
        ['1e-100', 40],
        ['3.1415926535897932384626433832795', 60],
        ['1e400', 25],
        ['-5.5e-25', 30],
      ];

      for (const [input, prec] of cases) {
        const result = cbrtDecimalStable(input, prec);
        assertWithinHalfUlp(input, result, prec);
      }
    });

    it('agrees with IEEE-754 Math.cbrt across normal-range inputs', () => {
      const inputs = [
        '0.00073',
        '0.5',
        '1.23456789',
        '42',
        '123456.789',
        '9.87654321e15',
        '-0.0042',
        '-17.3',
        '-1e-12',
      ];

      for (const input of inputs) {
        const expected = Math.cbrt(Number(input));
        const actual = Number(cbrtDecimalStable(input, 20));
        const relErr = Math.abs(actual - expected) / Math.abs(expected);
        assert.ok(
          relErr < 1e-14,
          `Relative error ${relErr} too large for input ${input} (actual=${actual}, expected=${expected})`,
        );
      }
    });

    it('recovers exact arbitrary-precision BigInt cubes beyond 53-bit precision', () => {
      const roots = [
        12345678901234567890n,
        -987654321098765432109876543210987654321n,
        1000000000000000000000000000000000000001n,
        (1n << 200n) - 1n,
      ];

      for (const r of roots) {
        const cubeStr = (r * r * r).toString();
        assert.equal(cbrtDecimalStable(cubeStr, 25), r.toString());
      }
    });

    it('preserves odd symmetry and power-of-1000 scaling invariance', () => {
      const samples = ['2', '17.42', '0.00051', '1234567890123456789012345'];
      for (const s of samples) {
        assert.equal(cbrtDecimalStable('-' + s, 30), '-' + cbrtDecimalStable(s, 30));
      }

      // cbrt(2 * 10^18) = 10^6 * cbrt(2)
      const base = cbrtDecimalStable('2', 26); // 1.25992104989487316476721061
      const scaled = cbrtDecimalStable('2e18', 20); // 1259921.04989487316476721061
      assert.equal(scaled.replace('.', ''), base.replace('.', ''));
    });
  });
});
