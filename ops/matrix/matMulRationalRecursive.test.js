import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulRationalRecursive } from './matMulRationalRecursive.js';

/** Helper to construct a rational literal quickly in tests. */
const r = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Independent GCD for test assertions and reference implementation. */
function testGcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Independent lowest-terms invariant checker for an entire rational matrix. */
function assertMatrixLowestTerms(M, expectedRows, expectedCols) {
  assert.equal(Array.isArray(M), true);
  assert.equal(M.length, expectedRows);
  for (let i = 0; i < expectedRows; i++) {
    assert.equal(Array.isArray(M[i]), true);
    assert.equal(M[i].length, expectedCols);
    for (let j = 0; j < expectedCols; j++) {
      const cell = M[i][j];
      assert.equal(typeof cell.num, 'bigint');
      assert.equal(typeof cell.den, 'bigint');
      assert.ok(cell.den > 0n, `den must be > 0n at [${i}][${j}], got ${cell.den}`);
      if (cell.num === 0n) {
        assert.equal(cell.den, 1n, `zero must have den === 1n at [${i}][${j}]`);
      } else {
        assert.equal(
          testGcd(cell.num, cell.den),
          1n,
          `entry [${i}][${j}] = ${cell.num}/${cell.den} is not in lowest terms`
        );
      }
    }
  }
}

/** Independent naive iterative triple-loop rational matrix multiplication reference. */
function iterativeMatMulRef(A, B) {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;

  const reduce = (num, den) => {
    if (num === 0n) return { num: 0n, den: 1n };
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = testGcd(num, den);
    return { num: num / g, den: den / g };
  };

  const out = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      let sumNum = 0n;
      let sumDen = 1n;
      for (let t = 0; t < k; t++) {
        const prodNum = A[i][t].num * B[t][j].num;
        const prodDen = A[i][t].den * B[t][j].den;
        const nextNum = sumNum * prodDen + prodNum * sumDen;
        const nextDen = sumDen * prodDen;
        const reduced = reduce(nextNum, nextDen);
        sumNum = reduced.num;
        sumDen = reduced.den;
      }
      row.push(reduce(sumNum, sumDen));
    }
    out.push(row);
  }
  return out;
}

/** Independent matrix addition for algebraic identity tests. */
function matAddRef(A, B) {
  return A.map((row, i) =>
    row.map((cell, j) => {
      const other = B[i][j];
      let num = cell.num * other.den + other.num * cell.den;
      let den = cell.den * other.den;
      if (num === 0n) return { num: 0n, den: 1n };
      if (den < 0n) {
        num = -num;
        den = -den;
      }
      const g = testGcd(num, den);
      return { num: num / g, den: den / g };
    })
  );
}

/** Deterministic PRNG (LCG) for reproducible test matrices. */
function makeRng(seed) {
  let s = BigInt(seed);
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number((s >> 33n) & 0x7fffffffn);
  };
}

function randomRationalMatrix(rows, cols, rng, maxVal = 15) {
  const mat = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const num = BigInt((rng() % (2 * maxVal + 1)) - maxVal);
      const rawDen = (rng() % maxVal) + 1;
      const den = BigInt(rng() % 5 === 0 ? -rawDen : rawDen);
      row.push({ num, den });
    }
    mat.push(row);
  }
  return mat;
}

describe('matMulRationalRecursive', () => {
  describe('normal and basic cases', () => {
    it('multiplies 1x1 scalar matrices', () => {
      const res = matMulRationalRecursive([[r(2, 3)]], [[r(9, 4)]]);
      assertMatrixLowestTerms(res, 1, 1);
      assert.deepStrictEqual(res, [[r(3, 2)]]);

      const zeroRes = matMulRationalRecursive([[r(0, 5)]], [[r(-7, 11)]]);
      assertMatrixLowestTerms(zeroRes, 1, 1);
      assert.deepStrictEqual(zeroRes, [[r(0, 1)]]);
    });

    it('multiplies 2x2 rational matrices', () => {
      const A = [
        [r(1, 2), r(2, 3)],
        [r(-3, 4), r(5, 6)],
      ];
      const B = [
        [r(4, 5), r(-1, 2)],
        [r(3, 2), r(6, 5)],
      ];
      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 2, 2);
      // [0][0] = 1/2*4/5 + 2/3*3/2 = 2/5 + 1 = 7/5
      // [0][1] = 1/2*(-1/2) + 2/3*6/5 = -1/4 + 4/5 = 11/20
      // [1][0] = -3/4*4/5 + 5/6*3/2 = -3/5 + 5/4 = 13/20
      // [1][1] = -3/4*(-1/2) + 5/6*6/5 = 3/8 + 1 = 11/8
      assert.deepStrictEqual(res, [
        [r(7, 5), r(11, 20)],
        [r(13, 20), r(11, 8)],
      ]);
    });

    it('handles dot product (1 x k) * (k x 1) -> (1 x 1)', () => {
      const A = [[r(1, 2), r(-1, 3), r(1, 4), r(-1, 5), r(1, 6)]];
      const B = [[r(2, 1)], [r(3, 1)], [r(4, 1)], [r(5, 1)], [r(6, 1)]];
      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 1, 1);
      // 1 - 1 + 1 - 1 + 1 = 1
      assert.deepStrictEqual(res, [[r(1, 1)]]);
    });

    it('handles outer product (m x 1) * (1 x n) -> (m x n)', () => {
      const A = [[r(2, 3)], [r(-4, 5)], [r(0, 7)]];
      const B = [[r(3, 4), r(-5, 2), r(0, 3), r(15, 8)]];
      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 3, 4);
      assert.deepStrictEqual(res, [
        [r(1, 2), r(-5, 3), r(0, 1), r(5, 4)],
        [r(-3, 5), r(2, 1), r(0, 1), r(-3, 2)],
        [r(0, 1), r(0, 1), r(0, 1), r(0, 1)],
      ]);
    });

    it('multiplies rectangular non-square matrices (2x3 * 3x4)', () => {
      const A = [
        [r(1, 3), r(-2, 5), r(3, 7)],
        [r(4, 9), r(5, 2), r(-1, 6)],
      ];
      const B = [
        [r(3, 2), r(0, 1), r(-6, 5), r(1, 1)],
        [r(5, 4), r(2, 3), r(1, 2), r(-4, 5)],
        [r(7, 3), r(-7, 6), r(0, 1), r(14, 9)],
      ];
      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 2, 4);
      assert.deepStrictEqual(res, iterativeMatMulRef(A, B));
    });

    it('preserves matrix when multiplied by identity on left or right', () => {
      const I2 = [
        [r(1), r(0)],
        [r(0), r(1)],
      ];
      const I3 = [
        [r(1), r(0), r(0)],
        [r(0), r(1), r(0)],
        [r(0), r(0), r(1)],
      ];
      const A = [
        [r(7, 11), r(-13, 17), r(0, 1)],
        [r(19, 23), r(29, 31), r(-37, 41)],
      ];
      assert.deepStrictEqual(matMulRationalRecursive(I2, A), A);
      assert.deepStrictEqual(matMulRationalRecursive(A, I3), A);
    });

    it('produces exact zero matrix when multiplied by a zero matrix', () => {
      const A = [
        [r(5, 7), r(-8, 9), r(11, 13)],
        [r(2, 3), r(4, 5), r(-6, 7)],
      ];
      const Z = [
        [r(0, 3), r(0, -5)],
        [r(0, 1), r(0, 99)],
        [r(0, -2), r(0, 1)],
      ];
      const res = matMulRationalRecursive(A, Z);
      assertMatrixLowestTerms(res, 2, 2);
      assert.deepStrictEqual(res, [
        [r(0, 1), r(0, 1)],
        [r(0, 1), r(0, 1)],
      ]);
    });
  });

  describe('edge cases, normalization, and exact BigInt precision', () => {
    it('normalizes unreduced inputs and negative denominators without mutating inputs', () => {
      const A = [
        [{ num: 6n, den: 9n }, { num: -10n, den: -15n }],
        [{ num: 0n, den: -42n }, { num: 12n, den: -18n }],
      ];
      const B = [
        [{ num: -9n, den: 6n }, { num: 0n, den: -7n }],
        [{ num: 15n, den: -10n }, { num: -20n, den: -25n }],
      ];
      const snapA = A.map((row) => row.map((c) => ({ ...c })));
      const snapB = B.map((row) => row.map((c) => ({ ...c })));

      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 2, 2);
      // A normalized: [[2/3, 2/3], [0, -2/3]]
      // B normalized: [[-3/2, 0], [-3/2, 4/5]]
      // Product: [[-2, 8/15], [1, -8/15]]
      assert.deepStrictEqual(res, [
        [r(-2, 1), r(8, 15)],
        [r(1, 1), r(-8, 15)],
      ]);
      assert.deepStrictEqual(A, snapA);
      assert.deepStrictEqual(B, snapB);
    });

    it('reduces exact cancellations to { num: 0n, den: 1n }', () => {
      const A = [[r(1, 3), r(1, 6), r(-1, 2)]];
      const B = [[r(1, 1)], [r(1, 1)], [r(1, 1)]];
      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 1, 1);
      assert.deepStrictEqual(res, [[{ num: 0n, den: 1n }]]);
    });

    it('returns distinct cell objects (no shared object aliasing)', () => {
      const A = [
        [r(0), r(0)],
        [r(0), r(0)],
      ];
      const B = [
        [r(1), r(2)],
        [r(3), r(4)],
      ];
      const res = matMulRationalRecursive(A, B);
      assert.notEqual(res[0][0], res[0][1]);
      assert.notEqual(res[0][0], res[1][0]);
      res[0][0].num = 999n;
      assert.equal(res[0][1].num, 0n);
    });

    it('handles very large BigInt numerators and denominators accurately', () => {
      const p1 = 10n ** 60n + 7n;
      const p2 = 10n ** 60n + 9n;
      const q1 = 10n ** 55n + 3n;
      const q2 = 10n ** 55n + 11n;
      const A = [
        [{ num: p1, den: q1 }, { num: -p2, den: q2 }],
        [{ num: q1, den: p1 }, { num: q2, den: p2 }],
      ];
      const B = [
        [{ num: q1, den: p1 }, { num: p2, den: q1 }],
        [{ num: q2, den: p2 }, { num: p1, den: q2 }],
      ];
      const res = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(res, 2, 2);
      // [0][0] = (p1/q1)*(q1/p1) + (-p2/q2)*(q2/p2) = 1 - 1 = 0
      assert.deepStrictEqual(res[0][0], { num: 0n, den: 1n });
      assert.deepStrictEqual(res, iterativeMatMulRef(A, B));
    });

    it('multiplies the 5x5 Hilbert matrix by its exact inverse to obtain exact I_5', () => {
      const H = Array.from({ length: 5 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => r(1, i + j + 1))
      );
      const Hinv = [
        [r(25), r(-300), r(1050), r(-1400), r(630)],
        [r(-300), r(4800), r(-18900), r(26880), r(-12600)],
        [r(1050), r(-18900), r(79380), r(-117600), r(56700)],
        [r(-1400), r(26880), r(-117600), r(179200), r(-88200)],
        [r(630), r(-12600), r(56700), r(-88200), r(44100)],
      ];
      const I5 = Array.from({ length: 5 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => r(i === j ? 1 : 0))
      );

      const leftProd = matMulRationalRecursive(H, Hinv);
      const rightProd = matMulRationalRecursive(Hinv, H);
      assertMatrixLowestTerms(leftProd, 5, 5);
      assertMatrixLowestTerms(rightProd, 5, 5);
      assert.deepStrictEqual(leftProd, I5);
      assert.deepStrictEqual(rightProd, I5);
    });
  });

  describe('algebraic identities and independent cross-checks', () => {
    it('satisfies associativity (A * B) * C === A * (B * C) and distributivity A * (B + C) === A*B + A*C', () => {
      const rng = makeRng(20261122);
      const A = randomRationalMatrix(4, 5, rng, 9);
      const B = randomRationalMatrix(5, 3, rng, 9);
      const C = randomRationalMatrix(3, 6, rng, 9);

      const leftAssoc = matMulRationalRecursive(matMulRationalRecursive(A, B), C);
      const rightAssoc = matMulRationalRecursive(A, matMulRationalRecursive(B, C));
      assertMatrixLowestTerms(leftAssoc, 4, 6);
      assertMatrixLowestTerms(rightAssoc, 4, 6);
      assert.deepStrictEqual(leftAssoc, rightAssoc);

      const B2 = randomRationalMatrix(5, 3, rng, 9);
      const distLeft = matMulRationalRecursive(A, matAddRef(B, B2));
      const distRight = matAddRef(
        matMulRationalRecursive(A, B),
        matMulRationalRecursive(A, B2)
      );
      assertMatrixLowestTerms(distLeft, 4, 3);
      assert.deepStrictEqual(distLeft, distRight);
    });

    it('matches independent iterative reference across varied odd, prime, and power-of-2 shapes', () => {
      const rng = makeRng(42);
      const shapes = [
        [1, 1, 1],
        [1, 7, 1],
        [7, 1, 5],
        [2, 3, 2],
        [3, 5, 7],
        [5, 3, 2],
        [8, 8, 8],
        [9, 11, 7],
        [13, 17, 5],
        [16, 16, 16],
      ];

      for (const [m, k, n] of shapes) {
        const A = randomRationalMatrix(m, k, rng, 12);
        const B = randomRationalMatrix(k, n, rng, 12);
        const actual = matMulRationalRecursive(A, B);
        const expected = iterativeMatMulRef(A, B);
        assertMatrixLowestTerms(actual, m, n);
        assert.deepStrictEqual(actual, expected, `mismatch for shape ${m}x${k} * ${k}x${n}`);
      }
    });

    it('agrees with floating-point matrix multiplication within 1e-12 on well-conditioned matrices', () => {
      const rng = makeRng(98765);
      const m = 6;
      const k = 7;
      const n = 5;
      const A = randomRationalMatrix(m, k, rng, 10);
      const B = randomRationalMatrix(k, n, rng, 10);

      const exact = matMulRationalRecursive(A, B);
      assertMatrixLowestTerms(exact, m, n);

      for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
          let floatSum = 0;
          for (let t = 0; t < k; t++) {
            floatSum += (Number(A[i][t].num) / Number(A[i][t].den)) *
                        (Number(B[t][j].num) / Number(B[t][j].den));
          }
          const exactAsFloat = Number(exact[i][j].num) / Number(exact[i][j].den);
          assert.ok(
            Math.abs(exactAsFloat - floatSum) < 1e-12,
            `float mismatch at [${i}][${j}]: ${exactAsFloat} vs ${floatSum}`
          );
        }
      }
    });
  });

  describe('input validation and error handling', () => {
    const valid1x1 = [[r(1, 1)]];

    it('throws TypeError when A or B is not an array', () => {
      for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
        assert.throws(() => matMulRationalRecursive(bad, valid1x1), TypeError);
        assert.throws(() => matMulRationalRecursive(valid1x1, bad), TypeError);
      }
    });

    it('throws RangeError when A or B is empty or has empty rows', () => {
      assert.throws(() => matMulRationalRecursive([], valid1x1), RangeError);
      assert.throws(() => matMulRationalRecursive(valid1x1, []), RangeError);
      assert.throws(() => matMulRationalRecursive([[]], valid1x1), RangeError);
      assert.throws(() => matMulRationalRecursive(valid1x1, [[]]), RangeError);
    });

    it('throws TypeError when a row is not an array or matrix is sparse', () => {
      assert.throws(() => matMulRationalRecursive([r(1)], valid1x1), TypeError);
      assert.throws(() => matMulRationalRecursive([valid1x1[0], null], valid1x1), TypeError);
      assert.throws(() => matMulRationalRecursive(valid1x1, [undefined]), TypeError);

      const sparseRows = new Array(2);
      sparseRows[0] = [r(1)];
      assert.throws(() => matMulRationalRecursive(sparseRows, valid1x1), TypeError);

      const sparseCell = [new Array(1)];
      assert.throws(() => matMulRationalRecursive(sparseCell, valid1x1), TypeError);
    });

    it('throws RangeError for ragged matrices', () => {
      const raggedA = [[r(1), r(2)], [r(3)]];
      const raggedB = [[r(1)], [r(2), r(3)]];
      assert.throws(() => matMulRationalRecursive(raggedA, [[r(1)], [r(2)]]), RangeError);
      assert.throws(() => matMulRationalRecursive([[r(1), r(2)]], raggedB), RangeError);
      assert.throws(() => matMulRationalRecursive([[r(1)], []], valid1x1), RangeError);
    });

    it('throws TypeError for invalid rational entry shapes or non-bigint fields', () => {
      const badEntries = [
        null,
        undefined,
        1,
        1n,
        '1/2',
        [1n, 2n],
        {},
        { num: 1, den: 2 },
        { num: 1n, den: 2 },
        { num: 1, den: 2n },
        { num: 1n },
        { den: 2n },
      ];
      for (const bad of badEntries) {
        assert.throws(() => matMulRationalRecursive([[bad]], valid1x1), TypeError);
        assert.throws(() => matMulRationalRecursive(valid1x1, [[bad]]), TypeError);
      }
    });

    it('throws RangeError for zero denominators', () => {
      assert.throws(() => matMulRationalRecursive([[{ num: 1n, den: 0n }]], valid1x1), RangeError);
      assert.throws(() => matMulRationalRecursive([[{ num: 0n, den: 0n }]], valid1x1), RangeError);
      assert.throws(() => matMulRationalRecursive(valid1x1, [[{ num: -5n, den: 0n }]]), RangeError);
    });

    it('throws RangeError for incompatible inner dimensions', () => {
      const A2x3 = [
        [r(1), r(2), r(3)],
        [r(4), r(5), r(6)],
      ];
      const B2x2 = [
        [r(1), r(2)],
        [r(3), r(4)],
      ];
      assert.throws(() => matMulRationalRecursive(A2x3, B2x2), RangeError);
      assert.throws(() => matMulRationalRecursive([[r(1), r(2)]], [[r(1)], [r(2)], [r(3)]]), RangeError);
    });
  });
});
