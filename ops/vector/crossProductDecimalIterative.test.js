import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductDecimalIterative } from './crossProductDecimalIterative.js';

/**
 * Independent exact BigInt rational helper (`num / den`) for mathematical cross-checks.
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function makeRat(num, den = 1n) {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g = gcdBigInt(num, den);
  return { num: num / g, den: den / g };
}

function strToRat(str) {
  const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(str);
  assert.ok(m, `Invalid decimal in test helper: ${str}`);
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2] ?? '';
  const fracPart = m[3] ?? m[4] ?? '';
  const exp = (m[5] !== undefined ? Number(m[5]) : 0) - fracPart.length;
  const digits = BigInt(intPart + fracPart) * sign;
  if (exp >= 0) {
    return makeRat(digits * (10n ** BigInt(exp)), 1n);
  }
  return makeRat(digits, 10n ** BigInt(-exp));
}

function ratAdd(x, y) {
  return makeRat(x.num * y.den + y.num * x.den, x.den * y.den);
}

function ratSub(x, y) {
  return makeRat(x.num * y.den - y.num * x.den, x.den * y.den);
}

function ratMul(x, y) {
  return makeRat(x.num * y.num, x.den * y.den);
}

function ratDot(u, v) {
  let sum = makeRat(0n, 1n);
  for (let i = 0; i < 3; i += 1) {
    sum = ratAdd(sum, ratMul(strToRat(u[i]), strToRat(v[i])));
  }
  return sum;
}

function ratCross(u, v) {
  const ru = u.map(strToRat);
  const rv = v.map(strToRat);
  return [
    ratSub(ratMul(ru[1], rv[2]), ratMul(ru[2], rv[1])),
    ratSub(ratMul(ru[2], rv[0]), ratMul(ru[0], rv[2])),
    ratSub(ratMul(ru[0], rv[1]), ratMul(ru[1], rv[0])),
  ];
}

function negateDecimalStr(s) {
  if (s === '0') return '0';
  return s.startsWith('-') ? s.slice(1) : `-${s}`;
}

describe('crossProductDecimalIterative', () => {
  describe('normal cases', () => {
    it('computes standard 3D basis vector cross products (right-hand rule)', () => {
      const i = ['1', '0', '0'];
      const j = ['0', '1', '0'];
      const k = ['0', '0', '1'];

      assert.deepEqual(crossProductDecimalIterative(i, j), k);
      assert.deepEqual(crossProductDecimalIterative(j, k), i);
      assert.deepEqual(crossProductDecimalIterative(k, i), j);

      assert.deepEqual(crossProductDecimalIterative(j, i), ['0', '0', '-1']);
      assert.deepEqual(crossProductDecimalIterative(k, j), ['-1', '0', '0']);
      assert.deepEqual(crossProductDecimalIterative(i, k), ['0', '-1', '0']);
    });

    it('computes cross products of integer and simple decimal 3D vectors', () => {
      assert.deepEqual(
        crossProductDecimalIterative(['2', '3', '4'], ['5', '6', '7']),
        ['-3', '6', '-3'],
      );
      assert.deepEqual(
        crossProductDecimalIterative(['1.5', '-2.25', '0.5'], ['4', '0.5', '-3']),
        ['6.5', '6.5', '9.75'],
      );
    });

    it('preserves high precision beyond IEEE-754 float64 (~15-17 digits) without catastrophic cancellation', () => {
      // In float64, 1e20 + 1e-20 === 1e20, so float64 would return [0, 0, 0].
      const a = [
        '100000000000000000000.00000000000000000001',
        '200000000000000000000.00000000000000000002',
        '300000000000000000000.00000000000000000003',
      ];
      const b = [
        '100000000000000000000.00000000000000000004',
        '200000000000000000000.00000000000000000005',
        '300000000000000000000.00000000000000000007',
      ];

      assert.deepEqual(crossProductDecimalIterative(a, b, 40), [
        '-1.0000000000000000000000000000000000000001',
        '5.0000000000000000000000000000000000000005',
        '-3.0000000000000000000000000000000000000003',
      ]);
      // With default precision=20, the 1e-40 tail rounds away cleanly
      assert.deepEqual(crossProductDecimalIterative(a, b), ['-1', '5', '-3']);
    });

    it('supports 50+ decimal places, leading plus signs, shorthand decimals, and scientific notation', () => {
      const a = ['+1e-25', '.5', '0.000000000000000000000000000001'];
      const b = ['2.', '-3e-25', '4.0000'];

      const res = crossProductDecimalIterative(a, b, 60);
      assert.deepEqual(res, [
        '2.0000000000000000000000000000000000000000000000000000003',
        '-0.000000000000000000000000399998',
        '-1.00000000000000000000000000000000000000000000000003',
      ]);
    });

    it('rounds half away from zero at the requested precision and normalizes trailing zeros', () => {
      // [0, 1, 0] x [0, 0, x] = [x, 0, 0]
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '1.2345'], 3),
        ['1.235', '0', '0'],
      );
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '-1.2345'], 3),
        ['-1.235', '0', '0'],
      );
      // Carry propagation across decimal point
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '9.995'], 2),
        ['10', '0', '0'],
      );
      // Tiny negative value rounding to zero must return "0", never "-0"
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '-0.00004'], 3),
        ['0', '0', '0'],
      );
    });
  });

  describe('edge cases', () => {
    it('returns the zero vector for parallel and identical vectors', () => {
      const v = [
        '3.1415926535897932384626433832795028841971',
        '-2.7182818284590452353602874713526624977572',
        '1.6180339887498948482045868343656381177203',
      ];
      assert.deepEqual(crossProductDecimalIterative(v, v, 80), ['0', '0', '0']);

      // Parallel vector scaled by -2
      const scaled = [
        '-6.2831853071795864769252867665590057683942',
        '5.4365636569180904707205749427053249955144',
        '-3.2360679774997896964091736687312762354406',
      ];
      assert.deepEqual(crossProductDecimalIterative(v, scaled, 80), ['0', '0', '0']);
    });

    it('handles zero vectors and negative zeros without emitting "-0"', () => {
      const zero = ['0', '0', '0'];
      const negZero = ['-0', '-0.000', '+0.0'];
      const v = ['-123.456', '789.012', '-0.0001'];

      assert.deepEqual(crossProductDecimalIterative(zero, v), ['0', '0', '0']);
      assert.deepEqual(crossProductDecimalIterative(v, zero), ['0', '0', '0']);
      assert.deepEqual(crossProductDecimalIterative(negZero, v), ['0', '0', '0']);
      assert.deepEqual(crossProductDecimalIterative(negZero, negZero), ['0', '0', '0']);
    });

    it('handles precision = 0 by rounding each component to the nearest integer', () => {
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '2.5'], 0),
        ['3', '0', '0'],
      );
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '-2.5'], 0),
        ['-3', '0', '0'],
      );
      assert.deepEqual(
        crossProductDecimalIterative(['0', '1', '0'], ['0', '0', '-0.499999999999'], 0),
        ['0', '0', '0'],
      );
    });

    it('does not mutate input arrays', () => {
      const a = ['1.25', '-2.5', '3.75'];
      const b = ['-4.5', '5.25', '-6.125'];
      const aCopy = [...a];
      const bCopy = [...b];

      crossProductDecimalIterative(a, b, 10);

      assert.deepEqual(a, aCopy);
      assert.deepEqual(b, bCopy);
    });

    it('throws TypeError or RangeError on invalid inputs', () => {
      // Non-array vectors
      assert.throws(() => crossProductDecimalIterative(null, ['1', '2', '3']), TypeError);
      assert.throws(() => crossProductDecimalIterative(['1', '2', '3'], undefined), TypeError);
      assert.throws(() => crossProductDecimalIterative('1,2,3', ['1', '2', '3']), TypeError);
      assert.throws(() => crossProductDecimalIterative({ 0: '1', 1: '2', 2: '3' }, ['1', '2', '3']), TypeError);

      // Non-3D arrays
      assert.throws(() => crossProductDecimalIterative([], ['1', '2', '3']), RangeError);
      assert.throws(() => crossProductDecimalIterative(['1', '2'], ['1', '2', '3']), RangeError);
      assert.throws(() => crossProductDecimalIterative(['1', '2', '3'], ['1', '2', '3', '4']), RangeError);

      // Non-string elements (including sparse arrays)
      assert.throws(() => crossProductDecimalIterative([1, 2, 3], ['1', '2', '3']), TypeError);
      assert.throws(() => crossProductDecimalIterative(['1', null, '3'], ['1', '2', '3']), TypeError);
      assert.throws(() => crossProductDecimalIterative(['1', '2', '3'], new Array(3)), TypeError);

      // Malformed decimal strings
      for (const bad of ['', ' ', 'abc', 'NaN', 'Infinity', '-Infinity', '1.2.3', '.', '+', '-', '1e', '1e+', ' 1.0', '1.0 ']) {
        assert.throws(
          () => crossProductDecimalIterative([bad, '0', '0'], ['0', '1', '0']),
          RangeError,
          `Expected RangeError for invalid decimal "${bad}"`,
        );
      }

      // Invalid precision values
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], '20'), TypeError);
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], null), TypeError);
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], 20n), TypeError);
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], -1), RangeError);
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], 1.5), RangeError);
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], Number.NaN), RangeError);
      assert.throws(() => crossProductDecimalIterative(['1', '0', '0'], ['0', '1', '0'], Number.POSITIVE_INFINITY), RangeError);
    });
  });

  describe('mathematical cross-checks (independent rational arithmetic)', () => {
    const a = [
      '12345678901234567890.12345678901234567891',
      '-9876543210987654321.09876543210987654321',
      '42.000000000000000000000000000007',
    ];
    const b = [
      '-0.00000000000000000003141592653589793238',
      '27182818284590452353.60287471352662497757',
      '-16180339887498948482.0458683436563811772',
    ];
    const c = [
      '77777777777777777.88888888888888888889',
      '11111111111111111.22222222222222222223',
      '-33333333333333333.44444444444444444445',
    ];

    it('matches exact BigInt rational cross product component-by-component', () => {
      const exactCross = crossProductDecimalIterative(a, b, 100);
      const ratExpected = ratCross(a, b);
      for (let idx = 0; idx < 3; idx += 1) {
        assert.deepEqual(strToRat(exactCross[idx]), ratExpected[idx]);
      }
    });

    it('satisfies orthogonality: dot(a, a × b) = 0 and dot(b, a × b) = 0', () => {
      const ab = crossProductDecimalIterative(a, b, 100);
      assert.deepEqual(ratDot(a, ab), { num: 0n, den: 1n });
      assert.deepEqual(ratDot(b, ab), { num: 0n, den: 1n });
    });

    it('satisfies anti-commutativity: a × b = -(b × a)', () => {
      const ab = crossProductDecimalIterative(a, b, 100);
      const ba = crossProductDecimalIterative(b, a, 100);
      assert.deepEqual(ab, ba.map(negateDecimalStr));
    });

    it('satisfies Lagrange identity: ||a × b||^2 = ||a||^2 * ||b||^2 - (a · b)^2', () => {
      const ab = crossProductDecimalIterative(a, b, 100);
      const lhs = ratDot(ab, ab);
      const normASq = ratDot(a, a);
      const normBSq = ratDot(b, b);
      const dotAB = ratDot(a, b);
      const rhs = ratSub(ratMul(normASq, normBSq), ratMul(dotAB, dotAB));

      assert.deepEqual(lhs, rhs);
    });

    it('satisfies the Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0', () => {
      const bc = crossProductDecimalIterative(b, c, 120);
      const ca = crossProductDecimalIterative(c, a, 120);
      const ab = crossProductDecimalIterative(a, b, 120);

      const term1 = crossProductDecimalIterative(a, bc, 200);
      const term2 = crossProductDecimalIterative(b, ca, 200);
      const term3 = crossProductDecimalIterative(c, ab, 200);

      for (let idx = 0; idx < 3; idx += 1) {
        const sum = ratAdd(
          ratAdd(strToRat(term1[idx]), strToRat(term2[idx])),
          strToRat(term3[idx]),
        );
        assert.deepEqual(sum, { num: 0n, den: 1n });
      }
    });
  });
});
