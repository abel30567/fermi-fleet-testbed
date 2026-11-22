import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductDecimalIterative } from './dotProductDecimalIterative.js';

/**
 * Independent fixed-scale BigInt helper for vector addition/subtraction and scalar scaling
 * used solely in cross-check tests.
 */
function addScaledDecimalStrings(x, y, scale) {
  const toScaled = (s) => {
    const neg = s.startsWith('-');
    const clean = neg || s.startsWith('+') ? s.slice(1) : s;
    const [intPart, fracPart = ''] = clean.split('.');
    const paddedFrac = fracPart.padEnd(scale, '0');
    const val = BigInt(intPart + paddedFrac);
    return neg ? -val : val;
  };
  const sum = toScaled(x) + toScaled(y);
  if (sum === 0n) return '0';
  const neg = sum < 0n;
  const absStr = (neg ? -sum : sum).toString().padStart(scale + 1, '0');
  const intPart = absStr.slice(0, absStr.length - scale);
  const fracPart = absStr.slice(absStr.length - scale).replace(/0+$/, '');
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return neg ? `-${body}` : body;
}

function negateDecimalString(s) {
  if (s === '0') return '0';
  return s.startsWith('-') ? s.slice(1) : `-${s}`;
}

describe('dotProductDecimalIterative', () => {
  describe('normal cases', () => {
    it('computes exact dot product of integer vectors', () => {
      assert.equal(dotProductDecimalIterative(['1', '2', '3'], ['4', '5', '6']), '32');
      assert.equal(
        dotProductDecimalIterative(['10', '-20', '30', '-40'], ['-5', '6', '-7', '8']),
        '-700'
      );
    });

    it('avoids IEEE-754 floating-point drift on decimal inputs', () => {
      // In IEEE-754 float64, 0.1 * 0.3 + 0.2 * 0.4 === 0.11000000000000001
      assert.equal(dotProductDecimalIterative(['0.1', '0.2'], ['0.3', '0.4']), '0.11');
      assert.equal(dotProductDecimalIterative(['0.1', '0.2'], ['1', '1']), '0.3');
    });

    it('preserves high precision far beyond float64 (60+ fractional digits)', () => {
      const a = [
        '1.000000000000000000000000000001',
        '2.000000000000000000000000000003',
      ];
      const b = [
        '3.000000000000000000000000000002',
        '4.000000000000000000000000000005',
      ];
      // (1 + 1e-30)(3 + 2e-30) + (2 + 3e-30)(4 + 5e-30) = 11 + 27e-30 + 17e-60
      const expected = '11.000000000000000000000000000027000000000000000000000000000017';
      assert.equal(dotProductDecimalIterative(a, b, 65), expected);
    });

    it('handles catastrophic cancellation beyond float64 without precision loss', () => {
      const a = ['100000000000000000000', '1', '-100000000000000000000'];
      const b = ['1', '0.00000000000000000001', '1'];
      assert.equal(dotProductDecimalIterative(a, b, 25), '0.00000000000000000001');
    });

    it('handles huge integers beyond Number.MAX_SAFE_INTEGER', () => {
      const a = ['123456789012345678901234567890', '987654321098765432109876543210'];
      const b = ['2', '3'];
      // 246913578024691357802469135780 + 2962962963296296296329629629630
      assert.equal(dotProductDecimalIterative(a, b, 0), '3209876541320987654132098765410');
    });

    it('supports signed numbers, shorthand decimals, and scientific notation', () => {
      const a = ['+.5', '5.', '1.25e-4', '-2E+3'];
      const b = ['2', '.2', '8e4', '-1e-3'];
      // 1 + 1 + 10 + 2 = 14
      assert.equal(dotProductDecimalIterative(a, b, 10), '14');
    });

    it('rounds half away from zero and normalizes trailing zeros', () => {
      assert.equal(dotProductDecimalIterative(['0.125'], ['1'], 2), '0.13');
      assert.equal(dotProductDecimalIterative(['-0.125'], ['1'], 2), '-0.13');
      assert.equal(dotProductDecimalIterative(['0.124'], ['1'], 2), '0.12');
      assert.equal(dotProductDecimalIterative(['0.999'], ['1'], 2), '1');
      assert.equal(dotProductDecimalIterative(['-0.999'], ['1'], 2), '-1');
      // Default precision = 20
      assert.equal(
        dotProductDecimalIterative(['0.123456789012345678905'], ['1']),
        '0.12345678901234567891'
      );
    });
  });

  describe('edge cases', () => {
    it('returns "0" for empty vectors', () => {
      assert.equal(dotProductDecimalIterative([], []), '0');
      assert.equal(dotProductDecimalIterative([], [], 0), '0');
      assert.equal(dotProductDecimalIterative([], [], 50), '0');
    });

    it('handles 1D vectors including signed zeros', () => {
      assert.equal(dotProductDecimalIterative(['-7.5'], ['2']), '-15');
      assert.equal(dotProductDecimalIterative(['-0.000'], ['42.123']), '0');
      assert.equal(dotProductDecimalIterative(['0e-50'], ['1e50']), '0');
    });

    it('returns "0" for orthogonal high-precision vectors', () => {
      const x = '3.14159265358979323846264338327950288';
      const y = '2.71828182845904523536028747135266249';
      assert.equal(dotProductDecimalIterative([x, `-${y}`], [y, x], 80), '0');
    });

    it('never produces "-0" when negative values cancel or round to zero', () => {
      assert.equal(dotProductDecimalIterative(['-0.0004'], ['1'], 2), '0');
      assert.equal(dotProductDecimalIterative(['-0.0049999999999999999999'], ['1'], 2), '0');
      assert.equal(dotProductDecimalIterative(['-1.5', '1.5'], ['1', '1'], 5), '0');
    });

    it('handles precision = 0 accurately including sub-half boundary values', () => {
      assert.equal(dotProductDecimalIterative(['123.5'], ['1'], 0), '124');
      assert.equal(dotProductDecimalIterative(['-123.5'], ['1'], 0), '-124');
      assert.equal(
        dotProductDecimalIterative(['0.4999999999999999999999999999999999999999'], ['1'], 0),
        '0'
      );
      assert.equal(
        dotProductDecimalIterative(['0.5000000000000000000000000000000000000001'], ['1'], 0),
        '1'
      );
    });

    it('rejects invalid input types and malformed values', () => {
      // Non-array vectors
      assert.throws(() => dotProductDecimalIterative(null, []), TypeError);
      assert.throws(() => dotProductDecimalIterative([], undefined), TypeError);
      assert.throws(() => dotProductDecimalIterative('123', ['1']), TypeError);
      assert.throws(() => dotProductDecimalIterative({ length: 0 }, []), TypeError);

      // Mismatched lengths
      assert.throws(() => dotProductDecimalIterative(['1'], ['1', '2']), RangeError);
      assert.throws(() => dotProductDecimalIterative(['1', '2'], []), RangeError);

      // Non-string elements (including sparse array holes)
      assert.throws(() => dotProductDecimalIterative([1], ['1']), TypeError);
      assert.throws(() => dotProductDecimalIterative(['1'], [null]), TypeError);
      assert.throws(() => dotProductDecimalIterative(['1'], [1n]), TypeError);
      // eslint-disable-next-line no-sparse-arrays
      assert.throws(() => dotProductDecimalIterative([, '1'], ['1', '1']), TypeError);

      // Invalid decimal strings (including when paired with "0")
      for (const bad of ['', ' ', ' 1', '1 ', 'abc', 'NaN', 'Infinity', '1.2.3', '.', '1e', '1_000']) {
        assert.throws(() => dotProductDecimalIterative([bad], ['1']), RangeError);
        assert.throws(() => dotProductDecimalIterative(['0'], [bad]), RangeError);
      }

      // Invalid precision
      assert.throws(() => dotProductDecimalIterative([], [], '20'), TypeError);
      assert.throws(() => dotProductDecimalIterative([], [], null), TypeError);
      assert.throws(() => dotProductDecimalIterative([], [], 20n), TypeError);
      assert.throws(() => dotProductDecimalIterative([], [], -1), RangeError);
      assert.throws(() => dotProductDecimalIterative([], [], 1.5), RangeError);
      assert.throws(() => dotProductDecimalIterative([], [], Number.NaN), RangeError);
      assert.throws(() => dotProductDecimalIterative([], [], Number.POSITIVE_INFINITY), RangeError);
      assert.throws(
        () => dotProductDecimalIterative([], [], Number.MAX_SAFE_INTEGER + 1),
        RangeError
      );
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies the polarization identity: dot(a, b) === (||a + b||^2 - ||a - b||^2) / 4', () => {
      const a = [
        '12.34567890123456789012345',
        '-0.00098765432109876543211',
        '98765.43210987654321098765432',
        '-42.19500000000000000000001',
      ];
      const b = [
        '-3.14159265358979323846264',
        '2.71828182845904523536028',
        '0.57721566490153286060651',
        '1.61803398874989484820458',
      ];
      const scale = 25;
      const sumVec = a.map((ai, i) => addScaledDecimalStrings(ai, b[i], scale));
      const diffVec = a.map((ai, i) =>
        addScaledDecimalStrings(ai, negateDecimalString(b[i]), scale)
      );

      const normSumSq = dotProductDecimalIterative(sumVec, sumVec, 60);
      const normDiffSq = dotProductDecimalIterative(diffVec, diffVec, 60);
      const diffNormSq = addScaledDecimalStrings(normSumSq, negateDecimalString(normDiffSq), 60);
      // Multiply by 0.25 via dot product of 1D vector with 0.25
      const fromPolarization = dotProductDecimalIterative([diffNormSq], ['0.25'], 60);
      const direct = dotProductDecimalIterative(a, b, 60);

      assert.equal(direct, fromPolarization);
    });

    it('satisfies symmetry and bilinearity: dot(a, b) === dot(b, a) and dot(a, b + c) === dot(a, b) + dot(a, c)', () => {
      const a = ['1.11111111111111111111', '-2.22222222222222222222', '3.33333333333333333333'];
      const b = ['4.44444444444444444444', '5.55555555555555555555', '-6.66666666666666666666'];
      const c = ['-7.77777777777777777777', '8.88888888888888888888', '9.99999999999999999999'];

      // Symmetry
      assert.equal(dotProductDecimalIterative(a, b, 50), dotProductDecimalIterative(b, a, 50));

      // Bilinearity
      const bPlusC = b.map((bi, i) => addScaledDecimalStrings(bi, c[i], 20));
      const lhs = dotProductDecimalIterative(a, bPlusC, 50);
      const ab = dotProductDecimalIterative(a, b, 50);
      const ac = dotProductDecimalIterative(a, c, 50);
      const rhs = addScaledDecimalStrings(ab, ac, 50);

      assert.equal(lhs, rhs);
    });

    it('matches exact closed-form sum of squares n(n+1)(2n+1)/6 * 10^-30', () => {
      const n = 100;
      const vec = [];
      for (let k = 1; k <= n; k += 1) {
        vec.push(`${k}e-15`);
      }
      // sum_{k=1}^{100} k^2 = 100 * 101 * 201 / 6 = 338350
      // 338350 * 10^-30 = 0.00000000000000000000000033835
      assert.equal(
        dotProductDecimalIterative(vec, vec, 35),
        '0.00000000000000000000000033835'
      );
    });
  });
});
