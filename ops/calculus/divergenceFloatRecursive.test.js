import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divergenceFloatRecursive } from './divergenceFloatRecursive.js';

function assertClose(actual, expected, tol = 1e-8, message) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    message ?? `Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
  );
}

describe('divergenceFloatRecursive', () => {
  describe('normal cases across dimensions', () => {
    it('computes divergence for a 1D vector field', () => {
      // F(x) = [x^3 - 2x + 5], div(F) = 3x^2 - 2
      const field = ([x]) => [x ** 3 - 2 * x + 5];
      assertClose(divergenceFloatRecursive(field, [2]), 10, 1e-10);
      assertClose(divergenceFloatRecursive(field, [-1.5]), 3 * 2.25 - 2, 1e-10);
    });

    it('computes divergence for a 2D nonlinear vector field', () => {
      // F(x, y) = [x^2 * y, sin(y) + x * y^2]
      // div(F) = 2*x*y + cos(y) + 2*x*y = 4*x*y + cos(y)
      const field = ([x, y]) => [x * x * y, Math.sin(y) + x * y * y];
      const point = [1.5, -0.7];
      const expected = 4 * point[0] * point[1] + Math.cos(point[1]);
      assertClose(divergenceFloatRecursive(field, point), expected, 1e-10);
    });

    it('computes divergence for a 3D nonlinear vector field', () => {
      // F(x, y, z) = [x^3 * y, exp(y * z), z * cos(x)]
      // div(F) = 3*x^2*y + z*exp(y*z) + cos(x)
      const field = ([x, y, z]) => [
        x ** 3 * y,
        Math.exp(y * z),
        z * Math.cos(x),
      ];
      const point = [0.8, -1.2, 0.5];
      const expected =
        3 * point[0] ** 2 * point[1] +
        point[2] * Math.exp(point[1] * point[2]) +
        Math.cos(point[0]);
      assertClose(divergenceFloatRecursive(field, point), expected, 1e-9);
    });

    it('computes divergence for a 4D vector field', () => {
      // F(x, y, z, w) = [x*y*z, y^2*w, log(1 + z^2), exp(w) - x]
      // div(F) = y*z + 2*y*w + (2*z)/(1 + z^2) + exp(w)
      const field = ([x, y, z, w]) => [
        x * y * z,
        y * y * w,
        Math.log(1 + z * z),
        Math.exp(w) - x,
      ];
      const point = [2.1, -0.5, 1.3, 0.4];
      const [x, y, z, w] = point;
      const expected = y * z + 2 * y * w + (2 * z) / (1 + z * z) + Math.exp(w);
      assertClose(divergenceFloatRecursive(field, point), expected, 1e-9);
    });

    it('computes divergence accurately for a high-dimensional (8D) field exercising multi-level recursion', () => {
      // F_i(x) = (i + 1) * x_i^2 + x_{(i+1)%n}
      // div(F) = sum_{i=0}^{7} 2 * (i + 1) * x_i
      const field = (p) => p.map((xi, i) => (i + 1) * xi * xi + p[(i + 1) % p.length]);
      const point = [0.5, -1.2, 2.0, 0.3, -0.7, 1.1, -0.4, 0.9];
      const expected = point.reduce((acc, xi, i) => acc + 2 * (i + 1) * xi, 0);
      assertClose(divergenceFloatRecursive(field, point), expected, 1e-9);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for a constant field', () => {
      const field = () => [7.5, -3.2, 0.0];
      assert.strictEqual(divergenceFloatRecursive(field, [1, 2, 3]), 0);
    });

    it('returns 0 for a 2D solenoidal / rotational field F(x, y) = [-y, x]', () => {
      const field = ([x, y]) => [-y, x];
      assertClose(divergenceFloatRecursive(field, [3.4, -5.6]), 0, 1e-12);
    });

    it('returns 0 for a 3D solenoidal (curl) field F = curl([x*y*z, y^2*z, z^2*x])', () => {
      // A = [x*y*z, y^2*z, z^2*x]
      // curl(A) = [dA_z/dy - dA_y/dz, dA_x/dz - dA_z/dx, dA_y/dx - dA_x/dy]
      //         = [-y^2, x*y - z^2, -x*z]
      // div(curl(A)) = 0 + x - x = 0
      const field = ([x, y, z]) => [-y * y, x * y - z * z, -x * z];
      assertClose(divergenceFloatRecursive(field, [1.7, -2.3, 0.9]), 0, 1e-10);
    });

    it('computes trace of matrix A for a linear field F(x) = A*x + b', () => {
      // A = [[2, -1, 4], [0, -5, 3], [7, 2, 9]], trace(A) = 2 - 5 + 9 = 6
      const field = ([x, y, z]) => [
        2 * x - y + 4 * z + 10,
        -5 * y + 3 * z - 2,
        7 * x + 2 * y + 9 * z + 1,
      ];
      assertClose(divergenceFloatRecursive(field, [10, -20, 30]), 6, 1e-9);
    });

    it('handles large coordinate magnitudes via adaptive step scaling', () => {
      // F(x, y) = [3*x + y, -2*y + x], div(F) = 1
      const field = ([x, y]) => [3 * x + y, -2 * y + x];
      assertClose(divergenceFloatRecursive(field, [1e7, -2e7]), 1, 1e-6);
    });

    it('respects custom options (step, maxDepth, tolerance) and does not mutate point', () => {
      const field = ([x, y]) => [Math.exp(x), Math.sin(y)];
      const point = [0.5, 1.0];
      const snapshot = point.slice();
      const result = divergenceFloatRecursive(field, point, {
        step: 1e-2,
        maxDepth: 4,
        tolerance: 1e-11,
      });
      assert.deepStrictEqual(point, snapshot);
      assertClose(result, Math.exp(0.5) + Math.cos(1.0), 1e-10);
    });
  });

  describe('analytical cross-check and mathematical identities', () => {
    it('matches independent analytical divergence of radial power field F(r) = |r|^p * r', () => {
      // In R^n, div(|x|^p * x) = (n + p) * |x|^p
      const p = 3;
      const field = (coords) => {
        const r2 = coords.reduce((s, v) => s + v * v, 0);
        const factor = r2 ** (p / 2);
        return coords.map((v) => factor * v);
      };
      const analyticalDiv = (coords) => {
        const r2 = coords.reduce((s, v) => s + v * v, 0);
        return (coords.length + p) * r2 ** (p / 2);
      };

      for (const point of [
        [1.2, -0.8],
        [0.6, 1.1, -0.9],
        [0.4, -0.5, 0.7, 1.0],
      ]) {
        assertClose(
          divergenceFloatRecursive(field, point),
          analyticalDiv(point),
          1e-8,
        );
      }
    });

    it('satisfies linearity: div(a*F + b*G) == a*div(F) + b*div(G)', () => {
      const F = ([x, y, z]) => [
        Math.sin(x * y),
        y ** 2 * Math.cos(z),
        Math.exp(x + z),
      ];
      const G = ([x, y, z]) => [
        x * z ** 2,
        Math.log(1 + x * x + y * y),
        Math.atan(y * z),
      ];

      const a = 2.75;
      const b = -1.6;
      const combined = (pt) => {
        const f = F(pt);
        const g = G(pt);
        return f.map((fi, i) => a * fi + b * g[i]);
      };

      const point = [0.7, -0.4, 1.1];
      const lhs = divergenceFloatRecursive(combined, point);
      const rhs =
        a * divergenceFloatRecursive(F, point) +
        b * divergenceFloatRecursive(G, point);

      assertClose(lhs, rhs, 1e-9);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when field is not a function', () => {
      assert.throws(() => divergenceFloatRecursive(null, [1, 2]), TypeError);
      assert.throws(() => divergenceFloatRecursive(42, [1, 2]), TypeError);
      assert.throws(() => divergenceFloatRecursive({}, [1, 2]), TypeError);
    });

    it('throws on invalid point argument', () => {
      const id = (p) => p.slice();
      assert.throws(() => divergenceFloatRecursive(id, null), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, '123'), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, []), RangeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, '2']), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, NaN]), RangeError);
      assert.throws(() => divergenceFloatRecursive(id, [Infinity, 0]), RangeError);
      assert.throws(() => divergenceFloatRecursive(id, [0, -Infinity]), RangeError);
    });

    it('throws when field output is not a valid matching-dimension vector', () => {
      assert.throws(
        () => divergenceFloatRecursive(() => 'not-an-array', [1, 2]),
        TypeError,
      );
      assert.throws(
        () => divergenceFloatRecursive(() => [], [1, 2]),
        RangeError,
      );
      assert.throws(
        () => divergenceFloatRecursive(([x]) => [x], [1, 2]),
        RangeError,
      );
      assert.throws(
        () => divergenceFloatRecursive(([x, y]) => [x, y, 0], [1, 2]),
        RangeError,
      );
      assert.throws(
        () => divergenceFloatRecursive(() => [1, NaN], [1, 2]),
        RangeError,
      );
      assert.throws(
        () => divergenceFloatRecursive(() => [1, 'bad'], [1, 2]),
        TypeError,
      );
    });

    it('throws when field returns mismatched dimension on perturbed points', () => {
      let calls = 0;
      const flakyField = (p) => {
        calls += 1;
        return calls === 1 ? p.slice() : [p[0]];
      };
      assert.throws(() => divergenceFloatRecursive(flakyField, [1, 2]), RangeError);
    });

    it('throws on invalid options', () => {
      const id = (p) => p.slice();
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], null), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], []), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], { step: 0 }), RangeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], { step: -1e-3 }), RangeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], { step: '1e-3' }), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], { maxDepth: 0 }), RangeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], { maxDepth: 1.5 }), TypeError);
      assert.throws(() => divergenceFloatRecursive(id, [1, 2], { tolerance: -1 }), RangeError);
    });
  });
});
