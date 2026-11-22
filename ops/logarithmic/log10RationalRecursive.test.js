import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10RationalRecursive } from './log10RationalRecursive.js';

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

function assertLowestTerms(r) {
  assert.equal(typeof r, 'object');
  assert.notEqual(r, null);
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`);
  assert.equal(gcd(r.num, r.den), 1n, `Expected gcd(|${r.num}|, ${r.den}) === 1n`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, `Expected zero as 0n/1n, got 0n/${r.den}`);
  }
}

/**
 * Converts an exact rational to a JS Number safely even when num and den
 * exceed Number.MAX_SAFE_INTEGER / 1e308 by scaling with BigInt division.
 */
function rationalToNumber(r) {
  const scale = 10n ** 18n;
  const scaled = (r.num * scale) / r.den;
  return Number(scaled) / 1e18;
}

/**
 * Checks |a - b| <= tolNum / tolDen purely in exact BigInt arithmetic.
 */
function assertRationalClose(a, b, tolNum, tolDen) {
  const diffNum = a.num * b.den - b.num * a.den;
  const absDiffNum = diffNum < 0n ? -diffNum : diffNum;
  const diffDen = a.den * b.den;
  assert.ok(
    absDiffNum * tolDen <= tolNum * diffDen,
    `Expected |${rationalToNumber(a)} - ${rationalToNumber(b)}| <= ${Number(tolNum) / Number(tolDen)}`
  );
}

function addRat(a, b) {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Independent iterative BigInt reference for ln(y) using direct iterative
 * power-series summation of 2 * sum_{k=0}^{terms-1} z^(2k+1) / (2k+1)
 * after simple iterative halving into [1, 2).
 */
function iterativeLnRef(num, den, terms = 40) {
  let p = num;
  let q = den;
  let c2 = 0n;
  while (p >= 2n * q) {
    q *= 2n;
    c2 += 1n;
  }
  while (p < q) {
    p *= 2n;
    c2 -= 1n;
  }
  function atanhIter(u, v, n) {
    let sumNum = 0n;
    let sumDen = 1n;
    let powU = u;
    let powV = v;
    const u2 = u * u;
    const v2 = v * v;
    for (let k = 0; k < n; k++) {
      const termDen = BigInt(2 * k + 1) * powV;
      sumNum = sumNum * termDen + powU * sumDen;
      sumDen = sumDen * termDen;
      const g = gcd(sumNum, sumDen);
      sumNum /= g;
      sumDen /= g;
      powU *= u2;
      powV *= v2;
    }
    const resNum = 2n * sumNum;
    const g = gcd(resNum, sumDen);
    return { num: resNum / g, den: sumDen / g };
  }
  const ln2 = atanhIter(1n, 3n, terms); // 2 * atanh((2-1)/(2+1)) = 2 * atanh(1/3)
  const lnRem = p === q ? { num: 0n, den: 1n } : atanhIter(p - q, p + q, terms);
  const scaledLn2 = { num: c2 * ln2.num, den: ln2.den };
  return addRat(scaledLn2, lnRem);
}

function iterativeLog10Ref(num, den, terms = 40) {
  const lnX = iterativeLnRef(num, den, terms);
  const ln10 = iterativeLnRef(10n, 1n, terms);
  const n = lnX.num * ln10.den;
  const d = lnX.den * ln10.num;
  const g = gcd(n, d);
  return d < 0n ? { num: -n / g, den: -d / g } : { num: n / g, den: d / g };
}

describe('log10RationalRecursive', () => {
  describe('exact integer powers of 10', () => {
    it('detects 1, positive powers of 10, and negative powers of 10 exactly', () => {
      const cases = [
        [{ num: 1n, den: 1n }, { num: 0n, den: 1n }],
        [{ num: 10n, den: 1n }, { num: 1n, den: 1n }],
        [{ num: 100n, den: 1n }, { num: 2n, den: 1n }],
        [{ num: 1000n, den: 1n }, { num: 3n, den: 1n }],
        [{ num: 1000000n, den: 1n }, { num: 6n, den: 1n }],
        [{ num: 1n, den: 10n }, { num: -1n, den: 1n }],
        [{ num: 1n, den: 100n }, { num: -2n, den: 1n }],
        [{ num: 1n, den: 1000n }, { num: -3n, den: 1n }],
        [{ num: 1n, den: 10000000n }, { num: -7n, den: 1n }],
      ];
      for (const [input, expected] of cases) {
        const res = log10RationalRecursive(input);
        assertLowestTerms(res);
        assert.deepEqual(res, expected);
      }
    });

    it('detects huge BigInt integer powers of 10 quickly via divide-and-conquer reduction', () => {
      for (const exp of [50n, 250n, 1000n]) {
        const pow = 10n ** exp;
        const pos = log10RationalRecursive({ num: pow, den: 1n });
        assertLowestTerms(pos);
        assert.deepEqual(pos, { num: exp, den: 1n });

        const neg = log10RationalRecursive({ num: 1n, den: pow });
        assertLowestTerms(neg);
        assert.deepEqual(neg, { num: -exp, den: 1n });
      }
    });
  });

  describe('unreduced and negative-denominator inputs', () => {
    it('normalizes unreduced fractions and double-negative rationals', () => {
      assert.deepEqual(log10RationalRecursive({ num: 7n, den: 7n }), { num: 0n, den: 1n });
      assert.deepEqual(log10RationalRecursive({ num: -7n, den: -7n }), { num: 0n, den: 1n });
      assert.deepEqual(log10RationalRecursive({ num: 300n, den: 3n }), { num: 2n, den: 1n });
      assert.deepEqual(log10RationalRecursive({ num: -1000n, den: -10n }), { num: 2n, den: 1n });
      assert.deepEqual(log10RationalRecursive({ num: -5n, den: -5000n }), { num: -3n, den: 1n });

      const a = log10RationalRecursive({ num: 2n, den: 1n });
      const b = log10RationalRecursive({ num: 6n, den: 3n });
      const c = log10RationalRecursive({ num: -14n, den: -7n });
      assertLowestTerms(a);
      assert.deepEqual(a, b);
      assert.deepEqual(a, c);
    });
  });

  describe('general positive rationals across all range-reduction branches', () => {
    it('matches Math.log10 to within 1e-12 across all intervals and signs', () => {
      const inputs = [
        // Exact powers of 2 in [1, 10)
        { num: 2n, den: 1n },
        { num: 4n, den: 1n },
        { num: 8n, den: 1n },
        // Branch (1, 9/8)
        { num: 17n, den: 16n },
        { num: 101n, den: 100n },
        { num: 1000001n, den: 1000000n },
        // Branch [9/8, 3/2)
        { num: 9n, den: 8n },
        { num: 5n, den: 4n },
        { num: 4n, den: 3n },
        { num: 7n, den: 5n },
        { num: 5n, den: 1n },
        { num: 50n, den: 1n },
        // Branch [3/2, 7/4)
        { num: 3n, den: 2n },
        { num: 13n, den: 8n },
        { num: 3n, den: 1n },
        { num: 6n, den: 1n },
        { num: 7n, den: 2n },
        // Branch [7/4, 2)
        { num: 7n, den: 4n },
        { num: 15n, den: 8n },
        { num: 7n, den: 1n },
        { num: 9n, den: 1n },
        { num: 999n, den: 100n },
        // Values in (0, 1)
        { num: 1n, den: 2n },
        { num: 1n, den: 3n },
        { num: 1n, den: 5n },
        { num: 2n, den: 5n },
        { num: 3n, den: 7n },
        { num: 7n, den: 13n },
        { num: 1n, den: 200n },
        { num: 99n, den: 10000n },
        // Boundary values near 1 and 10
        { num: 999999999999999n, den: 100000000000000n },
        { num: 1000000000000001n, den: 1000000000000000n },
      ];

      for (const x of inputs) {
        const res = log10RationalRecursive(x);
        assertLowestTerms(res);
        const approx = rationalToNumber(res);
        const expected = Math.log10(Number(x.num) / Number(x.den));
        assert.ok(
          Math.abs(approx - expected) <= 1e-12,
          `log10(${x.num}/${x.den}): got ${approx}, expected ${expected}`
        );
      }
    });
  });

  describe('cross-checks against independent reference and algebraic identities', () => {
    it('matches independent iterative BigInt atanh reference to <= 1e-15', () => {
      const testPairs = [
        [2n, 1n],
        [3n, 1n],
        [7n, 13n],
        [355n, 113n],
        [12345n, 67n],
        [17n, 10000n],
      ];
      for (const [num, den] of testPairs) {
        const res = log10RationalRecursive({ num, den });
        const ref = iterativeLog10Ref(num, den, 45);
        assertLowestTerms(res);
        assertRationalClose(res, ref, 1n, 10n ** 15n);
      }
    });

    it('matches known 35-digit values of log10(2), log10(3), and log10(7) at high precision', () => {
      // Known exact decimal prefixes (35 digits):
      // log10(2) = 0.30102999566398119521373889472449302...
      // log10(3) = 0.47712125471966243729502790325511530...
      // log10(7) = 0.84509804001425683071221625859263619...
      const scale35 = 10n ** 35n;
      const known = [
        [2n, { num: 30102999566398119521373889472449302n, den: scale35 }],
        [3n, { num: 47712125471966243729502790325511530n, den: scale35 }],
        [7n, { num: 84509804001425683071221625859263619n, den: scale35 }],
      ];
      for (const [n, exactPrefix] of known) {
        const res = log10RationalRecursive({ num: n, den: 1n }, 30);
        assertLowestTerms(res);
        assertRationalClose(res, exactPrefix, 1n, 10n ** 30n);
      }
    });

    it('satisfies algebraic logarithm identities in exact rational arithmetic', () => {
      // log10(2) + log10(5) = log10(10) = 1
      const l2 = log10RationalRecursive({ num: 2n, den: 1n }, 20);
      const l5 = log10RationalRecursive({ num: 5n, den: 1n }, 20);
      assertRationalClose(addRat(l2, l5), { num: 1n, den: 1n }, 1n, 10n ** 20n);

      // log10(a * b) = log10(a) + log10(b)
      const la = log10RationalRecursive({ num: 3n, den: 7n }, 20);
      const lb = log10RationalRecursive({ num: 11n, den: 5n }, 20);
      const lab = log10RationalRecursive({ num: 33n, den: 35n }, 20);
      assertRationalClose(addRat(la, lb), lab, 1n, 10n ** 19n);

      // Reciprocal identity: log10(1/x) === -log10(x) (exact!)
      const lRecip = log10RationalRecursive({ num: 7n, den: 3n }, 20);
      assert.deepEqual(lRecip, { num: -la.num, den: la.den });

      // Power identity: log10(3^7) = 7 * log10(3)
      const l3 = log10RationalRecursive({ num: 3n, den: 1n }, 20);
      const l3pow7 = log10RationalRecursive({ num: 3n ** 7n, den: 1n }, 20);
      assertRationalClose(
        { num: 7n * l3.num, den: l3.den },
        l3pow7,
        1n,
        10n ** 18n
      );

      // Shift identity: log10(10^12 * 7/3) === 12 + log10(7/3)
      const lShift = log10RationalRecursive({ num: 7n * 10n ** 12n, den: 3n }, 20);
      assert.deepEqual(lShift, addRat({ num: 12n, den: 1n }, lRecip));
    });
  });

  describe('precision and tolerance options', () => {
    it('accepts integer number, bigint, rational tolerance, and options object', () => {
      const ref25 = { num: 301029995663981195213738894724n, den: 10n ** 30n };

      const rNum = log10RationalRecursive({ num: 2n, den: 1n }, 25);
      const rBig = log10RationalRecursive({ num: 2n, den: 1n }, 25n);
      const rTol = log10RationalRecursive(
        { num: 2n, den: 1n },
        { num: 1n, den: 10n ** 25n }
      );
      const rObjPrec = log10RationalRecursive({ num: 2n, den: 1n }, { precision: 25 });
      const rObjTol = log10RationalRecursive(
        { num: 2n, den: 1n },
        { tolerance: { num: 1n, den: 10n ** 25n } }
      );
      const rObjBoth = log10RationalRecursive(
        { num: 2n, den: 1n },
        { precision: 10, tolerance: { num: 1n, den: 10n ** 25n } }
      );
      const rObjEmpty = log10RationalRecursive({ num: 2n, den: 1n }, {});

      for (const r of [rNum, rBig, rTol, rObjPrec, rObjTol, rObjBoth]) {
        assertLowestTerms(r);
        assertRationalClose(r, ref25, 1n, 10n ** 25n);
      }
      assertLowestTerms(rObjEmpty);
      assertRationalClose(rObjEmpty, ref25, 1n, 10n ** 15n);

      // Tolerance >= 1 still returns valid reduced rational
      const rCoarse = log10RationalRecursive({ num: 2n, den: 1n }, { num: 5n, den: 1n });
      assertLowestTerms(rCoarse);
      assertRationalClose(rCoarse, ref25, 1n, 10n);
    });
  });

  describe('large BigInt inputs and performance', () => {
    it('handles huge BigInt numerators and denominators accurately and quickly', () => {
      const start = performance.now();

      // x = 1 + 10^-80 => log10(x) ≈ 10^-80 / ln(10)
      const bigDen = 10n ** 80n;
      const nearOne = log10RationalRecursive({ num: bigDen + 1n, den: bigDen });
      assertLowestTerms(nearOne);
      assert.ok(nearOne.num > 0n);
      // 0 < log10(1 + 10^-80) < 10^-80
      assert.ok(nearOne.num * bigDen < nearOne.den);

      // x = 2 * 10^300 => log10(x) = 300 + log10(2)
      const huge = log10RationalRecursive({ num: 2n * 10n ** 300n, den: 1n });
      assertLowestTerms(huge);
      const l2 = log10RationalRecursive({ num: 2n, den: 1n });
      assert.deepEqual(huge, addRat({ num: 300n, den: 1n }, l2));

      // Large arbitrary 120-bit rational
      const arb = log10RationalRecursive({
        num: 123456789012345678901234567890123456n,
        den: 98765432109876543210987654321n,
      });
      assertLowestTerms(arb);
      const expectedArb = Math.log10(
        123456789012345678901234567890123456 / 98765432109876543210987654321
      );
      assert.ok(Math.abs(rationalToNumber(arb) - expectedArb) <= 1e-12);

      const elapsedMs = performance.now() - start;
      assert.ok(elapsedMs < 1000, `Expected < 1000ms, took ${elapsedMs.toFixed(1)}ms`);
    });
  });

  describe('input validation and error handling', () => {
    it('throws TypeError for non-rational x inputs', () => {
      const invalidX = [
        null,
        undefined,
        10,
        '10',
        10n,
        true,
        [10n, 1n],
        {},
        { num: 10, den: 1n },
        { num: 10n, den: 1 },
        { num: '10', den: '1' },
      ];
      for (const bad of invalidX) {
        assert.throws(() => log10RationalRecursive(bad), TypeError);
      }
    });

    it('throws RangeError for zero denominator or non-positive x (x <= 0)', () => {
      const outOfRange = [
        { num: 1n, den: 0n },
        { num: 0n, den: 0n },
        { num: -5n, den: 0n },
        { num: 0n, den: 1n },
        { num: 0n, den: -7n },
        { num: -1n, den: 1n },
        { num: 1n, den: -1n },
        { num: -100n, den: 3n },
        { num: 100n, den: -3n },
      ];
      for (const bad of outOfRange) {
        assert.throws(() => log10RationalRecursive(bad), RangeError);
      }
    });

    it('throws TypeError or RangeError for invalid precision/options arguments', () => {
      const x = { num: 2n, den: 1n };

      const typeBad = [
        null,
        '15',
        true,
        [],
        { foo: 15 },
        { precision: '15' },
        { tolerance: 1e-12 },
        { num: 1, den: 10n },
      ];
      for (const opt of typeBad) {
        assert.throws(() => log10RationalRecursive(x, opt), TypeError);
      }

      const rangeBad = [
        0,
        -5,
        1.5,
        NaN,
        Infinity,
        -Infinity,
        0n,
        -3n,
        { num: 0n, den: 1n },
        { num: -1n, den: 10n },
        { num: 1n, den: 0n },
        { precision: 0 },
        { precision: -2n },
        { tolerance: { num: 0n, den: 1n } },
        { tolerance: { num: -1n, den: 100n } },
        { tolerance: { num: 1n, den: 0n } },
      ];
      for (const opt of rangeBad) {
        assert.throws(() => log10RationalRecursive(x, opt), RangeError);
      }
    });
  });
});
