import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtDecimalStable } from './sqrtDecimalStable.js';

/**
 * Independent reference implementation using the schoolbook digit-by-digit
 * (base-100) square root extraction algorithm for non-negative integers scaled
 * to an exact precision, returning floor(sqrt(n)) for cross-checking Newton-Heron.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Exact floor(sqrt(n)).
 */
function digitByDigitIsqrt(n) {
  if (n === 0n) return 0n;
  const s = n.toString();
  const padded = s.length % 2 === 1 ? '0' + s : s;

  let root = 0n;
  let rem = 0n;

  for (let i = 0; i < padded.length; i += 2) {
    const pair = BigInt(padded.slice(i, i + 2));
    rem = rem * 100n + pair;

    // Find largest digit d in 0..9 such that (20 * root + d) * d <= rem.
    let d = 0n;
    for (let cand = 9n; cand >= 0n; cand -= 1n) {
      if ((20n * root + cand) * cand <= rem) {
        d = cand;
        break;
      }
    }
    rem -= (20n * root + d) * d;
    root = root * 10n + d;
  }

  return root;
}

/**
 * Converts a plain decimal string (no scientific notation) to `{ num, scale }`
 * such that `value = num / 10^scale`.
 *
 * @param {string} dec
 * @returns {{ num: bigint, scale: number }}
 */
function toRational(dec) {
  const dot = dec.indexOf('.');
  if (dot === -1) {
    return { num: BigInt(dec), scale: 0 };
  }
  const intPart = dec.slice(0, dot);
  const fracPart = dec.slice(dot + 1);
  return { num: BigInt(intPart + fracPart), scale: fracPart.length };
}

/**
 * Verifies the exact error bound `|result - sqrt(x)| <= 0.5 * 10^(-precision)`
 * in exact rational arithmetic (zero floating-point error).
 *
 * @param {string} xStr - Plain decimal string input.
 * @param {string} resultStr - Output of sqrtDecimalStable(xStr, precision).
 * @param {number} precision - Decimal precision.
 */
function assertExactErrorBound(xStr, resultStr, precision) {
  const { num: xNum, scale: xScale } = toRational(xStr);
  const { num: rNum, scale: rScale } = toRational(resultStr);

  assert.ok(rScale <= precision, `Output ${resultStr} exceeded precision ${precision}`);

  // Express result as R / 10^precision
  const R = rNum * (10n ** BigInt(precision - rScale));
  const powP = 10n ** BigInt(precision);
  const powX = 10n ** BigInt(xScale);

  // Lower bound: max(0, (2R - 1) / (2 * 10^precision))
  // Check lower^2 <= x <=> (2R - 1)^2 * 10^xScale <= 4 * xNum * 10^(2*precision)
  if (R > 0n) {
    const lowNum = 2n * R - 1n;
    const lhsLow = lowNum * lowNum * powX;
    const rhs = 4n * xNum * powP * powP;
    assert.ok(lhsLow <= rhs, `Lower error bound failed for sqrt(${xStr}) at p=${precision}: got ${resultStr}`);
  }

  // Upper bound: (2R + 1) / (2 * 10^precision)
  // Check x <= upper^2 <=> 4 * xNum * 10^(2*precision) <= (2R + 1)^2 * 10^xScale
  const highNum = 2n * R + 1n;
  const lhsHigh = highNum * highNum * powX;
  const rhs = 4n * xNum * powP * powP;
  assert.ok(rhs <= lhsHigh, `Upper error bound failed for sqrt(${xStr}) at p=${precision}: got ${resultStr}`);
}

describe('sqrtDecimalStable', () => {
  describe('normal cases', () => {
    it('computes exact square roots of perfect integer squares', () => {
      assert.equal(sqrtDecimalStable('0'), '0');
      assert.equal(sqrtDecimalStable('1'), '1');
      assert.equal(sqrtDecimalStable('4'), '2');
      assert.equal(sqrtDecimalStable('9'), '3');
      assert.equal(sqrtDecimalStable('144'), '12');
      assert.equal(sqrtDecimalStable('10000'), '100');
      assert.equal(sqrtDecimalStable('15241578750190521'), '123456789');
    });

    it('computes exact square roots of perfect decimal squares', () => {
      assert.equal(sqrtDecimalStable('0.25'), '0.5');
      assert.equal(sqrtDecimalStable('0.0001'), '0.01');
      assert.equal(sqrtDecimalStable('2.25'), '1.5');
      assert.equal(sqrtDecimalStable('6.25'), '2.5');
      assert.equal(sqrtDecimalStable('.0625'), '0.25');
      assert.equal(sqrtDecimalStable('152415787.50190521'), '12345.6789');
    });

    it('computes irrational square roots accurately to default and high precision', () => {
      // sqrt(2) = 1.4142135623730950488016887242096980785696718753769480731766797379907324784621070388503875343276415727...
      assert.equal(sqrtDecimalStable('2'), '1.4142135623730950488');
      assert.equal(
        sqrtDecimalStable('2', 50),
        '1.41421356237309504880168872420969807856967187537695',
      );
      assert.equal(
        sqrtDecimalStable('2', 100),
        '1.4142135623730950488016887242096980785696718753769480731766797379907324784621070388503875343276415727',
      );

      // sqrt(3) = 1.73205080756887729352744634150587236694280525381038...
      assert.equal(
        sqrtDecimalStable('3', 50),
        '1.73205080756887729352744634150587236694280525381038',
      );

      // sqrt(5) = 2.23606797749978969640917366873127623544061835961153...
      assert.equal(
        sqrtDecimalStable('5', 50),
        '2.23606797749978969640917366873127623544061835961153',
      );
    });

    it('supports precision = 0 and small precisions', () => {
      assert.equal(sqrtDecimalStable('2', 0), '1');
      assert.equal(sqrtDecimalStable('3', 0), '2');
      assert.equal(sqrtDecimalStable('2', 1), '1.4');
      assert.equal(sqrtDecimalStable('2', 4), '1.4142');
      assert.equal(sqrtDecimalStable('2', 5), '1.41421');
    });

    it('supports whitespace, leading +, leading/trailing zeros, and scientific notation', () => {
      assert.equal(sqrtDecimalStable('  +4.000  '), '2');
      assert.equal(sqrtDecimalStable('000144.000'), '12');
      assert.equal(sqrtDecimalStable('4.'), '2');
      assert.equal(sqrtDecimalStable('.25'), '0.5');
      assert.equal(sqrtDecimalStable('1e2'), '10');
      assert.equal(sqrtDecimalStable('2.25E-4'), '0.015');
      assert.equal(sqrtDecimalStable('1.44e+20'), '12000000000');
      assert.equal(sqrtDecimalStable('+4.e-2'), '0.2');
    });
  });

  describe('edge cases and numerical stability', () => {
    it('handles all zero representations including negative zero', () => {
      for (const z of ['0', '0.0', '-0', '-0.0', '+0', '0.', '.0', '0e50', '-0e-50', '  -0.000E+99  ']) {
        assert.equal(sqrtDecimalStable(z, 20), '0', `failed for "${z}"`);
        assert.equal(sqrtDecimalStable(z, 0), '0', `failed for "${z}" at p=0`);
      }
    });

    it('handles extreme magnitudes far outside IEEE-754 double range', () => {
      // 1e-1000 underflows double to 0, but exact sqrt is 1e-500
      const tiny = sqrtDecimalStable('1e-1000', 500);
      assert.equal(tiny, '0.' + '0'.repeat(499) + '1');

      // 4e-1000 at precision 500 -> 2e-500
      assert.equal(sqrtDecimalStable('4e-1000', 500), '0.' + '0'.repeat(499) + '2');

      // Ultra-tiny value below half-ULP fast path (no huge exponent allocation)
      assert.equal(sqrtDecimalStable('1e-1000000', 20), '0');

      // 1e1000 overflows double to Infinity, exact sqrt is 1e500
      assert.equal(sqrtDecimalStable('1e1000', 10), '1' + '0'.repeat(500));

      // Huge perfect square: (10^60 + 7)^2 = 10^120 + 14*10^60 + 49
      const base = 10n ** 60n + 7n;
      const sq = (base * base).toString();
      assert.equal(sqrtDecimalStable(sq, 20), base.toString());
    });

    it('is exact across IEEE-754 52/53-bit precision boundaries', () => {
      // (2^26)^2 - 1 = 4503599627370495 where Math.sqrt rounds up to 2^26
      const nearPower = (2n ** 52n - 1n).toString();
      assert.equal(sqrtDecimalStable(nearPower, 0), (2n ** 26n).toString());
      // Floor is 2^26 - 1 = 67108863, fractional part is ~0.999999992549...
      assert.equal(sqrtDecimalStable(nearPower, 10), '67108863.9999999925');

      // (2^53 - 1)^2
      const safeMax = 2n ** 53n - 1n;
      assert.equal(sqrtDecimalStable((safeMax * safeMax).toString(), 20), safeMax.toString());
    });

    it('breaks exact halfway ties with round-half-to-even', () => {
      // Exact half-integers at precision 0
      assert.equal(sqrtDecimalStable('0.25', 0), '0');   // 0.5 -> even 0
      assert.equal(sqrtDecimalStable('2.25', 0), '2');   // 1.5 -> even 2
      assert.equal(sqrtDecimalStable('6.25', 0), '2');   // 2.5 -> even 2
      assert.equal(sqrtDecimalStable('12.25', 0), '4');  // 3.5 -> even 4
      assert.equal(sqrtDecimalStable('20.25', 0), '4');  // 4.5 -> even 4

      // Arbitrarily close to ties (no double-rounding error)
      assert.equal(sqrtDecimalStable('0.2500000000000000000000001', 0), '1');
      assert.equal(sqrtDecimalStable('0.2499999999999999999999999', 0), '0');
      assert.equal(sqrtDecimalStable('2.2499999999999999999999999', 0), '1');
      assert.equal(sqrtDecimalStable('6.2500000000000000000000001', 0), '3');

      // Fractional halfway ties at precision 1
      assert.equal(sqrtDecimalStable('0.0025', 1), '0');   // 0.05 -> 0.0
      assert.equal(sqrtDecimalStable('0.0225', 1), '0.2'); // 0.15 -> 0.2
      assert.equal(sqrtDecimalStable('0.0625', 1), '0.2'); // 0.25 -> 0.2
      assert.equal(sqrtDecimalStable('0.1225', 1), '0.4'); // 0.35 -> 0.4
    });

    it('validates input types, domain, and precision', () => {
      assert.throws(() => sqrtDecimalStable(4), TypeError);
      assert.throws(() => sqrtDecimalStable(4n), TypeError);
      assert.throws(() => sqrtDecimalStable(null), TypeError);
      assert.throws(() => sqrtDecimalStable(undefined), TypeError);
      assert.throws(() => sqrtDecimalStable({}), TypeError);

      assert.throws(() => sqrtDecimalStable('4', '10'), TypeError);
      assert.throws(() => sqrtDecimalStable('4', null), TypeError);
      assert.throws(() => sqrtDecimalStable('4', -1), RangeError);
      assert.throws(() => sqrtDecimalStable('4', 1.5), RangeError);
      assert.throws(() => sqrtDecimalStable('4', NaN), RangeError);
      assert.throws(() => sqrtDecimalStable('4', Infinity), RangeError);

      assert.throws(() => sqrtDecimalStable('-1'), RangeError);
      assert.throws(() => sqrtDecimalStable('-0.0000000000000000001'), RangeError);
      assert.throws(() => sqrtDecimalStable('-1e-500'), RangeError);

      for (const bad of ['', '   ', '.', '+.', 'abc', 'NaN', 'Infinity', '1.2.3', '1e', '1e+', '1_000', '0x10']) {
        assert.throws(() => sqrtDecimalStable(bad), RangeError, `expected RangeError for "${bad}"`);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies exact rational error bound |r - sqrt(x)| <= 0.5 * 10^(-p)', () => {
      const inputs = [
        '0.000007',
        '0.1',
        '0.24999',
        '0.25',
        '0.25001',
        '0.999999999999',
        '2',
        '3.141592653589793238462643383279',
        '7',
        '99.9999',
        '123456789012345678901234567890.123456789',
      ];
      const precisions = [0, 1, 5, 17, 40];

      for (const x of inputs) {
        for (const p of precisions) {
          const result = sqrtDecimalStable(x, p);
          assertExactErrorBound(x, result, p);
        }
      }
    });

    it('matches independent digit-by-digit base-100 square root extraction', () => {
      const cases = [
        { x: '2', p: 35 },
        { x: '7', p: 35 },
        { x: '13', p: 40 },
        { x: '98765432109876543210', p: 30 },
        { x: '0.000123456789', p: 30 },
      ];

      for (const { x, p } of cases) {
        const { num, scale } = toRational(x);
        const shift = 2 * p - scale;
        const scaled = num * (10n ** BigInt(shift));
        const floorRoot = digitByDigitIsqrt(scaled);
        const rem = scaled - floorRoot * floorRoot;
        const expectedInt = rem > floorRoot ? floorRoot + 1n : floorRoot;

        const expectedDigits = expectedInt.toString().padStart(p + 1, '0');
        const intPart = expectedDigits.slice(0, expectedDigits.length - p);
        const fracPart = expectedDigits.slice(expectedDigits.length - p).replace(/0+$/, '');
        const expected = fracPart ? `${intPart}.${fracPart}` : intPart;

        assert.equal(sqrtDecimalStable(x, p), expected, `mismatch vs digit-by-digit for sqrt(${x}, ${p})`);
      }
    });

    it('satisfies multiplicative identity sqrt(a) * sqrt(b) = sqrt(a * b) to high precision', () => {
      const p = 60;
      const s2 = toRational(sqrtDecimalStable('2', p));
      const s3 = toRational(sqrtDecimalStable('3', p));
      const s6 = toRational(sqrtDecimalStable('6', p));

      // Compute s2 * s3 at scale s2.scale + s3.scale and compare with s6
      const prodNum = s2.num * s3.num;
      const prodScale = s2.scale + s3.scale;
      const s6Scaled = s6.num * (10n ** BigInt(prodScale - s6.scale));
      const diff = prodNum >= s6Scaled ? prodNum - s6Scaled : s6Scaled - prodNum;

      // Error bound: |s2*s3 - s6| <= (s2 + s3 + 1) * 0.5 * 10^-p < 10 * 10^-p
      const maxErr = 10n * (10n ** BigInt(prodScale - p));
      assert.ok(diff <= maxErr, `sqrt(2)*sqrt(3) diverged from sqrt(6): diff=${diff}`);
    });

    it('agrees with Math.sqrt within IEEE-754 double precision for moderate inputs', () => {
      for (const x of ['0.01', '0.5', '1.5', '2', '10', '42.42', '12345.6789', '1e12']) {
        const expected = Math.sqrt(Number(x));
        const actual = Number(sqrtDecimalStable(x, 20));
        assert.ok(
          Math.abs(actual - expected) <= 1e-14 * Math.max(1, expected),
          `Mismatch with Math.sqrt for ${x}: got ${actual}, expected ${expected}`,
        );
      }
    });
  });
});
