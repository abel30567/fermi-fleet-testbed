import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  curlBigIntIterative,
  SCALE,
  DEFAULT_STEP,
} from './curlBigIntIterative.js';

const S = SCALE;

/** Fixed-point multiplication: round((a * b) / S) */
function fpMul(a, b) {
  const prod = a * b;
  const half = S / 2n;
  return prod >= 0n ? (prod + half) / S : -((-prod + half) / S);
}

/** Absolute value for BigInt */
function abs(x) {
  return x < 0n ? -x : x;
}

/** Asserts each component of actual is within `tol` of expected */
function assertVecNear(actual, expected, tol) {
  assert.equal(actual.length, 3);
  for (let i = 0; i < 3; i += 1) {
    const err = abs(actual[i] - expected[i]);
    assert.ok(
      err <= tol,
      `component ${i}: expected ${expected[i]} ± ${tol}, got ${actual[i]} (err=${err})`,
    );
  }
}

describe('curlBigIntIterative', () => {
  describe('normal cases & analytic cross-checks', () => {
    test('constant vector field has zero curl', () => {
      const constantField = () => [7n * S, -3n * S, 42n * S];
      assert.deepEqual(
        curlBigIntIterative(constantField, [1n * S, 2n * S, 3n * S]),
        [0n, 0n, 0n],
      );
    });

    test('rotational field F(x,y,z) = (-y, x, 0) has exact curl (0, 0, 2)', () => {
      const rotational = ([x, y]) => [-y, x, 0n];

      assert.deepEqual(curlBigIntIterative(rotational, [0n, 0n, 0n]), [
        0n,
        0n,
        2n * S,
      ]);
      assert.deepEqual(
        curlBigIntIterative(rotational, [5n * S, -11n * S, 3n * S]),
        [0n, 0n, 2n * S],
      );
    });

    test('rigid-body rotation F(r) = omega x r has exact curl 2 * omega', () => {
      const omega = [3n * S, -4n * S, 5n * S];
      const rigidBody = ([x, y, z]) => [
        fpMul(omega[1], z) - fpMul(omega[2], y),
        fpMul(omega[2], x) - fpMul(omega[0], z),
        fpMul(omega[0], y) - fpMul(omega[1], x),
      ];

      const result = curlBigIntIterative(rigidBody, [2n * S, -7n * S, 9n * S]);
      assert.deepEqual(result, [2n * omega[0], 2n * omega[1], 2n * omega[2]]);
    });

    test('quadratic field F(x,y,z) = (y^2, z^2, x^2) has exact curl (-2z, -2x, -2y)', () => {
      const quadField = ([x, y, z]) => [
        fpMul(y, y),
        fpMul(z, z),
        fpMul(x, x),
      ];
      const p = [2n * S, -3n * S, 5n * S];
      assert.deepEqual(curlBigIntIterative(quadField, p), [
        -2n * p[2],
        -2n * p[0],
        -2n * p[1],
      ]);
    });

    test('coupled bilinear field F(x,y,z) = (xy, yz, zx) has exact curl (-y, -z, -x)', () => {
      const bilinear = ([x, y, z]) => [
        fpMul(x, y),
        fpMul(y, z),
        fpMul(z, x),
      ];
      const p = [4n * S, -6n * S, 9n * S];
      assert.deepEqual(curlBigIntIterative(bilinear, p), [-p[1], -p[2], -p[0]]);
    });

    test('non-integer fractional curl result matches exact fixed-point rounding', () => {
      // F(x,y,z) = (-y/3, x/2, 0) => curl = (0, 0, 1/2 + 1/3) = (0, 0, 5/6)
      const fractionalField = ([x, y]) => [-y / 3n, x / 2n, 0n];
      const result = curlBigIntIterative(fractionalField, [S, S, S]);
      const expectedZ = (5n * S + 3n) / 6n; // 833333333333333333n
      assertVecNear(result, [0n, 0n, expectedZ], 10n ** 6n);
    });

    test('cubic field F(x,y,z) = (y^3, z^3, x^3) matches analytic curl (-3z^2, -3x^2, -3y^2)', () => {
      const cubicField = ([x, y, z]) => [
        fpMul(fpMul(y, y), y),
        fpMul(fpMul(z, z), z),
        fpMul(fpMul(x, x), x),
      ];
      const p = [1n * S, 2n * S, -3n * S];
      const expected = [
        -3n * fpMul(p[2], p[2]),
        -3n * fpMul(p[0], p[0]),
        -3n * fpMul(p[1], p[1]),
      ];
      // For central diff at h = 10^-6, truncation error on x^3 is h^2 = 10^-12 (10^6 fp units)
      const actual = curlBigIntIterative(cubicField, p);
      assertVecNear(actual, expected, 2n * 10n ** 6n);
    });
  });

  describe('vector calculus identity cross-checks', () => {
    test('curl of a gradient field (conservative field) is identically zero', () => {
      // Scalar potential phi(x,y,z) = x^2*y + y^2*z + z^2*x
      // grad(phi) = [2xy + z^2, x^2 + 2yz, y^2 + 2zx]
      const gradPhi = ([x, y, z]) => [
        2n * fpMul(x, y) + fpMul(z, z),
        fpMul(x, x) + 2n * fpMul(y, z),
        fpMul(y, y) + 2n * fpMul(z, x),
      ];

      assert.deepEqual(
        curlBigIntIterative(gradPhi, [3n * S, -5n * S, 7n * S]),
        [0n, 0n, 0n],
      );
      assert.deepEqual(
        curlBigIntIterative(gradPhi, [-12n * S, 4n * S, -8n * S]),
        [0n, 0n, 0n],
      );
    });

    test('linearity: curl(a*F + b*G) == a*curl(F) + b*curl(G)', () => {
      const F = ([x, y, z]) => [fpMul(y, z), fpMul(z, x), fpMul(x, y)];
      const G = ([x, y, z]) => [-y, 2n * x + z, -3n * y];
      const a = 3n;
      const b = -5n;
      const combined = (p) => {
        const fp = F(p);
        const gp = G(p);
        return [
          a * fp[0] + b * gp[0],
          a * fp[1] + b * gp[1],
          a * fp[2] + b * gp[2],
        ];
      };

      const p = [2n * S, -3n * S, 4n * S];
      const curlF = curlBigIntIterative(F, p);
      const curlG = curlBigIntIterative(G, p);
      const curlCombined = curlBigIntIterative(combined, p);

      assert.deepEqual(curlCombined, [
        a * curlF[0] + b * curlG[0],
        a * curlF[1] + b * curlG[1],
        a * curlF[2] + b * curlG[2],
      ]);
    });

    test('product rule: curl(f * F) == grad(f) x F + f * curl(F)', () => {
      // f(x,y,z) = x + 2y - 3z => grad(f) = [1, 2, -3]
      // F(x,y,z) = [-y, x, z]  => curl(F) = [0, 0, 2]
      const f = ([x, y, z]) => x + 2n * y - 3n * z;
      const gradF = [1n * S, 2n * S, -3n * S];
      const F = ([x, y, z]) => [-y, x, z];
      const productField = (p) => {
        const scalar = f(p);
        const vec = F(p);
        return [
          fpMul(scalar, vec[0]),
          fpMul(scalar, vec[1]),
          fpMul(scalar, vec[2]),
        ];
      };

      const p = [2n * S, -5n * S, 3n * S];
      const scalarVal = f(p);
      const vecVal = F(p);
      const curlF = curlBigIntIterative(F, p);

      // grad(f) x F + f * curl(F)
      const expected = [
        fpMul(gradF[1], vecVal[2]) -
          fpMul(gradF[2], vecVal[1]) +
          fpMul(scalarVal, curlF[0]),
        fpMul(gradF[2], vecVal[0]) -
          fpMul(gradF[0], vecVal[2]) +
          fpMul(scalarVal, curlF[1]),
        fpMul(gradF[0], vecVal[1]) -
          fpMul(gradF[1], vecVal[0]) +
          fpMul(scalarVal, curlF[2]),
      ];

      assert.deepEqual(curlBigIntIterative(productField, p), expected);
    });
  });

  describe('options, iterative refinement, and edge cases', () => {
    test('supports bigint shorthand step and options object', () => {
      const rotational = ([x, y]) => [-y, x, 0n];
      const p = [S, S, S];

      assert.deepEqual(curlBigIntIterative(rotational, p, 10n ** 10n), [
        0n,
        0n,
        2n * S,
      ]);
      assert.deepEqual(
        curlBigIntIterative(rotational, p, { step: DEFAULT_STEP, iterations: 1 }),
        [0n, 0n, 2n * S],
      );
    });

    test('iterative step halving reduces error on cubic field', () => {
      const cubicField = ([x, y, z]) => [
        fpMul(fpMul(y, y), y),
        fpMul(fpMul(z, z), z),
        fpMul(fpMul(x, x), x),
      ];
      const p = [1n * S, 2n * S, 3n * S];
      const analytic = [-27n * S, -3n * S, -12n * S];

      const coarse = curlBigIntIterative(cubicField, p, {
        step: 10n ** 15n,
        iterations: 1,
      });
      const refined = curlBigIntIterative(cubicField, p, {
        step: 10n ** 15n,
        iterations: 5,
      });

      const coarseErr = abs(coarse[0] - analytic[0]);
      const refinedErr = abs(refined[0] - analytic[0]);
      assert.ok(
        refinedErr < coarseErr / 100n,
        `expected refined error (${refinedErr}) << coarse error (${coarseErr})`,
      );
    });

    test('stops early when consecutive iterations converge within tolerance', () => {
      let calls = 0;
      const linearField = ([x, y]) => {
        calls += 1;
        return [-y, x, 0n];
      };

      const result = curlBigIntIterative(linearField, [S, S, S], {
        step: 10n ** 12n,
        iterations: 10,
        tolerance: 0n,
      });

      assert.deepEqual(result, [0n, 0n, 2n * S]);
      // Pass 0 (6 calls) + Pass 1 (6 calls, diff === 0n <= tolerance) => 12 calls total
      assert.equal(calls, 12);
    });

    test('handles minimum step size 1n with multiple iterations without dividing by zero', () => {
      const rotational = ([x, y]) => [-y, x, 0n];
      assert.deepEqual(
        curlBigIntIterative(rotational, [0n, 0n, 0n], {
          step: 1n,
          iterations: 5,
        }),
        [0n, 0n, 2n * S],
      );
    });

    test('handles huge BigInt coordinates far beyond Number.MAX_SAFE_INTEGER', () => {
      const huge = 10n ** 40n;
      const rotational = ([x, y]) => [-y, x, 0n];
      assert.deepEqual(
        curlBigIntIterative(rotational, [huge, -huge, 3n * huge]),
        [0n, 0n, 2n * S],
      );
    });

    test('does not mutate caller point and isolates mutations performed by field', () => {
      const point = [1n * S, 2n * S, 3n * S];
      const mutatingField = (p) => {
        const out = [-p[1], p[0], 0n];
        p[0] = 999n;
        p[1] = 999n;
        p[2] = 999n;
        return out;
      };

      const result = curlBigIntIterative(mutatingField, point);
      assert.deepEqual(result, [0n, 0n, 2n * S]);
      assert.deepEqual(point, [1n * S, 2n * S, 3n * S]);
    });
  });

  describe('input validation', () => {
    const validField = () => [0n, 0n, 0n];
    const validPoint = [0n, 0n, 0n];

    test('throws TypeError when field is not a function', () => {
      assert.throws(() => curlBigIntIterative(null, validPoint), TypeError);
      assert.throws(() => curlBigIntIterative(42, validPoint), TypeError);
      assert.throws(() => curlBigIntIterative({}, validPoint), TypeError);
    });

    test('throws on invalid point argument', () => {
      assert.throws(() => curlBigIntIterative(validField, null), TypeError);
      assert.throws(() => curlBigIntIterative(validField, '0,0,0'), TypeError);
      assert.throws(() => curlBigIntIterative(validField, [0n, 0n]), RangeError);
      assert.throws(
        () => curlBigIntIterative(validField, [0n, 0n, 0n, 0n]),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, [0, 0n, 0n]),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, [0n, null, 0n]),
        TypeError,
      );
    });

    test('throws on invalid options, step, iterations, or tolerance', () => {
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, null),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, 'bad'),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, []),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, 0n),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, -10n),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { step: 100 }),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { step: 0n }),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { iterations: 0 }),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { iterations: 1.5 }),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { iterations: '2' }),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { tolerance: -1n }),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(validField, validPoint, { tolerance: 0 }),
        TypeError,
      );
    });

    test('throws when field returns an invalid vector', () => {
      assert.throws(
        () => curlBigIntIterative(() => null, validPoint),
        TypeError,
      );
      assert.throws(
        () => curlBigIntIterative(() => [0n, 0n], validPoint),
        RangeError,
      );
      assert.throws(
        () => curlBigIntIterative(() => [0n, 1, 0n], validPoint),
        TypeError,
      );
    });
  });
});
