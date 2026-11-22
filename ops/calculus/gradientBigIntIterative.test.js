import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradientBigIntIterative, SCALE } from './gradientBigIntIterative.js';

describe('gradientBigIntIterative', () => {
  describe('normal cases', () => {
    it('returns all zeros for a constant scalar field', () => {
      const f = () => 42n;
      const grad = gradientBigIntIterative(f, [1n, -2n, 3n], 1n);
      assert.deepEqual(grad, [0n, 0n, 0n]);
    });

    it('computes exact gradient for a 1D linear and quadratic function using default h = 1n', () => {
      const linear = ([x]) => 7n * x - 13n;
      assert.deepEqual(gradientBigIntIterative(linear, [5n]), [7n * SCALE]);

      const quadratic = ([x]) => 3n * x * x - 4n * x + 9n;
      // f'(x) = 6x - 4; at x = 5 -> 26
      assert.deepEqual(gradientBigIntIterative(quadratic, [5n]), [26n * SCALE]);
    });

    it('computes exact gradient for a multivariable linear scalar field', () => {
      const f = ([x, y, z]) => 3n * x - 7n * y + 11n * z + 100n;
      const grad = gradientBigIntIterative(f, [10n, -20n, 30n], 5n);
      assert.deepEqual(grad, [3n * SCALE, -7n * SCALE, 11n * SCALE]);
    });

    it('computes exact gradient for a multivariable quadratic scalar field', () => {
      // f(x, y, z) = 2x^2 - 3xy + 5y^2 + 4yz - z^2 + 7x - y + 9
      // df/dx = 4x - 3y + 7
      // df/dy = -3x + 10y + 4z - 1
      // df/dz = 4y - 2z
      const f = ([x, y, z]) =>
        2n * x * x - 3n * x * y + 5n * y * y + 4n * y * z - z * z + 7n * x - y + 9n;

      const x = 3n;
      const y = -4n;
      const z = 5n;
      const expected = [
        (4n * x - 3n * y + 7n) * SCALE,
        (-3n * x + 10n * y + 4n * z - 1n) * SCALE,
        (4n * y - 2n * z) * SCALE,
      ];

      assert.deepEqual(gradientBigIntIterative(f, [x, y, z], 1n), expected);
      assert.deepEqual(gradientBigIntIterative(f, [x, y, z], 17n), expected);
    });

    it('computes non-integer partial derivatives scaled by 10^18 with round-half-away-from-zero', () => {
      // Piecewise ReLU-like field: f(x, y) = max(0, x) - max(0, y)
      // At (1, 1) with h = 3:
      //   x: (f(4, 1) - f(-2, 1)) / 6 = (3 - (-1)) / 6 = 4 / 6 = 2/3 -> 666666666666666667n
      //   y: (f(1, 4) - f(1, -2)) / 6 = (-3 - 1) / 6 = -4 / 6 = -2/3 -> -666666666666666667n
      const relu = (v) => (v > 0n ? v : 0n);
      const f = ([x, y]) => relu(x) - relu(y);

      const grad = gradientBigIntIterative(f, [1n, 1n], 3n);
      assert.deepEqual(grad, [666666666666666667n, -666666666666666667n]);

      // Exact half (0.5): at (0, 0) with h = 3: (3 - 0) / 6 = 1/2
      assert.deepEqual(gradientBigIntIterative(f, [0n, 0n], 3n), [
        500000000000000000n,
        -500000000000000000n,
      ]);

      // 1/3 rounds down to 333333333333333333n; -1/3 rounds to -333333333333333333n
      // At (-1, -1) with h = 3: x: (f(2,-1) - f(-4,-1)) / 6 = (2 - 0) / 6 = 1/3
      assert.deepEqual(gradientBigIntIterative(f, [-1n, -1n], 3n), [
        333333333333333333n,
        -333333333333333333n,
      ]);

      // Exact ULP tie-breaking (half away from zero):
      // delta = 1n, h = SCALE => (1 * SCALE) / (2 * SCALE) = 0.5 ULP -> rounds to 1n
      // delta = -1n, h = SCALE => (-1 * SCALE) / (2 * SCALE) = -0.5 ULP -> rounds to -1n
      const stepField = ([x, y]) => (x > 0n ? 1n : 0n) - (y > 0n ? 1n : 0n);
      assert.deepEqual(gradientBigIntIterative(stepField, [0n, 0n], SCALE), [1n, -1n]);
    });

    it('works uniformly on fixed-point 10^18-scaled inputs and outputs', () => {
      // f(x, y) = x^2 + x*y + y^2 in fixed-point (scaled by SCALE)
      // At (1.5, 2.25): df/dx = 2*1.5 + 2.25 = 5.25; df/dy = 1.5 + 2*2.25 = 6.0
      const f = ([X, Y]) => (X * X + X * Y + Y * Y) / SCALE;
      const point = [15n * 10n ** 17n, 225n * 10n ** 16n];
      const h = 10n ** 12n; // 1e-6 in fixed-point units

      const [gx, gy] = gradientBigIntIterative(f, point, h);
      const expectedGx = 525n * 10n ** 16n; // 5.25 * 10^18
      const expectedGy = 6n * SCALE; // 6.0 * 10^18

      // Truncation in f's / SCALE introduces at most 1 / (2h) * SCALE = 5e5 ULP error
      assert.ok(gx - expectedGx >= -1_000_000n && gx - expectedGx <= 1_000_000n);
      assert.ok(gy - expectedGy >= -1_000_000n && gy - expectedGy <= 1_000_000n);
    });
  });

  describe('edge cases', () => {
    it('returns an empty array for a 0-dimensional point without calling f', () => {
      let called = false;
      const f = () => {
        called = true;
        return 0n;
      };
      const grad = gradientBigIntIterative(f, [], 1n);
      assert.deepEqual(grad, []);
      assert.equal(called, false);
    });

    it('handles the zero vector cleanly', () => {
      const f = ([x, y, z]) => x * x + y * y + z * z - 5n * x + 2n * z;
      assert.deepEqual(gradientBigIntIterative(f, [0n, 0n, 0n], 1n), [
        -5n * SCALE,
        0n,
        2n * SCALE,
      ]);
    });

    it('preserves exact precision for very large BigInt coordinates beyond Number.MAX_SAFE_INTEGER', () => {
      const big = 10n ** 35n + 12345678901234567890123456789n;
      const negBig = -(2n ** 128n) - 777n;
      // f(x, y) = x^2 - 2xy + 3y^2
      // df/dx = 2x - 2y, df/dy = -2x + 6y
      const f = ([x, y]) => x * x - 2n * x * y + 3n * y * y;

      const grad = gradientBigIntIterative(f, [big, negBig], 10n ** 10n);
      assert.deepEqual(grad, [
        (2n * big - 2n * negBig) * SCALE,
        (-2n * big + 6n * negBig) * SCALE,
      ]);
    });

    it('does not mutate the input point array (even when frozen)', () => {
      const point = Object.freeze([3n, -5n, 8n]);
      const f = ([x, y, z]) => x * y + y * z + z * x;
      const grad = gradientBigIntIterative(f, point, 2n);
      assert.deepEqual(point, [3n, -5n, 8n]);
      assert.deepEqual(grad, [
        (-5n + 8n) * SCALE,
        (3n + 8n) * SCALE,
        (-5n + 3n) * SCALE,
      ]);
    });

    it('handles high-dimensional vectors iteratively', () => {
      const dims = 200;
      const point = Array.from({ length: dims }, (_, i) => BigInt(i - 100));
      // f(x) = sum_{i=0}^{n-1} (i + 1) * x_i^2 => df/dx_i = 2 * (i + 1) * x_i
      const f = (v) => {
        let sum = 0n;
        for (let i = 0; i < v.length; i++) {
          sum += BigInt(i + 1) * v[i] * v[i];
        }
        return sum;
      };

      const grad = gradientBigIntIterative(f, point, 1n);
      assert.equal(grad.length, dims);
      for (let i = 0; i < dims; i++) {
        assert.equal(grad[i], 2n * BigInt(i + 1) * point[i] * SCALE);
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError if f is not a function', () => {
      for (const bad of [null, undefined, 123, 'fn', {}, []]) {
        assert.throws(() => gradientBigIntIterative(bad, [1n], 1n), TypeError);
        assert.throws(() => gradientBigIntIterative(bad, [], 1n), TypeError);
      }
    });

    it('throws TypeError if point is not an Array', () => {
      const f = () => 0n;
      for (const bad of [null, undefined, 1n, '123', { 0: 1n, length: 1 }, new BigInt64Array([1n])]) {
        assert.throws(() => gradientBigIntIterative(f, bad, 1n), TypeError);
      }
    });

    it('throws TypeError if any coordinate of point is not a BigInt (including sparse holes)', () => {
      const f = () => 0n;
      assert.throws(() => gradientBigIntIterative(f, [1, 2n], 1n), TypeError);
      assert.throws(() => gradientBigIntIterative(f, [1n, '2'], 1n), TypeError);
      assert.throws(() => gradientBigIntIterative(f, [1n, null], 1n), TypeError);
      assert.throws(() => gradientBigIntIterative(f, [1n, undefined], 1n), TypeError);

      // eslint-disable-next-line no-sparse-arrays
      const sparse = [1n, , 3n];
      assert.throws(() => gradientBigIntIterative(f, sparse, 1n), TypeError);
    });

    it('throws TypeError if h is not a BigInt', () => {
      const f = () => 0n;
      for (const bad of [1, 0, null, '1', NaN, {}]) {
        assert.throws(() => gradientBigIntIterative(f, [1n], bad), TypeError);
        assert.throws(() => gradientBigIntIterative(f, [], bad), TypeError);
      }
    });

    it('throws RangeError if h <= 0n', () => {
      const f = () => 0n;
      for (const bad of [0n, -1n, -(10n ** 18n)]) {
        assert.throws(() => gradientBigIntIterative(f, [1n], bad), RangeError);
        assert.throws(() => gradientBigIntIterative(f, [], bad), RangeError);
      }
    });

    it('throws TypeError if f returns a non-BigInt on +h or -h evaluation', () => {
      assert.throws(
        () => gradientBigIntIterative(() => 42, [1n], 1n),
        TypeError
      );
      let calls = 0;
      assert.throws(
        () =>
          gradientBigIntIterative(
            () => {
              calls += 1;
              return calls === 1 ? 10n : 'bad';
            },
            [1n],
            1n
          ),
        TypeError
      );
    });
  });

  describe('independent cross-checks and algebraic identities', () => {
    it('matches matrix-vector analytic formula (A + A^T)x + b for quadratic forms', () => {
      const A = [
        [3n, -2n, 5n, 1n],
        [4n, -1n, 0n, -3n],
        [-2n, 7n, 2n, 6n],
        [0n, 1n, -4n, 5n],
      ];
      const b = [11n, -13n, 17n, -19n];
      const c = 23n;

      const f = (x) => {
        let val = c;
        for (let i = 0; i < 4; i++) {
          val += b[i] * x[i];
          for (let j = 0; j < 4; j++) {
            val += x[i] * A[i][j] * x[j];
          }
        }
        return val;
      };

      const point = [7n, -11n, 13n, -5n];

      // Independent analytic gradient: g_i = sum_j (A[i][j] + A[j][i]) * x[j] + b[i]
      const expected = Array.from({ length: 4 }, (_, i) => {
        let sum = b[i];
        for (let j = 0; j < 4; j++) {
          sum += (A[i][j] + A[j][i]) * point[j];
        }
        return sum * SCALE;
      });

      for (const h of [1n, 5n, 997n]) {
        assert.deepEqual(gradientBigIntIterative(f, point, h), expected);
      }
    });

    it("satisfies Euler's homogeneous function theorem: x · ∇f(x) = k * f(x) * SCALE", () => {
      // Homogeneous degree k = 2 polynomial
      const f = ([x, y, z]) => 5n * x * x - 3n * x * y + 7n * y * z - 2n * z * z + 4n * x * z;
      const point = [13n, -29n, 41n];
      const grad = gradientBigIntIterative(f, point, 3n);

      let dot = 0n;
      for (let i = 0; i < point.length; i++) {
        dot += point[i] * grad[i];
      }
      assert.equal(dot, 2n * f(point) * SCALE);
    });

    it('satisfies exact algebraic central-difference identity for cubic polynomials', () => {
      // For f(x, y) = a*x^3 + b*y^3 + c*x*y:
      // (f(x+h, y) - f(x-h, y)) / (2h) = 3*a*x^2 + a*h^2 + c*y
      // (f(x, y+h) - f(x, y-h)) / (2h) = 3*b*y^2 + b*h^2 + c*x
      const a = 4n;
      const b = -3n;
      const c = 7n;
      const f = ([x, y]) => a * x * x * x + b * y * y * y + c * x * y;
      const x = 11n;
      const y = -8n;
      const h = 5n;

      const grad = gradientBigIntIterative(f, [x, y], h);
      assert.deepEqual(grad, [
        (3n * a * x * x + a * h * h + c * y) * SCALE,
        (3n * b * y * y + b * h * h + c * x) * SCALE,
      ]);
    });

    it('satisfies linearity of the gradient operator: ∇(αf + βg) = α∇f + β∇g', () => {
      const f = ([x, y, z]) => x * x - 2n * y * z + 3n * x;
      const g = ([x, y, z]) => 4n * y * y + 5n * x * z - z;
      const alpha = 7n;
      const beta = -11n;
      const combined = (p) => alpha * f(p) + beta * g(p);

      const point = [9n, -4n, 6n];
      const gradF = gradientBigIntIterative(f, point, 2n);
      const gradG = gradientBigIntIterative(g, point, 2n);
      const gradCombined = gradientBigIntIterative(combined, point, 2n);

      for (let i = 0; i < point.length; i++) {
        assert.equal(gradCombined[i], alpha * gradF[i] + beta * gradG[i]);
      }
    });

    it('cross-checks fixed-point gradient against independent floating-point analytic derivatives', () => {
      // f(x, y, z) = x^3 - 2 * x * y^2 + 3 * y * z + z^2
      // Analytic:
      //   df/dx = 3x^2 - 2y^2
      //   df/dy = -4xy + 3z
      //   df/dz = 3y + 2z
      const mulFP = (a, b) => (a * b) / SCALE;
      const fBig = ([X, Y, Z]) =>
        mulFP(mulFP(X, X), X) -
        2n * mulFP(X, mulFP(Y, Y)) +
        3n * mulFP(Y, Z) +
        mulFP(Z, Z);

      const coordsFloat = [1.25, -0.75, 2.5];
      const pointBig = coordsFloat.map((v) => BigInt(Math.round(v * 1e6)) * 10n ** 12n);
      const h = 10n ** 12n; // 1e-6 in fixed-point units

      const gradBig = gradientBigIntIterative(fBig, pointBig, h);

      const [x, y, z] = coordsFloat;
      const analyticFloat = [
        3 * x * x - 2 * y * y,
        -4 * x * y + 3 * z,
        3 * y + 2 * z,
      ];

      for (let i = 0; i < 3; i++) {
        const computedFloat = Number(gradBig[i]) / Number(SCALE);
        assert.ok(
          Math.abs(computedFloat - analyticFloat[i]) < 1e-9,
          `dim ${i}: expected ${analyticFloat[i]}, got ${computedFloat}`
        );
      }
    });

    it("satisfies symmetry of mixed partial derivatives (Schwarz's theorem)", () => {
      // f(x, y, z) = 2x^3*y - 5x*y^2*z + 3y*z^3 + 7x*z
      const f = ([x, y, z]) =>
        2n * x * x * x * y - 5n * x * y * y * z + 3n * y * z * z * z + 7n * x * z;

      const point = [4n, -3n, 5n];
      const h = 2n;

      // Compute finite-difference Hessian H[i][j] = ∂/∂x_j (∂f/∂x_i)
      const hessian = [];
      for (let i = 0; i < 3; i++) {
        const partialI = (p) => gradientBigIntIterative(f, p, h)[i];
        hessian.push(gradientBigIntIterative(partialI, point, h));
      }

      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          assert.equal(hessian[i][j], hessian[j][i]);
        }
      }
    });
  });
});
