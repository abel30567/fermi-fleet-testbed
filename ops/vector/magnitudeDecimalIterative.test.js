import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeDecimalIterative } from './magnitudeDecimalIterative.js';

/**
 * Independent exact decimal helper for test cross-checks.
 * Represents a decimal string as { num: bigint, exp: number } where value = num * 10^exp.
 */
function parseExactDecimal(str) {
  const neg = str.startsWith('-');
  const unsigned = neg || str.startsWith('+') ? str.slice(1) : str;
  const [mantissa, expPart] = unsigned.split(/[eE]/);
  const sciExp = expPart ? Number(expPart) : 0;
  const dotIdx = mantissa.indexOf('.');
  let digits;
  let fracLen;
  if (dotIdx === -1) {
    digits = mantissa;
    fracLen = 0;
  } else {
    digits = mantissa.slice(0, dotIdx) + mantissa.slice(dotIdx + 1);
    fracLen = mantissa.length - dotIdx - 1;
  }
  const num = BigInt(digits) * (neg ? -1n : 1n);
  return { num, exp: sciExp - fracLen };
}

function addExact(a, b) {
  const minExp = Math.min(a.exp, b.exp);
  const aScaled = a.num * (10n ** BigInt(a.exp - minExp));
  const bScaled = b.num * (10n ** BigInt(b.exp - minExp));
  return { num: aScaled + bScaled, exp: minExp };
}

function subExact(a, b) {
  return addExact(a, { num: -b.num, exp: b.exp });
}

function mulExact(a, b) {
  return { num: a.num * b.num, exp: a.exp + b.exp };
}

function cmpExact(a, b) {
  const diff = subExact(a, b);
  if (diff.num < 0n) return -1;
  if (diff.num > 0n) return 1;
  return 0;
}

function formatExact({ num, exp }) {
  if (num === 0n) return '0';
  const neg = num < 0n;
  const absStr = (neg ? -num : num).toString();
  let result;
  if (exp >= 0) {
    result = absStr + '0'.repeat(exp);
  } else {
    const p = -exp;
    if (absStr.length <= p) {
      result = '0.' + '0'.repeat(p - absStr.length) + absStr;
    } else {
      result = absStr.slice(0, absStr.length - p) + '.' + absStr.slice(absStr.length - p);
    }
    result = result.replace(/\.?0+$/, '');
  }
  return neg ? `-${result}` : result;
}

function sumOfSquaresExact(vec) {
  let acc = { num: 0n, exp: 0 };
  for (const s of vec) {
    const d = parseExactDecimal(s);
    acc = addExact(acc, mulExact(d, d));
  }
  return acc;
}

describe('magnitudeDecimalIterative', () => {
  describe('normal cases', () => {
    it('computes exact Pythagorean triples and quadruples', () => {
      assert.equal(magnitudeDecimalIterative(['3', '4']), '5');
      assert.equal(magnitudeDecimalIterative(['5', '12']), '13');
      assert.equal(magnitudeDecimalIterative(['8', '15']), '17');
      assert.equal(magnitudeDecimalIterative(['7', '24']), '25');
      assert.equal(magnitudeDecimalIterative(['2', '3', '6']), '7');
      assert.equal(magnitudeDecimalIterative(['1', '2', '2']), '3');
    });

    it('handles decimal fractions and signs', () => {
      assert.equal(magnitudeDecimalIterative(['0.3', '0.4']), '0.5');
      assert.equal(magnitudeDecimalIterative(['-0.05', '+0.12']), '0.13');
      assert.equal(magnitudeDecimalIterative(['+3.', '.0', '-004.000']), '5');
      assert.equal(magnitudeDecimalIterative(['.6', '.8']), '1');
    });

    it('computes irrational magnitudes with default and custom precision', () => {
      assert.equal(magnitudeDecimalIterative(['1', '1']), '1.4142135623730950488');
      assert.equal(magnitudeDecimalIterative(['1', '1'], 5), '1.41421');
      assert.equal(magnitudeDecimalIterative(['1', '1'], 10), '1.4142135624');
      assert.equal(magnitudeDecimalIterative(['1', '1', '1'], 10), '1.7320508076');
      assert.equal(magnitudeDecimalIterative(['1', '2'], 10), '2.2360679775');
    });

    it('supports precision = 0 with half-up rounding', () => {
      assert.equal(magnitudeDecimalIterative(['3', '4'], 0), '5');
      assert.equal(magnitudeDecimalIterative(['1', '1'], 0), '1'); // 1.414... -> 1
      assert.equal(magnitudeDecimalIterative(['2', '2'], 0), '3'); // 2.828... -> 3
      assert.equal(magnitudeDecimalIterative(['1.5'], 0), '2'); // exact tie -> 2
      assert.equal(magnitudeDecimalIterative(['2.5'], 0), '3'); // exact tie -> 3
      assert.equal(magnitudeDecimalIterative(['1.499999999999'], 0), '1');
    });

    it('rounds exact ties half-up at arbitrary precision', () => {
      assert.equal(magnitudeDecimalIterative(['0.05'], 1), '0.1');
      assert.equal(magnitudeDecimalIterative(['0.15'], 1), '0.2');
      assert.equal(magnitudeDecimalIterative(['0.049999999999999999999'], 1), '0');
      assert.equal(magnitudeDecimalIterative(['0.005'], 2), '0.01');
    });
  });

  describe('edge cases', () => {
    it('handles zero vectors', () => {
      assert.equal(magnitudeDecimalIterative(['0']), '0');
      assert.equal(magnitudeDecimalIterative(['0', '0', '0']), '0');
      assert.equal(magnitudeDecimalIterative(['-0', '+0.000', '0.0e-50', '0e+50']), '0');
      assert.equal(magnitudeDecimalIterative(['0', '0'], 0), '0');
      assert.equal(magnitudeDecimalIterative(['0', '0'], 60), '0');
    });

    it('handles 1D vectors including negative values', () => {
      assert.equal(magnitudeDecimalIterative(['-7']), '7');
      assert.equal(magnitudeDecimalIterative(['-42.125']), '42.125');
      assert.equal(magnitudeDecimalIterative(['-0.000000125']), '0.000000125');
      assert.equal(magnitudeDecimalIterative(['+123456789012345678901234567890']), '123456789012345678901234567890');
    });

    it('handles high-dimensional vectors', () => {
      const ones100 = Array(100).fill('1');
      assert.equal(magnitudeDecimalIterative(ones100), '10');
      const halves16 = Array(16).fill('-0.5');
      assert.equal(magnitudeDecimalIterative(halves16), '2');
    });

    it('handles very small components', () => {
      assert.equal(
        magnitudeDecimalIterative(['3e-40', '4e-40'], 45),
        `0.${'0'.repeat(39)}5`,
      );
      assert.equal(magnitudeDecimalIterative(['3e-40', '4e-40'], 20), '0');
      assert.equal(
        magnitudeDecimalIterative(['1e-1000', '1e-1000'], 20),
        '0',
      );
    });

    it('handles very large components', () => {
      const a = `3${'0'.repeat(60)}`;
      const b = `4${'0'.repeat(60)}`;
      const expected = `5${'0'.repeat(60)}`;
      assert.equal(magnitudeDecimalIterative([a, b]), expected);
      assert.equal(magnitudeDecimalIterative(['3e60', '4e60']), expected);
      assert.equal(magnitudeDecimalIterative(['1e30', '1e-30'], 20), `1${'0'.repeat(30)}`);
    });

    it('handles high precision (50 and 60 decimal places)', () => {
      // Known exact 50 decimal places of sqrt(2):
      // 1.4142135623 7309504880 1688724209 6980785696 7187537694 8073... -> rounds to ...95
      const sqrt2_50 = '1.41421356237309504880168872420969807856967187537695';
      assert.equal(magnitudeDecimalIterative(['1', '1'], 50), sqrt2_50);

      // Known exact 60 decimal places of sqrt(3):
      // 1.7320508075 6887729352 7446341505 8723669428 0525381038 0628055806 9794... -> rounds to ...07
      const sqrt3_60 = '1.732050807568877293527446341505872366942805253810380628055807';
      assert.equal(magnitudeDecimalIterative(['1', '1', '1'], 60), sqrt3_60);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array vector', () => {
      for (const bad of [null, undefined, '3,4', 123, {}, new Set(['1'])]) {
        assert.throws(() => magnitudeDecimalIterative(bad), TypeError);
      }
    });

    it('throws RangeError for empty vector', () => {
      assert.throws(() => magnitudeDecimalIterative([]), RangeError);
    });

    it('throws TypeError for non-string vector elements', () => {
      for (const bad of [[1, 2], [null], [undefined], [3n], [{}], ['1', 2]]) {
        assert.throws(() => magnitudeDecimalIterative(bad), TypeError);
      }
    });

    it('throws RangeError for invalid decimal strings', () => {
      const invalid = [
        '',
        '   ',
        'abc',
        'NaN',
        'Infinity',
        '-Infinity',
        '1.2.3',
        '.',
        '+',
        '-',
        '+.',
        '-.',
        '1e',
        '1e+',
        '1e-',
        ' 3 ',
        '1_000',
        '0x10',
      ];
      for (const s of invalid) {
        assert.throws(() => magnitudeDecimalIterative([s]), RangeError, `expected RangeError for "${s}"`);
      }
    });

    it('validates precision argument', () => {
      for (const badType of ['10', null, 20n, {}, true]) {
        assert.throws(() => magnitudeDecimalIterative(['3', '4'], badType), TypeError);
      }
      for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity]) {
        assert.throws(() => magnitudeDecimalIterative(['3', '4'], badRange), RangeError);
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('squaring result brackets the exact sum of squares within half an ULP', () => {
      const cases = [
        { v: ['1.23456789', '-9.87654321', '0.00012345'], p: 30 },
        { v: ['314159265358979323846', '271828182845904523536'], p: 50 },
        { v: ['0.0000000007', '-0.0000000013', '0.0000000029'], p: 40 },
        { v: ['1', '2', '3', '4', '5', '6', '7'], p: 55 },
      ];

      for (const { v, p } of cases) {
        const magStr = magnitudeDecimalIterative(v, p);
        const m = parseExactDecimal(magStr);
        const halfUlp = { num: 5n, exp: -(p + 1) };
        const lo = subExact(m, halfUlp);
        const hi = addExact(m, halfUlp);

        const targetSq = sumOfSquaresExact(v);
        const loSq = lo.num <= 0n ? { num: 0n, exp: 0 } : mulExact(lo, lo);
        const hiSq = mulExact(hi, hi);

        assert.ok(
          cmpExact(loSq, targetSq) <= 0 && cmpExact(targetSq, hiSq) <= 0,
          `Expected ${magStr}^2 to bracket sum of squares within 0.5*10^-${p}`,
        );
      }
    });

    it('satisfies the triangle inequality ||u + v|| <= ||u|| + ||v||', () => {
      const pairs = [
        [['1.5', '-2.25', '3.75'], ['-4.1', '5.2', '-0.3']],
        [['1e15', '-2e15', '3e15'], ['4e15', '5e15', '-6e15']],
        [['0.00012', '0.00034'], ['0.00056', '0.00078']],
        [['2', '4', '6'], ['1', '2', '3']], // positively collinear -> equality
      ];
      const p = 35;
      const tol = { num: 3n, exp: -p };

      for (const [u, v] of pairs) {
        const sumVec = u.map((ui, idx) => formatExact(addExact(parseExactDecimal(ui), parseExactDecimal(v[idx]))));
        const normSum = parseExactDecimal(magnitudeDecimalIterative(sumVec, p));
        const normU = parseExactDecimal(magnitudeDecimalIterative(u, p));
        const normV = parseExactDecimal(magnitudeDecimalIterative(v, p));
        const rhs = addExact(addExact(normU, normV), tol);

        assert.ok(
          cmpExact(normSum, rhs) <= 0,
          `Triangle inequality failed for u=${JSON.stringify(u)}, v=${JSON.stringify(v)}`,
        );
      }
    });

    it('satisfies scaling homogeneity ||k * v|| = |k| * ||v||', () => {
      const v = ['1.25', '-3.75', '5.5', '-0.125'];
      const scalars = ['7', '-13', '0.0025', '-12345.6789', '1e12'];
      const p = 40;

      const normV = parseExactDecimal(magnitudeDecimalIterative(v, p));

      for (const kStr of scalars) {
        const k = parseExactDecimal(kStr);
        const absK = { num: k.num < 0n ? -k.num : k.num, exp: k.exp };
        const kv = v.map((vi) => formatExact(mulExact(k, parseExactDecimal(vi))));

        const lhs = parseExactDecimal(magnitudeDecimalIterative(kv, p));
        const rhs = mulExact(absK, normV);
        const diff = subExact(lhs, rhs);
        const absDiff = { num: diff.num < 0n ? -diff.num : diff.num, exp: diff.exp };
        // |lhs - |k|*normV| <= 0.5*10^-p + |k|*(0.5*10^-p) <= (1 + |k|)*10^-p
        const bound = mulExact(addExact({ num: 1n, exp: 0 }, absK), { num: 1n, exp: -p });

        assert.ok(
          cmpExact(absDiff, bound) <= 0,
          `Scaling homogeneity failed for k=${kStr}`,
        );
      }
    });

    it('is invariant under component negation and permutation', () => {
      const v = ['1.1', '-2.2', '3.3', '-4.4', '5.5'];
      const base = magnitudeDecimalIterative(v, 30);
      const negated = ['-1.1', '2.2', '-3.3', '4.4', '-5.5'];
      const permuted = ['5.5', '1.1', '-4.4', '3.3', '-2.2'];
      assert.equal(magnitudeDecimalIterative(negated, 30), base);
      assert.equal(magnitudeDecimalIterative(permuted, 30), base);
    });
  });
});
