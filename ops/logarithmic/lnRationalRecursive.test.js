import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnRationalRecursive } from './lnRationalRecursive.js';

function absBigInt(n) {
  return n < 0n ? -n : n;
}

function gcd(a, b) {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

function assertLowestTerms(r) {
  assert.equal(typeof r, 'object');
  assert.notEqual(r, null);
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, `Expected zero to have den === 1n, got ${r.den}`);
  } else {
    assert.equal(gcd(r.num, r.den), 1n, `Expected gcd(|num|, den) === 1n for ${r.num}/${r.den}`);
  }
}

/**
 * Convert an exact rational to a JS Number accurately even when num and den
 * exceed Number.MAX_VALUE, by scaling to 18 decimal digits first.
 */
function rationalToNumber(r) {
  if (r.num === 0n) {
    return 0;
  }
  const scale = 10n ** 18n;
  const scaled = (r.num * scale) / r.den;
  return Number(scaled) / 1e18;
}

/**
 * Check |r - target| <= tol where r, target, and tol are exact rationals.
 */
function assertRationalNear(actual, expected, tol) {
  assertLowestTerms(actual);
  const diffNum = absBigInt(actual.num * expected.den - expected.num * actual.den);
  const diffDen = actual.den * expected.den;
  assert.ok(
    diffNum * tol.den <= tol.num * diffDen,
    `Expected |${rationalToNumber(actual)} - ${rationalToNumber(expected)}| <= ${rationalToNumber(tol)}`
  );
}

function addRat(a, b) {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

function subRat(a, b) {
  return addRat(a, { num: -b.num, den: b.den });
}

function mulRat(a, b) {
  const num = a.num * b.num;
  const den = a.den * b.den;
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Independent iterative BigInt reference for atanh series:
 *   2 * sum_{k=0}^{terms-1} ((m - 1) / (m + 1))^(2k + 1) / (2k + 1)
 */
function iterativeAtanhLn(m, terms) {
  const y = (() => {
    const num = m.num - m.den;
    const den = m.num + m.den;
    const g = gcd(num, den);
    return { num: num / g, den: den / g };
  })();
  const y2 = mulRat(y, y);
  let yPow = y;
  let sum = { num: 0n, den: 1n };
  for (let k = 0; k < terms; k++) {
    const denom = BigInt(2 * k + 1);
    sum = addRat(sum, { num: yPow.num, den: yPow.den * denom });
    yPow = mulRat(yPow, y2);
  }
  const doubled = { num: 2n * sum.num, den: sum.den };
  const g = gcd(doubled.num, doubled.den);
  return { num: doubled.num / g, den: doubled.den / g };
}

/**
 * Independent BigInt Taylor series for exp(z) = sum_{k=0}^{terms} z^k / k!
 * used for algebraic inverse check exp(ln(x)) ≈ x.
 */
function expTaylorRational(z, terms) {
  let sum = { num: 1n, den: 1n };
  let term = { num: 1n, den: 1n };
  for (let k = 1; k <= terms; k++) {
    term = mulRat(term, { num: z.num, den: z.den * BigInt(k) });
    sum = addRat(sum, term);
  }
  return sum;
}

describe('lnRationalRecursive', () => {
  describe('exact identities and normalization', () => {
    it('returns exact { num: 0n, den: 1n } for x === 1', () => {
      assert.deepEqual(lnRationalRecursive({ num: 1n, den: 1n }), { num: 0n, den: 1n });
    });

    it('handles unreduced and double-negative forms of 1', () => {
      assert.deepEqual(lnRationalRecursive({ num: 42n, den: 42n }), { num: 0n, den: 1n });
      assert.deepEqual(lnRationalRecursive({ num: -17n, den: -17n }), { num: 0n, den: 1n });
      assert.deepEqual(lnRationalRecursive({ num: 10n ** 50n, den: 10n ** 50n }), { num: 0n, den: 1n });
    });

    it('normalizes unreduced and double-negative positive inputs identically', () => {
      const a = lnRationalRecursive({ num: 3n, den: 2n });
      const b = lnRationalRecursive({ num: 15n, den: 10n });
      const c = lnRationalRecursive({ num: -21n, den: -14n });
      assertLowestTerms(a);
      assert.deepEqual(a, b);
      assert.deepEqual(a, c);
    });
  });

  describe('accuracy against Math.log and lowest-terms invariant', () => {
    const cases = [
      { label: '2', x: { num: 2n, den: 1n }, expected: Math.log(2) },
      { label: '1/2', x: { num: 1n, den: 2n }, expected: Math.log(0.5) },
      { label: '3', x: { num: 3n, den: 1n }, expected: Math.log(3) },
      { label: '10', x: { num: 10n, den: 1n }, expected: Math.log(10) },
      { label: '1/10', x: { num: 1n, den: 10n }, expected: Math.log(0.1) },
      { label: '2/3 (lower reduction boundary)', x: { num: 2n, den: 3n }, expected: Math.log(2 / 3) },
      { label: '4/3 (upper reduction boundary)', x: { num: 4n, den: 3n }, expected: Math.log(4 / 3) },
      { label: '3/4', x: { num: 3n, den: 4n }, expected: Math.log(0.75) },
      { label: '5/4', x: { num: 5n, den: 4n }, expected: Math.log(1.25) },
      { label: '999/1000', x: { num: 999n, den: 1000n }, expected: Math.log(0.999) },
      { label: '1001/1000', x: { num: 1001n, den: 1000n }, expected: Math.log(1.001) },
      { label: '1000', x: { num: 1000n, den: 1n }, expected: Math.log(1000) },
      { label: '1/1000', x: { num: 1n, den: 1000n }, expected: Math.log(0.001) },
      { label: '355/113', x: { num: 355n, den: 113n }, expected: Math.log(355 / 113) },
      { label: 'e approx', x: { num: 2718281828459045n, den: 10n ** 15n }, expected: 1.0 },
    ];

    for (const { label, x, expected } of cases) {
      it(`computes ln(${label}) within 1e-12 in lowest terms`, () => {
        const res = lnRationalRecursive(x);
        assertLowestTerms(res);
        const approx = rationalToNumber(res);
        assert.ok(
          Math.abs(approx - expected) <= 1e-12,
          `ln(${label}): got ${approx}, expected ${expected}, diff=${Math.abs(approx - expected)}`
        );
      });
    }
  });

  describe('independent cross-checks', () => {
    it('matches iterative BigInt atanh series bit-for-bit when fixed terms are specified', () => {
      const inputs = [
        { num: 2n, den: 3n },
        { num: 5n, den: 6n },
        { num: 9n, den: 8n },
        { num: 11n, den: 9n },
        { num: 101n, den: 100n },
      ];
      for (const m of inputs) {
        for (const terms of [1, 2, 5, 8, 13]) {
          const recursive = lnRationalRecursive(m, { terms });
          const iterative = iterativeAtanhLn(m, terms);
          assertLowestTerms(recursive);
          assert.deepEqual(recursive, iterative, `Mismatch for ${m.num}/${m.den} with terms=${terms}`);
        }
      }
    });

    it('satisfies algebraic logarithm identities: product, quotient, reciprocal, power', () => {
      const tol = { num: 1n, den: 10n ** 13n };
      const a = { num: 7n, den: 5n };
      const b = { num: 13n, den: 11n };

      const lnA = lnRationalRecursive(a);
      const lnB = lnRationalRecursive(b);
      const lnAB = lnRationalRecursive(mulRat(a, b));
      const lnADivB = lnRationalRecursive({ num: a.num * b.den, den: a.den * b.num });
      const lnInvA = lnRationalRecursive({ num: a.den, den: a.num });
      const lnA5 = lnRationalRecursive({ num: a.num ** 5n, den: a.den ** 5n });

      assertRationalNear(lnAB, addRat(lnA, lnB), tol);
      assertRationalNear(lnADivB, subRat(lnA, lnB), tol);
      assertRationalNear(lnInvA, { num: -lnA.num, den: lnA.den }, tol);
      assertRationalNear(lnA5, { num: 5n * lnA.num, den: lnA.den }, tol);
    });

    it('satisfies inverse identity exp(ln(x)) ≈ x using independent Taylor exp', () => {
      const tol = { num: 1n, den: 10n ** 12n };
      for (const x of [
        { num: 2n, den: 1n },
        { num: 3n, den: 2n },
        { num: 2n, den: 3n },
        { num: 5n, den: 7n },
      ]) {
        const y = lnRationalRecursive(x);
        const recovered = expTaylorRational(y, 24);
        assertRationalNear(recovered, x, tol);
      }
    });
  });

  describe('high precision and large BigInt inputs', () => {
    it('computes ln(2) to 35 decimal digits with options.precision', () => {
      // ln(2) = 0.6931471805599453094172321214581765680755...
      const expected = {
        num: 6931471805599453094172321214581765680755n,
        den: 10n ** 40n,
      };
      const res = lnRationalRecursive({ num: 2n, den: 1n }, { precision: 35 });
      assertLowestTerms(res);
      assertRationalNear(res, expected, { num: 1n, den: 10n ** 35n });
    });

    it('computes ln(10) to 30 decimal digits with options.tolerance', () => {
      // ln(10) = 2.3025850929940456840179914546843642076011...
      const expected = {
        num: 23025850929940456840179914546843642076011n,
        den: 10n ** 40n,
      };
      const tol = { num: 1n, den: 10n ** 30n };
      const res = lnRationalRecursive({ num: 10n, den: 1n }, { tolerance: tol });
      assertLowestTerms(res);
      assertRationalNear(res, expected, tol);
    });

    it('handles very large and very small BigInt powers accurately without stack overflow', () => {
      const ln2Exact35 = {
        num: 69314718055994530941723212145817657n,
        den: 10n ** 35n,
      };
      const tol = { num: 1n, den: 10n ** 12n };

      const lnBigPow2 = lnRationalRecursive({ num: 2n ** 1000n, den: 1n });
      assertLowestTerms(lnBigPow2);
      assertRationalNear(lnBigPow2, { num: 1000n * ln2Exact35.num, den: ln2Exact35.den }, tol);

      const lnSmallPow2 = lnRationalRecursive({ num: 1n, den: 2n ** 1000n });
      assertLowestTerms(lnSmallPow2);
      assert.deepEqual(lnSmallPow2, { num: -lnBigPow2.num, den: lnBigPow2.den });

      const ln10Exact35 = {
        num: 230258509299404568401799145468436421n,
        den: 10n ** 35n,
      };
      const ln10Pow100 = lnRationalRecursive({ num: 10n ** 100n, den: 1n });
      assertLowestTerms(ln10Pow100);
      assertRationalNear(ln10Pow100, { num: 100n * ln10Exact35.num, den: ln10Exact35.den }, tol);
    });

    it('preserves high relative accuracy for inputs extremely close to 1', () => {
      // ln(1 + 10^-25) = 10^-25 - (1/2) * 10^-50 + ...
      const x = { num: 10n ** 25n + 1n, den: 10n ** 25n };
      const res = lnRationalRecursive(x, { precision: 45 });
      assertLowestTerms(res);
      const expected = { num: 1n, den: 10n ** 25n };
      assertRationalNear(res, expected, { num: 1n, den: 10n ** 49n });
    });

    it('accepts BigInt values for precision and terms options', () => {
      const a = lnRationalRecursive({ num: 3n, den: 2n }, { precision: 18n });
      const b = lnRationalRecursive({ num: 3n, den: 2n }, { precision: 18 });
      assert.deepEqual(a, b);

      const c = lnRationalRecursive({ num: 3n, den: 2n }, { terms: 6n });
      const d = lnRationalRecursive({ num: 3n, den: 2n }, { terms: 6 });
      assert.deepEqual(c, d);
    });
  });

  describe('input validation and error handling', () => {
    it('throws TypeError for non-rational x', () => {
      for (const bad of [null, undefined, 2, '2', true, [], [1n, 2n], { num: 1, den: 1n }, { num: 1n, den: 1 }, {}]) {
        assert.throws(() => lnRationalRecursive(bad), TypeError);
      }
    });

    it('throws RangeError for zero denominator', () => {
      assert.throws(() => lnRationalRecursive({ num: 1n, den: 0n }), RangeError);
      assert.throws(() => lnRationalRecursive({ num: 0n, den: 0n }), RangeError);
    });

    it('throws RangeError for x <= 0', () => {
      assert.throws(() => lnRationalRecursive({ num: 0n, den: 1n }), RangeError);
      assert.throws(() => lnRationalRecursive({ num: 0n, den: -5n }), RangeError);
      assert.throws(() => lnRationalRecursive({ num: -1n, den: 1n }), RangeError);
      assert.throws(() => lnRationalRecursive({ num: -3n, den: 2n }), RangeError);
      assert.throws(() => lnRationalRecursive({ num: 3n, den: -2n }), RangeError);
    });

    it('throws TypeError or RangeError for invalid options', () => {
      const two = { num: 2n, den: 1n };

      // Invalid options container
      for (const bad of [null, 10, '10', []]) {
        assert.throws(() => lnRationalRecursive(two, bad), TypeError);
      }

      // Invalid tolerance
      assert.throws(() => lnRationalRecursive(two, { tolerance: 1e-12 }), TypeError);
      assert.throws(() => lnRationalRecursive(two, { tolerance: { num: 0n, den: 1n } }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { tolerance: { num: -1n, den: 10n } }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { tolerance: { num: 1n, den: 0n } }), RangeError);

      // Invalid precision
      assert.throws(() => lnRationalRecursive(two, { precision: '15' }), TypeError);
      assert.throws(() => lnRationalRecursive(two, { precision: -1 }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { precision: -1n }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { precision: 1.5 }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { precision: Number.NaN }), RangeError);

      // Invalid terms
      assert.throws(() => lnRationalRecursive(two, { terms: '5' }), TypeError);
      assert.throws(() => lnRationalRecursive(two, { terms: 0 }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { terms: 0n }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { terms: -3 }), RangeError);
      assert.throws(() => lnRationalRecursive(two, { terms: 2.5 }), RangeError);

      // Conflicting options
      assert.throws(
        () => lnRationalRecursive(two, { precision: 15, tolerance: { num: 1n, den: 10n ** 15n } }),
        RangeError
      );
      assert.throws(() => lnRationalRecursive(two, { precision: 15, terms: 10 }), RangeError);
      assert.throws(
        () => lnRationalRecursive(two, { terms: 10, tolerance: { num: 1n, den: 10n ** 15n } }),
        RangeError
      );
    });
  });
});
