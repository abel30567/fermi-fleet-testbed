import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divergenceComplexIterative } from './divergenceComplexIterative.js';

// Local complex arithmetic helpers for test expressions
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s });
const cConj = (a) => ({ re: a.re, im: -a.im });
const cExp = (z) => {
  const er = Math.exp(z.re);
  return { re: er * Math.cos(z.im), im: er * Math.sin(z.im) };
};
const cSin = (z) => ({
  re: Math.sin(z.re) * Math.cosh(z.im),
  im: Math.cos(z.re) * Math.sinh(z.im),
});
const cCos = (z) => ({
  re: Math.cos(z.re) * Math.cosh(z.im),
  im: -Math.sin(z.re) * Math.sinh(z.im),
});

function assertComplexClose(actual, expected, tol = 1e-7, msg = '') {
  const errRe = Math.abs(actual.re - expected.re);
  const errIm = Math.abs(actual.im - expected.im);
  assert.ok(
    errRe <= tol && errIm <= tol,
    `${msg ? `${msg}: ` : ''}expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i) [errRe=${errRe}, errIm=${errIm}, tol=${tol}]`
  );
}

describe('divergenceComplexIterative', () => {
  describe('normal cases', () => {
    it('computes 1D holomorphic divergence for F(z) = [z^3]', () => {
      const field = ([z]) => [cMul(cMul(z, z), z)];
      const z0 = { re: 2, im: -1.5 };
      const result = divergenceComplexIterative(field, [z0]);
      // d(z^3)/dz = 3 * z^2
      const expected = cScale(cMul(z0, z0), 3);
      assertComplexClose(result, expected, 1e-7);
    });

    it('computes 2D holomorphic polynomial divergence', () => {
      // F(z0, z1) = [z0^2 * z1, z1^3 + 2 * z0]
      // div(F) = 2 * z0 * z1 + 3 * z1^2
      const field = ([z0, z1]) => [
        cMul(cMul(z0, z0), z1),
        cAdd(cMul(cMul(z1, z1), z1), cScale(z0, 2)),
      ];
      const point = [
        { re: 1.2, im: 0.7 },
        { re: -0.5, im: 1.4 },
      ];
      const result = divergenceComplexIterative(field, point);
      const expected = cAdd(
        cScale(cMul(point[0], point[1]), 2),
        cScale(cMul(point[1], point[1]), 3)
      );
      assertComplexClose(result, expected, 1e-7);
    });

    it('computes 3D holomorphic transcendental divergence', () => {
      // F(z0, z1, z2) = [exp(z0), sin(z1), z2^2 + z0 * z1]
      // div(F) = exp(z0) + cos(z1) + 2 * z2
      const field = ([z0, z1, z2]) => [
        cExp(z0),
        cSin(z1),
        cAdd(cMul(z2, z2), cMul(z0, z1)),
      ];
      const point = [
        { re: 0.4, im: 1.1 },
        { re: -0.8, im: 0.5 },
        { re: 2.3, im: -1.7 },
      ];
      const result = divergenceComplexIterative(field, point);
      const expected = cAdd(
        cAdd(cExp(point[0]), cCos(point[1])),
        cScale(point[2], 2)
      );
      assertComplexClose(result, expected, 1e-7);
    });

    it('supports array-of-component-functions signature equivalently to vector function', () => {
      const f0 = ([z0, z1]) => cAdd(cMul(z0, z0), z1);
      const f1 = ([z0, z1]) => cMul(z0, cExp(z1));
      const vecField = (p) => [f0(p), f1(p)];

      const point = [
        { re: 0.9, im: -0.4 },
        { re: 0.3, im: 1.2 },
      ];
      const rVec = divergenceComplexIterative(vecField, point);
      const rArr = divergenceComplexIterative([f0, f1], point);
      // div = 2*z0 + z0*exp(z1)
      const expected = cAdd(cScale(point[0], 2), cMul(point[0], cExp(point[1])));

      assertComplexClose(rVec, expected, 1e-7);
      assertComplexClose(rArr, expected, 1e-7);
      assert.deepStrictEqual(rArr, rVec);
    });

    it('respects custom positive step size h', () => {
      const field = ([z0, z1]) => [cExp(z0), cMul(z1, z1)];
      const point = [
        { re: 0.5, im: -0.5 },
        { re: -1.2, im: 0.8 },
      ];
      const expected = cAdd(cExp(point[0]), cScale(point[1], 2));
      assertComplexClose(divergenceComplexIterative(field, point, 1e-5), expected, 1e-8);
      assertComplexClose(divergenceComplexIterative(field, point, 1e-4), expected, 1e-6);
    });

    it('computes exact Wirtinger divergence for non-holomorphic fields', () => {
      // Anti-holomorphic F(z0, z1) = [conj(z0), conj(z1)] -> div = 0
      const antiHolo = ([z0, z1]) => [cConj(z0), cConj(z1)];
      const point = [
        { re: 1.5, im: -2.2 },
        { re: -0.7, im: 3.1 },
      ];
      assertComplexClose(divergenceComplexIterative(antiHolo, point), { re: 0, im: 0 }, 1e-9);

      // Mixed F(z0, z1) = [z0 * conj(z0), z0 * conj(z1) + z1^2]
      // d/dz0 (z0 * conj(z0)) = conj(z0), d/dz1 (z0 * conj(z1) + z1^2) = 2 * z1
      const mixed = ([z0, z1]) => [
        cMul(z0, cConj(z0)),
        cAdd(cMul(z0, cConj(z1)), cMul(z1, z1)),
      ];
      const expected = cAdd(cConj(point[0]), cScale(point[1], 2));
      assertComplexClose(divergenceComplexIterative(mixed, point), expected, 1e-7);
    });
  });

  describe('edge cases', () => {
    it('returns exact { re: 0, im: 0 } without negative zero for constant fields', () => {
      const constantField = () => [
        { re: 3.5, im: -7.2 },
        { re: -1.1, im: 4.8 },
      ];
      const res = divergenceComplexIterative(constantField, [
        { re: 0, im: 0 },
        { re: 0, im: 0 },
      ]);
      assert.strictEqual(Object.is(res.re, 0), true);
      assert.strictEqual(Object.is(res.im, 0), true);
    });

    it('evaluates to zero for divergence-free (solenoidal) fields', () => {
      // F(z0, z1, z2) = [z0 + z1^2, z1 - z2^2, -2*z2 + z0*z1] -> div = 1 + 1 - 2 = 0
      const solenoidal = ([z0, z1, z2]) => [
        cAdd(z0, cMul(z1, z1)),
        cSub(z1, cMul(z2, z2)),
        cAdd(cScale(z2, -2), cMul(z0, z1)),
      ];
      const res = divergenceComplexIterative(solenoidal, [
        { re: 2.1, im: -1.3 },
        { re: -0.9, im: 0.4 },
        { re: 1.7, im: 2.5 },
      ]);
      assertComplexClose(res, { re: 0, im: 0 }, 1e-7);
    });

    it('handles higher dimensions (10D linear complex field)', () => {
      const coeffs = Array.from({ length: 10 }, (_, k) => ({
        re: k + 1,
        im: -(k % 4) + 0.5,
      }));
      const field = (z) => z.map((zi, k) => cMul(coeffs[k], zi));
      const point = Array.from({ length: 10 }, (_, k) => ({
        re: (k - 5) * 0.3,
        im: (k - 3) * 0.2,
      }));
      const expected = coeffs.reduce(cAdd, { re: 0, im: 0 });
      const res = divergenceComplexIterative(field, point);
      assertComplexClose(res, expected, 1e-7);
    });

    it('does not mutate caller point and resists field mutating its argument', () => {
      const point = [
        { re: 1, im: 2 },
        { re: 3, im: 4 },
      ];
      const snapshot = structuredClone(point);

      const mutatingField = (p) => {
        const out = [cMul(p[0], p[0]), cMul(p[1], p[1])];
        p[0].re = 9999;
        p[1] = { re: -9999, im: -9999 };
        return out;
      };

      const res = divergenceComplexIterative(mutatingField, point);
      assert.deepStrictEqual(point, snapshot);
      // div([z0^2, z1^2]) = 2*z0 + 2*z1 = (2+4i) + (6+8i) = 8 + 12i
      assertComplexClose(res, { re: 8, im: 12 }, 1e-7);
    });
  });

  describe('input validation', () => {
    const validPoint = [{ re: 1, im: 0 }];
    const validField = (p) => p;

    it('throws TypeError for invalid field argument', () => {
      for (const bad of [null, undefined, 123, 'field', {}, true]) {
        assert.throws(() => divergenceComplexIterative(bad, validPoint), TypeError);
      }
      assert.throws(() => divergenceComplexIterative([() => ({ re: 0, im: 0 }), 42], [
        { re: 1, im: 0 },
        { re: 2, im: 0 },
      ]), TypeError);
    });

    it('throws TypeError or RangeError for invalid point argument', () => {
      for (const bad of [null, undefined, 42, 'pt', { re: 1, im: 0 }]) {
        assert.throws(() => divergenceComplexIterative(validField, bad), TypeError);
      }
      assert.throws(() => divergenceComplexIterative(validField, []), RangeError);
      assert.throws(() => divergenceComplexIterative(validField, [null]), TypeError);
      assert.throws(() => divergenceComplexIterative(validField, [{ re: '1', im: 0 }]), TypeError);
      assert.throws(() => divergenceComplexIterative(validField, [{ re: 1 }]), TypeError);
      assert.throws(() => divergenceComplexIterative(validField, [{ re: NaN, im: 0 }]), RangeError);
      assert.throws(() => divergenceComplexIterative(validField, [{ re: 0, im: Infinity }]), RangeError);
      assert.throws(() => divergenceComplexIterative(validField, [{ re: -Infinity, im: 0 }]), RangeError);
    });

    it('throws RangeError when component function array length mismatches point dimension', () => {
      assert.throws(
        () =>
          divergenceComplexIterative([([z]) => z], [
            { re: 1, im: 0 },
            { re: 2, im: 0 },
          ]),
        RangeError
      );
      assert.throws(
        () => divergenceComplexIterative([], validPoint),
        RangeError
      );
    });

    it('throws TypeError or RangeError for invalid h', () => {
      for (const badType of ['1e-6', null, {}, true]) {
        assert.throws(() => divergenceComplexIterative(validField, validPoint, badType), TypeError);
      }
      for (const badRange of [0, -1e-6, NaN, Infinity, -Infinity]) {
        assert.throws(() => divergenceComplexIterative(validField, validPoint, badRange), RangeError);
      }
    });

    it('validates field return values', () => {
      assert.throws(() => divergenceComplexIterative(() => 'bad', validPoint), TypeError);
      assert.throws(
        () => divergenceComplexIterative(() => [{ re: 1, im: 0 }, { re: 2, im: 0 }], validPoint),
        RangeError
      );
      assert.throws(
        () => divergenceComplexIterative(() => [{ re: NaN, im: 0 }], validPoint),
        RangeError
      );
      assert.throws(
        () => divergenceComplexIterative([() => ({ re: 1, im: Infinity })], validPoint),
        RangeError
      );
      assert.throws(
        () => divergenceComplexIterative([() => null], validPoint),
        TypeError
      );
    });
  });

  describe('independent cross-checks', () => {
    it('cross-check 1: matches exact matrix trace for affine complex fields F(z) = A z + b', () => {
      const A = [
        [{ re: 2.5, im: -1.1 }, { re: -0.4, im: 3.2 }, { re: 1.0, im: 0.7 }],
        [{ re: 0.9, im: 0.3 }, { re: -1.7, im: 2.4 }, { re: -2.1, im: -0.5 }],
        [{ re: -0.6, im: 1.8 }, { re: 3.1, im: -1.2 }, { re: 0.8, im: -3.3 }],
      ];
      const b = [
        { re: 4.0, im: -2.0 },
        { re: -1.5, im: 0.5 },
        { re: 2.2, im: 3.7 },
      ];
      const affineField = (z) =>
        A.map((row, i) =>
          row.reduce((acc, aij, j) => cAdd(acc, cMul(aij, z[j])), b[i])
        );

      // Independent analytical trace: sum_i A[i][i]
      const traceA = A.reduce((acc, row, i) => cAdd(acc, row[i]), { re: 0, im: 0 });

      const testPoints = [
        [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }],
        [{ re: 1.3, im: -2.7 }, { re: 0.5, im: 1.9 }, { re: -3.1, im: 0.4 }],
      ];
      for (const pt of testPoints) {
        const div = divergenceComplexIterative(affineField, pt);
        assertComplexClose(div, traceA, 1e-7, 'div(Az + b) == tr(A)');
      }
    });

    it('cross-check 2: satisfies div(curl(A)) = 0 for a 3D holomorphic vector potential', () => {
      // Vector potential A(z0, z1, z2) = [z0 * z1^2, z1 * z2^2 + exp(z0), z2 * z0^2]
      // Analytical curl F = curl(A):
      //   F0 = dA2/dz1 - dA1/dz2 = 0 - 2 * z1 * z2 = -2 * z1 * z2
      //   F1 = dA0/dz2 - dA2/dz0 = 0 - 2 * z0 * z2 = -2 * z0 * z2
      //   F2 = dA1/dz0 - dA0/dz1 = exp(z0) - 2 * z0 * z1
      const curlA = ([z0, z1, z2]) => [
        cScale(cMul(z1, z2), -2),
        cScale(cMul(z0, z2), -2),
        cSub(cExp(z0), cScale(cMul(z0, z1), 2)),
      ];

      const points = [
        [{ re: 0.7, im: -0.3 }, { re: -1.1, im: 0.9 }, { re: 0.4, im: 1.6 }],
        [{ re: -0.5, im: 1.2 }, { re: 2.0, im: -0.8 }, { re: -1.4, im: -0.2 }],
      ];
      for (const pt of points) {
        const divCurl = divergenceComplexIterative(curlA, pt);
        assertComplexClose(divCurl, { re: 0, im: 0 }, 1e-7, 'div(curl(A)) == 0');
      }
    });

    it('cross-check 3: satisfies product rule div(g * F) = grad(g) . F + g * div(F)', () => {
      // Scalar field g(z0, z1) = z0 * z1 + exp(z0)
      const g = ([z0, z1]) => cAdd(cMul(z0, z1), cExp(z0));
      // Vector field F(z0, z1) = [sin(z0) + z1^2, z0^2 * z1]
      const F = ([z0, z1]) => [
        cAdd(cSin(z0), cMul(z1, z1)),
        cMul(cMul(z0, z0), z1),
      ];
      const gF = (p) => {
        const gp = g(p);
        return F(p).map((fi) => cMul(gp, fi));
      };

      const point = [
        { re: 0.6, im: -0.9 },
        { re: -1.3, im: 0.7 },
      ];

      // Independent analytical RHS:
      // grad(g) = [z1 + exp(z0), z0]
      // div(F) = cos(z0) + z0^2
      const gradG = [cAdd(point[1], cExp(point[0])), point[0]];
      const fAtPt = F(point);
      const gradDotF = cAdd(cMul(gradG[0], fAtPt[0]), cMul(gradG[1], fAtPt[1]));
      const divFAnalytical = cAdd(cCos(point[0]), cMul(point[0], point[0]));
      const rhs = cAdd(gradDotF, cMul(g(point), divFAnalytical));

      const lhs = divergenceComplexIterative(gF, point);
      assertComplexClose(lhs, rhs, 1e-6, 'div(g*F) == grad(g).F + g*div(F)');
    });

    it('cross-check 4: agrees with independent complex-step directional Richardson extrapolation on holomorphic field', () => {
      const field = ([z0, z1]) => [
        cMul(cExp(z0), cSin(z1)),
        cAdd(cCos(cMul(z0, z1)), cMul(z1, cMul(z1, z1))),
      ];
      const point = [
        { re: 0.35, im: 0.65 },
        { re: -0.45, im: 0.85 },
      ];

      // Independent 4th-order Richardson extrapolation along real axis for holomorphic F:
      // R(h) = (4 * D(h/2) - D(h)) / 3
      const realCentralPartial = (idx, step) => {
        const pPlus = point.map((c, j) => (j === idx ? { re: c.re + step, im: c.im } : c));
        const pMinus = point.map((c, j) => (j === idx ? { re: c.re - step, im: c.im } : c));
        const diff = cSub(field(pPlus)[idx], field(pMinus)[idx]);
        return cScale(diff, 1 / (2 * step));
      };
      const richardsonDiv = [0, 1].reduce(
        (acc, idx) => {
          const dH = realCentralPartial(idx, 1e-3);
          const dH2 = realCentralPartial(idx, 5e-4);
          const extrap = cScale(cSub(cScale(dH2, 4), dH), 1 / 3);
          return cAdd(acc, extrap);
        },
        { re: 0, im: 0 }
      );

      const actual = divergenceComplexIterative(field, point);
      assertComplexClose(actual, richardsonDiv, 1e-8, 'matches Richardson extrapolation');
    });
  });
});
