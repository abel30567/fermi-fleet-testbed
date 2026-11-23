import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseDecimalIterative } from './inverseDecimalIterative.js';

/**
 * Independent BigInt scaled-decimal helper for cross-checking matrix products
 * and comparing arbitrary-precision decimal strings within a tolerance.
 */
function parseDecimalToScaled(str, scale) {
  const s = str.trim();
  const neg = s.startsWith('-');
  const body = neg || s.startsWith('+') ? s.slice(1) : s;
  const [intPart, fracPart = ''] = body.split('.');
  const frac = fracPart.length > scale
    ? fracPart.slice(0, scale)
    : fracPart.padEnd(scale, '0');
  const val = BigInt((intPart || '0') + frac);
  return neg ? -val : val;
}

/**
 * Multiplies two square matrices of decimal strings using independent fixed-point
 * BigInt arithmetic at `workScale` fractional digits.
 */
function matMulScaled(A, B, workScale) {
  const n = A.length;
  const factor = 10n ** BigInt(workScale);
  const aScaled = A.map((row) => row.map((v) => parseDecimalToScaled(v, workScale)));
  const bScaled = B.map((row) => row.map((v) => parseDecimalToScaled(v, workScale)));
  const out = Array.from({ length: n }, () => new Array(n));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0n;
      for (let k = 0; k < n; k++) {
        sum += aScaled[i][k] * bScaled[k][j];
      }
      // Divide back by 10^workScale so out[i][j] is scaled by 10^workScale
      out[i][j] = sum / factor;
    }
  }
  return out;
}

function assertMatrixApproxIdentity(A, B, precision, toleranceDigits = 4) {
  const n = A.length;
  const workScale = precision + 5;
  const prod = matMulScaled(A, B, workScale);
  const oneScaled = 10n ** BigInt(workScale);
  const tol = 10n ** BigInt(workScale - (precision - toleranceDigits));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const expected = i === j ? oneScaled : 0n;
      const diff = prod[i][j] - expected;
      const absDiff = diff < 0n ? -diff : diff;
      assert.ok(
        absDiff <= tol,
        `Product mismatch at [${i}][${j}]: diff=${absDiff} > tol=${tol}`
      );
    }
  }
}

function assertMatricesApproxEqual(A, B, precision, toleranceDigits = 4) {
  assert.equal(A.length, B.length);
  const workScale = precision + 5;
  const tol = 10n ** BigInt(workScale - (precision - toleranceDigits));
  for (let i = 0; i < A.length; i++) {
    assert.equal(A[i].length, B[i].length);
    for (let j = 0; j < A[i].length; j++) {
      const va = parseDecimalToScaled(A[i][j], workScale);
      const vb = parseDecimalToScaled(B[i][j], workScale);
      const diff = va - vb;
      const absDiff = diff < 0n ? -diff : diff;
      assert.ok(
        absDiff <= tol,
        `Matrix mismatch at [${i}][${j}]: "${A[i][j]}" vs "${B[i][j]}"`
      );
    }
  }
}

describe('inverseDecimalIterative', () => {
  describe('normal square matrices (1x1, 2x2, 3x3, 4x4)', () => {
    it('inverts 1x1 matrices', () => {
      assert.deepEqual(inverseDecimalIterative([['1']]), [['1']]);
      assert.deepEqual(inverseDecimalIterative([['2']]), [['0.5']]);
      assert.deepEqual(inverseDecimalIterative([['-4']]), [['-0.25']]);
      assert.deepEqual(inverseDecimalIterative([['0.125']]), [['8']]);
      assert.deepEqual(inverseDecimalIterative([['2e-3']]), [['500']]);
      assert.deepEqual(
        inverseDecimalIterative([['3']], 10),
        [['0.3333333333']]
      );
      assert.deepEqual(
        inverseDecimalIterative([['-1.5']], 6),
        [['-0.666667']]
      );
    });

    it('inverts 2x2 matrices', () => {
      assert.deepEqual(
        inverseDecimalIterative([
          ['1', '0'],
          ['0', '1'],
        ]),
        [
          ['1', '0'],
          ['0', '1'],
        ]
      );

      assert.deepEqual(
        inverseDecimalIterative([
          ['4', '7'],
          ['2', '6'],
        ]),
        [
          ['0.6', '-0.7'],
          ['-0.2', '0.4'],
        ]
      );

      assert.deepEqual(
        inverseDecimalIterative([
          ['1.5', '-0.5'],
          ['0.5', '1.5'],
        ]),
        [
          ['0.6', '0.2'],
          ['-0.2', '0.6'],
        ]
      );
    });

    it('inverts 3x3 matrices', () => {
      // Unimodular matrix (det = 1) with exact integer inverse
      const m1 = [
        ['1', '2', '3'],
        ['0', '1', '4'],
        ['5', '6', '0'],
      ];
      assert.deepEqual(inverseDecimalIterative(m1), [
        ['-24', '18', '5'],
        ['20', '-15', '-4'],
        ['-5', '4', '1'],
      ]);

      // Symmetric tridiagonal matrix with exact terminating decimal inverse
      const m2 = [
        ['2', '-1', '0'],
        ['-1', '2', '-1'],
        ['0', '-1', '2'],
      ];
      assert.deepEqual(inverseDecimalIterative(m2), [
        ['0.75', '0.5', '0.25'],
        ['0.5', '1', '0.5'],
        ['0.25', '0.5', '0.75'],
      ]);
    });

    it('inverts 4x4 matrices', () => {
      const m4 = [
        ['2', '1', '0', '0'],
        ['1', '2', '1', '0'],
        ['0', '1', '2', '1'],
        ['0', '0', '1', '2'],
      ];
      // Determinant is 5; exact inverse is (1/5) * [[4,-3,2,-1],[-3,6,-4,2],[2,-4,6,-3],[-1,2,-3,4]]
      assert.deepEqual(inverseDecimalIterative(m4), [
        ['0.8', '-0.6', '0.4', '-0.2'],
        ['-0.6', '1.2', '-0.8', '0.4'],
        ['0.4', '-0.8', '1.2', '-0.6'],
        ['-0.2', '0.4', '-0.6', '0.8'],
      ]);
    });

    it('does not mutate the input matrix', () => {
      const input = [
        ['4', '7'],
        ['2', '6'],
      ];
      const snapshot = input.map((row) => [...row]);
      inverseDecimalIterative(input);
      assert.deepEqual(input, snapshot);
    });
  });

  describe('pivoting required (zeros on diagonal)', () => {
    it('handles permutation matrices with all zeros on the diagonal', () => {
      assert.deepEqual(
        inverseDecimalIterative([
          ['0', '1'],
          ['1', '0'],
        ]),
        [
          ['0', '1'],
          ['1', '0'],
        ]
      );

      assert.deepEqual(
        inverseDecimalIterative([
          ['0', '1', '0'],
          ['0', '0', '1'],
          ['1', '0', '0'],
        ]),
        [
          ['0', '0', '1'],
          ['1', '0', '0'],
          ['0', '1', '0'],
        ]
      );
    });

    it('handles zero appearing on the diagonal mid-elimination', () => {
      // After eliminating col 0 from row 1, entry (1,1) becomes 0 and requires pivoting with row 2
      const m = [
        ['1', '1', '1'],
        ['1', '1', '2'],
        ['1', '2', '3'],
      ];
      const inv = inverseDecimalIterative(m);
      assert.deepEqual(inv, [
        ['1', '1', '-1'],
        ['1', '-2', '1'],
        ['-1', '1', '0'],
      ]);
    });
  });

  describe('high precision and rounding', () => {
    it('computes 40-digit and 60-digit precision inverses accurately', () => {
      const inv40 = inverseDecimalIterative([['7']], 40);
      // 1/7 = 0.(142857)... -> 40th digit is 8, 41st digit is 5 -> rounds up to 9
      const expected40 = '0.' + '142857'.repeat(6) + '1429';
      assert.deepEqual(inv40, [[expected40]]);
      assert.equal(inv40[0][0].split('.')[1].length, 40);

      const inv60 = inverseDecimalIterative([['3']], 60);
      assert.deepEqual(inv60, [['0.' + '3'.repeat(60)]]);
    });

    it('maintains exactness beyond IEEE-754 float64 precision', () => {
      // In float64, 1 + 1e-30 === 1, so float64 thinks this matrix is singular.
      const eps = '1.' + '0'.repeat(29) + '1';
      const nearSingular = [
        ['1', '1'],
        ['1', eps],
      ];
      const inv = inverseDecimalIterative(nearSingular, 10);
      const ten30 = '1' + '0'.repeat(30);
      const ten30Plus1 = '1' + '0'.repeat(29) + '1';
      assert.deepEqual(inv, [
        [ten30Plus1, '-' + ten30],
        ['-' + ten30, ten30],
      ]);
    });

    it('supports precision = 0 and avoids negative zero', () => {
      assert.deepEqual(inverseDecimalIterative([['3']], 0), [['0']]);
      assert.deepEqual(inverseDecimalIterative([['-1000']], 2), [['0']]);
      assert.deepEqual(inverseDecimalIterative([['2']], 0), [['1']]);
      assert.deepEqual(inverseDecimalIterative([['-2']], 0), [['-1']]);
      assert.deepEqual(inverseDecimalIterative([['1.001']], 2), [['1']]);
    });
  });

  describe('singular matrices throw', () => {
    it('throws on 1x1 zero matrix', () => {
      assert.throws(() => inverseDecimalIterative([['0']]), /singular/i);
      assert.throws(() => inverseDecimalIterative([['-0.000']]), /singular/i);
    });

    it('throws on 2x2 and 3x3 singular matrices', () => {
      assert.throws(
        () =>
          inverseDecimalIterative([
            ['1', '2'],
            ['2', '4'],
          ]),
        /singular/i
      );

      assert.throws(
        () =>
          inverseDecimalIterative([
            ['0', '0'],
            ['1', '2'],
          ]),
        /singular/i
      );

      assert.throws(
        () =>
          inverseDecimalIterative([
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ]),
        /singular/i
      );
    });
  });

  describe('input validation', () => {
    it('throws on non-array or empty matrix', () => {
      assert.throws(() => inverseDecimalIterative(null), TypeError);
      assert.throws(() => inverseDecimalIterative(undefined), TypeError);
      assert.throws(() => inverseDecimalIterative('1'), TypeError);
      assert.throws(() => inverseDecimalIterative(42), TypeError);
      assert.throws(() => inverseDecimalIterative({}), TypeError);
      assert.throws(() => inverseDecimalIterative([]), RangeError);
    });

    it('throws on non-square or malformed rows', () => {
      assert.throws(() => inverseDecimalIterative([['1', '2']]), RangeError);
      assert.throws(
        () =>
          inverseDecimalIterative([
            ['1', '2', '3'],
            ['4', '5', '6'],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          inverseDecimalIterative([
            ['1', '2'],
            ['3'],
          ]),
        RangeError
      );
      assert.throws(
        () => inverseDecimalIterative([['1', '2'], '34']),
        TypeError
      );
    });

    it('throws on non-string or invalid decimal elements', () => {
      assert.throws(
        () =>
          inverseDecimalIterative([
            [1, 0],
            [0, 1],
          ]),
        TypeError
      );
      assert.throws(() => inverseDecimalIterative([[null]]), TypeError);
      assert.throws(() => inverseDecimalIterative([['']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['   ']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['abc']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['NaN']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['Infinity']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['1.2.3']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['.']]), RangeError);
    });

    it('throws on invalid precision values', () => {
      assert.throws(() => inverseDecimalIterative([['1']], -1), RangeError);
      assert.throws(() => inverseDecimalIterative([['1']], 1.5), RangeError);
      assert.throws(() => inverseDecimalIterative([['1']], Number.NaN), RangeError);
      assert.throws(() => inverseDecimalIterative([['1']], Number.POSITIVE_INFINITY), RangeError);
      assert.throws(() => inverseDecimalIterative([['1']], '20'), TypeError);
      assert.throws(() => inverseDecimalIterative([['1']], null), TypeError);
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies A * A^-1 ≈ I, A^-1 * A ≈ I, and (A^-1)^-1 ≈ A at 40-digit precision', () => {
      const matrices = [
        [
          ['3.14159265358979323846', '-2.71828182845904523536'],
          ['1.41421356237309504880', '1.61803398874989484820'],
        ],
        [
          ['0.1', '2.3', '-4.5'],
          ['6.7', '0', '8.9'],
          ['-1.2', '3.4', '5.6'],
        ],
        [
          ['1', '0.5', '0.33333333333333333333', '0.25'],
          ['0.5', '0.33333333333333333333', '0.25', '0.2'],
          ['0.33333333333333333333', '0.25', '0.2', '0.16666666666666666667'],
          ['0.25', '0.2', '0.16666666666666666667', '0.14285714285714285714'],
        ],
      ];

      const precision = 40;
      for (const A of matrices) {
        const Ainv = inverseDecimalIterative(A, precision);
        assertMatrixApproxIdentity(A, Ainv, precision, 6);
        assertMatrixApproxIdentity(Ainv, A, precision, 6);

        const AinvInv = inverseDecimalIterative(Ainv, precision);
        assertMatricesApproxEqual(AinvInv, A, precision, 8);
      }
    });
  });
});
