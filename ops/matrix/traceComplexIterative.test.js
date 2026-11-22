import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceComplexIterative } from './traceComplexIterative.js';

const c = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cConj = (a) => ({ re: a.re, im: a.im === 0 ? 0 : -a.im });
const cDiv = (a, b) => {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
};
const cSqrt = (z) => {
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt((r + z.re) / 2);
  const imMag = Math.sqrt((r - z.re) / 2);
  const im = z.im < 0 ? -imMag : imMag;
  return { re, im };
};

function matMul(A, B) {
  const n = A.length;
  const out = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0, 0)));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = c(0, 0);
      for (let k = 0; k < n; k++) {
        sum = cAdd(sum, cMul(A[i][k], B[k][j]));
      }
      out[i][j] = sum;
    }
  }
  return out;
}

function assertComplexClose(actual, expected, eps = 1e-12) {
  assert.ok(
    Math.abs(actual.re - expected.re) <= eps,
    `real part mismatch: expected ${expected.re}, got ${actual.re}`
  );
  assert.ok(
    Math.abs(actual.im - expected.im) <= eps,
    `imag part mismatch: expected ${expected.im}, got ${actual.im}`
  );
}

describe('traceComplexIterative', () => {
  describe('normal cases', () => {
    it('computes trace of a 1x1 complex matrix', () => {
      assert.deepEqual(traceComplexIterative([[c(3, -4)]]), { re: 3, im: -4 });
    });

    it('computes trace of a 2x2 complex matrix', () => {
      const m = [
        [c(1, 2), c(99, -88)],
        [c(-7, 5), c(3, -6)],
      ];
      assert.deepEqual(traceComplexIterative(m), { re: 4, im: -4 });
    });

    it('computes trace of a 3x3 complex matrix with fractional parts', () => {
      const m = [
        [c(1.5, -0.25), c(2, 3), c(4, 5)],
        [c(6, 7), c(-2.5, 1.75), c(8, 9)],
        [c(10, 11), c(12, 13), c(4.25, -3.5)],
      ];
      assertComplexClose(traceComplexIterative(m), { re: 3.25, im: -2 });
    });

    it('handles purely real and purely imaginary matrices', () => {
      const realMat = [
        [c(5, 0), c(1, 0)],
        [c(2, 0), c(-3, 0)],
      ];
      const imagMat = [
        [c(0, 5), c(0, 1)],
        [c(0, 2), c(0, -3)],
      ];
      assert.deepEqual(traceComplexIterative(realMat), { re: 2, im: 0 });
      assert.deepEqual(traceComplexIterative(imagMat), { re: 0, im: 2 });
    });
  });

  describe('edge cases', () => {
    it('returns { re: 0, im: 0 } for the 0x0 empty matrix', () => {
      assert.deepEqual(traceComplexIterative([]), { re: 0, im: 0 });
    });

    it('returns { re: n, im: 0 } for an n x n identity matrix', () => {
      const n = 5;
      const I = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
      );
      assert.deepEqual(traceComplexIterative(I), { re: n, im: 0 });
    });

    it('normalizes negative zero results to +0', () => {
      const res = traceComplexIterative([[c(-0, -0)]]);
      assert.ok(Object.is(res.re, 0));
      assert.ok(Object.is(res.im, 0));
    });

    it('does not mutate the input matrix or its elements', () => {
      const m = [
        [c(2, 3), c(4, 5)],
        [c(6, 7), c(8, 9)],
      ];
      const snapshot = structuredClone(m);
      traceComplexIterative(m);
      assert.deepEqual(m, snapshot);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when matrix is not an array', () => {
      for (const bad of [null, undefined, 42, 'abc', {}, { re: 1, im: 2 }]) {
        assert.throws(() => traceComplexIterative(bad), TypeError);
      }
    });

    it('throws TypeError when any row is not an array', () => {
      assert.throws(() => traceComplexIterative([null]), TypeError);
      assert.throws(() => traceComplexIterative([[c(1, 0), c(0, 0)], 'not-a-row']), TypeError);
    });

    it('throws RangeError for non-square or ragged matrices', () => {
      assert.throws(() => traceComplexIterative([[]]), RangeError);
      assert.throws(
        () =>
          traceComplexIterative([
            [c(1, 0), c(2, 0), c(3, 0)],
            [c(4, 0), c(5, 0), c(6, 0)],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          traceComplexIterative([
            [c(1, 0), c(2, 0)],
            [c(3, 0)],
          ]),
        RangeError
      );
    });

    it('throws TypeError for malformed complex entries (diagonal or off-diagonal)', () => {
      assert.throws(() => traceComplexIterative([[null]]), TypeError);
      assert.throws(() => traceComplexIterative([[[1, 2]]]), TypeError);
      assert.throws(() => traceComplexIterative([[{ re: 1 }]]), TypeError);
      assert.throws(() => traceComplexIterative([[{ re: '1', im: 0 }]]), TypeError);
      assert.throws(
        () =>
          traceComplexIterative([
            [c(1, 0), { re: 0, im: 'bad' }],
            [c(0, 0), c(2, 0)],
          ]),
        TypeError
      );
    });

    it('throws RangeError for non-finite complex components (NaN, ±Infinity)', () => {
      for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        assert.throws(() => traceComplexIterative([[c(badVal, 0)]]), RangeError);
        assert.throws(() => traceComplexIterative([[c(0, badVal)]]), RangeError);
        assert.throws(
          () =>
            traceComplexIterative([
              [c(1, 0), c(badVal, 0)],
              [c(0, 0), c(2, 0)],
            ]),
          RangeError
        );
      }
    });
  });

  describe('mathematical identities and independent cross-checks', () => {
    const A = [
      [c(2, -1), c(0, 3), c(-4, 2)],
      [c(1, 5), c(-3, 4), c(2, -2)],
      [c(6, 0), c(-1, -1), c(5, 3)],
    ];
    const B = [
      [c(-1, 2), c(3, -1), c(0, 4)],
      [c(2, 1), c(4, -5), c(-3, 2)],
      [c(-2, -3), c(1, 6), c(2, 1)],
    ];

    it('satisfies linearity: tr(alpha*A + beta*B) = alpha*tr(A) + beta*tr(B)', () => {
      const alpha = c(2, -3);
      const beta = c(-1.5, 0.5);
      const combined = A.map((row, i) =>
        row.map((val, j) => cAdd(cMul(alpha, val), cMul(beta, B[i][j])))
      );
      const lhs = traceComplexIterative(combined);
      const rhs = cAdd(
        cMul(alpha, traceComplexIterative(A)),
        cMul(beta, traceComplexIterative(B))
      );
      assertComplexClose(lhs, rhs);
    });

    it('satisfies transpose and conjugate-transpose identities', () => {
      const n = A.length;
      const AT = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => A[j][i])
      );
      const AStar = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => cConj(A[j][i]))
      );
      const trA = traceComplexIterative(A);
      assertComplexClose(traceComplexIterative(AT), trA);
      assertComplexClose(traceComplexIterative(AStar), cConj(trA));
    });

    it('satisfies the cyclic property: tr(AB) = tr(BA)', () => {
      const trAB = traceComplexIterative(matMul(A, B));
      const trBA = traceComplexIterative(matMul(B, A));
      assertComplexClose(trAB, trBA);
    });

    it('equals the sum of complex eigenvalues computed independently for 2x2 matrices', () => {
      const M = [
        [c(3, 2), c(-1, 4)],
        [c(2, -3), c(-5, 1)],
      ];
      // Characteristic polynomial: lambda^2 - (a + d)*lambda + (a*d - b*c) = 0
      // Compute roots independently via quadratic formula from coefficients.
      const [[a, b], [cEntry, d]] = M;
      const bCoeff = cSub(c(0, 0), cAdd(a, d)); // -(a + d)
      const cCoeff = cSub(cMul(a, d), cMul(b, cEntry)); // det(M)
      const disc = cSub(cMul(bCoeff, bCoeff), cMul(c(4, 0), cCoeff));
      const sqrtDisc = cSqrt(disc);
      const negB = cSub(c(0, 0), bCoeff);
      const lambda1 = cDiv(cAdd(negB, sqrtDisc), c(2, 0));
      const lambda2 = cDiv(cSub(negB, sqrtDisc), c(2, 0));

      const eigSum = cAdd(lambda1, lambda2);
      assertComplexClose(traceComplexIterative(M), eigSum);
    });

    it('matches an independent reduce-based reference on a 12x12 matrix', () => {
      const n = 12;
      const M = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          c(((i * 7 + j * 13) % 19) - 9, ((i * 11 - j * 5) % 17) - 8)
        )
      );
      const expected = M.reduce(
        (acc, row, idx) => ({ re: acc.re + row[idx].re, im: acc.im + row[idx].im }),
        { re: 0, im: 0 }
      );
      assert.deepEqual(traceComplexIterative(M), expected);
    });
  });
});
