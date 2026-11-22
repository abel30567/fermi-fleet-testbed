import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivativeRationalRecursive } from './derivativeRationalRecursive.js';

function bigAbs(n) {
  return n < 0n ? -n : n;
}

function gcd(a, b) {
  let x = bigAbs(a);
  let y = bigAbs(b);
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

function rat(num, den = 1n) {
  if (den === 0n) throw new RangeError('zero den');
  if (num === 0n) return { num: 0n, den: 1n };
  const n = den < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

function ratAdd(a, b) {
  return rat(a.num * b.den + b.num * a.den, a.den * b.den);
}

function ratSub(a, b) {
  return rat(a.num * b.den - b.num * a.den, a.den * b.den);
}

function ratMul(a, b) {
  return rat(a.num * b.num, a.den * b.den);
}

function ratDiv(a, b) {
  return rat(a.num * b.den, a.den * b.num);
}

function ratPow(a, exp) {
  let acc = rat(1n, 1n);
  for (let i = 0; i < exp; i += 1) {
    acc = ratMul(acc, a);
  }
  return acc;
}

function ratToNumber(r) {
  // Convert safely even for large BigInts by scaling into 60 bits of precision
  if (r.num === 0n) return 0;
  const scale = 10n ** 18n;
  const scaled = (r.num * scale) / r.den;
  return Number(scaled) / 1e18;
}

function assertNormalized(r) {
  assert.equal(typeof r, 'object');
  assert.notEqual(r, null);
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`);
  assert.equal(gcd(r.num, r.den), 1n, `Expected lowest terms for ${r.num}/${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, 'Expected zero to be represented as 0n/1n');
  }
}

function assertRatEqual(actual, expected) {
  assertNormalized(actual);
  const normExp = rat(expected.num, expected.den);
  assert.equal(actual.num, normExp.num, `Numerator mismatch: ${actual.num}/${actual.den} vs ${normExp.num}/${normExp.den}`);
  assert.equal(actual.den, normExp.den, `Denominator mismatch: ${actual.num}/${actual.den} vs ${normExp.num}/${normExp.den}`);
}

function assertRatClose(actual, expected, tolRat) {
  assertNormalized(actual);
  const diff = ratSub(actual, expected);
  const absDiff = { num: bigAbs(diff.num), den: diff.den };
  assert.ok(
    absDiff.num * tolRat.den <= tolRat.num * absDiff.den,
    `Expected |${actual.num}/${actual.den} - ${expected.num}/${expected.den}| <= ${tolRat.num}/${tolRat.den}, got ${absDiff.num}/${absDiff.den}`,
  );
}

/** Independent iterative Horner evaluation for cross-checking. */
function evalPolyHorner(coeffs, x) {
  let acc = rat(0n, 1n);
  for (let i = coeffs.length - 1; i >= 0; i -= 1) {
    acc = ratAdd(ratMul(acc, x), coeffs[i]);
  }
  return acc;
}

/** Independent iterative polynomial derivative for cross-checking. */
function derivPolyIterative(coeffs) {
  if (coeffs.length <= 1) return [rat(0n, 1n)];
  const out = [];
  for (let k = 1; k < coeffs.length; k += 1) {
    out.push(ratMul(coeffs[k], rat(BigInt(k), 1n)));
  }
  while (out.length > 1 && out[out.length - 1].num === 0n) {
    out.pop();
  }
  return out;
}

describe('derivativeRationalRecursive - polynomial mode', () => {
  it('differentiates constant and zero polynomials', () => {
    const dZero = derivativeRationalRecursive([rat(0n, 1n)]);
    assert.equal(dZero.length, 1);
    assertRatEqual(dZero[0], rat(0n, 1n));

    const dConst = derivativeRationalRecursive([{ num: 14n, den: -6n }]);
    assert.equal(dConst.length, 1);
    assertRatEqual(dConst[0], rat(0n, 1n));

    const valAtX = derivativeRationalRecursive([rat(7n, 3n)], rat(-5n, 2n));
    assertRatEqual(valAtX, rat(0n, 1n));
  });

  it('differentiates linear, quadratic, and higher-degree polynomials exactly', () => {
    // P(x) = 3/2 - 5/4 x + 2/3 x^2 - 7/6 x^3 + 1/4 x^4
    // P'(x) = -5/4 + 4/3 x - 7/2 x^2 + x^3
    const poly = [rat(3n, 2n), rat(-5n, 4n), rat(2n, 3n), rat(-7n, 6n), rat(1n, 4n)];
    const deriv = derivativeRationalRecursive(poly);
    const expected = [rat(-5n, 4n), rat(4n, 3n), rat(-7n, 2n), rat(1n, 1n)];

    assert.equal(deriv.length, expected.length);
    for (let i = 0; i < expected.length; i += 1) {
      assertRatEqual(deriv[i], expected[i]);
    }

    // Evaluate at x = 0, x = 2/3, x = -3/5
    for (const x of [rat(0n, 1n), rat(2n, 3n), rat(-3n, 5n)]) {
      const evaluated = derivativeRationalRecursive(poly, x);
      const hornerCheck = evalPolyHorner(expected, x);
      assertRatEqual(evaluated, hornerCheck);
    }
  });

  it('handles unreduced inputs, negative denominators, and trailing zeros', () => {
    // 4/(-6) + (-10)/(-15) x + 6/(-9) x^2 + 0/(-5) x^3 + 0/7 x^4
    // = -2/3 + 2/3 x - 2/3 x^2 => P'(x) = 2/3 - 4/3 x
    const poly = [
      { num: 4n, den: -6n },
      { num: -10n, den: -15n },
      { num: 6n, den: -9n },
      { num: 0n, den: -5n },
      { num: 0n, den: 7n },
    ];
    const deriv = derivativeRationalRecursive(poly);
    assert.equal(deriv.length, 2);
    assertRatEqual(deriv[0], rat(2n, 3n));
    assertRatEqual(deriv[1], rat(-4n, 3n));

    // All-zero higher terms collapse to constant 0
    const constWithTrailingZeros = [
      { num: 9n, den: 3n },
      { num: 0n, den: 2n },
      { num: 0n, den: -4n },
    ];
    const dZero = derivativeRationalRecursive(constWithTrailingZeros);
    assert.equal(dZero.length, 1);
    assertRatEqual(dZero[0], rat(0n, 1n));

    // Evaluate with unreduced negative-denominator x = -6 / -9 = 2/3
    // P'(2/3) = 2/3 - 8/9 = -2/9
    const val = derivativeRationalRecursive(poly, { num: -6n, den: -9n });
    assertRatEqual(val, rat(-2n, 9n));
  });

  it('handles large BigInts and high-degree polynomials, cross-checked with iterative Horner', () => {
    const big = 10n ** 30n;
    const poly = [];
    for (let k = 0; k <= 25; k += 1) {
      const sign = k % 2 === 0 ? 1n : -1n;
      poly.push({ num: sign * (big + BigInt(k) * 7n), den: BigInt(k + 1) * 3n });
    }

    const expectedDeriv = derivPolyIterative(poly.map((c) => rat(c.num, c.den)));
    const actualDeriv = derivativeRationalRecursive(poly);
    assert.equal(actualDeriv.length, expectedDeriv.length);
    for (let i = 0; i < expectedDeriv.length; i += 1) {
      assertRatEqual(actualDeriv[i], expectedDeriv[i]);
    }

    const x = rat(-3n, 7n);
    const actualVal = derivativeRationalRecursive(poly, x);
    const expectedVal = evalPolyHorner(expectedDeriv, x);
    assertRatEqual(actualVal, expectedVal);
  });

  it('satisfies algebraic product rule (P*Q)\'(x) = P\'(x)Q(x) + P(x)Q\'(x)', () => {
    const p = [rat(1n, 2n), rat(-3n, 5n), rat(4n, 7n)];
    const q = [rat(-2n, 3n), rat(5n, 4n), rat(-1n, 6n), rat(2n, 9n)];

    // Multiply polynomials P * Q
    const pq = Array.from({ length: p.length + q.length - 1 }, () => rat(0n, 1n));
    for (let i = 0; i < p.length; i += 1) {
      for (let j = 0; j < q.length; j += 1) {
        pq[i + j] = ratAdd(pq[i + j], ratMul(p[i], q[j]));
      }
    }

    const x = rat(5n, 3n);
    const lhs = derivativeRationalRecursive(pq, x);
    const rhs = ratAdd(
      ratMul(derivativeRationalRecursive(p, x), evalPolyHorner(q, x)),
      ratMul(evalPolyHorner(p, x), derivativeRationalRecursive(q, x)),
    );
    assertRatEqual(lhs, rhs);
  });
});

describe('derivativeRationalRecursive - callable function mode (Richardson extrapolation)', () => {
  it('computes exact derivatives for constant, linear, quadratic, cubic, and quintic functions', () => {
    const x = rat(7n, 5n);

    // Constant f(t) = 11/3 -> 0
    assertRatEqual(
      derivativeRationalRecursive(() => ({ num: 22n, den: 6n }), x),
      rat(0n, 1n),
    );

    // Linear f(t) = -4/9 t + 5/2 -> -4/9
    assertRatEqual(
      derivativeRationalRecursive((t) => ratAdd(ratMul(rat(-4n, 9n), t), rat(5n, 2n)), x),
      rat(-4n, 9n),
    );

    // Quadratic f(t) = 3/2 t^2 - 5/4 t + 1 -> 3t - 5/4
    const fQuad = (t) => ratAdd(ratSub(ratMul(rat(3n, 2n), ratMul(t, t)), ratMul(rat(5n, 4n), t)), rat(1n, 1n));
    assertRatEqual(
      derivativeRationalRecursive(fQuad, x),
      ratSub(ratMul(rat(3n, 1n), x), rat(5n, 4n)),
    );

    // Quintic polynomial cross-checked against polynomial mode: exact equality!
    const poly = [rat(2n, 3n), rat(-1n, 2n), rat(5n, 6n), rat(-3n, 4n), rat(1n, 5n), rat(-2n, 7n)];
    const fQuintic = (t) => evalPolyHorner(poly, t);
    for (const pt of [rat(0n, 1n), rat(3n, 4n), rat(-5n, 3n), rat(11n, 2n)]) {
      const fromCallable = derivativeRationalRecursive(fQuintic, pt);
      const fromPoly = derivativeRationalRecursive(poly, pt);
      assertRatEqual(fromCallable, fromPoly);
    }
  });

  it('computes high-accuracy derivatives for smooth non-polynomial rational functions', () => {
    const tol = rat(1n, 10n ** 12n);

    // f(t) = 1 / t, f'(t) = -1 / t^2
    const inv = (t) => ratDiv(rat(1n, 1n), t);
    for (const x of [rat(2n, 1n), rat(-3n, 5n), rat(1n, 1000n)]) {
      const actual = derivativeRationalRecursive(inv, x);
      const expected = ratDiv(rat(-1n, 1n), ratMul(x, x));
      assertRatClose(actual, expected, tol);
    }

    // f(t) = (t^2 + 1) / (t + 2), f'(t) = (t^2 + 4t - 1) / (t + 2)^2
    const fRat = (t) => ratDiv(ratAdd(ratMul(t, t), rat(1n, 1n)), ratAdd(t, rat(2n, 1n)));
    const fRatDeriv = (t) => {
      const num = ratSub(ratAdd(ratMul(t, t), ratMul(rat(4n, 1n), t)), rat(1n, 1n));
      const den = ratMul(ratAdd(t, rat(2n, 1n)), ratAdd(t, rat(2n, 1n)));
      return ratDiv(num, den);
    };
    for (const x of [rat(0n, 1n), rat(1n, 3n), rat(-1n, 2n), rat(5n, 2n)]) {
      const actual = derivativeRationalRecursive(fRat, x);
      assertRatClose(actual, fRatDeriv(x), tol);
    }

    // f(t) = 1 / (1 + t^2), f'(t) = -2t / (1 + t^2)^2
    const witch = (t) => ratDiv(rat(1n, 1n), ratAdd(rat(1n, 1n), ratMul(t, t)));
    const witchDeriv = (t) => {
      const d = ratAdd(rat(1n, 1n), ratMul(t, t));
      return ratDiv(ratMul(rat(-2n, 1n), t), ratMul(d, d));
    };
    assertRatEqual(derivativeRationalRecursive(witch, rat(0n, 1n)), rat(0n, 1n));
    assertRatClose(derivativeRationalRecursive(witch, rat(1n, 3n)), witchDeriv(rat(1n, 3n)), tol);
    assertRatClose(derivativeRationalRecursive(witch, rat(-2n, 1n)), witchDeriv(rat(-2n, 1n)), tol);
  });

  it('cross-checks against Math.exp and Math.cos via exact rational Taylor series', () => {
    // 20-term exact rational Taylor series for exp(t)
    const expTaylor = (t) => {
      let sum = rat(1n, 1n);
      let term = rat(1n, 1n);
      for (let k = 1; k <= 20; k += 1) {
        term = ratDiv(ratMul(term, t), rat(BigInt(k), 1n));
        sum = ratAdd(sum, term);
      }
      return sum;
    };
    const dExpAtHalf = derivativeRationalRecursive(expTaylor, rat(1n, 2n));
    assertNormalized(dExpAtHalf);
    assert.ok(
      Math.abs(ratToNumber(dExpAtHalf) - Math.exp(0.5)) < 1e-12,
      `Expected d/dx exp(1/2) ~ ${Math.exp(0.5)}, got ${ratToNumber(dExpAtHalf)}`,
    );

    // Exact rational Taylor series for sin(t) (odd powers up to t^19)
    const sinTaylor = (t) => {
      const t2 = ratMul(t, t);
      let sum = t;
      let term = t;
      for (let k = 1; k <= 9; k += 1) {
        const denom = BigInt(2 * k) * BigInt(2 * k + 1);
        term = ratDiv(ratMul(ratMul(term, t2), rat(-1n, 1n)), rat(denom, 1n));
        sum = ratAdd(sum, term);
      }
      return sum;
    };
    const dSinAtThird = derivativeRationalRecursive(sinTaylor, rat(1n, 3n));
    assertNormalized(dSinAtThird);
    assert.ok(
      Math.abs(ratToNumber(dSinAtThird) - Math.cos(1 / 3)) < 1e-12,
      `Expected d/dx sin(1/3) ~ ${Math.cos(1 / 3)}, got ${ratToNumber(dSinAtThird)}`,
    );
  });

  it('respects custom step, tolerance, and maxDepth options and unreduced inputs', () => {
    // Tight tolerance 1e-24 on f(t) = 1/t at x = 3
    const tightTol = rat(1n, 10n ** 24n);
    const inv = (t) => ratDiv(rat(1n, 1n), t);
    const highAcc = derivativeRationalRecursive(inv, { num: -9n, den: -3n }, {
      step: { num: -2n, den: -32n }, // unreduced 1/16
      tolerance: tightTol,
      maxDepth: 12,
    });
    assertRatClose(highAcc, rat(-1n, 9n), tightTol);

    // maxDepth: 0 returns the single central difference R(0, 0) = (f(x+h) - f(x-h)) / (2h)
    // For f(t) = t^3 at x = 2, h = 1/2: R(0, 0) = 3*4 + (1/2)^2 = 12 + 1/4 = 49/4
    const cube = (t) => ratPow(t, 3);
    const depth0 = derivativeRationalRecursive(cube, rat(2n, 1n), {
      step: rat(1n, 2n),
      maxDepth: 0,
    });
    assertRatEqual(depth0, rat(49n, 4n));

    // tolerance: 0 on cubic polynomial still reaches exact value
    const exactZeroTol = derivativeRationalRecursive(cube, rat(2n, 1n), {
      step: rat(1n, 2n),
      tolerance: rat(0n, 1n),
      maxDepth: 6,
    });
    assertRatEqual(exactZeroTol, rat(12n, 1n));

    // Large BigInt point x with unreduced rational returned from fn
    const bigX = { num: 10n ** 25n, den: 3n };
    const sqUnreduced = (t) => ({ num: t.num * t.num * -4n, den: t.den * t.den * -4n });
    const dBig = derivativeRationalRecursive(sqUnreduced, bigX);
    assertRatEqual(dBig, ratMul(rat(2n, 1n), bigX));
  });
});

describe('derivativeRationalRecursive - input validation and errors', () => {
  it('throws TypeError for invalid first argument', () => {
    for (const bad of [null, undefined, 42, 'x^2', {}, true]) {
      assert.throws(() => derivativeRationalRecursive(bad), TypeError);
    }
  });

  it('validates polynomial array and x in polynomial mode', () => {
    assert.throws(() => derivativeRationalRecursive([]), RangeError);
    assert.throws(() => derivativeRationalRecursive([null]), TypeError);
    assert.throws(() => derivativeRationalRecursive([{ num: 1, den: 2n }]), TypeError);
    assert.throws(() => derivativeRationalRecursive([{ num: 1n, den: '2' }]), TypeError);
    assert.throws(() => derivativeRationalRecursive([rat(1n, 1n), { num: 0n, den: 0n }]), RangeError);
    // Sparse array hole
    const sparse = [rat(1n, 1n)];
    sparse[2] = rat(3n, 1n);
    assert.throws(() => derivativeRationalRecursive(sparse), TypeError);
    assert.throws(() => derivativeRationalRecursive([rat(1n, 1n), rat(2n, 1n)], null), TypeError);
    assert.throws(() => derivativeRationalRecursive([rat(1n, 1n), rat(2n, 1n)], 3), TypeError);
    assert.throws(() => derivativeRationalRecursive([rat(1n, 1n), rat(2n, 1n)], { num: 1n, den: 0n }), RangeError);
  });

  it('validates x, options, and fn return values in callable mode', () => {
    const id = (t) => t;
    assert.throws(() => derivativeRationalRecursive(id), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, null), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, { num: 1n, den: 0n }), RangeError);

    // Invalid options container
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), null), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), []), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), 'bad'), TypeError);

    // Invalid options.step
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { step: 0.01 }), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { step: rat(0n, 1n) }), RangeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { step: rat(-1n, 4n) }), RangeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { step: { num: 1n, den: 0n } }), RangeError);

    // Invalid options.tolerance
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { tolerance: 1e-12 }), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { tolerance: rat(-1n, 10n) }), RangeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { tolerance: { num: 1n, den: 0n } }), RangeError);

    // Invalid options.maxDepth
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { maxDepth: '5' }), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { maxDepth: 5n }), TypeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { maxDepth: -1 }), RangeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { maxDepth: 2.5 }), RangeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { maxDepth: Number.NaN }), RangeError);
    assert.throws(() => derivativeRationalRecursive(id, rat(1n, 1n), { maxDepth: Number.POSITIVE_INFINITY }), RangeError);

    // Invalid fn return values
    assert.throws(() => derivativeRationalRecursive(() => 42, rat(1n, 1n)), TypeError);
    assert.throws(() => derivativeRationalRecursive(() => null, rat(1n, 1n)), TypeError);
    assert.throws(() => derivativeRationalRecursive(() => ({ num: 1n, den: 0n }), rat(1n, 1n)), RangeError);
  });
});
