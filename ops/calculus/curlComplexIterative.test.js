import test from 'node:test';
import assert from 'node:assert/strict';
import { curlComplexIterative } from './curlComplexIterative.js';

/** Helper constructors and complex math utilities for tests */
const c = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cScale = (a, s) => ({ re: a.re * s, im: a.im * s });
const cNeg = (a) => ({ re: -a.re, im: -a.im });
const cExp = (z) => {
  const e = Math.exp(z.re);
  return { re: e * Math.cos(z.im), im: e * Math.sin(z.im) };
};
const cSin = (z) => ({
  re: Math.sin(z.re) * Math.cosh(z.im),
  im: Math.cos(z.re) * Math.sinh(z.im),
});
const cCos = (z) => ({
  re: Math.cos(z.re) * Math.cosh(z.im),
  im: -Math.sin(z.re) * Math.sinh(z.im),
});

function assertComplexClose(actual, expected, tol = 1e-9, label = 'complex') {
  assert.ok(
    Math.abs(actual.re - expected.re) <= tol,
    `${label}.re: expected ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`,
  );
  assert.ok(
    Math.abs(actual.im - expected.im) <= tol,
    `${label}.im: expected ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`,
  );
}

function assertVector3Close(actual, expected, tol = 1e-9) {
  assert.equal(actual.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assertComplexClose(actual[i], expected[i], tol, `curl[${i}]`);
  }
}

test('normal cases: constant complex vector field has zero curl', () => {
  const field = () => [c(3, -4), c(-1.5, 2.25), c(0, 7)];
  const result = curlComplexIterative(field, [c(1, 2), c(-3, 4), c(5, -6)]);
  assert.deepStrictEqual(result, [c(0, 0), c(0, 0), c(0, 0)]);
});

test('normal cases: complex-scaled rigid rotation field', () => {
  const alpha = c(2, 3);
  const field = ([z0, z1]) => [cNeg(cMul(alpha, z1)), cMul(alpha, z0), c(0, 0)];
  const result = curlComplexIterative(field, [c(1.5, -0.5), c(-2, 1), c(0.25, 3)]);
  assertVector3Close(result, [c(0, 0), c(0, 0), c(4, 6)], 1e-10);
});

test('normal cases: holomorphic polynomial vector field on C^3', () => {
  // F(z0, z1, z2) = [z1*z2, z2^2 + i*z0, z0*z1^2]
  // curl(F) = [2*z0*z1 - 2*z2, z1 - z1^2, i - z2]
  const field = ([z0, z1, z2]) => [
    cMul(z1, z2),
    cAdd(cMul(z2, z2), cMul(c(0, 1), z0)),
    cMul(z0, cMul(z1, z1)),
  ];
  const point = [c(1, 2), c(-3, 1), c(2, -0.5)];
  const [z0, z1, z2] = point;
  const expected = [
    cSub(cScale(cMul(z0, z1), 2), cScale(z2, 2)),
    cSub(z1, cMul(z1, z1)),
    cSub(c(0, 1), z2),
  ];
  const actual = curlComplexIterative(field, point);
  assertVector3Close(actual, expected, 1e-9);
});

test('normal cases: complex electromagnetic plane wave E(r) = E0 * exp(i * k·r)', () => {
  const k = [1.2, -0.7, 2.3];
  const E0 = [c(1, -0.5), c(-0.3, 2.1), c(0.8, 0.4)];
  const field = ([x, y, z]) => {
    const phase = k[0] * x.re + k[1] * y.re + k[2] * z.re;
    const factor = cExp(c(0, phase));
    return [cMul(E0[0], factor), cMul(E0[1], factor), cMul(E0[2], factor)];
  };

  const point = [c(0.4, 0), c(-1.1, 0), c(0.7, 0)];
  const E = field(point);
  // Analytical identity: curl(E) = i * (k x E)
  const iUnit = c(0, 1);
  const expected = [
    cMul(iUnit, cSub(cScale(E[2], k[1]), cScale(E[1], k[2]))),
    cMul(iUnit, cSub(cScale(E[0], k[2]), cScale(E[2], k[0]))),
    cMul(iUnit, cSub(cScale(E[1], k[0]), cScale(E[0], k[1]))),
  ];

  const actual = curlComplexIterative(field, point);
  assertVector3Close(actual, expected, 1e-10);
});

test('normal cases: transcendental holomorphic vector field [sin(z1), cos(z2), exp(z0)]', () => {
  const field = ([z0, z1, z2]) => [cSin(z1), cCos(z2), cExp(z0)];
  const point = [c(0.5, -0.3), c(-0.8, 0.6), c(1.1, 0.4)];
  const [z0, z1, z2] = point;
  // curl = [sin(z2), -exp(z0), -cos(z1)]
  const expected = [cSin(z2), cNeg(cExp(z0)), cNeg(cCos(z1))];
  const actual = curlComplexIterative(field, point);
  assertVector3Close(actual, expected, 1e-10);
});

test('edge cases: zero point, no -0 artifacts, and input point immutability', () => {
  const point = [c(0, 0), c(0, 0), c(0, 0)];
  const snapshot = structuredClone(point);
  const field = () => [c(0, 0), c(0, 0), c(0, 0)];
  const actual = curlComplexIterative(field, point);

  assert.deepStrictEqual(point, snapshot);
  for (let i = 0; i < 3; i += 1) {
    assert.ok(Object.is(actual[i].re, 0), `curl[${i}].re should be +0`);
    assert.ok(Object.is(actual[i].im, 0), `curl[${i}].im should be +0`);
  }
});

test('edge cases: iterative Richardson extrapolation improves accuracy over single central difference', () => {
  // Use a coarse step h = 0.2 on a smooth non-polynomial field to observe O(h^2) -> O(h^6) improvement
  const field = ([z0, z1, z2]) => [cExp(z2), cSin(z0), cCos(z1)];
  const point = [c(0.7, 0.2), c(-0.4, 0.5), c(0.3, -0.6)];
  const [z0, z1, z2] = point;
  const expected = [cNeg(cSin(z1)), cExp(z2), cCos(z0)];

  const coarseIter1 = curlComplexIterative(field, point, 0.2, 1);
  const refinedIter3 = curlComplexIterative(field, point, 0.2, 3);

  const err1 = Math.hypot(
    coarseIter1[0].re - expected[0].re,
    coarseIter1[0].im - expected[0].im,
    coarseIter1[1].re - expected[1].re,
    coarseIter1[1].im - expected[1].im,
    coarseIter1[2].re - expected[2].re,
    coarseIter1[2].im - expected[2].im,
  );
  const err3 = Math.hypot(
    refinedIter3[0].re - expected[0].re,
    refinedIter3[0].im - expected[0].im,
    refinedIter3[1].re - expected[1].re,
    refinedIter3[1].im - expected[1].im,
    refinedIter3[2].re - expected[2].re,
    refinedIter3[2].im - expected[2].im,
  );

  assert.ok(err1 > 1e-4, `Expected coarse 1-iteration error > 1e-4, got ${err1}`);
  assert.ok(err3 < 1e-9, `Expected 3-iteration Richardson error < 1e-9, got ${err3}`);
  assert.ok(err3 < err1 * 1e-5);
});

test('edge cases: purely imaginary coordinates and large coordinate magnitudes', () => {
  const field = ([z0, z1, z2]) => [cMul(z1, z1), cMul(z2, z2), cMul(z0, z0)];
  const imagPoint = [c(0, 2), c(0, -3), c(0, 5)];
  // curl = [-2*z2, -2*z0, -2*z1]
  assertVector3Close(
    curlComplexIterative(field, imagPoint),
    [c(0, -10), c(0, -4), c(0, 6)],
    1e-9,
  );

  const largePoint = [c(1e5, 2), c(-2e5, -1), c(3e5, 4)];
  assertVector3Close(
    curlComplexIterative(field, largePoint, 1, 2),
    [c(-6e5, -8), c(-2e5, -4), c(4e5, 2)],
    1e-4,
  );
});

test('validation: throws TypeError / RangeError for invalid inputs and field outputs', () => {
  const validField = () => [c(0), c(0), c(0)];
  const validPoint = [c(0), c(0), c(0)];

  // Invalid field
  assert.throws(() => curlComplexIterative(null, validPoint), TypeError);
  assert.throws(() => curlComplexIterative(42, validPoint), TypeError);
  assert.throws(() => curlComplexIterative({}, validPoint), TypeError);

  // Invalid point container
  assert.throws(() => curlComplexIterative(validField, null), TypeError);
  assert.throws(() => curlComplexIterative(validField, { re: 0, im: 0 }), TypeError);
  assert.throws(() => curlComplexIterative(validField, []), RangeError);
  assert.throws(() => curlComplexIterative(validField, [c(0), c(0)]), RangeError);
  assert.throws(() => curlComplexIterative(validField, [c(0), c(0), c(0), c(0)]), RangeError);

  // Invalid complex point components
  assert.throws(() => curlComplexIterative(validField, [null, c(0), c(0)]), TypeError);
  assert.throws(() => curlComplexIterative(validField, [{ re: '0', im: 0 }, c(0), c(0)]), TypeError);
  assert.throws(() => curlComplexIterative(validField, [{ re: 0 }, c(0), c(0)]), TypeError);
  assert.throws(() => curlComplexIterative(validField, [c(NaN, 0), c(0), c(0)]), RangeError);
  assert.throws(() => curlComplexIterative(validField, [c(0, Infinity), c(0), c(0)]), RangeError);
  assert.throws(() => curlComplexIterative(validField, [c(-Infinity, 0), c(0), c(0)]), RangeError);

  // Invalid h
  assert.throws(() => curlComplexIterative(validField, validPoint, '1e-4'), TypeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, 0), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, -1e-4), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, NaN), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, Infinity), RangeError);

  // Invalid iterations
  assert.throws(() => curlComplexIterative(validField, validPoint, 1e-4, '2'), TypeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, 1e-4, 0), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, 1e-4, -1), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, 1e-4, 1.5), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, 1e-4, 17), RangeError);
  assert.throws(() => curlComplexIterative(validField, validPoint, 1e-4, Infinity), RangeError);

  // Step size too small to change floating-point coordinate
  assert.throws(
    () => curlComplexIterative(validField, [c(1e16, 0), c(0), c(0)], 1e-5, 1),
    RangeError,
  );

  // Invalid field return values
  assert.throws(() => curlComplexIterative(() => null, validPoint), TypeError);
  assert.throws(() => curlComplexIterative(() => [c(0), c(0)], validPoint), RangeError);
  assert.throws(() => curlComplexIterative(() => [c(0), 'bad', c(0)], validPoint), TypeError);
  assert.throws(() => curlComplexIterative(() => [c(0), c(NaN, 0), c(0)], validPoint), RangeError);
  assert.throws(() => curlComplexIterative(() => [c(0), c(0, Infinity), c(0)], validPoint), RangeError);
});

test('cross-check 1: mathematical identity curl(grad(phi)) === 0 for complex potential', () => {
  // phi(z0, z1, z2) = z0^2 * z1 + i * sin(z1 * z2) + exp(z0 + z2)
  // grad(phi) computed analytically:
  const gradPhi = ([z0, z1, z2]) => {
    const exp02 = cExp(cAdd(z0, z2));
    const iCos12 = cMul(c(0, 1), cCos(cMul(z1, z2)));
    return [
      cAdd(cScale(cMul(z0, z1), 2), exp02),
      cAdd(cMul(z0, z0), cMul(z2, iCos12)),
      cAdd(cMul(z1, iCos12), exp02),
    ];
  };

  const point = [c(0.6, -0.4), c(-0.7, 0.5), c(0.3, 0.8)];
  const curlOfGrad = curlComplexIterative(gradPhi, point);
  assertVector3Close(curlOfGrad, [c(0, 0), c(0, 0), c(0, 0)], 1e-9);
});

test('cross-check 2: mathematical identity div(curl(F)) === 0 via independent divergence', () => {
  const field = ([z0, z1, z2]) => [
    cAdd(cMul(z0, cSin(z1)), cExp(z2)),
    cMul(z2, cCos(z0)),
    cMul(cMul(z0, z1), z2),
  ];

  const point = [c(0.5, 0.3), c(-0.4, 0.7), c(0.8, -0.2)];
  const hDiv = 1e-4;
  let divRe = 0;
  let divIm = 0;

  for (let axis = 0; axis < 3; axis += 1) {
    const pPlus = point.map((z) => ({ re: z.re, im: z.im }));
    const pMinus = point.map((z) => ({ re: z.re, im: z.im }));
    pPlus[axis].re += hDiv;
    pMinus[axis].re -= hDiv;

    const curlPlus = curlComplexIterative(field, pPlus);
    const curlMinus = curlComplexIterative(field, pMinus);

    divRe += (curlPlus[axis].re - curlMinus[axis].re) / (2 * hDiv);
    divIm += (curlPlus[axis].im - curlMinus[axis].im) / (2 * hDiv);
  }

  assertComplexClose({ re: divRe, im: divIm }, c(0, 0), 1e-7, 'div(curl(F))');
});

test('cross-check 3: Cauchy-Riemann verification via independent imaginary-axis differentiation', () => {
  const field = ([z0, z1, z2]) => [
    cMul(cSin(z1), cExp(z2)),
    cAdd(cMul(z0, z2), cCos(z0)),
    cMul(z1, cExp(z0)),
  ];
  const point = [c(0.4, -0.5), c(-0.6, 0.3), c(0.2, 0.7)];

  // Independent reference using imaginary-axis perturbations:
  // dF/dz_j = (1/i) * (F(p + i*h*e_j) - F(p - i*h*e_j)) / (2h)
  // If (a + bi) = (F+ - F-) / (2h), then (1/i)(a + bi) = b - a*i.
  const hImag = 1e-5;
  const imagPartials = [0, 1, 2].map((axis) => {
    const pPlus = point.map((z) => ({ re: z.re, im: z.im }));
    const pMinus = point.map((z) => ({ re: z.re, im: z.im }));
    pPlus[axis].im += hImag;
    pMinus[axis].im -= hImag;
    const fPlus = field(pPlus);
    const fMinus = field(pMinus);
    return [0, 1, 2].map((comp) => {
      const a = (fPlus[comp].re - fMinus[comp].re) / (2 * hImag);
      const b = (fPlus[comp].im - fMinus[comp].im) / (2 * hImag);
      return { re: b, im: -a };
    });
  });

  const referenceCurl = [
    cSub(imagPartials[1][2], imagPartials[2][1]),
    cSub(imagPartials[2][0], imagPartials[0][2]),
    cSub(imagPartials[0][1], imagPartials[1][0]),
  ];

  const actual = curlComplexIterative(field, point);
  assertVector3Close(actual, referenceCurl, 1e-8);
});

test('cross-check 4: linearity curl(a*F + b*G) === a*curl(F) + b*curl(G)', () => {
  const alpha = c(1.5, -2.25);
  const beta = c(-0.75, 3.1);

  const F = ([z0, z1, z2]) => [cMul(z1, z2), cExp(z0), cSin(z1)];
  const G = ([z0, z1, z2]) => [cCos(z2), cMul(z0, z1), cMul(z2, z2)];
  const combined = (p) => {
    const f = F(p);
    const g = G(p);
    return [
      cAdd(cMul(alpha, f[0]), cMul(beta, g[0])),
      cAdd(cMul(alpha, f[1]), cMul(beta, g[1])),
      cAdd(cMul(alpha, f[2]), cMul(beta, g[2])),
    ];
  };

  const point = [c(0.3, 0.9), c(-0.5, 0.2), c(0.8, -0.4)];
  const lhs = curlComplexIterative(combined, point);
  const curlF = curlComplexIterative(F, point);
  const curlG = curlComplexIterative(G, point);
  const rhs = [0, 1, 2].map((i) => cAdd(cMul(alpha, curlF[i]), cMul(beta, curlG[i])));

  assertVector3Close(lhs, rhs, 1e-9);
});

test('cross-check 5: Stokes theorem line integral around small square matches curl_z * Area', () => {
  const field = ([z0, z1, z2]) => [
    cAdd(cMul(c(0, 1), cMul(z1, z1)), cSin(z0)),
    cMul(c(2, -1), cExp(cAdd(z0, z2))),
    cMul(z0, z1),
  ];

  const x0 = 0.6;
  const y0 = -0.3;
  const z0 = 0.4;
  const delta = 1e-3;
  const area = (2 * delta) * (2 * delta);

  // Simpson's rule integration along a 1D segment [a, b]
  const simpson = (fn, a, b) => {
    const mid = 0.5 * (a + b);
    const fa = fn(a);
    const fm = fn(mid);
    const fb = fn(b);
    const w = (b - a) / 6;
    return {
      re: w * (fa.re + 4 * fm.re + fb.re),
      im: w * (fa.im + 4 * fm.im + fb.im),
    };
  };

  // Counter-clockwise contour around [x0 - delta, x0 + delta] x [y0 - delta, y0 + delta]
  const bottom = simpson((x) => field([c(x), c(y0 - delta), c(z0)])[0], x0 - delta, x0 + delta);
  const right = simpson((y) => field([c(x0 + delta), c(y), c(z0)])[1], y0 - delta, y0 + delta);
  const top = simpson((x) => field([c(x), c(y0 + delta), c(z0)])[0], x0 + delta, x0 - delta);
  const left = simpson((y) => field([c(x0 - delta), c(y), c(z0)])[1], y0 + delta, y0 - delta);

  const circulation = cAdd(cAdd(bottom, right), cAdd(top, left));
  const stokesCurlZ = cScale(circulation, 1 / area);

  const curlAtCenter = curlComplexIterative(field, [c(x0), c(y0), c(z0)]);
  assertComplexClose(curlAtCenter[2], stokesCurlZ, 1e-5, 'Stokes curl_z');
});
