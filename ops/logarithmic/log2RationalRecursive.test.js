import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log2RationalRecursive } from './log2RationalRecursive.js';

/**
 * Iterative Euclidean GCD helper for verifying lowest-terms invariants.
 */
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

/**
 * Asserts the canonical exact rational invariant:
 * - object with BigInt `num` and `den`
 * - `den > 0n`
 * - `gcd(|num|, den) === 1n`
 * - zero represented as `{ num: 0n, den: 1n }`
 */
function assertCanonicalRational(r) {
  assert.equal(typeof r, 'object');
  assert.notEqual(r, null);
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, `Zero must be 0n/1n, got 0n/${r.den}`);
  } else {
    assert.equal(gcd(r.num, r.den), 1n, `Expected reduced fraction, got ${r.num}/${r.den}`);
  }
}

/**
 * Safely converts an arbitrarily large BigInt rational to a JS Number via fixed-point scaling.
 */
function rationalToNumber({ num, den }) {
  const scale = 10n ** 18n;
  const scaled = (num * scale) / den;
  return Number(scaled) / 1e18;
}

/**
 * Computes `|a - b|` as an exact rational `{ num, den }` (non-negative).
 */
function absDiffRational(a, b) {
  const diffNum = a.num * b.den - b.num * a.den;
  return {
    num: diffNum < 0n ? -diffNum : diffNum,
    den: a.den * b.den,
  };
}

/**
 * Checks whether exact rational `a <= b` (with positive denominators).
 */
function rationalLte(a, b) {
  return a.num * b.den <= b.num * a.den;
}

/**
 * Exact rational addition helper for algebraic identity tests.
 */
function addRational(a, b) {
  return {
    num: a.num * b.den + b.num * a.den,
    den: a.den * b.den,
  };
}

/**
 * Exact rational subtraction helper for algebraic identity tests.
 */
function subRational(a, b) {
  return {
    num: a.num * b.den - b.num * a.den,
    den: a.den * b.den,
  };
}

/**
 * Independent iterative reference for `log2(x)` using iterative bit-by-bit
 * squaring extraction (no `atanh`, no recursion) to `bits` fractional bits.
 */
function iterativeBinaryLog2Reference(num, den, bits = 60) {
  let n = num;
  let d = den;
  let intPart = 0n;
  while (n >= d * 2n) {
    d *= 2n;
    intPart += 1n;
  }
  while (n < d) {
    n *= 2n;
    intPart -= 1n;
  }
  // Now 1 <= n / d < 2; extract `bits` fractional binary digits by repeated squaring.
  let frac = 0n;
  const scale = 1n << BigInt(bits);
  // Keep precision bounded with fixed-point scaling (extra guard bits)
  const guard = 20n;
  const fpShift = BigInt(bits) + guard;
  let r = (n << fpShift) / d;
  const two = 2n << fpShift;
  for (let i = 0; i < bits; i += 1) {
    r = (r * r) >> fpShift;
    frac <<= 1n;
    if (r >= two) {
      frac |= 1n;
      r >>= 1n;
    }
  }
  return {
    num: intPart * scale + frac,
    den: scale,
  };
}

describe('log2RationalRecursive', () => {
  describe('exact powers of 2', () => {
    it('returns exact integer rationals for 1 and positive powers of 2', () => {
      const cases = [
        [{ num: 1n, den: 1n }, 0n],
        [{ num: 2n, den: 1n }, 1n],
        [{ num: 4n, den: 1n }, 2n],
        [{ num: 8n, den: 1n }, 3n],
        [{ num: 16n, den: 1n }, 4n],
        [{ num: 1024n, den: 1n }, 10n],
        [{ num: 1n << 64n, den: 1n }, 64n],
        [{ num: 1n << 256n, den: 1n }, 256n],
        [{ num: 1n << 5000n, den: 1n }, 5000n],
      ];
      for (const [input, expected] of cases) {
        const res = log2RationalRecursive(input);
        assertCanonicalRational(res);
        assert.deepEqual(res, { num: expected, den: 1n });
      }
    });

    it('returns exact negative integer rationals for negative powers of 2', () => {
      const cases = [
        [{ num: 1n, den: 2n }, -1n],
        [{ num: 1n, den: 4n }, -2n],
        [{ num: 1n, den: 8n }, -3n],
        [{ num: 1n, den: 16n }, -4n],
        [{ num: 1n, den: 1024n }, -10n],
        [{ num: 1n, den: 1n << 64n }, -64n],
        [{ num: 1n, den: 1n << 5000n }, -5000n],
      ];
      for (const [input, expected] of cases) {
        const res = log2RationalRecursive(input);
        assertCanonicalRational(res);
        assert.deepEqual(res, { num: expected, den: 1n });
      }
    });

    it('handles unreduced and double-negative exact power-of-2 inputs', () => {
      const cases = [
        [{ num: 24n, den: 3n }, 3n],
        [{ num: -40n, den: -5n }, 3n],
        [{ num: 7n, den: 112n }, -4n],
        [{ num: -9n, den: -9n }, 0n],
        [{ num: 100n * (1n << 30n), den: 100n }, 30n],
        [{ num: -13n, den: -13n * (1n << 30n) }, -30n],
      ];
      for (const [input, expected] of cases) {
        const res = log2RationalRecursive(input);
        assertCanonicalRational(res);
        assert.deepEqual(res, { num: expected, den: 1n });
      }
    });
  });

  describe('general positive rationals and Math.log2 cross-check', () => {
    it('accurately computes log2 within 1e-12 for diverse positive rationals', () => {
      const inputs = [
        { num: 3n, den: 1n },
        { num: 5n, den: 1n },
        { num: 10n, den: 1n },
        { num: 100n, den: 1n },
        { num: 3n, den: 2n },
        { num: 5n, den: 4n },
        { num: 7n, den: 4n },
        { num: 1999n, den: 1000n },
        { num: 1001n, den: 1000n },
        { num: 1n, den: 3n },
        { num: 2n, den: 3n },
        { num: 3n, den: 5n },
        { num: 1n, den: 10n },
        { num: 1n, den: 1000n },
        { num: 355n, den: 113n },
        { num: -30n, den: -20n }, // unreduced double-negative 3/2
        { num: 999999n, den: 123456n },
      ];

      for (const x of inputs) {
        const res = log2RationalRecursive(x);
        assertCanonicalRational(res);
        const approx = rationalToNumber(res);
        const expected = Math.log2(Number(x.num) / Number(x.den));
        const err = Math.abs(approx - expected);
        assert.ok(
          err <= 1e-12,
          `Error too large for ${x.num}/${x.den}: got ${approx}, expected ${expected}, err=${err}`,
        );
      }
    });

    it('matches independent iterative binary-squaring reference algorithm', () => {
      const inputs = [
        { num: 3n, den: 1n },
        { num: 7n, den: 5n },
        { num: 11n, den: 17n },
        { num: 1234567n, den: 891011n },
        { num: 1n, den: 999n },
        { num: 1000003n, den: 1n },
      ];
      const tol = { num: 1n, den: 10n ** 14n };
      for (const x of inputs) {
        const recursiveRes = log2RationalRecursive(x);
        assertCanonicalRational(recursiveRes);
        const refRes = iterativeBinaryLog2Reference(x.num, x.den, 60);
        const diff = absDiffRational(recursiveRes, refRes);
        assert.ok(
          rationalLte(diff, tol),
          `Mismatch vs iterative reference for ${x.num}/${x.den}: diff=${rationalToNumber(diff)}`,
        );
      }
    });
  });

  describe('algebraic logarithm identities', () => {
    it('satisfies log2(a * b) = log2(a) + log2(b)', () => {
      const a = { num: 3n, den: 5n };
      const b = { num: 7n, den: 11n };
      const ab = { num: a.num * b.num, den: a.den * b.den };

      const lhs = log2RationalRecursive(ab);
      const rhs = addRational(log2RationalRecursive(a), log2RationalRecursive(b));
      const diff = absDiffRational(lhs, rhs);
      assert.ok(rationalLte(diff, { num: 1n, den: 10n ** 14n }));
    });

    it('satisfies log2(a / b) = log2(a) - log2(b)', () => {
      const a = { num: 13n, den: 7n };
      const b = { num: 19n, den: 23n };
      const aDivB = { num: a.num * b.den, den: a.den * b.num };

      const lhs = log2RationalRecursive(aDivB);
      const rhs = subRational(log2RationalRecursive(a), log2RationalRecursive(b));
      const diff = absDiffRational(lhs, rhs);
      assert.ok(rationalLte(diff, { num: 1n, den: 10n ** 14n }));
    });

    it('satisfies log2(1 / x) = -log2(x) and log2(x^5) = 5 * log2(x)', () => {
      const x = { num: 5n, den: 3n };
      const invX = { num: 3n, den: 5n };
      const logX = log2RationalRecursive(x);
      const logInvX = log2RationalRecursive(invX);
      const sum = addRational(logX, logInvX);
      assert.ok(rationalLte(absDiffRational(sum, { num: 0n, den: 1n }), { num: 1n, den: 10n ** 14n }));

      const x5 = { num: 5n ** 5n, den: 3n ** 5n };
      const logX5 = log2RationalRecursive(x5);
      const fiveLogX = { num: 5n * logX.num, den: logX.den };
      assert.ok(rationalLte(absDiffRational(logX5, fiveLogX), { num: 1n, den: 10n ** 13n }));
    });
  });

  describe('large BigInts and boundary values', () => {
    it('handles very large BigInt inputs beyond IEEE-754 double range', () => {
      // 3 * 2^1200 => log2 = 1200 + log2(3)
      const bigPos = { num: 3n * (1n << 1200n), den: 1n };
      const resPos = log2RationalRecursive(bigPos);
      assertCanonicalRational(resPos);
      const log3 = log2RationalRecursive({ num: 3n, den: 1n });
      const expectedPos = addRational({ num: 1200n, den: 1n }, log3);
      assert.deepEqual(resPos, expectedPos);

      // 3 / 2^1200 => log2 = -1200 + log2(3)
      const bigNeg = { num: 3n, den: 1n << 1200n };
      const resNeg = log2RationalRecursive(bigNeg);
      assertCanonicalRational(resNeg);
      const expectedNeg = addRational({ num: -1200n, den: 1n }, log3);
      assert.deepEqual(resNeg, expectedNeg);
    });

    it('handles rationals extremely close to 1 and extremely close to 2', () => {
      // x = 1 + 10^-50 => log2(x) ≈ 10^-50 / ln(2) ≈ 1.4426950408889634 * 10^-50
      const eps = 10n ** 50n;
      const nearOne = { num: eps + 1n, den: eps };
      const resNearOne = log2RationalRecursive(nearOne, { precision: 60 });
      assertCanonicalRational(resNearOne);
      assert.ok(resNearOne.num > 0n);
      const scaled = rationalToNumber({ num: resNearOne.num * eps, den: resNearOne.den });
      assert.ok(Math.abs(scaled - 1 / Math.LN2) < 1e-14);

      // x = 2 - 10^-30 => log2(x) is strictly < 1 and very close to 1
      const e30 = 10n ** 30n;
      const nearTwo = { num: 2n * e30 - 1n, den: e30 };
      const resNearTwo = log2RationalRecursive(nearTwo, { precision: 35 });
      assertCanonicalRational(resNearTwo);
      assert.ok(resNearTwo.num < resNearTwo.den, 'log2(2 - eps) must be < 1');
      const oneMinus = subRational({ num: 1n, den: 1n }, resNearTwo);
      const scaledTwo = rationalToNumber({ num: oneMinus.num * e30, den: oneMinus.den });
      // 1 - log2(2 - eps) = -log2(1 - eps/2) ≈ (eps / 2) / ln(2)
      assert.ok(Math.abs(scaledTwo - 0.5 / Math.LN2) < 1e-14);
    });

    it('handles large coprime BigInt ratios accurately and quickly', () => {
      const x = { num: 3n ** 100n, den: 2n ** 150n };
      const start = performance.now();
      const res = log2RationalRecursive(x);
      const elapsed = performance.now() - start;
      assertCanonicalRational(res);
      assert.ok(elapsed < 1000, `Expected fast execution (< 1000ms), took ${elapsed}ms`);
      // log2(3^100 / 2^150) = 100 * log2(3) - 150
      const expected = 100 * Math.log2(3) - 150;
      assert.ok(Math.abs(rationalToNumber(res) - expected) <= 1e-12);
    });
  });

  describe('optional precision, tolerance, and terms parameters', () => {
    it('supports high precision option (40 decimal digits)', () => {
      const res = log2RationalRecursive({ num: 3n, den: 1n }, { precision: 40 });
      assertCanonicalRational(res);
      // Verify against 140-bit iterative binary-squaring reference (~42 decimal digits)
      const ref = iterativeBinaryLog2Reference(3n, 1n, 140);
      const diff = absDiffRational(res, ref);
      assert.ok(
        rationalLte(diff, { num: 1n, den: 10n ** 40n }),
        `Expected error <= 1e-40 for precision: 40`,
      );
    });

    it('supports numeric and rational tolerance options', () => {
      const resNum = log2RationalRecursive({ num: 5n, den: 1n }, { tolerance: 1e-20 });
      assertCanonicalRational(resNum);
      const ref = iterativeBinaryLog2Reference(5n, 1n, 80);
      assert.ok(rationalLte(absDiffRational(resNum, ref), { num: 1n, den: 10n ** 20n }));

      const resRat = log2RationalRecursive(
        { num: 5n, den: 1n },
        { tolerance: { num: 1n, den: 10n ** 25n } },
      );
      assertCanonicalRational(resRat);
      const ref25 = iterativeBinaryLog2Reference(5n, 1n, 95);
      assert.ok(rationalLte(absDiffRational(resRat, ref25), { num: 1n, den: 10n ** 25n }));
    });

    it('supports explicit terms option and converges monotonically', () => {
      const target = Math.log2(3);
      const err2 = Math.abs(rationalToNumber(log2RationalRecursive({ num: 3n, den: 1n }, { terms: 2 })) - target);
      const err6 = Math.abs(rationalToNumber(log2RationalRecursive({ num: 3n, den: 1n }, { terms: 6 })) - target);
      const err18 = Math.abs(rationalToNumber(log2RationalRecursive({ num: 3n, den: 1n }, { terms: 18 })) - target);
      assert.ok(err6 < err2, `Expected 6 terms (${err6}) more accurate than 2 terms (${err2})`);
      assert.ok(err18 < err6, `Expected 18 terms (${err18}) more accurate than 6 terms (${err6})`);
      assert.ok(err18 < 1e-14);
    });
  });

  describe('input validation and error handling', () => {
    it('throws TypeError for non-rational or malformed x inputs', () => {
      const invalidInputs = [
        null,
        undefined,
        42,
        '8/1',
        [8n, 1n],
        {},
        { num: 8, den: 1n },
        { num: 8n, den: 1 },
        { num: '8', den: '1' },
        { num: 8n },
        { den: 1n },
      ];
      for (const bad of invalidInputs) {
        assert.throws(() => log2RationalRecursive(bad), TypeError);
      }
    });

    it('throws RangeError for zero denominator and non-positive x (x <= 0)', () => {
      const outOfRange = [
        { num: 1n, den: 0n },
        { num: 0n, den: 0n },
        { num: 0n, den: 1n },
        { num: 0n, den: -5n },
        { num: -1n, den: 1n },
        { num: 1n, den: -1n },
        { num: -8n, den: 1n },
        { num: 8n, den: -2n },
        { num: -1n, den: 1000n },
      ];
      for (const bad of outOfRange) {
        assert.throws(() => log2RationalRecursive(bad), RangeError);
      }
    });

    it('validates options thoroughly even for exact powers of 2', () => {
      const x = { num: 8n, den: 1n };
      assert.throws(() => log2RationalRecursive(x, null), TypeError);
      assert.throws(() => log2RationalRecursive(x, 15), TypeError);
      assert.throws(() => log2RationalRecursive(x, []), TypeError);
      assert.throws(() => log2RationalRecursive(x, { precision: '15' }), TypeError);
      assert.throws(() => log2RationalRecursive(x, { precision: 0 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { precision: -5 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { precision: 1.5 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { terms: '10' }), TypeError);
      assert.throws(() => log2RationalRecursive(x, { terms: 0 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { terms: -1 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { terms: 2.5 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: '1e-12' }), TypeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: 0 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: -1e-12 }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: Number.NaN }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: Number.POSITIVE_INFINITY }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: { num: 0n, den: 1n } }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: { num: -1n, den: 10n } }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: { num: 1n, den: 0n } }), RangeError);
      assert.throws(() => log2RationalRecursive(x, { tolerance: { num: 1, den: 10n } }), TypeError);
    });
  });
});
