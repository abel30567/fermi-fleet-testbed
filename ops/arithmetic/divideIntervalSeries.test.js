import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideIntervalSeries } from './divideIntervalSeries.js';

// ---------------------------------------------------------------------------
// Independent Exact BigInt Rational Arithmetic Oracle
// ---------------------------------------------------------------------------

const _buf = new ArrayBuffer(8);
const _dv = new DataView(_buf);

/**
 * Converts a finite IEEE 754 binary64 number into an exact dyadic rational
 * `{ num: BigInt, exp: number }` representing `num * 2^exp`.
 */
function floatToDyadic(x) {
  if (x === 0) return { num: 0n, exp: 0 };
  _dv.setFloat64(0, x, false);
  const bits = _dv.getBigUint64(0, false);
  const sign = (bits >> 63n) === 1n ? -1n : 1n;
  const biasedExp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);

  if (biasedExp === 0) {
    // Subnormal: (-1)^sign * frac * 2^-1074
    return { num: sign * frac, exp: -1074 };
  }
  // Normal: (-1)^sign * (2^52 + frac) * 2^(biasedExp - 1023 - 52)
  return { num: sign * ((1n << 52n) + frac), exp: biasedExp - 1075 };
}

/**
 * Compares an IEEE 754 binary64 bound `q` (which may be ±Infinity) against the
 * exact rational `x / y` (where `x`, `y` are finite and `y !== 0`).
 *
 * Returns `-1` if `q < x / y`, `0` if `q === x / y`, `+1` if `q > x / y`.
 */
function compareFloatToExactQuotient(q, x, y) {
  if (q === Infinity) return 1;
  if (q === -Infinity) return -1;

  const dx = floatToDyadic(x);
  const dy = floatToDyadic(y);
  const dq = floatToDyadic(q);

  // Compare q * y vs x (flipping if y < 0):
  // q * y = (dq.num * dy.num) * 2^(dq.exp + dy.exp)
  // x     = dx.num * 2^dx.exp
  const lhsExp = dq.exp + dy.exp;
  const rhsExp = dx.exp;
  let lhs = dq.num * dy.num;
  let rhs = dx.num;

  if (lhsExp > rhsExp) {
    lhs <<= BigInt(lhsExp - rhsExp);
  } else if (rhsExp > lhsExp) {
    rhs <<= BigInt(rhsExp - lhsExp);
  }

  let cmp = lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
  if (y < 0) cmp = -cmp;
  return cmp;
}

function oracleNextUp(x) {
  if (x === Infinity) return Infinity;
  if (x === -Infinity) return -Number.MAX_VALUE;
  if (x === 0) return Number.MIN_VALUE;
  _dv.setFloat64(0, x, false);
  let bits = _dv.getBigUint64(0, false);
  bits = x > 0 ? bits + 1n : bits - 1n;
  _dv.setBigUint64(0, bits, false);
  const out = _dv.getFloat64(0, false);
  return out === 0 ? 0 : out;
}

function oracleNextDown(x) {
  return -oracleNextUp(-x) === 0 ? 0 : -oracleNextUp(-x);
}

/**
 * Verifies BOTH exact enclosure AND optimal 1-ULP tightness of `[lo, hi]`
 * against all four corners of `a / b` using exact BigInt rational arithmetic.
 */
function assertOptimalEnclosure(a, b, result) {
  const [lo, hi] = result;
  assert.ok(Array.isArray(result) && result.length === 2);
  assert.ok(!Number.isNaN(lo) && !Number.isNaN(hi));
  assert.ok(lo <= hi, `expected lo (${lo}) <= hi (${hi}) for [${a}] / [${b}]`);
  assert.ok(!Object.is(lo, -0), 'lo must not be -0');
  assert.ok(!Object.is(hi, -0), 'hi must not be -0');

  const corners = [
    [a[0], b[0]],
    [a[0], b[1]],
    [a[1], b[0]],
    [a[1], b[1]],
  ];

  let tightLo = false;
  let tightHi = false;

  for (const [x, y] of corners) {
    const cmpLo = compareFloatToExactQuotient(lo, x, y);
    const cmpHi = compareFloatToExactQuotient(hi, x, y);
    assert.ok(cmpLo <= 0, `lo=${lo} exceeded exact ${x}/${y}`);
    assert.ok(cmpHi >= 0, `hi=${hi} fell below exact ${x}/${y}`);

    if (cmpLo === 0 || compareFloatToExactQuotient(oracleNextUp(lo), x, y) > 0) {
      tightLo = true;
    }
    if (cmpHi === 0 || compareFloatToExactQuotient(oracleNextDown(hi), x, y) < 0) {
      tightHi = true;
    }
  }

  assert.ok(tightLo, `lo=${lo} is not optimally tight for [${a}] / [${b}]`);
  assert.ok(tightHi, `hi=${hi} is not optimally tight for [${a}] / [${b}]`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('divideIntervalSeries', () => {
  describe('normal cases and all sign combinations', () => {
    it('computes exact dyadic interval divisions tightly', () => {
      assert.deepStrictEqual(divideIntervalSeries([2, 4], [1, 2]), [1, 4]);
      assert.deepStrictEqual(divideIntervalSeries([6, 6], [3, 3]), [2, 2]);
      assert.deepStrictEqual(divideIntervalSeries([1, 3], [2, 4]), [0.25, 1.5]);
      assert.deepStrictEqual(divideIntervalSeries([0, 0], [2, 5]), [0, 0]);
      const negZeroCheck = divideIntervalSeries([0, 0], [-5, -2]);
      assert.deepStrictEqual(negZeroCheck, [0, 0]);
      assert.ok(Object.is(negZeroCheck[0], 0));
      assert.ok(Object.is(negZeroCheck[1], 0));
    });

    it('handles all six sign-case regimes accurately', () => {
      // b > 0, a >= 0
      assert.deepStrictEqual(divideIntervalSeries([2, 6], [1, 2]), [1, 6]);
      // b > 0, a <= 0
      assert.deepStrictEqual(divideIntervalSeries([-6, -2], [1, 2]), [-6, -1]);
      // b > 0, a straddles 0
      assert.deepStrictEqual(divideIntervalSeries([-4, 6], [2, 4]), [-2, 3]);
      // b < 0, a >= 0
      assert.deepStrictEqual(divideIntervalSeries([2, 6], [-2, -1]), [-6, -1]);
      // b < 0, a <= 0
      assert.deepStrictEqual(divideIntervalSeries([-6, -2], [-2, -1]), [1, 6]);
      // b < 0, a straddles 0
      assert.deepStrictEqual(divideIntervalSeries([-4, 6], [-4, -2]), [-3, 2]);
    });

    it('outward-rounds non-dyadic quotients to guarantee enclosure', () => {
      const oneThird = divideIntervalSeries([1, 1], [3, 3]);
      assert.ok(oneThird[0] < oneThird[1]);
      assert.equal(oracleNextUp(oneThird[0]), oneThird[1]);
      assertOptimalEnclosure([1, 1], [3, 3], oneThird);

      const negOneSeventh = divideIntervalSeries([-1, -1], [7, 7]);
      assert.ok(negOneSeventh[0] < negOneSeventh[1]);
      assert.equal(oracleNextUp(negOneSeventh[0]), negOneSeventh[1]);
      assertOptimalEnclosure([-1, -1], [7, 7], negOneSeventh);

      const wide = divideIntervalSeries([-1, 2], [3, 7]);
      assertOptimalEnclosure([-1, 2], [3, 7], wide);
    });
  });

  describe('edge cases (subnormals, underflow, overflow, boundaries)', () => {
    it('handles zero endpoints on numerator intervals', () => {
      assert.deepStrictEqual(divideIntervalSeries([0, 4], [2, 4]), [0, 2]);
      assert.deepStrictEqual(divideIntervalSeries([-4, 0], [2, 4]), [-2, 0]);
      assert.deepStrictEqual(divideIntervalSeries([0, 4], [-4, -2]), [-2, 0]);
      assert.deepStrictEqual(divideIntervalSeries([-4, 0], [-4, -2]), [0, 2]);
      for (const [a, b] of [
        [[0, 4], [-4, -2]],
        [[-4, 0], [-4, -2]],
      ]) {
        const [lo, hi] = divideIntervalSeries(a, b);
        assert.ok(!Object.is(lo, -0));
        assert.ok(!Object.is(hi, -0));
      }
    });

    it('handles subnormal inputs and exact/inexact subnormal quotients', () => {
      const m = Number.MIN_VALUE; // 2^-1074
      assert.deepStrictEqual(divideIntervalSeries([m, m], [1, 1]), [m, m]);
      assert.deepStrictEqual(divideIntervalSeries([m, m], [2, 2]), [0, m]);
      assert.deepStrictEqual(divideIntervalSeries([-m, -m], [2, 2]), [-m, 0]);
      assert.deepStrictEqual(divideIntervalSeries([m, m], [1.5, 1.5]), [0, m]);
      assert.deepStrictEqual(divideIntervalSeries([3 * m, 3 * m], [2, 2]), [m, 2 * m]);
      assert.deepStrictEqual(divideIntervalSeries([m, 2 * m], [m, 2 * m]), [0.5, 2]);

      assertOptimalEnclosure([m, 3 * m], [1.5, 3], divideIntervalSeries([m, 3 * m], [1.5, 3]));
      assertOptimalEnclosure([-3 * m, m], [-3, -1.5], divideIntervalSeries([-3 * m, m], [-3, -1.5]));
    });

    it('handles severe underflow toward zero without losing enclosure', () => {
      assert.deepStrictEqual(
        divideIntervalSeries([1e-300, 1e-300], [1e300, 1e300]),
        [0, Number.MIN_VALUE],
      );
      assert.deepStrictEqual(
        divideIntervalSeries([-1e-300, -1e-300], [1e300, 1e300]),
        [-Number.MIN_VALUE, 0],
      );
      assert.deepStrictEqual(
        divideIntervalSeries([-1e-300, 1e-300], [1e300, 1e300]),
        [-Number.MIN_VALUE, Number.MIN_VALUE],
      );
    });

    it('handles overflow to ±Infinity with outward bounds', () => {
      assert.deepStrictEqual(
        divideIntervalSeries([Number.MAX_VALUE, Number.MAX_VALUE], [0.5, 0.5]),
        [Number.MAX_VALUE, Infinity],
      );
      assert.deepStrictEqual(
        divideIntervalSeries([-Number.MAX_VALUE, -Number.MAX_VALUE], [0.5, 0.5]),
        [-Infinity, -Number.MAX_VALUE],
      );
      assert.deepStrictEqual(
        divideIntervalSeries([-Number.MAX_VALUE, Number.MAX_VALUE], [0.5, 0.5]),
        [-Infinity, Infinity],
      );
    });

    it('handles extreme-magnitude operands without internal splitting overflow', () => {
      const M = Number.MAX_VALUE;
      assert.deepStrictEqual(divideIntervalSeries([M, M], [M, M]), [1, 1]);
      assert.deepStrictEqual(divideIntervalSeries([-M, M], [M, M]), [-1, 1]);
      const nearMax = divideIntervalSeries([M, M], [1 + Number.EPSILON, 1 + 2 * Number.EPSILON]);
      assertOptimalEnclosure([M, M], [1 + Number.EPSILON, 1 + 2 * Number.EPSILON], nearMax);

      // Quotient rounds to MAX_VALUE while exact value > MAX_VALUE
      const almostOverflow = divideIntervalSeries(
        [M, M],
        [1 - Number.EPSILON / 8, 1],
      );
      assertOptimalEnclosure([M, M], [1 - Number.EPSILON / 8, 1], almostOverflow);
    });
  });

  describe('input validation', () => {
    it('rejects non-array arguments with TypeError', () => {
      for (const bad of [null, undefined, 42, '1,2', { lo: 1, hi: 2 }]) {
        assert.throws(() => divideIntervalSeries(bad, [1, 2]), TypeError);
        assert.throws(() => divideIntervalSeries([1, 2], bad), TypeError);
      }
    });

    it('rejects arrays whose length is not 2 with RangeError', () => {
      for (const bad of [[], [1], [1, 2, 3]]) {
        assert.throws(() => divideIntervalSeries(bad, [1, 2]), RangeError);
        assert.throws(() => divideIntervalSeries([1, 2], bad), RangeError);
      }
    });

    it('rejects non-number endpoints with TypeError', () => {
      assert.throws(() => divideIntervalSeries(['1', 2], [1, 2]), TypeError);
      assert.throws(() => divideIntervalSeries([1, null], [1, 2]), TypeError);
      assert.throws(() => divideIntervalSeries([1, 2], [undefined, 2]), TypeError);
      assert.throws(() => divideIntervalSeries([1, 2], [1, 2n]), TypeError);
    });

    it('rejects non-finite endpoints with RangeError', () => {
      for (const bad of [
        [NaN, 1],
        [1, NaN],
        [Infinity, Infinity],
        [-Infinity, 1],
        [1, Infinity],
      ]) {
        assert.throws(() => divideIntervalSeries(bad, [1, 2]), RangeError);
        assert.throws(() => divideIntervalSeries([1, 2], bad), RangeError);
      }
    });

    it('rejects inverted intervals (lo > hi) with RangeError', () => {
      assert.throws(() => divideIntervalSeries([2, 1], [1, 2]), RangeError);
      assert.throws(() => divideIntervalSeries([1, 2], [-1, -2]), RangeError);
    });

    it('rejects divisor intervals containing zero with RangeError', () => {
      for (const zeroDivisor of [
        [0, 0],
        [-0, 0],
        [0, 1],
        [-1, 0],
        [-1, 1],
        [-Number.MIN_VALUE, Number.MIN_VALUE],
      ]) {
        assert.throws(() => divideIntervalSeries([1, 2], zeroDivisor), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches exact BigInt rational oracle across 500 deterministic pseudorandom intervals', () => {
      // Deterministic xorshift64* PRNG
      let state = 0x9e3779b97f4a7c15n;
      function nextU64() {
        state ^= state >> 12n;
        state &= (1n << 64n) - 1n;
        state ^= (state << 25n) & ((1n << 64n) - 1n);
        state ^= state >> 27n;
        return (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n);
      }
      function randFloat() {
        const u = nextU64();
        const sign = (u & 1n) === 0n ? 1 : -1;
        const expBucket = Number((u >> 1n) % 5n);
        const mant = 1 + Number((u >> 12n) & ((1n << 52n) - 1n)) * 2 ** -52;
        if (expBucket === 0) return sign * mant * 2 ** (Number((u >> 4n) % 40n) - 20);
        if (expBucket === 1) return sign * mant * 2 ** (Number((u >> 4n) % 400n) - 200);
        if (expBucket === 2) return sign * mant * 2 ** (Number((u >> 4n) % 20n) + 1000);
        if (expBucket === 3) return sign * mant * 2 ** (-1020 - Number((u >> 4n) % 50n));
        return sign * (Number((u >> 4n) % 97n) + 1);
      }

      for (let i = 0; i < 500; i++) {
        let a0 = randFloat();
        let a1 = randFloat();
        if (a0 > a1) [a0, a1] = [a1, a0];

        let b0 = Math.abs(randFloat());
        let b1 = Math.abs(randFloat());
        if (b0 === 0) b0 = Number.MIN_VALUE;
        if (b1 === 0) b1 = Number.MIN_VALUE;
        if (b0 > b1) [b0, b1] = [b1, b0];
        if ((i & 1) === 1) {
          [b0, b1] = [-b1, -b0];
        }

        const res = divideIntervalSeries([a0, a1], [b0, b1]);
        assertOptimalEnclosure([a0, a1], [b0, b1], res);
      }
    });

    it('agrees with independent geometric (Neumann) series enclosure on small-radius divisors', () => {
      // Independent check: for B = [m - r, m + r] with rho = r / |m| < 0.25,
      // 1 / (m * (1 + delta)) = (1/m) * sum_{k=0}^{N} (-delta)^k + R_N,
      // where |R_N| <= rho^(N+1) / (|m| * (1 - rho)).
      // On point A = [x, x], B = [m - r, m + r], every exact value x / y lies in
      // [x / (m + r), x / (m - r)] (for x > 0, m - r > 0), and the series at
      // y = m ± r converges directly to those endpoints.
      const cases = [
        { a: [3, 5], m: 10, r: 0.5 },
        { a: [-7, -2], m: 4, r: 0.2 },
        { a: [-3, 5], m: -8, r: 0.4 },
        { a: [1.5, 2.5], m: 3, r: 0.1 },
      ];

      for (const { a, m, r } of cases) {
        const b = [m - r, m + r];
        const [lo, hi] = divideIntervalSeries(a, b);

        // Compute corner quotients independently via geometric series around m:
        // x / (m + d) = (x / m) * sum_{k=0}^{40} (-d / m)^k, |d| = r.
        const seriesCorners = [];
        for (const x of a) {
          for (const d of [-r, r]) {
            const ratio = -d / m;
            let sum = 0;
            let term = 1;
            for (let k = 0; k <= 40; k++) {
              sum += term;
              term *= ratio;
            }
            seriesCorners.push((x / m) * sum);
          }
        }
        const seriesMin = Math.min(...seriesCorners);
        const seriesMax = Math.max(...seriesCorners);

        const tol = 1e-13 * Math.max(1, Math.abs(seriesMin), Math.abs(seriesMax));
        assert.ok(Math.abs(lo - seriesMin) <= tol, `lo=${lo} vs seriesMin=${seriesMin}`);
        assert.ok(Math.abs(hi - seriesMax) <= tol, `hi=${hi} vs seriesMax=${seriesMax}`);
        assertOptimalEnclosure(a, b, [lo, hi]);
      }
    });

    it('satisfies algebraic interval identities (monotonicity, symmetry, self-division)', () => {
      // Inclusion monotonicity: A1 ⊆ A2 and B1 ⊆ B2 => A1/B1 ⊆ A2/B2
      const inner = divideIntervalSeries([-1, 2], [3, 5]);
      const outer = divideIntervalSeries([-2, 3], [2, 6]);
      assert.ok(outer[0] <= inner[0] && inner[1] <= outer[1]);

      // Negation symmetry: (-A)/B = -(A/B) and A/(-B) = -(A/B)
      const [lo, hi] = divideIntervalSeries([-3, 7], [3, 11]);
      const negA = divideIntervalSeries([-7, 3], [3, 11]);
      const negB = divideIntervalSeries([-3, 7], [-11, -3]);
      assert.deepStrictEqual(negA, [-hi, -lo]);
      assert.deepStrictEqual(negB, [-hi, -lo]);

      // Self-division always encloses 1
      for (const b of [
        [3, 7],
        [-7, -3],
        [0.1, 0.3],
        [1e-200, 3e-200],
      ]) {
        const self = divideIntervalSeries(b, b);
        assert.ok(self[0] <= 1 && 1 <= self[1], `1 not in [${self}] for B=[${b}]`);
      }
    });
  });
});
