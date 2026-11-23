import test from 'node:test';
import assert from 'node:assert/strict';
import { factorialComplexIterative } from './factorialComplexIterative.js';

function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
  assert.equal(typeof actual, 'object');
  assert.notEqual(actual, null);
  const diffRe = Math.abs(actual.re - expected.re);
  const diffIm = Math.abs(actual.im - expected.im);
  const scale = Math.hypot(expected.re, expected.im);
  const tol = Math.max(absTol, relTol * scale);
  assert.ok(
    diffRe <= tol && diffIm <= tol,
    `Expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i), ` +
      `diff=(${diffRe}, ${diffIm}), tol=${tol}`
  );
}

function cMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}

function cSin(z) {
  return {
    re: Math.sin(z.re) * Math.cosh(z.im),
    im: Math.cos(z.re) * Math.sinh(z.im),
  };
}

test('non-negative integer factorials (exact iterative values)', () => {
  assert.deepStrictEqual(factorialComplexIterative({ re: 0, im: 0 }), { re: 1, im: 0 });
  assert.deepStrictEqual(factorialComplexIterative({ re: 1, im: 0 }), { re: 1, im: 0 });
  assert.deepStrictEqual(factorialComplexIterative({ re: 5, im: 0 }), { re: 120, im: 0 });
  assert.deepStrictEqual(factorialComplexIterative({ re: 10, im: 0 }), { re: 3628800, im: 0 });
  assert.deepStrictEqual(factorialComplexIterative({ re: 20, im: 0 }), {
    re: 2432902008176640000,
    im: 0,
  });
  // Negative zero in imaginary part is treated as real
  assert.deepStrictEqual(factorialComplexIterative({ re: 6, im: -0 }), { re: 720, im: 0 });
});

test('real half-integer factorials (positive and negative)', () => {
  const sqrtPi = Math.sqrt(Math.PI);
  // (-0.5)! = Gamma(0.5) = sqrt(pi)
  assertComplexClose(factorialComplexIterative({ re: -0.5, im: 0 }), { re: sqrtPi, im: 0 });
  assert.equal(factorialComplexIterative({ re: -0.5, im: 0 }).im, 0);

  // (0.5)! = Gamma(1.5) = sqrt(pi) / 2
  assertComplexClose(factorialComplexIterative({ re: 0.5, im: 0 }), { re: sqrtPi / 2, im: 0 });

  // (1.5)! = Gamma(2.5) = 3 * sqrt(pi) / 4
  assertComplexClose(factorialComplexIterative({ re: 1.5, im: 0 }), {
    re: (3 * sqrtPi) / 4,
    im: 0,
  });

  // (-1.5)! = Gamma(-0.5) = -2 * sqrt(pi)
  assertComplexClose(factorialComplexIterative({ re: -1.5, im: 0 }), {
    re: -2 * sqrtPi,
    im: 0,
  });
  assert.equal(factorialComplexIterative({ re: -1.5, im: 0 }).im, 0);

  // (-2.5)! = Gamma(-1.5) = (4 / 3) * sqrt(pi)
  assertComplexClose(factorialComplexIterative({ re: -2.5, im: 0 }), {
    re: (4 * sqrtPi) / 3,
    im: 0,
  });
});

test('known complex values: i! and (1 + i)! and (-1 + i)!', () => {
  // Known reference value: i! = Gamma(1 + i)
  const iFact = { re: 0.49801566811835604, im: -0.15494982830181068 };
  assertComplexClose(factorialComplexIterative({ re: 0, im: 1 }), iFact, 1e-13, 1e-13);

  // (1 + i)! = (1 + i) * i!
  const onePlusIFact = cMul({ re: 1, im: 1 }, iFact);
  assertComplexClose(factorialComplexIterative({ re: 1, im: 1 }), onePlusIFact, 1e-13, 1e-13);

  // (-1 + i)! = i! / i = -i * i!
  const negOnePlusIFact = cDiv(iFact, { re: 0, im: 1 });
  assertComplexClose(factorialComplexIterative({ re: -1, im: 1 }), negOnePlusIFact, 1e-13, 1e-13);
});

test('independent cross-check: modulus identity |iy|!^2 = pi*y / sinh(pi*y)', () => {
  for (const y of [0.25, 1, 2.5, 5, 10]) {
    const res = factorialComplexIterative({ re: 0, im: y });
    const modSq = res.re * res.re + res.im * res.im;
    const expectedModSq = (Math.PI * y) / Math.sinh(Math.PI * y);
    assert.ok(
      Math.abs(modSq - expectedModSq) <= 1e-12 * expectedModSq,
      `For y=${y}: got |iy!|^2=${modSq}, expected=${expectedModSq}`
    );
  }
});

test('independent cross-check: recurrence z! = z * (z - 1)! across all quadrants', () => {
  const points = [
    { re: 2.3, im: 1.7 },
    { re: -0.3, im: 2.1 },
    { re: -3.4, im: -1.9 },
    { re: 0.25, im: -4.5 },
    { re: 7.5, im: 3.2 },
    { re: -5.5, im: 0 },
  ];

  for (const z of points) {
    const lhs = factorialComplexIterative(z);
    const rhs = cMul(z, factorialComplexIterative({ re: z.re - 1, im: z.im }));
    assertComplexClose(lhs, rhs, 1e-12, 1e-12);
  }
});

test('independent cross-check: Euler reflection z! * (-z)! = pi * z / sin(pi * z)', () => {
  const points = [
    { re: 0.3, im: 0.7 },
    { re: 1.4, im: -0.8 },
    { re: -2.2, im: 1.5 },
    { re: 0.25, im: 0 },
  ];

  for (const z of points) {
    const lhs = cMul(
      factorialComplexIterative(z),
      factorialComplexIterative({ re: -z.re, im: -z.im })
    );
    const piZ = { re: Math.PI * z.re, im: Math.PI * z.im };
    const rhs = cDiv(piZ, cSin(piZ));
    assertComplexClose(lhs, rhs, 1e-12, 1e-12);
  }
});

test('independent cross-check: conjugate symmetry conj(z!) = conj(z)!', () => {
  const points = [
    { re: 0.5, im: 2.3 },
    { re: -2.7, im: 4.1 },
    { re: 12.1, im: -3.6 },
  ];

  for (const z of points) {
    const fz = factorialComplexIterative(z);
    const fConj = factorialComplexIterative({ re: z.re, im: -z.im });
    assertComplexClose(fConj, { re: fz.re, im: -fz.im }, 1e-13, 1e-13);
  }
});

test('independent cross-check: large real & large imaginary stability (no intermediate overflow)', () => {
  // 150! is ~5.7133839564458505e262; naive non-log Lanczos overflows t^(z+0.5) > 1e308
  const exact150 = factorialComplexIterative({ re: 150, im: 0 });
  const near150 = factorialComplexIterative({ re: 150, im: 1e-12 });
  assert.ok(Number.isFinite(exact150.re));
  assertComplexClose(near150, exact150, 1e-9, 1e-9);

  // Large negative Re with large Im exercises asymptotic lnSinPi branch (|pi * im| > 20)
  const zLargeIm = { re: -2.3, im: 10 };
  const f1 = factorialComplexIterative(zLargeIm);
  const fPrev = factorialComplexIterative({ re: zLargeIm.re - 1, im: zLargeIm.im });
  assert.ok(Number.isFinite(f1.re) && Number.isFinite(f1.im));
  assertComplexClose(f1, cMul(zLargeIm, fPrev), 1e-11, 1e-20);

  // Huge integer factorial returns Infinity without hanging
  const huge = factorialComplexIterative({ re: 1e9, im: 0 });
  assert.deepStrictEqual(huge, { re: Infinity, im: 0 });
});

test('input validation and negative integer poles', () => {
  // Non-object or missing/non-numeric fields -> TypeError
  for (const bad of [null, undefined, 5, '1+2i', true, {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }]) {
    assert.throws(() => factorialComplexIterative(bad), TypeError);
  }

  // Non-finite components -> RangeError
  for (const bad of [
    { re: NaN, im: 0 },
    { re: 0, im: NaN },
    { re: Infinity, im: 0 },
    { re: -Infinity, im: 0 },
    { re: 1, im: Infinity },
    { re: 1, im: -Infinity },
  ]) {
    assert.throws(() => factorialComplexIterative(bad), RangeError);
  }

  // Negative integer poles -> RangeError
  for (const pole of [-1, -2, -5, -100]) {
    assert.throws(() => factorialComplexIterative({ re: pole, im: 0 }), RangeError);
    assert.throws(() => factorialComplexIterative({ re: pole, im: -0 }), RangeError);
  }
});
