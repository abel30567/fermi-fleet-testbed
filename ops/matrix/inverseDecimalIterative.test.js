import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseDecimalIterative } from './inverseDecimalIterative.js';

/**
 * Independent helper: parses a decimal string (no scientific notation needed
 * for outputs, supports optional sign and fraction) into `{ value: bigint, scale: number }`
 * representing `value / 10^scale`.
 */
function parseFixedDecimal(str) {
  const negative = str.startsWith('-');
  const unsigned = negative || str.startsWith('+') ? str.slice(1) : str;
  const dotIdx = unsigned.indexOf('.');
  if (dotIdx === -1) {
    const val = BigInt(unsigned);
    return { value: negative ? -val : val, scale: 0 };
  }
  const intPart = unsigned.slice(0, dotIdx);
  const fracPart = unsigned.slice(dotIdx + 1);
  const val = BigInt(intPart + fracPart);
  return { value: negative ? -val : val, scale: fracPart.length };
}

/**
 * Independent helper: exact decimal matrix multiplication `A * B`, returning
 * each entry as `{ value: bigint, scale: number }`.
 */
function exactMatMul(A, B) {
  const n = A.length;
  const parsedA = A.map((row) => row.map(parseFixedDecimal));
  const parsedB = B.map((row) => row.map(parseFixedDecimal));

  let maxScaleA = 0;
  let maxScaleB = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (parsedA[i][j].scale > maxScaleA) maxScaleA = parsedA[i][j].scale;
      if (parsedB[i][j].scale > maxScaleB) maxScaleB = parsedB[i][j].scale;
    }
  }

  const intA = parsedA.map((row) =>
    row.map((e) => e.value * 10n ** BigInt(maxScaleA - e.scale)),
  );
  const intB = parsedB.map((row) =>
    row.map((e) => e.value * 10n ** BigInt(maxScaleB - e.scale)),
  );

  const totalScale = maxScaleA + maxScaleB;
  const product = Array.from({ length: n }, () => new Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sum = 0n;
      for (let k = 0; k < n; k += 1) {
        sum += intA[i][k] * intB[k][j];
      }
      product[i][j] = { value: sum, scale: totalScale };
    }
  }
  return product;
}

/**
 * Asserts that `|actual - expected| <= 10^(-tolDigits)` where `actual` is a
 * decimal string and `expected` is a decimal string.
 */
function assertDecimalClose(actualStr, expectedStr, tolDigits) {
  const a = parseFixedDecimal(actualStr);
  const e = parseFixedDecimal(expectedStr);
  const commonScale = Math.max(a.scale, e.scale, tolDigits);
  const aScaled = a.value * 10n ** BigInt(commonScale - a.scale);
  const eScaled = e.value * 10n ** BigInt(commonScale - e.scale);
  const diff = aScaled >= eScaled ? aScaled - eScaled : eScaled - aScaled;
  const tol = 10n ** BigInt(commonScale - tolDigits);
  assert.ok(
    diff <= tol,
    `Expected ${actualStr} to be within 1e-${tolDigits} of ${expectedStr}`,
  );
}

/**
 * Asserts that an exact product matrix `{ value, scale }[][]` is within
 * `10^(-tolDigits)` of the identity matrix.
 */
function assertProductNearIdentity(prod, tolDigits) {
  const n = prod.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const { value, scale } = prod[i][j];
      const commonScale = Math.max(scale, tolDigits);
      const target = i === j ? 10n ** BigInt(commonScale) : 0n;
      const actual = value * 10n ** BigInt(commonScale - scale);
      const diff = actual >= target ? actual - target : target - actual;
      const tol = 10n ** BigInt(commonScale - tolDigits);
      assert.ok(
        diff <= tol,
        `Product entry [${i}][${j}] deviated from identity by more than 1e-${tolDigits}`,
      );
    }
  }
}

/**
 * Independent BigInt rational helper for adjugate/determinant cross-checks.
 */
function refDivideRounded(num, den, precision) {
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const neg = num < 0n;
  const absNum = neg ? -num : num;
  const scaled = absNum * 10n ** BigInt(precision);
  let q = scaled / den;
  const r = scaled % den;
  if (r * 2n >= den) q += 1n;
  if (q === 0n) return '0';
  const sign = neg ? '-' : '';
  if (precision === 0) return sign + q.toString();
  const s = q.toString().padStart(precision + 1, '0');
  const intPart = s.slice(0, s.length - precision);
  const fracPart = s.slice(s.length - precision).replace(/0+$/, '');
  return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

describe('inverseDecimalIterative', () => {
  describe('normal cases', () => {
    it('inverts 1x1 matrices with exact and repeating reciprocals', () => {
      assert.deepEqual(inverseDecimalIterative([['4']], 10), [['0.25']]);
      assert.deepEqual(inverseDecimalIterative([['-0.5']], 10), [['-2']]);
      assert.deepEqual(inverseDecimalIterative([['3']], 30), [
        ['0.333333333333333333333333333333'],
      ]);
      assert.deepEqual(inverseDecimalIterative([['7']], 20), [
        ['0.14285714285714285714'],
      ]);
    });

    it('inverts 2x2 matrices accurately', () => {
      // [[4, 7], [2, 6]] has det = 10, inverse = [[0.6, -0.7], [-0.2, 0.4]]
      const A = [
        ['4', '7'],
        ['2', '6'],
      ];
      assert.deepEqual(inverseDecimalIterative(A, 10), [
        ['0.6', '-0.7'],
        ['-0.2', '0.4'],
      ]);
    });

    it('inverts 3x3 matrices accurately', () => {
      // [[1, 2, 3], [0, 1, 4], [5, 6, 0]] has det = 1, exact integer inverse
      const A = [
        ['1', '2', '3'],
        ['0', '1', '4'],
        ['5', '6', '0'],
      ];
      assert.deepEqual(inverseDecimalIterative(A, 15), [
        ['-24', '18', '5'],
        ['20', '-15', '-4'],
        ['-5', '4', '1'],
      ]);
    });

    it('inverts 4x4 matrices accurately', () => {
      const A = [
        ['2', '1', '0', '0'],
        ['1', '2', '1', '0'],
        ['0', '1', '2', '1'],
        ['0', '0', '1', '2'],
      ];
      // Exact inverse of 4x4 tridiagonal Toeplitz (det = 5):
      // (1/5) * [[4,-3,2,-1], [-3,6,-4,2], [2,-4,6,-3], [-1,2,-3,4]]
      assert.deepEqual(inverseDecimalIterative(A, 10), [
        ['0.8', '-0.6', '0.4', '-0.2'],
        ['-0.6', '1.2', '-0.8', '0.4'],
        ['0.4', '-0.8', '1.2', '-0.6'],
        ['-0.2', '0.4', '-0.6', '0.8'],
      ]);
    });

    it('computes high-precision (40-digit) inverse beyond float64 precision', () => {
      const A = [
        ['1.1', '2.3'],
        ['3.7', '5.9'],
      ];
      // det = 1.1*5.9 - 2.3*3.7 = 6.49 - 8.51 = -2.02 = -101/50
      // inv[0][0] = 5.9 / -2.02 = -295/101
      // inv[0][1] = -2.3 / -2.02 = 115/101
      // inv[1][0] = -3.7 / -2.02 = 185/101
      // inv[1][1] = 1.1 / -2.02 = -55/101
      const inv = inverseDecimalIterative(A, 40);
      assert.deepEqual(inv, [
        [
          '-2.9207920792079207920792079207920792079208',
          '1.1386138613861386138613861386138613861386',
        ],
        [
          '1.8316831683168316831683168316831683168317',
          '-0.5445544554455445544554455445544554455446',
        ],
      ]);
    });

    it('handles ill-conditioned Hilbert 3x3 matrix far beyond float64 accuracy', () => {
      const oneThird50 = '0.' + '3'.repeat(50);
      const hilbert3 = [
        ['1', '0.5', oneThird50],
        ['0.5', oneThird50, '0.25'],
        [oneThird50, '0.25', '0.2'],
      ];
      const expected = [
        ['9', '-36', '30'],
        ['-36', '192', '-180'],
        ['30', '-180', '180'],
      ];
      const inv = inverseDecimalIterative(hilbert3, 45);
      // True Hilbert 3x3 inverse has exact integer entries; with 50-digit input
      // and condition number ~524, all entries must match to at least 42 digits
      // (whereas IEEE-754 float64 loses precision around 13 digits).
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          assertDecimalClose(inv[i][j], expected[i][j], 42);
        }
      }
    });

    it('handles severely ill-conditioned matrix that is singular in IEEE-754 float64', () => {
      // In float64, 1 + 1e-20 === 1, so this matrix appears singular!
      const A = [
        ['1', '1'],
        ['1', '1.00000000000000000001'],
      ];
      const inv = inverseDecimalIterative(A, 10);
      assert.deepEqual(inv, [
        ['100000000000000000001', '-100000000000000000000'],
        ['-100000000000000000000', '100000000000000000000'],
      ]);
    });

    it('accepts scientific notation, leading +, leading zeros, and shorthand decimals', () => {
      const A = [
        ['+1e-2', '.0'],
        ['000.0', '2.5E+1'],
      ];
      assert.deepEqual(inverseDecimalIterative(A, 10), [
        ['100', '0'],
        ['0', '0.04'],
      ]);
    });

    it('does not mutate the input matrix', () => {
      const A = [
        ['0', '2'],
        ['4', '1'],
      ];
      const snapshot = structuredClone(A);
      inverseDecimalIterative(A, 10);
      assert.deepEqual(A, snapshot);
    });
  });

  describe('edge cases', () => {
    it('returns identity matrix when given identity matrix', () => {
      const I1 = [['1']];
      assert.deepEqual(inverseDecimalIterative(I1), [['1']]);

      const I3 = [
        ['1', '0', '0'],
        ['0', '1', '0'],
        ['0', '0', '1'],
      ];
      assert.deepEqual(inverseDecimalIterative(I3, 25), I3);
    });

    it('handles zero diagonal entries requiring pivot swaps', () => {
      const perm = [
        ['0', '0', '1'],
        ['1', '0', '0'],
        ['0', '1', '0'],
      ];
      assert.deepEqual(inverseDecimalIterative(perm, 10), [
        ['0', '1', '0'],
        ['0', '0', '1'],
        ['1', '0', '0'],
      ]);

      const zeroDiag = [
        ['0', '2', '1'],
        ['1', '-2', '-3'],
        ['-1', '1', '2'],
      ];
      // det = 1, exact integer inverse
      assert.deepEqual(inverseDecimalIterative(zeroDiag, 10), [
        ['-1', '-3', '-4'],
        ['1', '1', '1'],
        ['-1', '-2', '-2'],
      ]);
    });

    it('uses default precision of 20 decimal places', () => {
      const inv = inverseDecimalIterative([['3']]);
      assert.equal(inv[0][0], '0.' + '3'.repeat(20));
    });

    it('supports precision = 0 with half-away-from-zero rounding and no -0', () => {
      // [[2, 0], [0, -2]] -> [[0.5, 0], [0, -0.5]] -> rounded at precision=0 -> [[1, 0], [0, -1]]
      assert.deepEqual(
        inverseDecimalIterative(
          [
            ['2', '0'],
            ['0', '-2'],
          ],
          0,
        ),
        [
          ['1', '0'],
          ['0', '-1'],
        ],
      );

      // -1 / 3 = -0.333... rounds to '0', never '-0'
      assert.deepEqual(inverseDecimalIterative([['-3']], 0), [['0']]);
      assert.deepEqual(inverseDecimalIterative([['-1e25']], 10), [['0']]);
    });

    it('throws RangeError for singular matrices', () => {
      assert.throws(() => inverseDecimalIterative([['0']]), RangeError);
      assert.throws(
        () =>
          inverseDecimalIterative([
            ['1', '2'],
            ['2', '4'],
          ]),
        RangeError,
      );
      assert.throws(
        () =>
          inverseDecimalIterative([
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ]),
        RangeError,
      );
      assert.throws(
        () =>
          inverseDecimalIterative([
            ['0', '0'],
            ['1', '2'],
          ]),
        RangeError,
      );
    });

    it('validates matrix shape, element types, decimal syntax, and precision', () => {
      // Non-array matrix
      assert.throws(() => inverseDecimalIterative(null), TypeError);
      assert.throws(() => inverseDecimalIterative(undefined), TypeError);
      assert.throws(() => inverseDecimalIterative('1'), TypeError);

      // Empty or non-square matrix
      assert.throws(() => inverseDecimalIterative([]), RangeError);
      assert.throws(() => inverseDecimalIterative([[]]), RangeError);
      assert.throws(() => inverseDecimalIterative([['1', '2']]), RangeError);
      assert.throws(() => inverseDecimalIterative([['1'], ['2']]), RangeError);
      assert.throws(
        () => inverseDecimalIterative([['1', '2'], ['3']]),
        RangeError,
      );

      // Non-array row
      assert.throws(() => inverseDecimalIterative([1, 2]), TypeError);
      assert.throws(() => inverseDecimalIterative([['1', '0'], null]), TypeError);

      // Non-string entries
      assert.throws(() => inverseDecimalIterative([[1]]), TypeError);
      assert.throws(() => inverseDecimalIterative([[null]]), TypeError);
      assert.throws(() => inverseDecimalIterative([[1n]]), TypeError);

      // Invalid decimal strings
      for (const bad of ['', '   ', 'abc', '1.2.3', 'NaN', 'Infinity', '.', '1e', ' 1 ']) {
        assert.throws(() => inverseDecimalIterative([[bad]]), RangeError);
      }

      // Invalid precision
      assert.throws(() => inverseDecimalIterative([['1']], '10'), TypeError);
      assert.throws(() => inverseDecimalIterative([['1']], null), TypeError);
      assert.throws(() => inverseDecimalIterative([['1']], -1), RangeError);
      assert.throws(() => inverseDecimalIterative([['1']], 1.5), RangeError);
      assert.throws(() => inverseDecimalIterative([['1']], Number.NaN), RangeError);
      assert.throws(
        () => inverseDecimalIterative([['1']], Number.POSITIVE_INFINITY),
        RangeError,
      );
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies A * A^-1 ≈ I and A^-1 * A ≈ I using independent exact multiplication', () => {
      const matrices = [
        [
          ['3.14159265358979323846', '-2.71828182845904523536'],
          ['1.41421356237309504880', '1.61803398874989484820'],
        ],
        [
          ['0.125', '7.3', '-4.25'],
          ['-3.5', '0.0', '9.125'],
          ['6.4', '-2.75', '1.8'],
        ],
        [
          ['10.5', '-1.25', '2.5', '0.75'],
          ['3.2', '8.4', '-0.5', '1.1'],
          ['-2.1', '0.9', '7.7', '-3.3'],
          ['0.4', '-4.6', '1.8', '9.2'],
        ],
      ];

      const precision = 35;
      for (const A of matrices) {
        const inv = inverseDecimalIterative(A, precision);
        const leftProd = exactMatMul(inv, A);
        const rightProd = exactMatMul(A, inv);
        assertProductNearIdentity(leftProd, precision - 4);
        assertProductNearIdentity(rightProd, precision - 4);
      }
    });

    it('matches independent adjugate/determinant formula for 2x2 and 3x3 integer matrices', () => {
      // 2x2 cross-check: inv([[a, b], [c, d]]) = (1 / (ad - bc)) * [[d, -b], [-c, a]]
      const m2 = [
        [17n, -23n],
        [31n, 47n],
      ];
      const det2 = m2[0][0] * m2[1][1] - m2[0][1] * m2[1][0];
      const adj2 = [
        [m2[1][1], -m2[0][1]],
        [-m2[1][0], m2[0][0]],
      ];
      const precision = 35;
      const expected2 = adj2.map((row) =>
        row.map((v) => refDivideRounded(v, det2, precision)),
      );
      const actual2 = inverseDecimalIterative(
        m2.map((row) => row.map((v) => v.toString())),
        precision,
      );
      assert.deepEqual(actual2, expected2);

      // 3x3 cross-check via cofactor expansion & adjugate transpose
      const m3 = [
        [3n, -5n, 7n],
        [11n, 13n, -17n],
        [19n, -23n, 29n],
      ];
      const minorDet = (r0, r1, c0, c1) =>
        m3[r0][c0] * m3[r1][c1] - m3[r0][c1] * m3[r1][c0];

      const cofactors = [
        [minorDet(1, 2, 1, 2), -minorDet(1, 2, 0, 2), minorDet(1, 2, 0, 1)],
        [-minorDet(0, 2, 1, 2), minorDet(0, 2, 0, 2), -minorDet(0, 2, 0, 1)],
        [minorDet(0, 1, 1, 2), -minorDet(0, 1, 0, 2), minorDet(0, 1, 0, 1)],
      ];
      const det3 =
        m3[0][0] * cofactors[0][0] +
        m3[0][1] * cofactors[0][1] +
        m3[0][2] * cofactors[0][2];

      const expected3 = Array.from({ length: 3 }, (_, i) =>
        Array.from({ length: 3 }, (_, j) =>
          refDivideRounded(cofactors[j][i], det3, precision),
        ),
      );
      const actual3 = inverseDecimalIterative(
        m3.map((row) => row.map((v) => v.toString())),
        precision,
      );
      assert.deepEqual(actual3, expected3);
    });

    it('recovers original matrix under double inversion (A^-1)^-1 ≈ A', () => {
      const A = [
        ['1.25', '-3.5', '0.75'],
        ['4.125', '2.5', '-1.5'],
        ['-0.5', '6.25', '3.0'],
      ];
      const invA = inverseDecimalIterative(A, 45);
      const invInvA = inverseDecimalIterative(invA, 30);
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          assertDecimalClose(invInvA[i][j], A[i][j], 28);
        }
      }
    });
  });
});
