import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeDecimalSeries } from './transposeDecimalSeries.js';

/**
 * Independent BigInt exact scaled decimal helper for algebraic cross-checks.
 * Scales a decimal string `s` by `10^commonScale` into an exact BigInt.
 */
function toScaledBigInt(str, commonScale) {
  const negative = str.startsWith('-');
  const unsigned = negative || str.startsWith('+') ? str.slice(1) : str;
  const [intPart, fracPart = ''] = unsigned.split('.');
  if (fracPart.length > commonScale) {
    throw new Error(`Fraction length exceeds commonScale=${commonScale} for ${str}`);
  }
  const padded = intPart + fracPart.padEnd(commonScale, '0');
  const val = BigInt(padded);
  return negative ? -val : val;
}

describe('transposeDecimalSeries', () => {
  it('transposes a square 3x3 matrix', () => {
    const input = [
      ['1', '2.5', '-3.75'],
      ['4.125', '0', '6'],
      ['-7.5', '8.25', '9.5'],
    ];

    const expected = [
      ['1', '4.125', '-7.5'],
      ['2.5', '0', '8.25'],
      ['-3.75', '6', '9.5'],
    ];

    assert.deepEqual(transposeDecimalSeries(input, 10), expected);
  });

  it('transposes a rectangular 2x3 matrix into a 3x2 matrix', () => {
    const input = [
      ['1.1', '2.2', '3.3'],
      ['4.4', '5.5', '6.6'],
    ];

    const expected = [
      ['1.1', '4.4'],
      ['2.2', '5.5'],
      ['3.3', '6.6'],
    ];

    assert.deepEqual(transposeDecimalSeries(input, 5), expected);
  });

  it('transposes row vector (1xN) to column vector (Nx1) and back', () => {
    const rowVec = [['-10.25', '0', '3.14159', '42']];
    const colVec = [
      ['-10.25'],
      ['0'],
      ['3.14159'],
      ['42'],
    ];

    assert.deepEqual(transposeDecimalSeries(rowVec, 10), colVec);
    assert.deepEqual(transposeDecimalSeries(colVec, 10), rowVec);
  });

  it('transposes a 1x1 matrix', () => {
    assert.deepEqual(transposeDecimalSeries([['-0042.12500']], 10), [['-42.125']]);
  });

  it('preserves high-precision (>40 digits) entries without floating-point loss', () => {
    const pi55 = '3.1415926535897932384626433832795028841971693993751058209';
    const e55 = '2.7182818284590452353602874713526624977572470936999595749';
    const negBig = '-987654321098765432109876543210.0123456789012345678901234567890123456789012345';
    const tiny = '0.0000000000000000000000000000000000000000000000123456789';

    const input = [
      [pi55, e55],
      [negBig, tiny],
    ];

    const result = transposeDecimalSeries(input, 60);
    assert.deepEqual(result, [
      [pi55, negBig],
      [e55, tiny],
    ]);
  });

  it('normalizes negative zeros, plus signs, leading/trailing zeros, and scientific notation', () => {
    const input = [
      ['-0', '-0.0000', '+0.00'],
      ['+0007.5000', '.250', '5.'],
      ['1.25e-4', '-2.5E3', ' -0.0004 '],
    ];

    const result = transposeDecimalSeries(input, 6);
    assert.deepEqual(result, [
      ['0', '7.5', '0.000125'],
      ['0', '0.25', '-2500'],
      ['0', '5', '-0.0004'],
    ]);
  });

  it('rounds accurately according to configurable precision (including precision = 0)', () => {
    const input = [
      ['1.2345', '-1.2345', '9.999'],
      ['-0.004', '0.005', '-0.005'],
    ];

    assert.deepEqual(transposeDecimalSeries(input, 2), [
      ['1.23', '0'],
      ['-1.23', '0.01'],
      ['10', '-0.01'],
    ]);

    assert.deepEqual(transposeDecimalSeries(input, 3), [
      ['1.235', '-0.004'],
      ['-1.235', '0.005'],
      ['9.999', '-0.005'],
    ]);

    assert.deepEqual(transposeDecimalSeries(input, 0), [
      ['1', '0'],
      ['-1', '0'],
      ['10', '0'],
    ]);
  });

  it('does not mutate the input matrix or any of its rows', () => {
    const row0 = ['+01.50', '-0.00'];
    const row1 = ['2.34567', '3'];
    const input = [row0, row1];
    const snapshot = structuredClone(input);

    const transposed = transposeDecimalSeries(input, 2);
    transposed[0][0] = '999';

    assert.deepEqual(input, snapshot);
    assert.strictEqual(input[0], row0);
    assert.strictEqual(input[1], row1);
  });

  it('throws on invalid matrices, invalid decimal strings, and invalid precision', () => {
    // Non-array / empty / ragged matrices
    assert.throws(() => transposeDecimalSeries(null), TypeError);
    assert.throws(() => transposeDecimalSeries('123'), TypeError);
    assert.throws(() => transposeDecimalSeries([]), RangeError);
    assert.throws(() => transposeDecimalSeries([[]]), RangeError);
    assert.throws(() => transposeDecimalSeries(['1', '2']), TypeError);
    assert.throws(() => transposeDecimalSeries([['1', '2'], 'bad']), TypeError);
    assert.throws(() => transposeDecimalSeries([['1', '2'], ['3']]), RangeError);

    // Invalid entry types and strings
    assert.throws(() => transposeDecimalSeries([[1, 2]]), TypeError);
    assert.throws(() => transposeDecimalSeries([[undefined]]), TypeError);
    assert.throws(() => transposeDecimalSeries([['']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['   ']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['NaN']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['Infinity']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['-Infinity']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['1.2.3']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['12abc']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['.']]), RangeError);
    assert.throws(() => transposeDecimalSeries([['1e99999999']]), RangeError);

    // Invalid precision
    assert.throws(() => transposeDecimalSeries([['1']], '5'), TypeError);
    assert.throws(() => transposeDecimalSeries([['1']], null), TypeError);
    assert.throws(() => transposeDecimalSeries([['1']], -1), RangeError);
    assert.throws(() => transposeDecimalSeries([['1']], 1.5), RangeError);
    assert.throws(() => transposeDecimalSeries([['1']], Number.NaN), RangeError);
    assert.throws(() => transposeDecimalSeries([['1']], Number.POSITIVE_INFINITY), RangeError);
  });

  it('satisfies algebraic cross-checks: involution (A^T)^T == A, element sum, and Frobenius norm invariance', () => {
    const precision = 50;
    const A = [
      [
        '12345678901234567890.12345678901234567890123456789012345678901234',
        '-0.0000000000000000000098765432109876543210987654321',
        '42.5',
      ],
      [
        '-99999999999999999999.99999999999999999999999999999999999999999999',
        '0',
        '3.1415926535897932384626433832795028841971693993751',
      ],
    ];

    const AT = transposeDecimalSeries(A, precision);
    const ATT = transposeDecimalSeries(AT, precision);

    // 1. Involution: (A^T)^T === A
    assert.deepEqual(ATT, A);

    // 2. Independent BigInt exact element sum invariance: sum(A) === sum(A^T)
    const sumMatrix = (M) =>
      M.flat().reduce((acc, s) => acc + toScaledBigInt(s, precision), 0n);

    assert.strictEqual(sumMatrix(AT), sumMatrix(A));

    // 3. Independent BigInt exact squared Frobenius norm invariance: ||A||_F^2 === ||A^T||_F^2
    const frobeniusSq = (M) =>
      M.flat().reduce((acc, s) => {
        const v = toScaledBigInt(s, precision);
        return acc + v * v;
      }, 0n);

    assert.strictEqual(frobeniusSq(AT), frobeniusSq(A));
    assert.ok(frobeniusSq(AT) > 0n);

    // 4. Linearity cross-check: (A + B)^T === A^T + B^T (scaled BigInt check)
    const B = [
      ['1.25', '2.5', '-3.75'],
      ['4.125', '-5.625', '6.875'],
    ];
    const BT = transposeDecimalSeries(B, precision);
    const AplusB = A.map((row, i) =>
      row.map((val, j) => {
        const sum = toScaledBigInt(val, precision) + toScaledBigInt(B[i][j], precision);
        const sign = sum < 0n ? '-' : '';
        const abs = (sum < 0n ? -sum : sum).toString().padStart(precision + 1, '0');
        const intPart = abs.slice(0, abs.length - precision);
        const fracPart = abs.slice(abs.length - precision).replace(/0+$/, '');
        return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
      })
    );
    const AplusBT = transposeDecimalSeries(AplusB, precision);

    for (let j = 0; j < AplusBT.length; j++) {
      for (let i = 0; i < AplusBT[j].length; i++) {
        const lhs = toScaledBigInt(AplusBT[j][i], precision);
        const rhs =
          toScaledBigInt(AT[j][i], precision) + toScaledBigInt(BT[j][i], precision);
        assert.strictEqual(lhs, rhs);
      }
    }
  });
});
