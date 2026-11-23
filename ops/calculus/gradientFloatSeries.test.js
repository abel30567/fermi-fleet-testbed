import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradientFloatSeries } from './gradientFloatSeries.js';

/**
 * Asserts that two vectors are approximately equal componentwise within an
 * absolute/relative tolerance.
 *
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [tol=1e-9]
 */
function assertVecClose(actual, expected, tol = 1e-9) {
  assert.equal(actual.length, expected.length, 'Vector lengths must match');
  for (let i = 0; i < expected.length; i++) {
    const scale = Math.max(1, Math.abs(expected[i]));
    const diff = Math.abs(actual[i] - expected[i]);
    assert.ok(
      diff <= tol * scale,
      `Component ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff}, allowed=${tol * scale})`,
    );
  }
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

describe('gradientFloatSeries', () => {
  describe('normal cases', () => {
    it('computes 1D derivative accurately for polynomials and smooth functions', () => {
      // Degree-4 polynomial: 5-point central stencil has zero truncation error
      const poly4 = ([x]) => 2 * x ** 4 - 3 * x ** 3 + 5 * x ** 2 - 7 * x + 11;
      const dPoly4 = (x) => 8 * x ** 3 - 9 * x ** 2 + 10 * x - 7;
      for (const x of [-2.5, 0, 1.75, 4.2]) {
        assertVecClose(gradientFloatSeries(poly4, [x]), [dPoly4(x)], 1e-10);
      }

      const trig1d = ([x]) => Math.sin(x) + Math.exp(0.5 * x);
      assertVecClose(
        gradientFloatSeries(trig1d, [1.2]),
        [Math.cos(1.2) + 0.5 * Math.exp(0.6)],
        1e-10,
      );
    });

    it('computes 2D gradient accurately', () => {
      const f = ([x, y]) => x ** 2 * y + Math.sin(x * y) - 3 * y ** 3;
      const x = 1.3;
      const y = -0.7;
      const expected = [
        2 * x * y + y * Math.cos(x * y),
        x ** 2 + x * Math.cos(x * y) - 9 * y ** 2,
      ];
      assertVecClose(gradientFloatSeries(f, [x, y]), expected, 1e-10);
    });

    it('computes 3D gradient accurately', () => {
      const f = ([x, y, z]) => x * y * z + Math.exp(x - z) + Math.cos(y + 2 * z);
      const [x, y, z] = [0.5, -1.1, 0.8];
      const expected = [
        y * z + Math.exp(x - z),
        x * z - Math.sin(y + 2 * z),
        x * y - Math.exp(x - z) - 2 * Math.sin(y + 2 * z),
      ];
      assertVecClose(gradientFloatSeries(f, [x, y, z]), expected, 1e-10);
    });

    it('computes exact gradient of a general symmetric quadratic form 0.5 x^T A x + b^T x + c', () => {
      const A = [
        [4, -1, 2, 0.5],
        [-1, 3, -0.5, 1],
        [2, -0.5, 5, -2],
        [0.5, 1, -2, 6],
      ];
      const b = [-3, 2, 1.5, -4];
      const c = 7.25;

      const quad = (x) => {
        let val = c;
        for (let i = 0; i < x.length; i++) {
          val += b[i] * x[i];
          for (let j = 0; j < x.length; j++) {
            val += 0.5 * x[i] * A[i][j] * x[j];
          }
        }
        return val;
      };

      const point = [1.5, -2.0, 0.75, 3.25];
      const expected = A.map((row, i) => dot(row, point) + b[i]);

      assertVecClose(gradientFloatSeries(quad, point), expected, 1e-10);
    });

    it('computes gradient of trigonometric and exponential scalar fields', () => {
      // 3D Gaussian-modulated wave: exp(-(x^2 + y^2 + z^2) / 2) * cos(x - y)
      const f = ([x, y, z]) => {
        const r2 = x * x + y * y + z * z;
        return Math.exp(-0.5 * r2) * Math.cos(x - y);
      };
      const [x, y, z] = [0.4, -0.6, 0.9];
      const e = Math.exp(-0.5 * (x * x + y * y + z * z));
      const c = Math.cos(x - y);
      const s = Math.sin(x - y);
      const expected = [
        e * (-x * c - s),
        e * (-y * c + s),
        e * (-z * c),
      ];

      assertVecClose(gradientFloatSeries(f, [x, y, z]), expected, 1e-10);
    });

    it('respects an explicit custom step size h', () => {
      const f = ([x, y]) => Math.exp(x) * Math.sin(y);
      const point = [0.8, 1.1];
      const expected = [Math.exp(0.8) * Math.sin(1.1), Math.exp(0.8) * Math.cos(1.1)];

      assertVecClose(gradientFloatSeries(f, point, 1e-3), expected, 1e-10);
      assertVecClose(gradientFloatSeries(f, point, 1e-4), expected, 1e-10);
    });
  });

  describe('edge cases', () => {
    it('returns exact zeros (without -0) for a constant scalar field', () => {
      const constantField = () => 42.5;
      const grad = gradientFloatSeries(constantField, [1, -2, 3.5]);
      assert.deepEqual(grad, [0, 0, 0]);
      for (const component of grad) {
        assert.ok(!Object.is(component, -0), 'Gradient component should not be -0');
      }
    });

    it('evaluates accurately at the origin', () => {
      const f = ([x, y, z]) => Math.sin(2 * x) + Math.exp(3 * y) - Math.log1p(z) + x * y;
      const grad = gradientFloatSeries(f, [0, 0, 0]);
      assertVecClose(grad, [2, 3, -1], 1e-10);
    });

    it('handles large coordinates accurately with scale-aware default step', () => {
      const f = ([x, y, z]) => x * x + 3 * x * y - 2 * y * y + 0.5 * z * z;
      const point = [1e7, -2e7, 5e6];
      const [x, y, z] = point;
      const expected = [2 * x + 3 * y, 3 * x - 4 * y, z];

      assertVecClose(gradientFloatSeries(f, point), expected, 1e-9);
    });

    it('does not mutate the input point array and protects against mutating f', () => {
      const point = Object.freeze([1.25, -0.75, 2.5]);
      const f = (vec) => {
        const result = vec[0] ** 2 + 2 * vec[1] + 3 * vec[2] ** 2;
        // Deliberately mutate the received argument to ensure caller isolation
        vec[0] = 999;
        vec[1] = -999;
        vec[2] = 12345;
        return result;
      };

      const grad = gradientFloatSeries(f, point);
      assert.deepEqual(point, [1.25, -0.75, 2.5]);
      assertVecClose(grad, [2.5, 2, 15], 1e-10);
    });

    it('validates invalid inputs', () => {
      const validF = ([x]) => x * x;

      // Invalid f
      assert.throws(() => gradientFloatSeries(null, [1]), TypeError);
      assert.throws(() => gradientFloatSeries(undefined, [1]), TypeError);
      assert.throws(() => gradientFloatSeries(123, [1]), TypeError);
      assert.throws(() => gradientFloatSeries({}, [1]), TypeError);

      // Invalid point container
      assert.throws(() => gradientFloatSeries(validF, null), TypeError);
      assert.throws(() => gradientFloatSeries(validF, '123'), TypeError);
      assert.throws(() => gradientFloatSeries(validF, { 0: 1, length: 1 }), TypeError);
      assert.throws(() => gradientFloatSeries(validF, new Float64Array([1])), TypeError);
      assert.throws(() => gradientFloatSeries(validF, []), RangeError);

      // Invalid point elements
      assert.throws(() => gradientFloatSeries(validF, [NaN]), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [Infinity]), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [-Infinity]), RangeError);
      assert.throws(() => gradientFloatSeries(validF, ['1']), TypeError);
      assert.throws(() => gradientFloatSeries(validF, [1, null]), TypeError);

      // Invalid h
      assert.throws(() => gradientFloatSeries(validF, [1], 0), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [1], -1e-4), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [1], NaN), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [1], Infinity), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [1], -Infinity), RangeError);
      assert.throws(() => gradientFloatSeries(validF, [1], '1e-4'), TypeError);
      assert.throws(() => gradientFloatSeries(validF, [1], null), TypeError);

      // Invalid return value from f
      assert.throws(() => gradientFloatSeries(() => NaN, [1]), RangeError);
      assert.throws(() => gradientFloatSeries(() => Infinity, [1]), RangeError);
      assert.throws(() => gradientFloatSeries(() => '42', [1]), TypeError);
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies the directional derivative identity D_u f(x) = grad(f)(x) · u', () => {
      const f = ([x, y, z]) => Math.sin(x * y) + Math.exp(0.3 * z) * (x * x + y);
      const x = [0.7, -0.4, 1.2];
      const grad = gradientFloatSeries(f, x);

      const directions = [
        [1, 0, 0],
        [0, 1, 0],
        [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
        [2.5, -1.3, 0.8],
      ];

      // Independent 1D central difference of g(t) = f(x + t u) with Richardson extrapolation
      const t1 = 1e-4;
      const t2 = 5e-5;
      for (const u of directions) {
        const g = (t) => f([x[0] + t * u[0], x[1] + t * u[1], x[2] + t * u[2]]);
        const d1 = (g(t1) - g(-t1)) / (2 * t1);
        const d2 = (g(t2) - g(-t2)) / (2 * t2);
        const directionalDeriv = (4 * d2 - d1) / 3;

        const fromGrad = dot(grad, u);
        assert.ok(
          Math.abs(fromGrad - directionalDeriv) <= 1e-9 * Math.max(1, Math.abs(directionalDeriv)),
          `Directional derivative mismatch for u=${JSON.stringify(u)}: grad·u=${fromGrad}, D_u f=${directionalDeriv}`,
        );
      }
    });

    it('satisfies linearity: grad(a*f + b*g) = a*grad(f) + b*grad(g)', () => {
      const f = ([x, y, z]) => Math.sin(x) * Math.cos(y) + z ** 3;
      const g = ([x, y, z]) => Math.exp(0.2 * x - 0.3 * y) + x * z;
      const alpha = 2.75;
      const beta = -1.6;
      const combined = (v) => alpha * f(v) + beta * g(v);

      const point = [0.9, -1.2, 0.5];
      const gradF = gradientFloatSeries(f, point);
      const gradG = gradientFloatSeries(g, point);
      const gradCombined = gradientFloatSeries(combined, point);
      const expected = gradF.map((val, i) => alpha * val + beta * gradG[i]);

      assertVecClose(gradCombined, expected, 1e-10);
    });

    it('satisfies the product rule: grad(f * g) = g * grad(f) + f * grad(g)', () => {
      const f = ([x, y]) => Math.exp(0.4 * x) + y * y;
      const g = ([x, y]) => Math.cos(x + 0.5 * y) + 2;
      const prod = (v) => f(v) * g(v);

      const point = [-0.6, 1.4];
      const fv = f(point);
      const gv = g(point);
      const gradF = gradientFloatSeries(f, point);
      const gradG = gradientFloatSeries(g, point);
      const gradProd = gradientFloatSeries(prod, point);
      const expected = gradF.map((dfi, i) => gv * dfi + fv * gradG[i]);

      assertVecClose(gradProd, expected, 1e-10);
    });
  });
});
