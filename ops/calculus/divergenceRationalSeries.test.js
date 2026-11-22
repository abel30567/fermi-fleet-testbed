import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divergenceRationalSeries } from './divergenceRationalSeries.js';

/** Helper to construct an exact rational { num, den }. */
const rat = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Helper to construct a monomial term { coeff, powers }. */
const term = (num, den, powers) => ({ coeff: rat(num, den), powers });

function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function assertLowestTerms(r) {
  assert.equal(typeof r.num, 'bigint', 'num must be BigInt');
  assert.equal(typeof r.den, 'bigint', 'den must be BigInt');
  assert.ok(r.den > 0n, `den must be > 0n, got ${r.den}`);
  assert.equal(gcdBigInt(r.num, r.den), 1n, `rational ${r.num}/${r.den} must be in lowest terms`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, 'zero must be represented as { num: 0n, den: 1n }');
  }
}

function assertRationalEqual(actual, expectedNum, expectedDen = 1n) {
  assertLowestTerms(actual);
  assert.equal(actual.num, BigInt(expectedNum));
  assert.equal(actual.den, BigInt(expectedDen));
}

function rationalToNumber(r) {
  return Number(r.num) / Number(r.den);
}

/** Independent exact rational arithmetic helpers for cross-checks. */
function normRat(num, den) {
  if (num === 0n) return { num: 0n, den: 1n };
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdBigInt(n, d);
  return { num: n / g, den: d / g };
}

function addRat(a, b) {
  return normRat(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subRat(a, b) {
  return normRat(a.num * b.den - b.num * a.den, a.den * b.den);
}

function mulRat(a, b) {
  return normRat(a.num * b.num, a.den * b.den);
}

function divRat(a, b) {
  return normRat(a.num * b.den, a.den * b.num);
}

function powRat(r, exp) {
  if (exp === 0) return { num: 1n, den: 1n };
  if (r.num === 0n) return { num: 0n, den: 1n };
  const e = BigInt(exp);
  return normRat(r.num ** e, r.den ** e);
}

/** Independent polynomial evaluation over JS floats. */
function evalPolyFloat(poly, coords) {
  let sum = 0;
  for (const { coeff, powers } of poly) {
    let val = Number(coeff.num) / Number(coeff.den);
    for (let j = 0; j < coords.length; j += 1) {
      if (powers[j] !== 0) {
        val *= coords[j] ** powers[j];
      }
    }
    sum += val;
  }
  return sum;
}

/** Independent polynomial evaluation over exact rationals. */
function evalPolyRat(poly, point) {
  let sum = rat(0n, 1n);
  for (const { coeff, powers } of poly) {
    let val = normRat(coeff.num, coeff.den);
    for (let j = 0; j < point.length; j += 1) {
      if (powers[j] !== 0) {
        val = mulRat(val, powRat(point[j], powers[j]));
      }
    }
    sum = addRat(sum, val);
  }
  return sum;
}

/** Independent symbolic partial derivative of a multivariate polynomial. */
function partialDerivPoly(poly, varIdx) {
  const out = [];
  for (const { coeff, powers } of poly) {
    const p = powers[varIdx];
    if (p === 0) continue;
    const nextPowers = powers.slice();
    nextPowers[varIdx] = p - 1;
    out.push({ coeff: mulRat(coeff, rat(p, 1n)), powers: nextPowers });
  }
  return out;
}

/** Negate a multivariate polynomial. */
function negatePoly(poly) {
  return poly.map(({ coeff, powers }) => ({
    coeff: rat(-coeff.num, coeff.den),
    powers: powers.slice(),
  }));
}

/** Independent symbolic 3D curl: curl(G) = (dGz/dy - dGy/dz, dGx/dz - dGz/dx, dGy/dx - dGx/dy). */
function curl3D(G) {
  const [Gx, Gy, Gz] = G;
  return [
    [...partialDerivPoly(Gz, 1), ...negatePoly(partialDerivPoly(Gy, 2))],
    [...partialDerivPoly(Gx, 2), ...negatePoly(partialDerivPoly(Gz, 0))],
    [...partialDerivPoly(Gy, 0), ...negatePoly(partialDerivPoly(Gx, 1))],
  ];
}

/** Multiply two multivariate polynomials symbolically. */
function mulPoly(p1, p2) {
  const out = [];
  for (const t1 of p1) {
    for (const t2 of p2) {
      out.push({
        coeff: mulRat(t1.coeff, t2.coeff),
        powers: t1.powers.map((p, idx) => p + t2.powers[idx]),
      });
    }
  }
  return out;
}

describe('divergenceRationalSeries', () => {
  describe('normal cases: 1D, 2D, 3D, and 4D fields', () => {
    it('computes 1D divergence (ordinary polynomial derivative)', () => {
      // F(x) = (3/4)x^4 - (2/5)x^2 + 7x - 11
      // F'(x) = 3x^3 - (4/5)x + 7; at x = -2/3 -> 299/45
      const field = [[term(3, 4, [4]), term(-2, 5, [2]), term(7, 1, [1]), term(-11, 1, [0])]];
      const res = divergenceRationalSeries(field, [rat(-2, 3)]);
      assertRationalEqual(res, 299n, 45n);
    });

    it('computes divergence of a 2D constant field as 0', () => {
      const field = [[term(7, 3, [0, 0])], [term(-11, 5, [0, 0])]];
      const res = divergenceRationalSeries(field, [rat(4, 9), rat(-13, 7)]);
      assertRationalEqual(res, 0n, 1n);
    });

    it('computes divergence of a 2D linear field (constant trace of Jacobian)', () => {
      // F(x, y) = ((2/3)x - 5y + 1, 4x - (5/6)y + 9) => div(F) = 2/3 - 5/6 = -1/6
      const field = [
        [term(2, 3, [1, 0]), term(-5, 1, [0, 1]), term(1, 1, [0, 0])],
        [term(4, 1, [1, 0]), term(-5, 6, [0, 1]), term(9, 1, [0, 0])],
      ];
      assertRationalEqual(divergenceRationalSeries(field, [rat(0), rat(0)]), -1n, 6n);
      assertRationalEqual(divergenceRationalSeries(field, [rat(17, 3), rat(-9, 11)]), -1n, 6n);
    });

    it('computes divergence of a 2D higher-degree rational polynomial field', () => {
      // F(x, y) = ((2/3)x^3 y^2 - (1/5)xy, (3/4)x^2 y^3 + (5/6)y^2)
      // div(F) = (17/4)x^2 y^2 + (22/15)y; at (3/2, -2/3) -> 589/180
      const field = [
        [term(2, 3, [3, 2]), term(-1, 5, [1, 1])],
        [term(3, 4, [2, 3]), term(5, 6, [0, 2])],
      ];
      const res = divergenceRationalSeries(field, [rat(3, 2), rat(-2, 3)]);
      assertRationalEqual(res, 589n, 180n);
    });

    it('computes divergence of 3D radial and nonlinear fields', () => {
      // Radial field F(x, y, z) = (x, y, z) => div(F) = 3
      const radial = [[term(1, 1, [1, 0, 0])], [term(1, 1, [0, 1, 0])], [term(1, 1, [0, 0, 1])]];
      assertRationalEqual(divergenceRationalSeries(radial, [rat(-5, 2), rat(7, 3), rat(11, 4)]), 3n, 1n);

      // Nonlinear field F(x, y, z) = (x^2 y z, x y^2 z, x y z^2) => div(F) = 6xyz
      const nonlinear = [[term(1, 1, [2, 1, 1])], [term(1, 1, [1, 2, 1])], [term(1, 1, [1, 1, 2])]];
      assertRationalEqual(
        divergenceRationalSeries(nonlinear, [rat(1, 2), rat(-2, 3), rat(5, 7)]),
        -10n,
        7n,
      );
    });

    it('computes divergence of a 4D rational polynomial field', () => {
      // F(w, x, y, z) = ((1/2)w^2 x, -(1/3)x^3 y, (1/4)y^2 z^2, (1/5)w z^5)
      // div(F) = w x - x^2 y + (1/2)y z^2 + w z^4; at (1, -2, 3, 1/2) -> -217/16
      const field = [
        [term(1, 2, [2, 1, 0, 0])],
        [term(-1, 3, [0, 3, 1, 0])],
        [term(1, 4, [0, 0, 2, 2])],
        [term(1, 5, [1, 0, 0, 5])],
      ];
      const res = divergenceRationalSeries(field, [rat(1), rat(-2), rat(3), rat(1, 2)]);
      assertRationalEqual(res, -217n, 16n);
    });
  });

  describe('solenoidal (divergence-free) fields', () => {
    it('returns 0 for 2D rotational vortex F(x, y) = (-y, x)', () => {
      const vortex = [[term(-1, 1, [0, 1])], [term(1, 1, [1, 0])]];
      assertRationalEqual(divergenceRationalSeries(vortex, [rat(5, 3), rat(-7, 2)]), 0n, 1n);
    });

    it('returns 0 for 2D nonlinear stream-function field', () => {
      // psi(x, y) = x^3 y^2 - (1/2)y^4 => F = (d_y psi, -d_x psi) = (2x^3 y - 2y^3, -3x^2 y^2)
      const streamField = [
        [term(2, 1, [3, 1]), term(-2, 1, [0, 3])],
        [term(-3, 1, [2, 2])],
      ];
      for (const pt of [
        [rat(0), rat(0)],
        [rat(3, 5), rat(-7, 4)],
        [rat(-11, 2), rat(13, 9)],
      ]) {
        assertRationalEqual(divergenceRationalSeries(streamField, pt), 0n, 1n);
      }
    });

    it('returns 0 for 3D divergence-free fields (both decoupled and cancelling)', () => {
      // Decoupled: F(x, y, z) = (y^2 z, x z^2, x^2 y)
      const decoupled = [[term(1, 1, [0, 2, 1])], [term(1, 1, [1, 0, 2])], [term(1, 1, [2, 1, 0])]];
      assertRationalEqual(
        divergenceRationalSeries(decoupled, [rat(2, 3), rat(-5, 7), rat(11, 13)]),
        0n,
        1n,
      );

      // Cancelling non-zero partials: F(x, y, z) = (x^2 y z, x y^2 z, -2 x y z^2)
      // dFx/dx + dFy/dy + dFz/dz = 2xyz + 2xyz - 4xyz = 0
      const cancelling = [
        [term(1, 1, [2, 1, 1])],
        [term(1, 1, [1, 2, 1])],
        [term(-2, 1, [1, 1, 2])],
      ];
      assertRationalEqual(
        divergenceRationalSeries(cancelling, [rat(-4, 9), rat(7, 5), rat(-3, 8)]),
        0n,
        1n,
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty component polynomials (identically zero components)', () => {
      assertRationalEqual(divergenceRationalSeries([[], []], [rat(5, 2), rat(-3, 4)]), 0n, 1n);
      const partialZero = [[], [term(4, 3, [0, 2, 0])], []];
      assertRationalEqual(
        divergenceRationalSeries(partialZero, [rat(99), rat(3, 8), rat(-7)]),
        1n,
        1n,
      );
    });

    it('handles evaluation at origin (0^0 = 1 convention for linear terms)', () => {
      // F(x, y, z) = (3x + 5x^2 + 7, -2y + y^3, (1/2)z + x y z)
      // At (0, 0, 0): div(F) = 3 - 2 + 1/2 = 3/2
      const field = [
        [term(3, 1, [1, 0, 0]), term(5, 1, [2, 0, 0]), term(7, 1, [0, 0, 0])],
        [term(-2, 1, [0, 1, 0]), term(1, 1, [0, 3, 0])],
        [term(1, 2, [0, 0, 1]), term(1, 1, [1, 1, 1])],
      ];
      assertRationalEqual(divergenceRationalSeries(field, [rat(0), rat(0), rat(0)]), 3n, 2n);
    });

    it('handles duplicate/uncollected monomials and zero-coefficient terms', () => {
      const field = [
        [term(1, 2, [2, 0]), term(1, 2, [2, 0]), term(0, 5, [3, 4])],
        [term(-3, 4, [0, 1]), term(5, 4, [0, 1])],
      ];
      // F = (x^2, (1/2)y) => div(F) = 2x + 1/2; at (3/4, -9) -> 3/2 + 1/2 = 2
      assertRationalEqual(divergenceRationalSeries(field, [rat(3, 4), rat(-9)]), 2n, 1n);
    });

    it('normalizes unreduced inputs and negative denominators in coeff and point', () => {
      // coeff 6/-4 = -3/2, x = -10/-15 = 2/3, y = 8/-12 = -2/3
      // F(x, y) = ((-3/2)x^2, (9/6)y^2) => div(F) = -3x + 3y = -3(2/3) + 3(-2/3) = -4
      const field = [[term(6, -4, [2, 0])], [term(-9, -6, [0, 2])]];
      const res = divergenceRationalSeries(field, [rat(-10, -15), rat(8, -12)]);
      assertRationalEqual(res, -4n, 1n);
    });

    it('maintains exact BigInt precision for large coefficients and high powers', () => {
      // F(x) = (1 / 3^20) * x^25 => div(F) = (25 / 3^20) * x^24
      // At x = 3 => (25 / 3^20) * 3^24 = 25 * 81 = 2025
      const field = [[term(1n, 3n ** 20n, [25])]];
      assertRationalEqual(divergenceRationalSeries(field, [rat(3n, 1n)]), 2025n, 1n);

      // Exact BigInt numerator exceeding Number.MAX_SAFE_INTEGER
      const big = 10n ** 25n + 7n;
      const bigField = [[term(big, 1n, [1, 0])], [term(1n, 1n, [0, 1])]];
      assertRationalEqual(divergenceRationalSeries(bigField, [rat(0), rat(0)]), big + 1n, 1n);
    });
  });

  describe('input validation', () => {
    it('throws on invalid field or point containers and dimension mismatches', () => {
      assert.throws(() => divergenceRationalSeries(null, [rat(1)]), TypeError);
      assert.throws(() => divergenceRationalSeries('not-array', [rat(1)]), TypeError);
      assert.throws(() => divergenceRationalSeries([], []), RangeError);
      assert.throws(() => divergenceRationalSeries([[]], null), TypeError);
      assert.throws(() => divergenceRationalSeries([[], []], [rat(1)]), RangeError);
      assert.throws(() => divergenceRationalSeries([[]], [rat(1), rat(2)]), RangeError);
    });

    it('throws on invalid rational objects in point or term coeff', () => {
      const validField = [[term(1, 1, [1])]];
      assert.throws(() => divergenceRationalSeries(validField, [null]), TypeError);
      assert.throws(() => divergenceRationalSeries(validField, [42]), TypeError);
      assert.throws(() => divergenceRationalSeries(validField, [{ num: 1, den: 1n }]), TypeError);
      assert.throws(() => divergenceRationalSeries(validField, [{ num: 1n, den: 1 }]), TypeError);
      assert.throws(() => divergenceRationalSeries(validField, [{ num: 1n, den: 0n }]), RangeError);

      assert.throws(
        () => divergenceRationalSeries([[{ coeff: null, powers: [1] }]], [rat(1)]),
        TypeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[{ coeff: { num: 1, den: 2n }, powers: [1] }]], [rat(1)]),
        TypeError,
      );
      // Zero-power term must still validate its coeff!
      assert.throws(
        () => divergenceRationalSeries([[{ coeff: { num: 0n, den: 0n }, powers: [0] }]], [rat(1)]),
        RangeError,
      );
    });

    it('throws on invalid component arrays, term objects, and powers', () => {
      assert.throws(() => divergenceRationalSeries([null], [rat(1)]), TypeError);
      assert.throws(() => divergenceRationalSeries([[null]], [rat(1)]), TypeError);
      assert.throws(
        () => divergenceRationalSeries([[{ coeff: rat(1), powers: 'bad' }]], [rat(1)]),
        TypeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[term(1, 1, [1, 2])]], [rat(1)]),
        RangeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[{ coeff: rat(1), powers: [1n] }]], [rat(1)]),
        TypeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[term(1, 1, [-1])]], [rat(1)]),
        RangeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[term(1, 1, [1.5])]], [rat(1)]),
        RangeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[term(1, 1, [Number.NaN])]], [rat(1)]),
        RangeError,
      );
      assert.throws(
        () => divergenceRationalSeries([[term(1, 1, [Number.POSITIVE_INFINITY])]], [rat(1)]),
        RangeError,
      );
      assert.throws(
        () =>
          divergenceRationalSeries([[term(1, 1, [Number.MAX_SAFE_INTEGER + 1])]], [rat(1)]),
        RangeError,
      );
      // Zero-coefficient term must still validate its powers!
      assert.throws(
        () => divergenceRationalSeries([[term(0, 1, [-2])]], [rat(1)]),
        RangeError,
      );
    });
  });

  describe('independent cross-checks', () => {
    it('matches floating-point central finite differences within tight tolerance', () => {
      const field = [
        [term(3, 5, [4, 1, 2]), term(-2, 3, [2, 3, 0]), term(7, 4, [1, 0, 1]), term(-1, 2, [0, 2, 2])],
        [term(-5, 7, [1, 4, 1]), term(4, 9, [2, 2, 3]), term(1, 3, [0, 1, 0])],
        [term(2, 11, [3, 0, 3]), term(-3, 4, [1, 2, 2]), term(5, 6, [0, 0, 4])],
      ];
      const points = [
        [rat(1, 2), rat(-2, 3), rat(3, 4)],
        [rat(-4, 5), rat(7, 6), rat(-1, 3)],
        [rat(0), rat(5, 4), rat(-3, 5)],
      ];
      const h = 1e-6;

      for (const point of points) {
        const exact = divergenceRationalSeries(field, point);
        assertLowestTerms(exact);
        const exactFloat = rationalToNumber(exact);

        const coords = point.map(rationalToNumber);
        let fdDiv = 0;
        for (let i = 0; i < field.length; i += 1) {
          const plus = coords.slice();
          const minus = coords.slice();
          plus[i] += h;
          minus[i] -= h;
          fdDiv += (evalPolyFloat(field[i], plus) - evalPolyFloat(field[i], minus)) / (2 * h);
        }

        assert.ok(
          Math.abs(exactFloat - fdDiv) < 1e-7,
          `expected ${exactFloat} to match central finite difference ${fdDiv}`,
        );
      }
    });

    it('matches exact rational Richardson-extrapolated central difference for degree <= 4 fields', () => {
      // For any polynomial of degree <= 4 in x_i, D(h) = (f(x+h)-f(x-h))/(2h) = f'(x) + (h^2/6)f'''(x),
      // so Richardson extrapolation (4*D(h/2) - D(h)) / 3 is algebraically EXACT over Q!
      const field = [
        [term(5, 3, [4, 2]), term(-7, 4, [3, 1]), term(2, 5, [2, 3]), term(-3, 7, [1, 0])],
        [term(-4, 9, [2, 4]), term(3, 2, [1, 3]), term(-1, 6, [3, 2]), term(8, 5, [0, 1])],
      ];
      const point = [rat(-5, 6), rat(4, 7)];
      const exact = divergenceRationalSeries(field, point);

      const centralDiffRat = (h) => {
        const twoH = mulRat(rat(2), h);
        let sum = rat(0);
        for (let i = 0; i < field.length; i += 1) {
          const plus = point.slice();
          const minus = point.slice();
          plus[i] = addRat(plus[i], h);
          minus[i] = subRat(minus[i], h);
          const diff = subRat(evalPolyRat(field[i], plus), evalPolyRat(field[i], minus));
          sum = addRat(sum, divRat(diff, twoH));
        }
        return sum;
      };

      const h = rat(1, 5);
      const halfH = rat(1, 10);
      const dH = centralDiffRat(h);
      const dHalf = centralDiffRat(halfH);
      const richardson = divRat(subRat(mulRat(rat(4), dHalf), dH), rat(3));

      assertRationalEqual(exact, richardson.num, richardson.den);
    });

    it('satisfies the vector calculus identity div(curl(G)) = 0 identically', () => {
      const G = [
        [term(3, 5, [3, 2, 1]), term(-7, 4, [1, 4, 2]), term(2, 3, [0, 1, 3]), term(5, 2, [2, 0, 0])],
        [term(-4, 7, [2, 3, 2]), term(9, 8, [4, 0, 1]), term(-1, 6, [1, 1, 4])],
        [term(5, 9, [1, 3, 3]), term(-2, 5, [3, 1, 2]), term(11, 12, [2, 2, 0]), term(-3, 4, [0, 0, 2])],
      ];
      const curlG = curl3D(G);

      const testPoints = [
        [rat(0), rat(0), rat(0)],
        [rat(1, 2), rat(-3, 4), rat(5, 6)],
        [rat(-7, 3), rat(11, 5), rat(-2, 9)],
        [rat(13, 7), rat(17, 11), rat(19, 13)],
      ];

      for (const pt of testPoints) {
        assertRationalEqual(divergenceRationalSeries(curlG, pt), 0n, 1n);
      }
    });

    it('satisfies linearity div(aF + bH) = a*div(F) + b*div(H) and product rule div(phi*F) = grad(phi).F + phi*div(F)', () => {
      const F = [
        [term(2, 3, [2, 1]), term(-1, 4, [1, 2])],
        [term(3, 5, [1, 3]), term(7, 2, [0, 1])],
      ];
      const H = [
        [term(-5, 6, [3, 0]), term(4, 7, [1, 1])],
        [term(1, 2, [2, 2]), term(-3, 8, [0, 2])],
      ];
      const alpha = rat(3, 7);
      const beta = rat(-5, 11);
      const pt = [rat(-4, 5), rat(7, 3)];

      const combined = [0, 1].map((i) => [
        ...F[i].map(({ coeff, powers }) => ({ coeff: mulRat(alpha, coeff), powers })),
        ...H[i].map(({ coeff, powers }) => ({ coeff: mulRat(beta, coeff), powers })),
      ]);

      const lhsLin = divergenceRationalSeries(combined, pt);
      const rhsLin = addRat(
        mulRat(alpha, divergenceRationalSeries(F, pt)),
        mulRat(beta, divergenceRationalSeries(H, pt)),
      );
      assertRationalEqual(lhsLin, rhsLin.num, rhsLin.den);

      // Product rule: div(phi * F) = grad(phi) . F + phi * div(F)
      const phi = [term(5, 4, [2, 1]), term(-2, 3, [0, 2]), term(1, 5, [1, 0])];
      const phiF = [mulPoly(phi, F[0]), mulPoly(phi, F[1])];

      const lhsProd = divergenceRationalSeries(phiF, pt);
      const gradPhiDotF = addRat(
        mulRat(evalPolyRat(partialDerivPoly(phi, 0), pt), evalPolyRat(F[0], pt)),
        mulRat(evalPolyRat(partialDerivPoly(phi, 1), pt), evalPolyRat(F[1], pt)),
      );
      const rhsProd = addRat(
        gradPhiDotF,
        mulRat(evalPolyRat(phi, pt), divergenceRationalSeries(F, pt)),
      );
      assertRationalEqual(lhsProd, rhsProd.num, rhsProd.den);
    });
  });
});
