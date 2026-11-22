import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeBigIntIterative, SCALE } from './derivativeBigIntIterative.js';

/**
 * Independent helper: evaluates polynomial c[0] + c[1]*x + ... + c[d]*x^d using Horner's method.
 * @param {bigint[]} coeffs
 * @param {bigint} x
 * @returns {bigint}
 */
function evalPoly(coeffs, x) {
  let acc = 0n;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    acc = acc * x + coeffs[i];
  }
  return acc;
}

/**
 * Independent helper: symbolically computes the k-th derivative polynomial coefficients.
 * @param {bigint[]} coeffs
 * @param {number} order
 * @returns {bigint[]}
 */
function symbolicPolyDerivative(coeffs, order) {
  let current = coeffs.slice();
  for (let k = 0; k < order; k++) {
    if (current.length <= 1) {
      return [0n];
    }
    const next = new Array(current.length - 1);
    for (let i = 1; i < current.length; i++) {
      next[i - 1] = current[i] * BigInt(i);
    }
    current = next;
  }
  return current;
}

describe('derivativeBigIntIterative', () => {
  describe('normal cases', () => {
    it('exports SCALE = 10n ** 18n', () => {
      assert.equal(SCALE, 1000000000000000000n);
    });

    it('computes zero derivative for constant functions', () => {
      const f = () => 42n;
      assert.equal(derivativeBigIntIterative(f, 0n), 0n);
      assert.equal(derivativeBigIntIterative(f, 123456n, 7n), 0n);
      assert.equal(derivativeBigIntIterative(f, -999n, 3n, { order: 2 }), 0n);
    });

    it('computes exact first derivative for linear functions across all methods', () => {
      const f = (x) => 7n * x - 13n;
      const expected = 7n * SCALE;

      for (const method of ['central', 'forward', 'backward']) {
        assert.equal(derivativeBigIntIterative(f, 5n, 1n, { method }), expected);
        assert.equal(derivativeBigIntIterative(f, -100n, 17n, { method }), expected);
      }
    });

    it('computes exact central difference for quadratic functions with any step h', () => {
      // f(x) = 3x^2 - 5x + 11 => f'(x) = 6x - 5
      const f = (x) => 3n * x * x - 5n * x + 11n;

      assert.equal(derivativeBigIntIterative(f, 0n), -5n * SCALE);
      assert.equal(derivativeBigIntIterative(f, 4n), 19n * SCALE);
      assert.equal(derivativeBigIntIterative(f, 4n, 100n), 19n * SCALE);
      assert.equal(derivativeBigIntIterative(f, -10n, 37n), -65n * SCALE);
    });

    it('produces exact 10^18 fixed-point results for non-integer quotients', () => {
      // f(x) = x with modified values giving (f(x+h) - f(x-h)) / (2h) = 1/3 and -1/3
      // With x = 0n, h = 3n: 2h = 6n; if f(3n) = 2n and f(-3n) = 0n -> 2 / 6 = 1/3
      const posFrac = (x) => (x > 0n ? 2n : 0n);
      assert.equal(
        derivativeBigIntIterative(posFrac, 0n, 3n),
        333333333333333333n,
      );

      // Negative truncation toward zero: -2 / 6 = -1/3
      const negFrac = (x) => (x > 0n ? -2n : 0n);
      assert.equal(
        derivativeBigIntIterative(negFrac, 0n, 3n),
        -333333333333333333n,
      );

      // Exact half: 1/2 -> 5 * 10^17
      const halfFrac = (x) => (x > 0n ? 1n : 0n);
      assert.equal(
        derivativeBigIntIterative(halfFrac, 0n, 1n),
        500000000000000000n,
      );
    });

    it('supports scale-invariant first derivative on fixed-point functions', () => {
      // Fixed-point f(x) = x^2 / SCALE; at x = 2.5 * SCALE, f'(x) = 5.0 * SCALE
      const fpSquare = (x) => (x * x) / SCALE;
      const x = 25n * 10n ** 17n; // 2.5
      const h = 10n ** 12n; // 1e-6
      assert.equal(derivativeBigIntIterative(fpSquare, x, h), 5n * SCALE);
    });

    it('computes higher-order derivatives (order 2, 3, 4)', () => {
      const f2 = (x) => 5n * x * x - 3n * x + 1n;
      assert.equal(derivativeBigIntIterative(f2, 7n, 1n, { order: 2 }), 10n * SCALE);
      assert.equal(derivativeBigIntIterative(f2, 7n, 1n, { order: 3 }), 0n);

      const f3 = (x) => 2n * x ** 3n - 4n * x ** 2n + x - 9n;
      // f3''(x) = 12x - 8, f3'''(x) = 12
      assert.equal(derivativeBigIntIterative(f3, 5n, 2n, { order: 2 }), 52n * SCALE);
      assert.equal(derivativeBigIntIterative(f3, 5n, 2n, { order: 3 }), 12n * SCALE);

      const f4 = (x) => x ** 4n;
      // f4''''(x) = 24
      assert.equal(derivativeBigIntIterative(f4, -3n, 1n, { order: 4 }), 24n * SCALE);
    });

    it('recovers exact derivatives of higher-degree polynomials via Richardson extrapolation', () => {
      // f(x) = x^3 => central (refinements=0) has O(h^2) error; refinements=1 is exact!
      const cube = (x) => x ** 3n;
      assert.equal(derivativeBigIntIterative(cube, 5n, 1n, { refinements: 0 }), 76n * SCALE);
      assert.equal(derivativeBigIntIterative(cube, 5n, 1n, { refinements: 1 }), 75n * SCALE);

      // f(x) = x^5 => f'(3) = 5 * 3^4 = 405; refinements=2 eliminates O(h^2) and O(h^4)
      const fifth = (x) => x ** 5n;
      assert.equal(derivativeBigIntIterative(fifth, 3n, 1n, { refinements: 2 }), 405n * SCALE);

      // Forward difference with Richardson extrapolation on x^2: exact at refinements=1
      const sq = (x) => x * x;
      assert.equal(
        derivativeBigIntIterative(sq, 3n, 1n, { method: 'forward', refinements: 1 }),
        6n * SCALE,
      );
      assert.equal(
        derivativeBigIntIterative(sq, 3n, 1n, { method: 'backward', refinements: 1 }),
        6n * SCALE,
      );
    });

    it('supports custom output scale and default parameters', () => {
      const f = (x) => x * x;
      // Default h = 1n, default options
      assert.equal(derivativeBigIntIterative(f, 6n), 12n * SCALE);
      // Explicit undefined triggers defaults
      assert.equal(derivativeBigIntIterative(f, 6n, undefined, undefined), 12n * SCALE);
      // Custom scale
      assert.equal(derivativeBigIntIterative(f, 6n, 1n, { scale: 1n }), 12n);
      assert.equal(derivativeBigIntIterative(f, 6n, 1n, { scale: 10n ** 6n }), 12_000_000n);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('handles zero, negative, and arbitrarily large BigInt coordinates without overflow', () => {
      const f = (x) => 3n * x * x + 2n * x - 1n;
      const hugeX = 10n ** 40n;
      const hugeH = 10n ** 20n;
      assert.equal(
        derivativeBigIntIterative(f, hugeX, hugeH),
        (6n * hugeX + 2n) * SCALE,
      );
      assert.equal(
        derivativeBigIntIterative(f, -hugeX, hugeH),
        (-6n * hugeX + 2n) * SCALE,
      );
    });

    it('preserves parity symmetries at the origin', () => {
      // Even function f(-x) = f(x) => odd derivatives at 0 are 0
      const evenFn = (x) => x ** 4n - 7n * x * x + 19n;
      assert.equal(derivativeBigIntIterative(evenFn, 0n, 5n, { order: 1 }), 0n);
      assert.equal(derivativeBigIntIterative(evenFn, 0n, 5n, { order: 3 }), 0n);

      // Odd function f(-x) = -f(x) => even derivatives at 0 are 0
      const oddFn = (x) => x ** 5n - 3n * x ** 3n + 11n * x;
      assert.equal(derivativeBigIntIterative(oddFn, 0n, 5n, { order: 2 }), 0n);
      assert.equal(derivativeBigIntIterative(oddFn, 0n, 5n, { order: 4 }), 0n);
    });

    it('handles zero function with high order and refinements', () => {
      const zero = () => 0n;
      assert.equal(
        derivativeBigIntIterative(zero, 0n, 1n, { order: 5, refinements: 3 }),
        0n,
      );
    });
  });

  describe('input validation', () => {
    const id = (x) => x;

    it('throws TypeError for invalid f or non-BigInt return from f', () => {
      assert.throws(() => derivativeBigIntIterative(null, 1n), TypeError);
      assert.throws(() => derivativeBigIntIterative('not a fn', 1n), TypeError);
      assert.throws(() => derivativeBigIntIterative((x) => Number(x), 1n), TypeError);
      assert.throws(() => derivativeBigIntIterative(() => undefined, 1n), TypeError);
    });

    it('throws TypeError or RangeError for invalid x or h', () => {
      assert.throws(() => derivativeBigIntIterative(id, 5), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, '5'), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 5n, 1), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 5n, null), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 5n, 0n), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 5n, -5n), RangeError);
    });

    it('throws TypeError or RangeError for invalid options', () => {
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, null), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, []), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, 'bad'), TypeError);

      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { order: '1' }), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { order: 1n }), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { order: 0 }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { order: -2 }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { order: 1.5 }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { order: Number.NaN }), RangeError);

      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { refinements: '0' }), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { refinements: -1 }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { refinements: 2.5 }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { refinements: Infinity }), RangeError);

      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { method: 123 }), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { method: 'centered' }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { method: '' }), RangeError);

      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { scale: 1e18 }), TypeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { scale: 0n }), RangeError);
      assert.throws(() => derivativeBigIntIterative(id, 1n, 1n, { scale: -SCALE }), RangeError);
    });
  });

  describe('cross-checks against independent computations', () => {
    it('matches exact symbolic polynomial differentiation across orders 1..4 and points', () => {
      // p(x) = -5 + 3x - 7x^2 + 2x^3 - 4x^4 + 9x^5 - 2x^6
      const coeffs = [-5n, 3n, -7n, 2n, -4n, 9n, -2n];
      const poly = (x) => evalPoly(coeffs, x);
      const testPoints = [-1000000n, -7n, 0n, 13n, 10n ** 12n];

      for (const order of [1, 2, 3, 4]) {
        const derivCoeffs = symbolicPolyDerivative(coeffs, order);
        // Central difference of order k with r refinements is exact for degree <= k + 1 + 2r.
        // Degree is 6, so r = 3 guarantees exactness for all orders >= 1.
        for (const x of testPoints) {
          const numerical = derivativeBigIntIterative(poly, x, 1n, {
            order,
            refinements: 3,
          });
          const analytical = evalPoly(derivCoeffs, x) * SCALE;
          assert.equal(
            numerical,
            analytical,
            `Mismatch for order=${order} at x=${x}`,
          );
        }
      }
    });

    it('satisfies linearity and Leibniz product rule identically', () => {
      const f = (x) => 2n * x ** 3n - x + 4n;
      const g = (x) => -3n * x ** 2n + 5n * x - 2n;
      const a = 7n;
      const b = -11n;
      const linearComb = (x) => a * f(x) + b * g(x);
      const product = (x) => f(x) * g(x);

      for (const x of [-15n, 0n, 9n, 12345n]) {
        const df = derivativeBigIntIterative(f, x, 1n, { refinements: 2 });
        const dg = derivativeBigIntIterative(g, x, 1n, { refinements: 2 });
        const dLin = derivativeBigIntIterative(linearComb, x, 1n, { refinements: 2 });
        const dProd = derivativeBigIntIterative(product, x, 1n, { refinements: 2 });

        // Linearity: (a*f + b*g)' = a*f' + b*g'
        assert.equal(dLin, a * df + b * dg);

        // Product rule: (f*g)' = f'*g + f*g'
        assert.equal(dProd, df * g(x) + f(x) * dg);
      }
    });

    it('matches exact analytical and floating-point derivative of g(t) = 1 / (1 + t^2)', () => {
      // Fixed-point g(t) = 1 / (1 + t^2), with t and g(t) scaled by S = 10^18.
      // g_fp(t_fp) = (S^3) / (S^2 + t_fp^2)
      // Analytical derivative: g'(t) = -2t / (1 + t^2)^2
      const S = SCALE;
      const gFp = (tFp) => (S * S * S) / (S * S + tFp * tFp);

      const testValues = [0.0, 0.5, 1.0, 2.0, -1.5];
      for (const tNum of testValues) {
        const tFp = BigInt(Math.round(tNum * 1e6)) * 10n ** 12n;
        const h = 10n ** 12n; // 1e-6 in fixed-point

        const numericalFp = derivativeBigIntIterative(gFp, tFp, h, { refinements: 1 });
        const numericalFloat = Number(numericalFp) / Number(S);
        const analyticalFloat = (-2 * tNum) / (1 + tNum * tNum) ** 2;

        assert.ok(
          Math.abs(numericalFloat - analyticalFloat) < 1e-9,
          `At t=${tNum}: numerical=${numericalFloat}, analytical=${analyticalFloat}`,
        );
      }
    });
  });
});
