import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyDecimalStable } from './multiplyDecimalStable.js';

/**
 * Independent reference implementation: schoolbook base-10 digit-by-digit multiplication
 * over positive/negative plain decimal strings (no BigInt multiplication used).
 */
function schoolbookMultiplyPlain(a, b) {
  let sign = 1;
  if (a.startsWith('-')) {
    sign = -sign;
    a = a.slice(1);
  }
  if (b.startsWith('-')) {
    sign = -sign;
    b = b.slice(1);
  }

  const [ai, af = ''] = a.split('.');
  const [bi, bf = ''] = b.split('.');
  const scale = af.length + bf.length;
  const ad = (ai + af).replace(/^0+/, '');
  const bd = (bi + bf).replace(/^0+/, '');

  if (!ad || !bd) return '0';

  const result = new Array(ad.length + bd.length).fill(0);
  for (let i = ad.length - 1; i >= 0; i--) {
    const da = ad.charCodeAt(i) - 48;
    for (let j = bd.length - 1; j >= 0; j--) {
      const db = bd.charCodeAt(j) - 48;
      const sum = da * db + result[i + j + 1];
      result[i + j + 1] = sum % 10;
      result[i + j] += Math.floor(sum / 10);
    }
  }

  let digits = result.join('').replace(/^0+/, '');
  if (!digits) return '0';

  let formatted;
  if (scale === 0) {
    formatted = digits;
  } else if (digits.length <= scale) {
    formatted = '0.' + '0'.repeat(scale - digits.length) + digits;
  } else {
    const split = digits.length - scale;
    formatted = digits.slice(0, split) + '.' + digits.slice(split);
  }

  if (formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '');
  }

  return (sign < 0 ? '-' : '') + formatted;
}

/**
 * Convert a plain decimal string to a scaled BigInt at the given fractional scale.
 */
function toScaledBigInt(str, targetScale) {
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const [iPart, fPart = ''] = body.split('.');
  const pad = targetScale - fPart.length;
  assert.ok(pad >= 0, 'targetScale must be >= fractional digits');
  const mag = BigInt(iPart + fPart + '0'.repeat(pad));
  return neg ? -mag : mag;
}

describe('multiplyDecimalStable', () => {
  describe('normal arithmetic cases', () => {
    it('multiplies integers and signed decimals accurately', () => {
      assert.equal(multiplyDecimalStable('6', '7'), '42');
      assert.equal(multiplyDecimalStable('-6', '7'), '-42');
      assert.equal(multiplyDecimalStable('6', '-7'), '-42');
      assert.equal(multiplyDecimalStable('-6', '-7'), '42');
      assert.equal(multiplyDecimalStable('+12.5', '+4'), '50');
      assert.equal(multiplyDecimalStable('12.34', '56.78'), '700.6652');
    });

    it('avoids IEEE-754 floating-point precision artifacts', () => {
      assert.equal(multiplyDecimalStable('0.1', '0.2'), '0.02');
      assert.equal(multiplyDecimalStable('0.14', '100'), '14');
      assert.equal(multiplyDecimalStable('0.29', '100'), '29');
      assert.equal(multiplyDecimalStable('1.005', '100'), '100.5');
      assert.equal(multiplyDecimalStable('19.99', '100'), '1999');
      assert.equal(multiplyDecimalStable('0.3', '3'), '0.9');
    });

    it('handles arbitrary precision well beyond IEEE-754 safe integer limits', () => {
      const a = '123456789012345678901234567890.1234567890123456789';
      const b = '987654321098765432109876543210.9876543210987654321';
      const expected = schoolbookMultiplyPlain(a, b);
      assert.equal(multiplyDecimalStable(a, b), expected);
    });

    it('supports scientific notation and cancels extreme exponents cleanly', () => {
      assert.equal(multiplyDecimalStable('1.5e3', '2e-2'), '30');
      assert.equal(multiplyDecimalStable('-2.5E-4', '4E+4'), '-10');
      assert.equal(multiplyDecimalStable('.5e2', '5.e-1'), '25');
      assert.equal(multiplyDecimalStable('1e10000', '1e-10000'), '1');
      assert.equal(multiplyDecimalStable('3.5e50000', '2e-50000'), '7');
    });
  });

  describe('configurable precision and round-half-to-even', () => {
    it('rounds ties to even for both positive and negative values', () => {
      // precision = 0
      assert.equal(multiplyDecimalStable('0.5', '1', 0), '0');
      assert.equal(multiplyDecimalStable('-0.5', '1', 0), '0');
      assert.equal(multiplyDecimalStable('1.5', '1', 0), '2');
      assert.equal(multiplyDecimalStable('2.5', '1', 0), '2');
      assert.equal(multiplyDecimalStable('3.5', '1', 0), '4');
      assert.equal(multiplyDecimalStable('-1.5', '1', 0), '-2');
      assert.equal(multiplyDecimalStable('-2.5', '1', 0), '-2');

      // precision = 2
      assert.equal(multiplyDecimalStable('0.005', '1', 2), '0');
      assert.equal(multiplyDecimalStable('-0.005', '1', 2), '0');
      assert.equal(multiplyDecimalStable('0.015', '1', 2), '0.02');
      assert.equal(multiplyDecimalStable('0.025', '1', 2), '0.02');
      assert.equal(multiplyDecimalStable('-0.015', '1', 2), '-0.02');
      assert.equal(multiplyDecimalStable('-0.025', '1', 2), '-0.02');
    });

    it('rounds strictly above half up and strictly below half down', () => {
      assert.equal(multiplyDecimalStable('0.50000000000000000001', '1', 0), '1');
      assert.equal(multiplyDecimalStable('0.49999999999999999999', '1', 0), '0');
      assert.equal(multiplyDecimalStable('-0.50000000000000000001', '1', 0), '-1');
      assert.equal(multiplyDecimalStable('2.5000000001', '1', 0), '3');
      assert.equal(multiplyDecimalStable('1.234', '5.678', 2), '7.01');
      assert.equal(multiplyDecimalStable('1.234', '5.678', 4), '7.0067');
    });

    it('propagates carries across 9s during rounding', () => {
      assert.equal(multiplyDecimalStable('9.995', '1', 2), '10');
      assert.equal(multiplyDecimalStable('-9.995', '1', 2), '-10');
      assert.equal(multiplyDecimalStable('99.9999', '1', 3), '100');
      assert.equal(multiplyDecimalStable('0.999', '1', 2), '1');
    });

    it('handles sub-ULP products and precision exceeding exact scale', () => {
      assert.equal(multiplyDecimalStable('1e-50000', '1e-50000', 10), '0');
      assert.equal(multiplyDecimalStable('-1e-500', '1e-500', 50), '0');
      assert.equal(multiplyDecimalStable('0.1', '0.2', 20), '0.02');
      assert.equal(multiplyDecimalStable('5', '4', 0), '20');
      assert.equal(multiplyDecimalStable('5', '4', 5), '20');
    });
  });

  describe('edge cases and input validation', () => {
    it('normalizes all zero forms to "0" without negative zero', () => {
      assert.equal(multiplyDecimalStable('0', '0'), '0');
      assert.equal(multiplyDecimalStable('-0', '42.5'), '0');
      assert.equal(multiplyDecimalStable('42.5', '-0.000'), '0');
      assert.equal(multiplyDecimalStable('-0.0', '-0.0'), '0');
      assert.equal(multiplyDecimalStable('0e100000000', '1e100000000'), '0');
      assert.equal(multiplyDecimalStable('-0.004', '1', 2), '0');
    });

    it('accepts leading/trailing zeros, whitespace, and shorthand decimals', () => {
      assert.equal(multiplyDecimalStable('  +00012.3400  ', '  00.0100  '), '0.1234');
      assert.equal(multiplyDecimalStable('.5', '2.'), '1');
      assert.equal(multiplyDecimalStable('-.25', '-.4'), '0.1');
    });

    it('throws TypeError on non-string operands or non-number precision', () => {
      assert.throws(() => multiplyDecimalStable(1.5, '2'), TypeError);
      assert.throws(() => multiplyDecimalStable('1.5', 2), TypeError);
      assert.throws(() => multiplyDecimalStable(null, '2'), TypeError);
      assert.throws(() => multiplyDecimalStable('2', undefined), TypeError);
      assert.throws(() => multiplyDecimalStable(10n, '2'), TypeError);
      assert.throws(() => multiplyDecimalStable('1', '2', '2'), TypeError);
      assert.throws(() => multiplyDecimalStable('1', '2', null), TypeError);
    });

    it('throws RangeError on malformed decimal strings, invalid precision, or extreme output length', () => {
      for (const bad of ['', '   ', '.', '+.', '-.', '+', '-', 'NaN', 'Infinity', '-Infinity', '1.2.3', '1e', '1e+', '1_000', '0x10', '12abc']) {
        assert.throws(() => multiplyDecimalStable(bad, '1'), RangeError, `expected RangeError for "${bad}"`);
        assert.throws(() => multiplyDecimalStable('1', bad), RangeError, `expected RangeError for "${bad}"`);
      }

      for (const badPrec of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => multiplyDecimalStable('1', '2', badPrec), RangeError);
      }

      assert.throws(() => multiplyDecimalStable('1e2000000', '1'), RangeError);
      assert.throws(() => multiplyDecimalStable('1e-2000000', '1'), RangeError);
    });
  });

  describe('independent cross-checks and mathematical invariants', () => {
    it('matches independent schoolbook digit-by-digit multiplication across pseudo-random decimals', () => {
      // Deterministic LCG for reproducible test vectors
      let state = 0x12345678;
      const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state;
      };

      const genDecimal = () => {
        const neg = (next() & 1) === 1 ? '-' : '';
        const intLen = 1 + (next() % 25);
        const fracLen = next() % 25;
        let s = '';
        for (let i = 0; i < intLen; i++) s += String(next() % 10);
        if (fracLen > 0) {
          s += '.';
          for (let i = 0; i < fracLen; i++) s += String(next() % 10);
        }
        return neg + s;
      };

      for (let i = 0; i < 60; i++) {
        const a = genDecimal();
        const b = genDecimal();
        const actual = multiplyDecimalStable(a, b);
        const expected = schoolbookMultiplyPlain(a, b);
        assert.equal(actual, expected, `mismatch for (${a}) * (${b})`);
      }
    });

    it('satisfies commutativity, associativity, and identity laws', () => {
      const values = [
        '0',
        '1',
        '-1',
        '0.0001234567890123456789',
        '-98765432109876543210.5',
        '3.141592653589793238462643383279',
      ];

      for (const a of values) {
        assert.equal(multiplyDecimalStable(a, '1'), a === '0' ? '0' : a);
        for (const b of values) {
          assert.equal(multiplyDecimalStable(a, b), multiplyDecimalStable(b, a));
        }
      }

      const [x, y, z] = [values[3], values[4], values[5]];
      assert.equal(
        multiplyDecimalStable(multiplyDecimalStable(x, y), z),
        multiplyDecimalStable(x, multiplyDecimalStable(y, z))
      );
    });

    it('satisfies the exact 0.5 ULP error bound across precisions', () => {
      const pairs = [
        ['3.14159265358979323846', '2.71828182845904523536'],
        ['-12345.6789012345', '0.000987654321'],
        ['0.33333333333333333333', '0.66666666666666666667'],
      ];

      for (const [a, b] of pairs) {
        const exact = multiplyDecimalStable(a, b);
        const exactFracLen = (exact.split('.')[1] ?? '').length;

        for (const p of [0, 1, 2, 5, 10, 15, 25]) {
          const rounded = multiplyDecimalStable(a, b, p);
          const scale = Math.max(exactFracLen, p) + 1;
          const exactScaled = toScaledBigInt(exact, scale);
          const roundedScaled = toScaledBigInt(rounded, scale);
          const diff = exactScaled >= roundedScaled
            ? exactScaled - roundedScaled
            : roundedScaled - exactScaled;
          const halfUlp = 5n * (10n ** BigInt(scale - p - 1));
          assert.ok(
            diff <= halfUlp,
            `error ${diff} exceeded 0.5 ULP (${halfUlp}) for (${a})*(${b}) at p=${p}`
          );
        }
      }
    });
  });
});
