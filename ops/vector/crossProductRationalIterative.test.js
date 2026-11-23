import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductRationalIterative } from './crossProductRationalIterative.js';

const rat = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

function addRat(x, y) {
  const num = x.num * y.den + y.num * x.den;
  const den = x.den * y.den;
  if (num === 0n) return { num: 0n, den: 1n };
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den);
  return { num: (sign * num) / g, den: (sign * den) / g };
}

function mulRat(x, y) {
  const num = x.num * y.num;
  const den = x.den * y.den;
  if (num === 0n) return { num: 0n, den: 1n };
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den);
  return { num: (sign * num) / g, den: (sign * den) / g };
}

function negRat(x) {
  return x.num === 0n ? { num: 0n, den: 1n } : { num: -x.num, den: x.den };
}

function dotRat(u, v) {
  return addRat(
    addRat(mulRat(u[0], v[0]), mulRat(u[1], v[1])),
    mulRat(u[2], v[2])
  );
}

function addVec(u, v) {
  return [addRat(u[0], v[0]), addRat(u[1], v[1]), addRat(u[2], v[2])];
}

function scaleVec(s, v) {
  return [mulRat(s, v[0]), mulRat(s, v[1]), mulRat(s, v[2])];
}

function assertLowestTermsVector(v) {
  assert.equal(Array.isArray(v), true);
  assert.equal(v.length, 3);
  for (const r of v) {
    assert.equal(typeof r.num, 'bigint');
    assert.equal(typeof r.den, 'bigint');
    assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
    if (r.num === 0n) {
      assert.equal(r.den, 1n);
    } else {
      assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
    }
  }
}

describe('crossProductRationalIterative', () => {
  it('computes standard basis cross products correctly', () => {
    const e1 = [rat(1), rat(0), rat(0)];
    const e2 = [rat(0), rat(1), rat(0)];
    const e3 = [rat(0), rat(0), rat(1)];

    assert.deepEqual(crossProductRationalIterative(e1, e2), e3);
    assert.deepEqual(crossProductRationalIterative(e2, e3), e1);
    assert.deepEqual(crossProductRationalIterative(e3, e1), e2);

    assert.deepEqual(crossProductRationalIterative(e2, e1), [rat(0), rat(0), rat(-1)]);
    assert.deepEqual(crossProductRationalIterative(e3, e2), [rat(-1), rat(0), rat(0)]);
    assert.deepEqual(crossProductRationalIterative(e1, e3), [rat(0), rat(-1), rat(0)]);
  });

  it('computes exact rational cross products and reduces to lowest terms', () => {
    const a = [rat(1, 2), rat(2, 3), rat(3, 4)];
    const b = [rat(4, 5), rat(5, 6), rat(6, 7)];
    // c0 = (2/3)*(6/7) - (3/4)*(5/6) = 4/7 - 5/8 = (32 - 35)/56 = -3/56
    // c1 = (3/4)*(4/5) - (1/2)*(6/7) = 3/5 - 3/7 = (21 - 15)/35 = 6/35
    // c2 = (1/2)*(5/6) - (2/3)*(4/5) = 5/12 - 8/15 = (25 - 32)/60 = -7/60
    const res = crossProductRationalIterative(a, b);
    assertLowestTermsVector(res);
    assert.deepEqual(res, [rat(-3, 56), rat(6, 35), rat(-7, 60)]);
  });

  it('normalizes unreduced inputs and negative denominators without mutating inputs', () => {
    const a = [rat(2, -4), rat(-6, -9), rat(0, -5)];
    const b = [rat(10, 15), rat(-4, 8), rat(9, -3)];
    const aSnapshot = a.map((x) => ({ ...x }));
    const bSnapshot = b.map((x) => ({ ...x }));

    // a = [-1/2, 2/3, 0], b = [2/3, -1/2, -3]
    // c0 = (2/3)*(-3) - 0 = -2
    // c1 = 0 - (-1/2)*(-3) = -3/2
    // c2 = (-1/2)*(-1/2) - (2/3)*(2/3) = 1/4 - 4/9 = -7/36
    const res = crossProductRationalIterative(a, b);
    assertLowestTermsVector(res);
    assert.deepEqual(res, [rat(-2, 1), rat(-3, 2), rat(-7, 36)]);
    assert.deepEqual(a, aSnapshot);
    assert.deepEqual(b, bSnapshot);
  });

  it('handles zero vectors and parallel / anti-parallel vectors', () => {
    const zero = [rat(0), rat(0), rat(0)];
    const v = [rat(7, 11), rat(-13, 17), rat(19, 23)];
    const parallel = scaleVec(rat(-5, 3), v);

    assert.deepEqual(crossProductRationalIterative(zero, v), zero);
    assert.deepEqual(crossProductRationalIterative(v, zero), zero);
    assert.deepEqual(crossProductRationalIterative(zero, zero), zero);
    assert.deepEqual(crossProductRationalIterative(v, v), zero);
    assert.deepEqual(crossProductRationalIterative(v, parallel), zero);
  });

  it('maintains exactness for huge BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
    const big = 10n ** 40n;
    const a = [
      { num: big + 1n, den: 3n },
      { num: big, den: 5n },
      { num: 1n, den: big }
    ];
    const b = [
      { num: big, den: 3n },
      { num: big - 1n, den: 5n },
      { num: 1n, den: big }
    ];
    // c2 = ((big+1)/3)*((big-1)/5) - (big/5)*(big/3) = (big^2 - 1 - big^2)/15 = -1/15
    const res = crossProductRationalIterative(a, b);
    assertLowestTermsVector(res);
    assert.deepEqual(res[2], { num: -1n, den: 15n });

    // c0 = (big/5)*(1/big) - (1/big)*((big-1)/5) = 1/(5*big)
    assert.deepEqual(res[0], { num: 1n, den: 5n * big });
    // c1 = (1/big)*(big/3) - ((big+1)/3)*(1/big) = -1/(3*big)
    assert.deepEqual(res[1], { num: -1n, den: 3n * big });
  });

  it('satisfies algebraic identities and independent 3x3 determinant cross-check', () => {
    const a = [rat(5, 7), rat(-11, 13), rat(17, 19)];
    const b = [rat(-23, 29), rat(31, 37), rat(-41, 43)];
    const c = [rat(3, 11), rat(5, 17), rat(-7, 23)];

    const axb = crossProductRationalIterative(a, b);
    const bxa = crossProductRationalIterative(b, a);
    assertLowestTermsVector(axb);
    assertLowestTermsVector(bxa);

    // 1. Anti-commutativity: a × b = -(b × a)
    assert.deepEqual(axb, bxa.map(negRat));

    // 2. Orthogonality: a · (a × b) = 0 and b · (a × b) = 0
    assert.deepEqual(dotRat(a, axb), rat(0));
    assert.deepEqual(dotRat(b, axb), rat(0));

    // 3. Lagrange's identity: |a × b|^2 = |a|^2 |b|^2 - (a · b)^2
    const lhs = dotRat(axb, axb);
    const dotAB = dotRat(a, b);
    const rhs = addRat(
      mulRat(dotRat(a, a), dotRat(b, b)),
      negRat(mulRat(dotAB, dotAB))
    );
    assert.deepEqual(lhs, rhs);

    // 4. Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
    const t1 = crossProductRationalIterative(a, crossProductRationalIterative(b, c));
    const t2 = crossProductRationalIterative(b, crossProductRationalIterative(c, a));
    const t3 = crossProductRationalIterative(c, axb);
    assert.deepEqual(addVec(addVec(t1, t2), t3), [rat(0), rat(0), rat(0)]);

    // 5. Independent cross-check via Rule of Sarrus for det([c, a, b]) = c · (a × b)
    const sarrusPos = addRat(
      addRat(
        mulRat(mulRat(c[0], a[1]), b[2]),
        mulRat(mulRat(c[1], a[2]), b[0])
      ),
      mulRat(mulRat(c[2], a[0]), b[1])
    );
    const sarrusNeg = addRat(
      addRat(
        mulRat(mulRat(c[2], a[1]), b[0]),
        mulRat(mulRat(c[1], a[0]), b[2])
      ),
      mulRat(mulRat(c[0], a[2]), b[1])
    );
    const detIndependent = addRat(sarrusPos, negRat(sarrusNeg));
    assert.deepEqual(dotRat(c, axb), detIndependent);

    // 6. Bilinearity: (s*a + t*c) × b = s*(a × b) + t*(c × b)
    const s = rat(-7, 12);
    const t = rat(13, 18);
    const leftLin = crossProductRationalIterative(addVec(scaleVec(s, a), scaleVec(t, c)), b);
    const rightLin = addVec(
      scaleVec(s, axb),
      scaleVec(t, crossProductRationalIterative(c, b))
    );
    assert.deepEqual(leftLin, rightLin);
  });

  it('rejects invalid inputs with appropriate errors', () => {
    const valid = [rat(1), rat(2), rat(3)];

    // Non-array vectors
    for (const bad of [null, undefined, 42, '123', {}, new Set([rat(1), rat(2), rat(3)])]) {
      assert.throws(() => crossProductRationalIterative(bad, valid), TypeError);
      assert.throws(() => crossProductRationalIterative(valid, bad), TypeError);
    }

    // Wrong vector lengths
    for (const badLen of [[], [rat(1)], [rat(1), rat(2)], [rat(1), rat(2), rat(3), rat(4)]]) {
      assert.throws(() => crossProductRationalIterative(badLen, valid), RangeError);
      assert.throws(() => crossProductRationalIterative(valid, badLen), RangeError);
    }

    // Sparse arrays
    const sparse = new Array(3);
    sparse[0] = rat(1);
    sparse[2] = rat(3);
    assert.throws(() => crossProductRationalIterative(sparse, valid), TypeError);
    assert.throws(() => crossProductRationalIterative(valid, sparse), TypeError);

    // Invalid rational elements
    for (const badEl of [
      null,
      undefined,
      1,
      '1/2',
      { num: 1, den: 2n },
      { num: 1n, den: 2 },
      { num: 1n },
      { den: 1n },
      {}
    ]) {
      assert.throws(() => crossProductRationalIterative([badEl, rat(1), rat(1)], valid), TypeError);
      assert.throws(() => crossProductRationalIterative(valid, [rat(1), badEl, rat(1)]), TypeError);
    }

    // Zero denominator
    assert.throws(
      () => crossProductRationalIterative([rat(1, 0), rat(2), rat(3)], valid),
      RangeError
    );
    assert.throws(
      () => crossProductRationalIterative(valid, [rat(1), rat(2), rat(0, 0)]),
      RangeError
    );
  });
});
