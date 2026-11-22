import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcsinComplexRecursive } from './arcsinComplexRecursive.js';

/**
 * Independent complex sine: sin(u + i*v) = sin(u)*cosh(v) + i*cos(u)*sinh(v).
 */
function complexSin({ re: u, im: v }) {
  return {
    re: Math.sin(u) * Math.cosh(v),
    im: Math.cos(u) * Math.sinh(v),
  };
}

/**
 * Independent direct reference formula (Abramowitz & Stegun 4.4.37 / Hull-Fairgrieve-Tang)
 * for moderate |z| where direct hypot/acosh has high accuracy.
 */
function arcsinReferenceDirect({ re: x, im: y }) {
  const r1 = Math.hypot(x + 1, y);
  const r2 = Math.hypot(x - 1, y);
  const A = Math.max(1, 0.5 * (r1 + r2));
  const B = Math.max(-1, Math.min(1, 0.5 * (r1 - r2)));
  const re = Math.asin(B);
  const imMag = Math.acosh(A);
  const im = y < 0 ? -imMag : imMag;
  return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im };
}

function assertComplexClose(actual, expected, tol = 1e-13, msg = '') {
  const reErr = Math.abs(actual.re - expected.re);
  const imErr = Math.abs(actual.im - expected.im);
  const reScale = Math.max(1, Math.abs(expected.re));
  const imScale = Math.max(1, Math.abs(expected.im));
  assert.ok(
    reErr <= tol * reScale,
    `${msg} real mismatch: got ${actual.re}, expected ${expected.re} (err=${reErr})`,
  );
  assert.ok(
    imErr <= tol * imScale,
    `${msg} imag mismatch: got ${actual.im}, expected ${expected.im} (err=${imErr})`,
  );
}

describe('arcsinComplexRecursive', () => {
  describe('known analytical values and normal complex inputs', () => {
    it('computes exact known real values in [-1, 1]', () => {
      const cases = [
        [0, 0],
        [0.5, Math.PI / 6],
        [Math.SQRT1_2, Math.PI / 4],
        [Math.sqrt(3) / 2, Math.PI / 3],
        [1, Math.PI / 2],
        [-0.5, -Math.PI / 6],
        [-Math.SQRT1_2, -Math.PI / 4],
        [-Math.sqrt(3) / 2, -Math.PI / 3],
        [-1, -Math.PI / 2],
      ];

      for (const [x, expectedRe] of cases) {
        const res = arcsinComplexRecursive({ re: x, im: 0 });
        assertComplexClose(res, { re: expectedRe, im: 0 }, 1e-14, `arcsin(${x})`);
        assert.equal(Object.is(res.im, -0), false, `im should not be -0 for x=${x}`);
      }
    });

    it('matches Math.asin across pure real inputs in [-1, 1]', () => {
      for (const x of [-0.999, -0.73, -0.25, -0.01, 0.01, 0.37, 0.88, 0.999999]) {
        const res = arcsinComplexRecursive({ re: x, im: 0 });
        assertComplexClose(res, { re: Math.asin(x), im: 0 }, 1e-14, `arcsin(${x})`);
        assert.equal(res.im, 0);
      }
    });

    it('matches i * Math.asinh(y) for pure imaginary inputs', () => {
      for (const y of [-100, -5, -1, -0.03, -1e-12, 1e-12, 0.03, 1, 5, 100, 1e10]) {
        const res = arcsinComplexRecursive({ re: 0, im: y });
        assertComplexClose(res, { re: 0, im: Math.asinh(y) }, 1e-14, `arcsin(${y}i)`);
        assert.equal(res.re, 0);
      }
    });

    it('computes accurate values in all four complex quadrants', () => {
      const points = [
        { re: 1, im: 1 },
        { re: -1, im: 1 },
        { re: -1, im: -1 },
        { re: 1, im: -1 },
        { re: 0.5, im: 0.5 },
        { re: -0.3, im: 0.7 },
        { re: 3, im: -4 },
        { re: -2.5, im: 7.25 },
        { re: 0.02, im: -0.03 },
        { re: 10, im: 20 },
      ];

      for (const z of points) {
        const res = arcsinComplexRecursive(z);
        const ref = arcsinReferenceDirect(z);
        assertComplexClose(res, ref, 1e-13, `arcsin(${z.re} + ${z.im}i)`);
      }
    });
  });

  describe('edge cases, branch cuts, and extreme magnitudes', () => {
    it('normalizes -0 inputs and outputs to +0', () => {
      const r1 = arcsinComplexRecursive({ re: -0, im: -0 });
      assert.equal(Object.is(r1.re, 0), true);
      assert.equal(Object.is(r1.im, 0), true);

      const r2 = arcsinComplexRecursive({ re: 0, im: -0 });
      assert.equal(Object.is(r2.re, 0), true);
      assert.equal(Object.is(r2.im, 0), true);
    });

    it('handles branch cuts |x| > 1, y = 0 with upper half-plane continuity', () => {
      for (const x of [1.5, 2, 10, 1e6, -1.5, -2, -10, -1e6]) {
        const res = arcsinComplexRecursive({ re: x, im: 0 });
        const expected = {
          re: Math.sign(x) * (Math.PI / 2),
          im: Math.acosh(Math.abs(x)),
        };
        assertComplexClose(res, expected, 1e-13, `branch cut x=${x}`);
      }
    });

    it('is continuous approaching branch cuts from upper and lower half-planes', () => {
      const eps = 1e-10;
      const upperPos = arcsinComplexRecursive({ re: 2, im: eps });
      const lowerPos = arcsinComplexRecursive({ re: 2, im: -eps });
      const onCutPos = arcsinComplexRecursive({ re: 2, im: 0 });

      assertComplexClose(upperPos, onCutPos, 1e-8, 'upper limit at x=2');
      assertComplexClose(lowerPos, { re: Math.PI / 2, im: -Math.acosh(2) }, 1e-8, 'lower limit at x=2');

      const upperNeg = arcsinComplexRecursive({ re: -2, im: eps });
      const lowerNeg = arcsinComplexRecursive({ re: -2, im: -eps });
      const onCutNeg = arcsinComplexRecursive({ re: -2, im: 0 });

      assertComplexClose(upperNeg, onCutNeg, 1e-8, 'upper limit at x=-2');
      assertComplexClose(lowerNeg, { re: -Math.PI / 2, im: -Math.acosh(2) }, 1e-8, 'lower limit at x=-2');
    });

    it('maintains high precision near branch points z = +-1', () => {
      // Near z = 1 + i*eps: arcsin(1 + i*eps) ~= (pi/2 - sqrt(eps)) + i*sqrt(eps)
      const eps = 1e-12;
      const res1 = arcsinComplexRecursive({ re: 1, im: eps });
      assertComplexClose(
        res1,
        { re: Math.PI / 2 - Math.sqrt(eps), im: Math.sqrt(eps) },
        1e-11,
        'near 1 + i*1e-12',
      );
      assertComplexClose(complexSin(res1), { re: 1, im: eps }, 1e-13, 'sin(arcsin(1 + i*1e-12))');

      // Real value very close to 1: 1 - 1e-12
      const xNear1 = 1 - 1e-12;
      const res2 = arcsinComplexRecursive({ re: xNear1, im: 0 });
      assertComplexClose(res2, { re: Math.asin(xNear1), im: 0 }, 1e-13, 'near 1 - 1e-12');
    });

    it('handles very small complex numbers without underflow', () => {
      const tiny1 = { re: 1e-12, im: -2e-12 };
      assertComplexClose(arcsinComplexRecursive(tiny1), tiny1, 1e-14, 'tiny 1e-12');

      const tiny2 = { re: 1e-200, im: -3e-200 };
      const res2 = arcsinComplexRecursive(tiny2);
      assert.equal(res2.re, tiny2.re);
      assert.equal(res2.im, tiny2.im);
    });

    it('handles extreme magnitudes and strongly asymmetric components without overflow', () => {
      // z = 1e-5 + i*1e20 => Re(arcsin(z)) ~= x/y = 1e-25, Im ~= ln(2*1e20)
      const asym1 = arcsinComplexRecursive({ re: 1e-5, im: 1e20 });
      assert.ok(Math.abs(asym1.re - 1e-25) / 1e-25 < 1e-12, `asym1.re=${asym1.re}`);
      assert.ok(
        Math.abs(asym1.im - (Math.log(2) + 20 * Math.LN10)) < 1e-12,
        `asym1.im=${asym1.im}`,
      );

      // Huge magnitude near Number.MAX_VALUE: z = 1e300 + i*1e300
      // Asymptotically: arcsin(r * e^(i*pi/4)) ~= pi/4 + i * ln(2*r)
      const huge = arcsinComplexRecursive({ re: 1e300, im: 1e300 });
      const expectedIm = Math.log(2 * Math.SQRT2) + 300 * Math.LN10;
      assertComplexClose(huge, { re: Math.PI / 4, im: expectedIm }, 1e-13, '1e300 + 1e300i');

      // Pure real huge value: z = 1e300 + 0i
      const hugeReal = arcsinComplexRecursive({ re: 1e300, im: 0 });
      assertComplexClose(
        hugeReal,
        { re: Math.PI / 2, im: Math.LN2 + 300 * Math.LN10 },
        1e-13,
        '1e300 + 0i',
      );
    });
  });

  describe('independent cross-checks and algebraic identities', () => {
    it('satisfies sin(arcsin(z)) === z across a diverse complex grid', () => {
      const grid = [
        { re: 0, im: 0 },
        { re: 0.25, im: 0.75 },
        { re: -0.8, im: 0.6 },
        { re: 1.5, im: 2.5 },
        { re: -3.2, im: -1.4 },
        { re: 4.1, im: -0.2 },
        { re: -0.05, im: 5.0 },
        { re: 0.999, im: 0.001 },
        { re: 2.0, im: 0 },
        { re: -2.0, im: 0 },
        { re: 0, im: -3.7 },
      ];

      for (const z of grid) {
        const w = arcsinComplexRecursive(z);
        assert.ok(
          w.re >= -Math.PI / 2 - 1e-15 && w.re <= Math.PI / 2 + 1e-15,
          `Re(arcsin(z)) out of principal strip: ${w.re}`,
        );
        const recovered = complexSin(w);
        assertComplexClose(recovered, z, 1e-12, `sin(arcsin(${z.re} + ${z.im}i))`);
      }
    });

    it('satisfies odd symmetry arcsin(-z) = -arcsin(z) and conjugate symmetry off branch cuts', () => {
      const samples = [
        { re: 0.4, im: 0.9 },
        { re: 2.3, im: 1.7 },
        { re: -1.2, im: 3.4 },
        { re: 0.01, im: -0.02 },
        { re: 15, im: -8 },
      ];

      for (const z of samples) {
        const w = arcsinComplexRecursive(z);
        const wNeg = arcsinComplexRecursive({ re: -z.re, im: -z.im });
        const wConj = arcsinComplexRecursive({ re: z.re, im: -z.im });

        assertComplexClose(wNeg, { re: -w.re, im: -w.im }, 1e-13, `odd symmetry at ${z.re}+${z.im}i`);
        assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-13, `conjugate symmetry at ${z.re}+${z.im}i`);
      }
    });

    it('satisfies arcsin(sin(w)) === w for w inside the principal strip', () => {
      const stripPoints = [
        { re: 0.5, im: 0.3 },
        { re: -1.1, im: 2.0 },
        { re: 1.4, im: -1.5 },
        { re: -0.2, im: -0.8 },
        { re: 0, im: 3.1 },
      ];

      for (const w of stripPoints) {
        const z = complexSin(w);
        const recovered = arcsinComplexRecursive(z);
        assertComplexClose(recovered, w, 1e-12, `arcsin(sin(${w.re} + ${w.im}i))`);
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-object, null, or array inputs', () => {
      for (const bad of [null, undefined, 0, 1, '1+i', true, [1, 2], () => {}]) {
        assert.throws(() => arcsinComplexRecursive(bad), TypeError);
      }
    });

    it('throws TypeError when re or im is missing or not a number', () => {
      const badObjs = [
        {},
        { re: 1 },
        { im: 1 },
        { re: '0.5', im: 0 },
        { re: 0, im: null },
        { re: undefined, im: 0 },
        { re: 0, im: false },
      ];
      for (const bad of badObjs) {
        assert.throws(() => arcsinComplexRecursive(bad), TypeError);
      }
    });

    it('throws RangeError for NaN or infinite components', () => {
      const badValues = [
        { re: NaN, im: 0 },
        { re: 0, im: NaN },
        { re: Infinity, im: 0 },
        { re: -Infinity, im: 1 },
        { re: 1, im: Infinity },
        { re: 0, im: -Infinity },
      ];
      for (const bad of badValues) {
        assert.throws(() => arcsinComplexRecursive(bad), RangeError);
      }
    });
  });
});
