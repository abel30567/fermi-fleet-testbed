import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { combinationsRationalSeries } from './combinationsRationalSeries.js';

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function makeRat(num, den = 1n) {
  if (den === 0n) throw new RangeError('Zero denominator');
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

function addRat(a, b) {
  return makeRat(a.num * b.den + b.num * a.den, a.den * b.den);
}

function subRat(a, b) {
  return makeRat(a.num * b.den - b.num * a.den, a.den * b.den);
}

function mulRat(a, b) {
  return makeRat(a.num * b.num, a.den * b.den);
}

function factorial(n) {
  let acc = 1n;
  for (let i = 2n; i <= n; i++) {
    acc *= i;
  }
  return acc;
}

function assertNormalized(r) {
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, `expected zero as 0n/1n, got 0n/${r.den}`);
  } else {
    assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`);
  }
}

/**
 * Independent naive reference: compute unreduced product prod_{j=0}^{k-1}(p - j*q)
 * divided by (q^k * k!) and reduce once at the end.
 */
function naiveGeneralizedBinomial(x, k) {
  const { num: p, den: q } = makeRat(x.num, x.den);
  const K = BigInt(k);
  let num = 1n;
  let fact = 1n;
  for (let j = 0n; j < K; j++) {
    num *= p - j * q;
    fact *= j + 1n;
  }
  return makeRat(num, fact * q ** K);
}

describe('combinationsRationalSeries', () => {
  describe('normal cases: integer and rational arguments', () => {
    it('computes standard non-negative integer combinations', () => {
      assert.deepEqual(combinationsRationalSeries({ num: 5n, den: 1n }, 2), { num: 10n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 10n, den: 1n }, 3), { num: 120n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 10n, den: 1n }, 7n), { num: 120n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 50n, den: 1n }, 25), {
        num: 126410606437752n,
        den: 1n,
      });
      // Exceeds Number.MAX_SAFE_INTEGER
      assert.deepEqual(combinationsRationalSeries({ num: 100n, den: 1n }, 50), {
        num: 100891344545564193334812497256n,
        den: 1n,
      });
    });

    it('computes Newton binomial series coefficients for x = 1/2', () => {
      const expected = [
        { num: 1n, den: 1n },
        { num: 1n, den: 2n },
        { num: -1n, den: 8n },
        { num: 1n, den: 16n },
        { num: -5n, den: 128n },
        { num: 7n, den: 256n },
      ];
      const half = { num: 1n, den: 2n };
      for (let k = 0; k < expected.length; k++) {
        const res = combinationsRationalSeries(half, k);
        assertNormalized(res);
        assert.deepEqual(res, expected[k]);
      }
    });

    it('computes generalized binomial coefficients for x = -1/2 and general rationals', () => {
      const negHalfExpected = [
        { num: 1n, den: 1n },
        { num: -1n, den: 2n },
        { num: 3n, den: 8n },
        { num: -5n, den: 16n },
        { num: 35n, den: 128n },
        { num: -63n, den: 256n },
      ];
      for (let k = 0; k < negHalfExpected.length; k++) {
        const res = combinationsRationalSeries({ num: -1n, den: 2n }, k);
        assertNormalized(res);
        assert.deepEqual(res, negHalfExpected[k]);
      }

      // C(1/3, 3) = (1/3)(-2/3)(-5/3)/6 = 10/162 = 5/81
      assert.deepEqual(combinationsRationalSeries({ num: 1n, den: 3n }, 3), { num: 5n, den: 81n });
      // C(3/2, 4) = (3/2)(1/2)(-1/2)(-3/2)/24 = 9 / (16 * 24) = 3/128
      assert.deepEqual(combinationsRationalSeries({ num: 3n, den: 2n }, 4), { num: 3n, den: 128n });
      // C(-2/5, 3) = (-2/5)(-7/5)(-12/5)/6 = -168 / 750 = -28/125
      assert.deepEqual(combinationsRationalSeries({ num: -2n, den: 5n }, 3), { num: -28n, den: 125n });
    });

    it('normalizes unreduced inputs and negative denominators cleanly', () => {
      // 6/4 === 3/2, -6/-4 === 3/2
      const a = combinationsRationalSeries({ num: 6n, den: 4n }, 4);
      const b = combinationsRationalSeries({ num: -6n, den: -4n }, 4);
      assertNormalized(a);
      assertNormalized(b);
      assert.deepEqual(a, { num: 3n, den: 128n });
      assert.deepEqual(b, { num: 3n, den: 128n });

      // 1 / -2 === -1/2
      const c = combinationsRationalSeries({ num: 1n, den: -2n }, 3);
      assertNormalized(c);
      assert.deepEqual(c, { num: -5n, den: 16n });

      // 10 / 2 === 5 (integer path after normalization)
      assert.deepEqual(combinationsRationalSeries({ num: 10n, den: 2n }, 2), { num: 10n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 10n, den: 2n }, 6), { num: 0n, den: 1n });

      // 0 / -7 === 0/1
      assert.deepEqual(combinationsRationalSeries({ num: 0n, den: -7n }, 0), { num: 1n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 0n, den: -7n }, 4), { num: 0n, den: 1n });
    });
  });

  describe('edge cases and boundaries', () => {
    it('returns 1/1 for k = 0 (number, -0, bigint) across all x', () => {
      const xs = [
        { num: 0n, den: 1n },
        { num: 7n, den: 1n },
        { num: -7n, den: 1n },
        { num: 1n, den: 2n },
        { num: -5n, den: 3n },
      ];
      for (const x of xs) {
        assert.deepEqual(combinationsRationalSeries(x, 0), { num: 1n, den: 1n });
        assert.deepEqual(combinationsRationalSeries(x, -0), { num: 1n, den: 1n });
        assert.deepEqual(combinationsRationalSeries(x, 0n), { num: 1n, den: 1n });
      }
    });

    it('handles x = 0 and k > n for non-negative integers (including very large k)', () => {
      assert.deepEqual(combinationsRationalSeries({ num: 0n, den: 1n }, 1), { num: 0n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 0n, den: 1n }, 1000000n), { num: 0n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 5n, den: 1n }, 5), { num: 1n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 5n, den: 1n }, 6), { num: 0n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: 5n, den: 1n }, 1000000000n), { num: 0n, den: 1n });
    });

    it('handles negative integers via upper negation (including large k)', () => {
      // C(-1, k) = (-1)^k
      assert.deepEqual(combinationsRationalSeries({ num: -1n, den: 1n }, 0), { num: 1n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: -1n, den: 1n }, 1), { num: -1n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: -1n, den: 1n }, 1000000n), { num: 1n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: -1n, den: 1n }, 1000001n), { num: -1n, den: 1n });

      // C(-2, k) = (-1)^k * (k + 1)
      assert.deepEqual(combinationsRationalSeries({ num: -2n, den: 1n }, 3), { num: -4n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: -2n, den: 1n }, 1000000n), {
        num: 1000001n,
        den: 1n,
      });

      // C(-5, 3) = -C(7, 3) = -35; C(-5, 4) = C(8, 4) = 70
      assert.deepEqual(combinationsRationalSeries({ num: -5n, den: 1n }, 3), { num: -35n, den: 1n });
      assert.deepEqual(combinationsRationalSeries({ num: -5n, den: 1n }, 4), { num: 70n, den: 1n });
    });

    it('does not mutate the input rational object', () => {
      const input = { num: -6n, den: -4n };
      combinationsRationalSeries(input, 3);
      assert.deepEqual(input, { num: -6n, den: -4n });
    });
  });

  describe('input validation', () => {
    it('throws TypeError for invalid x objects or non-bigint components', () => {
      const badXs = [
        null,
        undefined,
        5,
        5n,
        '1/2',
        {},
        { num: 1, den: 2 },
        { num: 1n, den: 2 },
        { num: 1, den: 2n },
        { num: 1n },
        { den: 1n },
      ];
      for (const badX of badXs) {
        assert.throws(() => combinationsRationalSeries(badX, 2), TypeError);
      }
    });

    it('throws RangeError when x.den === 0n', () => {
      assert.throws(() => combinationsRationalSeries({ num: 1n, den: 0n }, 2), RangeError);
      assert.throws(() => combinationsRationalSeries({ num: 0n, den: 0n }, 0), RangeError);
    });

    it('throws TypeError for non-number / non-bigint k', () => {
      const x = { num: 1n, den: 2n };
      for (const badK of ['2', null, undefined, {}, true, { num: 2n, den: 1n }]) {
        assert.throws(() => combinationsRationalSeries(x, badK), TypeError);
      }
    });

    it('throws RangeError for negative, fractional, non-finite, or unsafe k', () => {
      const x = { num: 1n, den: 2n };
      for (const badK of [-1, -100, -1n, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => combinationsRationalSeries(x, badK), RangeError);
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches factorial formula n! / (k! * (n - k)!) for all 0 <= k <= n <= 20', () => {
      for (let n = 0n; n <= 20n; n++) {
        const nf = factorial(n);
        for (let k = 0n; k <= n; k++) {
          const expected = { num: nf / (factorial(k) * factorial(n - k)), den: 1n };
          const actual = combinationsRationalSeries({ num: n, den: 1n }, k);
          assertNormalized(actual);
          assert.deepEqual(actual, expected, `mismatch at C(${n}, ${k})`);
        }
      }
    });

    it("satisfies Pascal's identity C(x, k) = C(x - 1, k - 1) + C(x - 1, k) for integers and rationals", () => {
      const one = { num: 1n, den: 1n };
      const testXs = [
        { num: 0n, den: 1n },
        { num: 6n, den: 1n },
        { num: -4n, den: 1n },
        { num: 1n, den: 2n },
        { num: -1n, den: 2n },
        { num: 1n, den: 3n },
        { num: -2n, den: 3n },
        { num: 5n, den: 4n },
        { num: -7n, den: 6n },
        { num: 11n, den: 5n },
      ];
      for (const x of testXs) {
        const xm1 = subRat(x, one);
        for (let k = 1; k <= 12; k++) {
          const lhs = combinationsRationalSeries(x, k);
          const rhs = addRat(
            combinationsRationalSeries(xm1, k - 1),
            combinationsRationalSeries(xm1, k),
          );
          assertNormalized(lhs);
          assert.deepEqual(lhs, rhs, `Pascal mismatch at x=${x.num}/${x.den}, k=${k}`);
        }
      }
    });

    it('matches naive unreduced falling-factorial reference for rationals', () => {
      const testXs = [
        { num: 1n, den: 2n },
        { num: -3n, den: 4n },
        { num: 7n, den: 3n },
        { num: -11n, den: 6n },
        { num: 13n, den: 7n },
        { num: -5n, den: 1n },
        { num: 8n, den: 1n },
      ];
      for (const x of testXs) {
        for (let k = 0; k <= 14; k++) {
          const actual = combinationsRationalSeries(x, k);
          const expected = naiveGeneralizedBinomial(x, k);
          assertNormalized(actual);
          assert.deepEqual(actual, expected, `naive mismatch at x=${x.num}/${x.den}, k=${k}`);
        }
      }
    });

    it('matches closed-form central binomial identity C(-1/2, k) = (-1)^k * C(2k, k) / 4^k', () => {
      for (let k = 0n; k <= 20n; k++) {
        const actual = combinationsRationalSeries({ num: -1n, den: 2n }, k);
        const central = factorial(2n * k) / (factorial(k) * factorial(k));
        const sign = (k & 1n) === 1n ? -1n : 1n;
        const expected = makeRat(sign * central, 4n ** k);
        assertNormalized(actual);
        assert.deepEqual(actual, expected, `central binomial mismatch at k=${k}`);
      }
    });

    it('satisfies Vandermonde / Newton binomial series convolution sum_{j=0}^k C(x, j) C(y, k - j) = C(x + y, k)', () => {
      const pairs = [
        [{ num: 1n, den: 2n }, { num: 1n, den: 2n }],   // (1+t)^(1/2) * (1+t)^(1/2) = 1 + t
        [{ num: 1n, den: 2n }, { num: -1n, den: 2n }],  // (1+t)^(1/2) * (1+t)^(-1/2) = 1
        [{ num: 1n, den: 3n }, { num: 2n, den: 3n }],   // sum = 1
        [{ num: -3n, den: 4n }, { num: 5n, den: 6n }],  // sum = 1/12
        [{ num: -3n, den: 1n }, { num: 7n, den: 2n }],  // sum = 1/2
      ];
      for (const [x, y] of pairs) {
        const sumXY = addRat(x, y);
        for (let k = 0; k <= 10; k++) {
          let conv = { num: 0n, den: 1n };
          for (let j = 0; j <= k; j++) {
            const term = mulRat(
              combinationsRationalSeries(x, j),
              combinationsRationalSeries(y, k - j),
            );
            conv = addRat(conv, term);
          }
          const expected = combinationsRationalSeries(sumXY, k);
          assert.deepEqual(
            conv,
            expected,
            `Vandermonde mismatch at x=${x.num}/${x.den}, y=${y.num}/${y.den}, k=${k}`,
          );
        }
      }
    });

    it('satisfies upper negation C(x, k) = (-1)^k C(k - x - 1, k) and absorption k*C(x, k) = x*C(x - 1, k - 1)', () => {
      const xs = [
        { num: 1n, den: 2n },
        { num: -2n, den: 5n },
        { num: 9n, den: 4n },
        { num: -3n, den: 1n },
      ];
      const one = { num: 1n, den: 1n };
      for (const x of xs) {
        const xm1 = subRat(x, one);
        for (let k = 1n; k <= 10n; k++) {
          const cxk = combinationsRationalSeries(x, k);

          // Upper negation: C(x, k) = (-1)^k * C(k - x - 1, k)
          const shifted = subRat({ num: k - 1n, den: 1n }, x);
          const negSide = combinationsRationalSeries(shifted, k);
          const signedNegSide =
            (k & 1n) === 1n ? { num: -negSide.num, den: negSide.den } : negSide;
          assert.deepEqual(cxk, signedNegSide, `upper negation mismatch at x=${x.num}/${x.den}, k=${k}`);

          // Absorption: k * C(x, k) = x * C(x - 1, k - 1)
          const lhsAbs = mulRat({ num: k, den: 1n }, cxk);
          const rhsAbs = mulRat(x, combinationsRationalSeries(xm1, k - 1n));
          assert.deepEqual(lhsAbs, rhsAbs, `absorption mismatch at x=${x.num}/${x.den}, k=${k}`);
        }
      }
    });
  });
});
