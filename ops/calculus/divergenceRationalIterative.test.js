import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divergenceRationalIterative } from './divergenceRationalIterative.js';

/** Helper to construct an exact rational. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

/** Helper to construct a polynomial term. */
const term = (coeff, powers) => ({ coeff, powers });

/** Independent exact rational helpers for mathematical cross-checks. */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

function norm(num, den) {
  if (num === 0n) return { num: 0n, den: 1n };
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

function rAdd(a, b) {
  return norm(a.num * b.den + b.num * a.den, a.den * b.den);
}

function rMul(a, b) {
  return norm(a.num * b.num, a.den * b.den);
}

function rPow(a, e) {
  let res = q(1n, 1n);
  for (let i = 0; i < e; i += 1) {
    res = rMul(res, a);
  }
  return res;
}

/** Evaluates a scalar polynomial at a rational point. */
function evalPoly(poly, point) {
  let sum = q(0n, 1n);
  for (const t of poly) {
    let v = norm(t.coeff.num, t.coeff.den);
    for (let k = 0; k < point.length; k += 1) {
      if (t.powers[k] > 0) {
        v = rMul(v, rPow(point[k], t.powers[k]));
      }
    }
    sum = rAdd(sum, v);
  }
  return sum;
}

/** Symbolically multiplies two multivariate scalar polynomials. */
function mulPoly(p, s) {
  const result = [];
  for (const t1 of p) {
    for (const t2 of s) {
      const powers = t1.powers.map((e, idx) => e + t2.powers[idx]);
      result.push({ coeff: rMul(t1.coeff, t2.coeff), powers });
    }
  }
  return result;
}

/** Symbolically differentiates a scalar polynomial with respect to variable `varIdx`. */
function diffPoly(poly, varIdx) {
  const result = [];
  for (const t of poly) {
    const p = t.powers[varIdx];
    if (p === 0) continue;
    const powers = t.powers.slice();
    powers[varIdx] = p - 1;
    result.push({
      coeff: rMul(t.coeff, q(p, 1n)),
      powers,
    });
  }
  return result;
}

/** Symbolically subtracts two scalar polynomials: p - s. */
function subPoly(p, s) {
  return [
    ...p,
    ...s.map((t) => ({ coeff: { num: -t.coeff.num, den: t.coeff.den }, powers: t.powers.slice() })),
  ];
}

/** Symbolically scales a scalar polynomial by a rational scalar. */
function scalePoly(poly, scalar) {
  return poly.map((t) => ({ coeff: rMul(t.coeff, scalar), powers: t.powers.slice() }));
}

/** Symbolically computes curl(F) for a 3D polynomial vector field F = [F0, F1, F2]. */
function curl3D(F) {
  const [F0, F1, F2] = F;
  return [
    subPoly(diffPoly(F2, 1), diffPoly(F1, 2)), // ∂F2/∂y - ∂F1/∂z
    subPoly(diffPoly(F0, 2), diffPoly(F2, 0)), // ∂F0/∂z - ∂F2/∂x
    subPoly(diffPoly(F1, 0), diffPoly(F0, 1)), // ∂F1/∂x - ∂F0/∂y
  ];
}

describe('divergenceRationalIterative', () => {
  describe('1D vector fields', () => {
    it('returns 0/1 for empty (zero) and constant 1D fields', () => {
      assert.deepEqual(divergenceRationalIterative([[]], [q(7n, 3n)]), q(0n, 1n));
      const constantField = [[term(q(11n, 4n), [0])]];
      assert.deepEqual(divergenceRationalIterative(constantField, [q(-5n, 2n)]), q(0n, 1n));
    });

    it('computes exact derivative for linear and nonlinear 1D polynomials', () => {
      // F(x) = 3x^2 - (1/2)x + 5  =>  div(F)(x) = 6x - 1/2
      const field = [[term(q(3n), [2]), term(q(-1n, 2n), [1]), term(q(5n), [0])]];
      // At x = 2/3: 6*(2/3) - 1/2 = 4 - 1/2 = 7/2
      assert.deepEqual(divergenceRationalIterative(field, [q(2n, 3n)]), q(7n, 2n));
      // At x = 0: 6*0 - 1/2 = -1/2 (verifies 0^0 = 1 on linear term)
      assert.deepEqual(divergenceRationalIterative(field, [q(0n)]), q(-1n, 2n));
    });
  });

  describe('2D vector fields', () => {
    it('returns 0/1 for constant and solenoidal (divergence-free) fields', () => {
      // Constant field F(x, y) = (3/4, -5/7)
      const constantField = [[term(q(3n, 4n), [0, 0])], [term(q(-5n, 7n), [0, 0])]];
      assert.deepEqual(divergenceRationalIterative(constantField, [q(2n, 5n), q(-9n, 11n)]), q(0n, 1n));

      // Rotational solenoidal field F(x, y) = (-y, x)
      const rotational = [[term(q(-1n), [0, 1])], [term(q(1n), [1, 0])]];
      assert.deepEqual(divergenceRationalIterative(rotational, [q(3n, 7n), q(-11n, 13n)]), q(0n, 1n));

      // Nonlinear solenoidal field F(x, y) = (x^2 y - y^3, -x y^2 + x^3)
      // ∂F0/∂x = 2xy, ∂F1/∂y = -2xy => div(F) = 0
      const nonlinearSolenoidal = [
        [term(q(1n), [2, 1]), term(q(-1n), [0, 3])],
        [term(q(-1n), [1, 2]), term(q(1n), [3, 0])],
      ];
      assert.deepEqual(divergenceRationalIterative(nonlinearSolenoidal, [q(-4n, 9n), q(7n, 5n)]), q(0n, 1n));
    });

    it('computes exact divergence for linear and nonlinear 2D fields at fractional coordinates', () => {
      // Radial field F(x, y) = (x, y) => div = 2
      const radial = [[term(q(1n), [1, 0])], [term(q(1n), [0, 1])]];
      assert.deepEqual(divergenceRationalIterative(radial, [q(100n, 3n), q(-7n, 19n)]), q(2n, 1n));

      // F(x, y) = ((2/3) x^3 y - (1/5) y^2, (4/7) x y^2 + (3/2) y)
      // ∂F0/∂x = 2 x^2 y, ∂F1/∂y = (8/7) x y + 3/2
      // At (-3/4, 5/6): 15/16 - 5/7 + 3/2 = 193/112
      const nonlinear = [
        [term(q(2n, 3n), [3, 1]), term(q(-1n, 5n), [0, 2])],
        [term(q(4n, 7n), [1, 2]), term(q(3n, 2n), [0, 1])],
      ];
      assert.deepEqual(divergenceRationalIterative(nonlinear, [q(-3n, 4n), q(5n, 6n)]), q(193n, 112n));
    });
  });

  describe('3D and higher-dimensional vector fields', () => {
    it('computes exact divergence for linear and nonlinear 3D fields', () => {
      // Linear: F(x, y, z) = (2x - y, 3y + 5z, -4z + x) => div = 2 + 3 - 4 = 1
      const linear3D = [
        [term(q(2n), [1, 0, 0]), term(q(-1n), [0, 1, 0])],
        [term(q(3n), [0, 1, 0]), term(q(5n), [0, 0, 1])],
        [term(q(-4n), [0, 0, 1]), term(q(1n), [1, 0, 0])],
      ];
      assert.deepEqual(divergenceRationalIterative(linear3D, [q(1n, 2n), q(-2n, 3n), q(5n, 7n)]), q(1n, 1n));

      // Nonlinear: F(x, y, z) = (x^2 y z, x y^2 z, x y z^2) => div = 6 x y z
      const symmetric3D = [
        [term(q(1n), [2, 1, 1])],
        [term(q(1n), [1, 2, 1])],
        [term(q(1n), [1, 1, 2])],
      ];
      // At (2/3, -3/5, 5/7): 6 * (2/3) * (-3/5) * (5/7) = -12/7
      assert.deepEqual(divergenceRationalIterative(symmetric3D, [q(2n, 3n), q(-3n, 5n), q(5n, 7n)]), q(-12n, 7n));
      // At (0, -3/5, 5/7): 0
      assert.deepEqual(divergenceRationalIterative(symmetric3D, [q(0n), q(-3n, 5n), q(5n, 7n)]), q(0n, 1n));
    });

    it('handles 4D vector fields accurately', () => {
      // F(x, y, z, w) = (x^2, y^3, z*w, w^2) => div = 2x + 3y^2 + w + 2w = 2x + 3y^2 + 3w
      const field4D = [
        [term(q(1n), [2, 0, 0, 0])],
        [term(q(1n), [0, 3, 0, 0])],
        [term(q(1n), [0, 0, 1, 1])],
        [term(q(1n), [0, 0, 0, 2])],
      ];
      // At (1/2, 2/3, 99/1, -1/4): 2*(1/2) + 3*(4/9) + 3*(-1/4) = 1 + 4/3 - 3/4 = 19/12
      assert.deepEqual(
        divergenceRationalIterative(field4D, [q(1n, 2n), q(2n, 3n), q(99n, 1n), q(-1n, 4n)]),
        q(19n, 12n),
      );
    });
  });

  describe('edge cases and normalization', () => {
    it('normalizes unreduced inputs and negative denominators into lowest terms with den > 0n', () => {
      // F(x, y) = ((6/4) x^2, (3/-9) y^2) = ((3/2) x^2, (-1/3) y^2)
      // div = 3x - (2/3)y
      // At (2/-6, -6/-4) = (-1/3, 3/2): 3*(-1/3) - (2/3)*(3/2) = -1 - 1 = -2/1
      const field = [
        [term(q(6n, 4n), [2, 0])],
        [term(q(3n, -9n), [0, 2])],
      ];
      const result = divergenceRationalIterative(field, [q(2n, -6n), q(-6n, -4n)]);
      assert.deepEqual(result, q(-2n, 1n));
      assert.equal(result.den > 0n, true);

      // Zero numerator with negative denominator
      const zeroField = [[term(q(0n, -5n), [3])]];
      assert.deepEqual(divergenceRationalIterative(zeroField, [q(0n, -7n)]), q(0n, 1n));
    });

    it('handles unsimplified duplicate monomials and large BigInt values without precision loss', () => {
      // F(x) = x^2 + 3x^2 = 4x^2 => div = 8x
      const duplicateField = [[term(q(1n), [2]), term(q(3n), [2])]];
      const bigNum = 10n ** 30n + 7n;
      const bigDen = 10n ** 20n + 3n;
      const expected = norm(8n * bigNum, bigDen);
      assert.deepEqual(divergenceRationalIterative(duplicateField, [q(bigNum, bigDen)]), expected);
    });

    it('does not mutate input vectorField or point', () => {
      const field = [[term(q(6n, 4n), [2, 1])], [term(q(2n, -4n), [1, 2])]];
      const point = [q(4n, -2n), q(6n, 9n)];
      const fieldSnapshot = JSON.stringify(field, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
      const pointSnapshot = JSON.stringify(point, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));

      divergenceRationalIterative(field, point);

      assert.equal(
        JSON.stringify(field, (_, v) => (typeof v === 'bigint' ? `${v}n` : v)),
        fieldSnapshot,
      );
      assert.equal(
        JSON.stringify(point, (_, v) => (typeof v === 'bigint' ? `${v}n` : v)),
        pointSnapshot,
      );
    });
  });

  describe('invalid input validation', () => {
    it('throws TypeError or RangeError for invalid vectorField or point shapes', () => {
      assert.throws(() => divergenceRationalIterative(null, [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative({}, [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative([[]], null), TypeError);
      assert.throws(() => divergenceRationalIterative([[]], 'not-array'), TypeError);

      assert.throws(() => divergenceRationalIterative([], []), RangeError);
      assert.throws(() => divergenceRationalIterative([[]], [q(1n), q(2n)]), RangeError);
      assert.throws(() => divergenceRationalIterative([[], []], [q(1n)]), RangeError);
    });

    it('throws for invalid point rationals even when components are empty', () => {
      assert.throws(() => divergenceRationalIterative([[]], [null]), TypeError);
      assert.throws(() => divergenceRationalIterative([[]], [{ num: 1, den: 1n }]), TypeError);
      assert.throws(() => divergenceRationalIterative([[]], [{ num: 1n, den: 1 }]), TypeError);
      assert.throws(() => divergenceRationalIterative([[]], [[1n, 1n]]), TypeError);
      assert.throws(() => divergenceRationalIterative([[]], [q(1n, 0n)]), RangeError);
    });

    it('throws for invalid components, terms, coefficients, and powers', () => {
      assert.throws(() => divergenceRationalIterative(['bad'], [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative([[null]], [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative([[[]]], [q(1n)]), TypeError);

      // Invalid coeff
      assert.throws(() => divergenceRationalIterative([[term({ num: 1, den: 1n }, [1])]], [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative([[term(q(1n, 0n), [1])]], [q(1n)]), RangeError);

      // Invalid powers array
      assert.throws(() => divergenceRationalIterative([[term(q(1n), 'bad')]], [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative([[term(q(1n), [1, 2])]], [q(1n)]), RangeError);

      // Invalid power entries
      assert.throws(() => divergenceRationalIterative([[term(q(1n), [-1])]], [q(1n)]), RangeError);
      assert.throws(() => divergenceRationalIterative([[term(q(1n), [1.5])]], [q(1n)]), RangeError);
      assert.throws(() => divergenceRationalIterative([[term(q(1n), [Number.NaN])]], [q(1n)]), RangeError);
      assert.throws(() => divergenceRationalIterative([[term(q(1n), [Number.POSITIVE_INFINITY])]], [q(1n)]), RangeError);
      assert.throws(
        () => divergenceRationalIterative([[term(q(1n), [Number.MAX_SAFE_INTEGER + 1])]], [q(1n)]),
        RangeError,
      );
      assert.throws(() => divergenceRationalIterative([[term(q(1n), ['1'])]], [q(1n)]), TypeError);
      assert.throws(() => divergenceRationalIterative([[term(q(1n), [1n])]], [q(1n)]), TypeError);

      // Malformed term must still be rejected even when coeff is 0 or p_j is 0
      assert.throws(
        () => divergenceRationalIterative([[term(q(0n), [-1, 0])], []], [q(1n), q(1n)]),
        RangeError,
      );
      assert.throws(
        () => divergenceRationalIterative([[term(q(1n), [0, 1.5])], []], [q(1n), q(1n)]),
        RangeError,
      );
    });
  });

  describe('mathematical identity cross-checks', () => {
    it('satisfies product rule: div(f * F) === grad(f) · F + f * div(F) in 3D', () => {
      // Scalar polynomial f(x, y, z) = (2/3) x^2 y - (1/4) y z^2 + (5/7) x z + 3
      const f = [
        term(q(2n, 3n), [2, 1, 0]),
        term(q(-1n, 4n), [0, 1, 2]),
        term(q(5n, 7n), [1, 0, 1]),
        term(q(3n, 1n), [0, 0, 0]),
      ];

      // 3D vector field F(x, y, z)
      const F = [
        [term(q(3n, 5n), [2, 0, 1]), term(q(-2n, 3n), [0, 2, 0])],
        [term(q(1n, 2n), [1, 1, 1]), term(q(4n, 9n), [0, 0, 3])],
        [term(q(-7n, 6n), [1, 2, 2]), term(q(5n, 8n), [1, 0, 0]), term(q(-1n, 3n), [0, 0, 1])],
      ];

      const fTimesF = F.map((comp) => mulPoly(f, comp));
      const gradF = [diffPoly(f, 0), diffPoly(f, 1), diffPoly(f, 2)];

      const testPoints = [
        [q(2n, 3n), q(-3n, 5n), q(7n, 4n)],
        [q(0n, 1n), q(-5n, 6n), q(2n, 9n)],
        [q(-11n, 7n), q(0n, 1n), q(0n, 1n)],
        [q(1n, 1n), q(1n, 1n), q(1n, 1n)],
      ];

      for (const pt of testPoints) {
        const lhs = divergenceRationalIterative(fTimesF, pt);

        // Compute grad(f)(pt) · F(pt) + f(pt) * div(F)(pt)
        let gradDotF = q(0n, 1n);
        for (let j = 0; j < 3; j += 1) {
          const gVal = evalPoly(gradF[j], pt);
          const fCompVal = evalPoly(F[j], pt);
          gradDotF = rAdd(gradDotF, rMul(gVal, fCompVal));
        }
        const fVal = evalPoly(f, pt);
        const divFVal = divergenceRationalIterative(F, pt);
        const rhs = rAdd(gradDotF, rMul(fVal, divFVal));

        assert.deepEqual(lhs, rhs);
      }
    });

    it('satisfies vector calculus identity: div(curl(F)) === 0 for a 3D polynomial field', () => {
      // Rich nonlinear 3D polynomial vector field F
      const F = [
        [term(q(5n, 3n), [3, 2, 1]), term(q(-7n, 4n), [1, 0, 3]), term(q(2n, 9n), [0, 4, 2])],
        [term(q(-3n, 8n), [2, 3, 2]), term(q(11n, 5n), [4, 1, 0]), term(q(-1n, 7n), [0, 1, 4])],
        [term(q(4n, 11n), [1, 3, 3]), term(q(-9n, 2n), [2, 1, 2]), term(q(6n, 5n), [3, 0, 1])],
      ];

      const curlF = curl3D(F);

      const testPoints = [
        [q(3n, 7n), q(-5n, 11n), q(13n, 6n)],
        [q(0n, 1n), q(2n, 3n), q(-4n, 5n)],
        [q(-17n, 13n), q(-19n, 23n), q(-29n, 31n)],
        [q(10n ** 12n + 3n, 7n), q(-(10n ** 10n) - 5n, 11n), q(10n ** 8n + 1n, 13n)],
      ];

      for (const pt of testPoints) {
        assert.deepEqual(divergenceRationalIterative(curlF, pt), q(0n, 1n));
      }
    });

    it('satisfies linearity: div(a*F + b*G) === a*div(F) + b*div(G)', () => {
      const a = q(7n, 5n);
      const b = q(-11n, 6n);

      const F = [
        [term(q(2n, 3n), [2, 1]), term(q(-1n, 4n), [0, 3])],
        [term(q(5n, 7n), [1, 2]), term(q(3n, 2n), [3, 0])],
      ];
      const G = [
        [term(q(-4n, 9n), [3, 2]), term(q(1n, 2n), [1, 0])],
        [term(q(8n, 3n), [0, 4]), term(q(-5n, 11n), [2, 1])],
      ];

      const combined = [
        [...scalePoly(F[0], a), ...scalePoly(G[0], b)],
        [...scalePoly(F[1], a), ...scalePoly(G[1], b)],
      ];

      const pt = [q(-5n, 8n), q(9n, 14n)];
      const lhs = divergenceRationalIterative(combined, pt);
      const rhs = rAdd(
        rMul(a, divergenceRationalIterative(F, pt)),
        rMul(b, divergenceRationalIterative(G, pt)),
      );

      assert.deepEqual(lhs, rhs);
    });
  });
});
