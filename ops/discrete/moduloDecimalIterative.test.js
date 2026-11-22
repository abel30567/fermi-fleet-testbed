import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloDecimalIterative } from './moduloDecimalIterative.js';

/**
 * Independent helper that converts a plain decimal string (no scientific notation)
 * into `{ value: bigint, scale: number }` for quotient-remainder identity verification.
 */
function toExactScaled(str) {
  const neg = str.startsWith('-');
  const unsigned = neg || str.startsWith('+') ? str.slice(1) : str;
  const dot = unsigned.indexOf('.');
  if (dot === -1) {
    return { value: BigInt(neg ? `-${unsigned}` : unsigned), scale: 0 };
  }
  const intPart = unsigned.slice(0, dot) || '0';
  const fracPart = unsigned.slice(dot + 1);
  const raw = BigInt(intPart + fracPart);
  return { value: neg ? -raw : raw, scale: fracPart.length };
}

describe('moduloDecimalIterative', () => {
  describe('normal cases', () => {
    it('computes exact integer remainders', () => {
      assert.equal(moduloDecimalIterative('10', '3'), '1');
      assert.equal(moduloDecimalIterative('100', '7'), '2');
      assert.equal(moduloDecimalIterative('25', '5'), '0');
      assert.equal(moduloDecimalIterative('1', '1'), '0');
    });

    it('computes exact fractional decimal remainders without float64 drift', () => {
      assert.equal(moduloDecimalIterative('5.7', '2.1'), '1.5');
      assert.equal(moduloDecimalIterative('10.5', '3.2'), '0.9');
      // Classic IEEE-754 floating-point failure cases (0.3 % 0.1 !== 0 in float64)
      assert.equal(moduloDecimalIterative('0.3', '0.1'), '0');
      assert.equal(moduloDecimalIterative('1.0', '0.1'), '0');
      assert.equal(moduloDecimalIterative('0.7', '0.2'), '0.1');
      assert.equal(moduloDecimalIterative('12.345', '0.25'), '0.095');
    });

    it('handles high-precision numbers well beyond IEEE-754 float64 limits (30–60+ digits)', () => {
      const a = '1234567890123456789012345678901234567890.123456789012345678901234567890123456789';
      const b = '1000000000000000000000000000000000000000';
      assert.equal(
        moduloDecimalIterative(a, b, 50),
        '234567890123456789012345678901234567890.123456789012345678901234567890123456789',
      );

      // 40-digit fractional precision exact cancellation
      const fracA = '0.0000000000000000000000000000000000000009';
      const fracB = '0.0000000000000000000000000000000000000004';
      assert.equal(
        moduloDecimalIterative(fracA, fracB, 45),
        '0.0000000000000000000000000000000000000001',
      );
    });

    it('handles huge 100+ digit integers efficiently without linear looping', () => {
      const bigA = '9'.repeat(120);
      const bigB = '12345678901234567890123456789';
      const expected = (BigInt(bigA) % BigInt(bigB)).toString();
      assert.equal(moduloDecimalIterative(bigA, bigB), expected);
    });

    it('supports scientific notation and leading plus/whitespace', () => {
      assert.equal(moduloDecimalIterative('1.5e2', '4e1'), '30');
      assert.equal(moduloDecimalIterative('5.7e-1', '2.1e-1'), '0.15');
      assert.equal(moduloDecimalIterative('+10.5', '+3.2'), '0.9');
      assert.equal(moduloDecimalIterative('  5.7  ', ' 2.1 '), '1.5');
      assert.equal(moduloDecimalIterative('.75', '.2'), '0.15');
      assert.equal(moduloDecimalIterative('5.', '2.'), '1');
    });
  });

  describe('truncated remainder sign semantics', () => {
    it('follows truncated division semantics where non-zero remainder has the sign of dividend a', () => {
      // (+, +) -> +
      assert.equal(moduloDecimalIterative('5.7', '2.1'), '1.5');
      // (-, +) -> -
      assert.equal(moduloDecimalIterative('-5.7', '2.1'), '-1.5');
      // (+, -) -> +
      assert.equal(moduloDecimalIterative('5.7', '-2.1'), '1.5');
      // (-, -) -> -
      assert.equal(moduloDecimalIterative('-5.7', '-2.1'), '-1.5');

      // Integer sign combinations matching JS %
      assert.equal(moduloDecimalIterative('-7', '3'), '-1');
      assert.equal(moduloDecimalIterative('7', '-3'), '1');
      assert.equal(moduloDecimalIterative('-7', '-3'), '-1');
    });
  });

  describe('edge cases and precision handling', () => {
    it('returns "0" for zero dividend and exact multiples (never "-0")', () => {
      assert.equal(moduloDecimalIterative('0', '5'), '0');
      assert.equal(moduloDecimalIterative('-0', '5'), '0');
      assert.equal(moduloDecimalIterative('0.000', '-3.14'), '0');
      assert.equal(moduloDecimalIterative('6.3', '2.1'), '0');
      assert.equal(moduloDecimalIterative('-6.3', '2.1'), '0');
      assert.equal(moduloDecimalIterative('-6.3', '-2.1'), '0');
    });

    it('returns dividend unchanged when |a| < |b|', () => {
      assert.equal(moduloDecimalIterative('1.25', '5.5'), '1.25');
      assert.equal(moduloDecimalIterative('-1.25', '5.5'), '-1.25');
      assert.equal(moduloDecimalIterative('1.25', '-5.5'), '1.25');
      assert.equal(moduloDecimalIterative('-1.25', '-5.5'), '-1.25');
    });

    it('rounds half away from zero when exact remainder exceeds requested precision', () => {
      assert.equal(moduloDecimalIterative('1.123456', '0.5', 3), '0.123');
      assert.equal(moduloDecimalIterative('1.1235', '0.5', 3), '0.124');
      assert.equal(moduloDecimalIterative('-1.1235', '0.5', 3), '-0.124');
      // Rounding very small negative remainder to zero must not produce "-0"
      assert.equal(moduloDecimalIterative('-0.0001', '1', 2), '0');
      // Carry propagation on rounding
      assert.equal(moduloDecimalIterative('0.9999', '1', 2), '1');
    });

    it('supports precision = 0', () => {
      assert.equal(moduloDecimalIterative('10', '3', 0), '1');
      assert.equal(moduloDecimalIterative('5.7', '2.1', 0), '2'); // exact 1.5 -> 2
      assert.equal(moduloDecimalIterative('5.3', '2.1', 0), '1'); // exact 1.1 -> 1
      assert.equal(moduloDecimalIterative('-5.7', '2.1', 0), '-2'); // exact -1.5 -> -2
    });
  });

  describe('input validation', () => {
    it('throws RangeError when divisor b is zero', () => {
      assert.throws(() => moduloDecimalIterative('10', '0'), RangeError);
      assert.throws(() => moduloDecimalIterative('10', '-0'), RangeError);
      assert.throws(() => moduloDecimalIterative('10', '0.0000'), RangeError);
      assert.throws(() => moduloDecimalIterative('10', '0e10'), RangeError);
      assert.throws(() => moduloDecimalIterative('0', '0'), RangeError);
    });

    it('throws TypeError for non-string a or b, or non-number precision', () => {
      assert.throws(() => moduloDecimalIterative(10, '3'), TypeError);
      assert.throws(() => moduloDecimalIterative('10', 3), TypeError);
      assert.throws(() => moduloDecimalIterative(null, '3'), TypeError);
      assert.throws(() => moduloDecimalIterative('10', undefined), TypeError);
      assert.throws(() => moduloDecimalIterative(10n, '3'), TypeError);
      assert.throws(() => moduloDecimalIterative('10', '3', '5'), TypeError);
      assert.throws(() => moduloDecimalIterative('10', '3', null), TypeError);
    });

    it('throws RangeError for malformed decimal strings or invalid precision', () => {
      for (const bad of ['', '   ', '.', '+.', '-.', 'abc', '1.2.3', 'NaN', 'Infinity', '1e', '1e+', '1_000']) {
        assert.throws(() => moduloDecimalIterative(bad, '2'), RangeError, `Expected RangeError for a="${bad}"`);
        assert.throws(() => moduloDecimalIterative('2', bad), RangeError, `Expected RangeError for b="${bad}"`);
      }
      assert.throws(() => moduloDecimalIterative('10', '3', -1), RangeError);
      assert.throws(() => moduloDecimalIterative('10', '3', 1.5), RangeError);
      assert.throws(() => moduloDecimalIterative('10', '3', Number.NaN), RangeError);
      assert.throws(() => moduloDecimalIterative('10', '3', Number.POSITIVE_INFINITY), RangeError);
      // Even when a is "0", invalid precision must still be rejected
      assert.throws(() => moduloDecimalIterative('0', '3', -2), RangeError);
    });
  });

  describe('independent cross-checks', () => {
    it('matches native BigInt % across large positive and negative integers', () => {
      const pairs = [
        ['9876543210987654321098765432109876543210987654321', '12345678901234567890123456789'],
        ['-9876543210987654321098765432109876543210987654321', '12345678901234567890123456789'],
        ['9876543210987654321098765432109876543210987654321', '-12345678901234567890123456789'],
        ['-9876543210987654321098765432109876543210987654321', '-12345678901234567890123456789'],
        ['1000000000000000000000000000000000000000000000000000000000000', '999999999999999999999999999999999999999'],
      ];

      for (const [a, b] of pairs) {
        const actual = moduloDecimalIterative(a, b);
        const expected = (BigInt(a) % BigInt(b)).toString();
        assert.equal(actual, expected, `Mismatch for ${a} % ${b}`);
      }
    });

    it('satisfies exact quotient-remainder identity a = q * b + r with |r| < |b| for high-precision decimals', () => {
      const cases = [
        ['31415926535897932384626433832795.028841971693993751058209749445', '2718281828459045.235360287471352662497757247093'],
        ['-31415926535897932384626433832795.028841971693993751058209749445', '2718281828459045.235360287471352662497757247093'],
        ['31415926535897932384626433832795.028841971693993751058209749445', '-2718281828459045.235360287471352662497757247093'],
        ['-31415926535897932384626433832795.028841971693993751058209749445', '-2718281828459045.235360287471352662497757247093'],
        ['0.12345678901234567890123456789012345', '0.00000000000000000000777777777777777'],
      ];

      for (const [aStr, bStr] of cases) {
        const rStr = moduloDecimalIterative(aStr, bStr, 60);

        const a = toExactScaled(aStr);
        const b = toExactScaled(bStr);
        const r = toExactScaled(rStr);

        const S = Math.max(a.scale, b.scale, r.scale);
        const A = a.value * (10n ** BigInt(S - a.scale));
        const B = b.value * (10n ** BigInt(S - b.scale));
        const R = r.value * (10n ** BigInt(S - r.scale));

        // Independent quotient via BigInt truncated integer division
        const Q = A / B;

        // Identity: A === Q * B + R
        assert.equal(Q * B + R, A, `Quotient-remainder identity failed for ${aStr} mod ${bStr}`);

        // Bound: |R| < |B|
        const absR = R < 0n ? -R : R;
        const absB = B < 0n ? -B : B;
        assert.ok(absR < absB, `Remainder bound |r| < |b| failed for ${aStr} mod ${bStr}`);

        // Sign: R === 0 or sign(R) === sign(A)
        if (R !== 0n) {
          assert.equal(R < 0n, A < 0n, `Remainder sign mismatch for ${aStr} mod ${bStr}`);
        }
      }
    });
  });
});
