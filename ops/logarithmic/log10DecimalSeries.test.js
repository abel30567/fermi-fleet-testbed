import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10DecimalSeries } from './log10DecimalSeries.js';

/**
 * Helper: convert a decimal string to a BigInt scaled by 10^scale for exact
 * high-precision arithmetic comparisons in tests.
 */
function toScaledBigInt(decStr, scale) {
  const negative = decStr.startsWith('-');
  const unsigned = negative ? decStr.slice(1) : decStr;
  const [intPart, fracPart = ''] = unsigned.split('.');
  if (fracPart.length > scale) {
    throw new Error(`Value ${decStr} has more than ${scale} fractional digits`);
  }
  const padded = fracPart.padEnd(scale, '0');
  const mag = BigInt(intPart + padded);
  return negative ? -mag : mag;
}

describe('log10DecimalSeries', () => {
  describe('exact powers of 10', () => {
    it('returns exact integers for powers of 10 across formats', () => {
      assert.equal(log10DecimalSeries('1'), '0');
      assert.equal(log10DecimalSeries('1.00000'), '0');
      assert.equal(log10DecimalSeries('+1e0'), '0');
      assert.equal(log10DecimalSeries('10'), '1');
      assert.equal(log10DecimalSeries('10.'), '1');
      assert.equal(log10DecimalSeries('100'), '2');
      assert.equal(log10DecimalSeries('1000000'), '6');
      assert.equal(log10DecimalSeries('0.1'), '-1');
      assert.equal(log10DecimalSeries('.1'), '-1');
      assert.equal(log10DecimalSeries('0.001'), '-3');
      assert.equal(log10DecimalSeries('1e50'), '50');
      assert.equal(log10DecimalSeries('1E-50'), '-50');
      assert.equal(log10DecimalSeries('1e1000', 60), '1000');
      assert.equal(log10DecimalSeries('1e-1000', 60), '-1000');
      assert.equal(log10DecimalSeries('  +1000.000e-1  '), '2');
    });
  });

  describe('known values and normal cases', () => {
    it('computes log10(2), log10(3), log10(5) at default precision (30 digits)', () => {
      assert.equal(log10DecimalSeries('2'), '0.301029995663981195213738894724');
      assert.equal(log10DecimalSeries('3'), '0.477121254719662437295027903255');
      assert.equal(log10DecimalSeries('5'), '0.698970004336018804786261105276');
    });

    it('handles negative logarithms for values in (0, 1)', () => {
      assert.equal(log10DecimalSeries('0.5'), '-0.301029995663981195213738894724');
      assert.equal(log10DecimalSeries('0.2'), '-0.698970004336018804786261105276');
      assert.equal(log10DecimalSeries('0.002'), '-2.698970004336018804786261105276');
    });

    it('handles configurable low and medium precision', () => {
      assert.equal(log10DecimalSeries('2', 1), '0.3');
      assert.equal(log10DecimalSeries('2', 5), '0.30103');
      assert.equal(log10DecimalSeries('2', 10), '0.3010299957');
      assert.equal(log10DecimalSeries('200', 6), '2.30103');
    });

    it('matches Math.log10 across diverse positive numbers', () => {
      const samples = [
        '0.00012345',
        '0.3333333333333333',
        '0.9999',
        '1.0001',
        '2.718281828459045',
        '3.141592653589793',
        '7.5',
        '42',
        '999.999',
        '123456789.123456',
        '1.5e-120',
        '9.87654321e200',
      ];
      for (const s of samples) {
        const expected = Math.log10(Number(s));
        const actual = Number(log10DecimalSeries(s, 20));
        const tol = Math.max(1e-13, Math.abs(expected) * 1e-14);
        assert.ok(
          Math.abs(actual - expected) <= tol,
          `Mismatch for ${s}: got ${actual}, expected ${expected}`
        );
      }
    });
  });

  describe('high precision (> 50 digits) and extreme magnitudes', () => {
    it('computes log10(2) to 60 and 80 decimal places accurately', () => {
      const log10Of2To80 =
        '0.30102999566398119521373889472449302676818988146210854131042746112710818927442451';
      assert.equal(log10DecimalSeries('2', 60), log10Of2To80.slice(0, 62));
      assert.equal(log10DecimalSeries('2', 80), log10Of2To80);
    });

    it('computes log10(e) to 60 decimal places accurately', () => {
      // e to 70+ digits
      const eStr =
        '2.7182818284590452353602874713526624977572470936999595749669676277240766303535';
      const log10OfETo60 =
        '0.434294481903251827651128918916605082294397005803666566114454';
      assert.equal(log10DecimalSeries(eStr, 60), log10OfETo60);
    });

    it('handles very small and very large numbers beyond IEEE-754 double range', () => {
      const huge = log10DecimalSeries('2e500', 40);
      assert.equal(huge, '500.3010299956639811952137388947244930267682');

      const tiny = log10DecimalSeries('2e-500', 40);
      // -500 + 0.301029995663981195213738894724493026768189... = -499.6989700043360188047862611052755069732318
      assert.equal(tiny, '-499.6989700043360188047862611052755069732318');
    });

    it('handles values very close to 1 without catastrophic cancellation', () => {
      // ln(1 + 1e-20) / ln(10) = (1e-20 - 0.5e-40 + ...) * log10(e)
      const val = '1.00000000000000000001';
      const actual = log10DecimalSeries(val, 50);
      // First 20 fractional digits are 0, followed by log10(e) digits:
      // 43429448190325182765 (then -0.5 * 4.3429448190e-41 = -2.1714724095e-41)
      // log10(e) * 1e-20 = 0.000000000000000000004342944819032518276511289189166...
      // minus 0.5*1e-40*log10(e) =              ...21714724095...
      // => ...18276511289189166 - 2171472409.5 = ...18276511287017694... wait:
      // 1e-20 starts at digit 21, 1e-40 starts at digit 41:
      // digit 21..40: 43429448190325182765
      // digit 41..50: 1128918917 - 2171472410 -> borrow 1 from digit 40!
      // Verify via 100 * log10(1 + 1e-20) ~= log10((1 + 1e-20)^100)
      assert.ok(actual.startsWith('0.000000000000000000004342944819032518276'));
      // Value that rounds to 0 must never return "-0"
      assert.equal(log10DecimalSeries('0.9999999999999999999999999999999999999999', 20), '0');
    });
  });

  describe('independent mathematical identity cross-checks', () => {
    it('satisfies log10(a * b) = log10(a) + log10(b) at 65-digit precision', () => {
      const p = 65;
      const pairs = [
        ['2', '5', '10'],
        ['3', '7', '21'],
        ['12.345', '67.89', '838.10205'],
        ['0.00073', '19384.5', '14.150685'],
        ['9876543210987654321', '1234567890123456789', '12193263113702179522374638011112635269'],
      ];

      for (const [a, b, prod] of pairs) {
        const la = toScaledBigInt(log10DecimalSeries(a, p), p);
        const lb = toScaledBigInt(log10DecimalSeries(b, p), p);
        const lp = toScaledBigInt(log10DecimalSeries(prod, p), p);
        const diff = la + lb > lp ? la + lb - lp : lp - (la + lb);
        assert.ok(
          diff <= 1n,
          `log10(${a}) + log10(${b}) != log10(${prod}) within 1 ULP at ${p} digits (diff=${diff})`
        );
      }
    });

    it('satisfies log10(a^n) = n * log10(a) at 60-digit precision', () => {
      const p = 60;
      const cases = [
        [2n, 100],
        [3n, 50],
        [7n, 35],
        [13n, 40],
      ];

      for (const [base, exp] of cases) {
        const powerStr = (base ** BigInt(exp)).toString();
        const lhs = toScaledBigInt(log10DecimalSeries(powerStr, p), p);
        const rhs = BigInt(exp) * toScaledBigInt(log10DecimalSeries(base.toString(), p), p);
        const diff = lhs > rhs ? lhs - rhs : rhs - lhs;
        assert.ok(
          diff <= BigInt(exp),
          `log10(${base}^${exp}) != ${exp} * log10(${base}) (diff=${diff})`
        );
      }
    });

    it('satisfies log10(1 / x) = -log10(x) exactly for terminating reciprocals', () => {
      const p = 70;
      const pairs = [
        ['2', '0.5'],
        ['4', '0.25'],
        ['8', '0.125'],
        ['16', '0.0625'],
        ['125', '0.008'],
        ['6250', '0.00016'],
      ];

      for (const [x, invX] of pairs) {
        const lx = toScaledBigInt(log10DecimalSeries(x, p), p);
        const linv = toScaledBigInt(log10DecimalSeries(invX, p), p);
        assert.equal(lx + linv, 0n, `Expected log10(${x}) + log10(${invX}) === 0`);
      }
    });
  });

  describe('strict input validation', () => {
    it('rejects non-string values with TypeError', () => {
      for (const bad of [undefined, null, 10, 10n, {}, [], true]) {
        assert.throws(() => log10DecimalSeries(bad), TypeError);
      }
    });

    it('rejects zero and negative decimal strings with RangeError', () => {
      for (const bad of ['0', '0.0', '0.00000', '+0', '-0', '0e10', '-1', '-0.0001', '-1e-50', '-100']) {
        assert.throws(() => log10DecimalSeries(bad), RangeError, `Should reject "${bad}"`);
      }
    });

    it('rejects malformed decimal strings with RangeError', () => {
      for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '.', '1.2.3', '1e', '1e+', 'e10', '1_000', '0x10']) {
        assert.throws(() => log10DecimalSeries(bad), RangeError, `Should reject "${bad}"`);
      }
    });

    it('rejects invalid precision arguments', () => {
      for (const badType of ['30', null, 30n, {}, []]) {
        assert.throws(() => log10DecimalSeries('2', badType), TypeError);
      }
      for (const badRange of [0, -1, -30, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => log10DecimalSeries('2', badRange), RangeError);
      }
    });
  });
});
