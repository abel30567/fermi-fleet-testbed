import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationIntervalRecursive } from './summationIntervalRecursive.js';

// ---------------------------------------------------------------------------
// Independent exact BigInt dyadic & rational arithmetic helpers for testing
// ---------------------------------------------------------------------------

const dvBuf = new ArrayBuffer(8);
const dv = new DataView(dvBuf);

/**
 * Converts any finite IEEE-754 binary64 number to an exact dyadic rational
 * `{ num: BigInt, exp: number }` representing `num * 2^exp`.
 */
function float64ToDyadic(x) {
  if (!Number.isFinite(x)) {
    throw new RangeError(`Expected finite number, got ${x}`);
  }
  if (x === 0) return { num: 0n, exp: 0 };
  dv.setFloat64(0, x, false);
  const bits = dv.getBigUint64(0, false);
  const sign = bits >> 63n === 1n ? -1n : 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  if (rawExp === 0) {
    // Subnormal: value = sign * frac * 2^(-1074)
    return { num: sign * frac, exp: -1074 };
  }
  // Normal: value = sign * (2^52 + frac) * 2^(rawExp - 1023 - 52)
  return { num: sign * ((1n << 52n) | frac), exp: rawExp - 1075 };
}

/**
 * Sums an array of finite binary64 numbers with exact BigInt dyadic arithmetic.
 */
function exactDyadicSum(values) {
  if (values.length === 0) return { num: 0n, exp: 0 };
  const dyadics = values.map(float64ToDyadic);
  let minExp = dyadics[0].exp;
  for (let i = 1; i < dyadics.length; i++) {
    if (dyadics[i].exp < minExp) minExp = dyadics[i].exp;
  }
  let total = 0n;
  for (const d of dyadics) {
    total += d.num << BigInt(d.exp - minExp);
  }
  return { num: total, exp: minExp };
}

/**
 * Compares a float64 bound (allowing ±Infinity) against an exact dyadic rational.
 * Returns -1 if f < d, 0 if f == d, +1 if f > d.
 */
function compareFloatToDyadic(f, d) {
  if (f === -Infinity) return -1;
  if (f === Infinity) return 1;
  const fd = float64ToDyadic(f);
  const minExp = Math.min(fd.exp, d.exp);
  const lhs = fd.num << BigInt(fd.exp - minExp);
  const rhs = d.num << BigInt(d.exp - minExp);
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/**
 * Compares an exact binary64 float against an exact rational p / q (q > 0n).
 * Returns -1 if f < p/q, 0 if f == p/q, +1 if f > p/q.
 */
function compareFloatToRational(f, p, q) {
  if (f === -Infinity) return -1;
  if (f === Infinity) return 1;
  const fd = float64ToDyadic(f);
  // Compare fd.num * 2^fd.exp vs p / q
  // i.e. fd.num * q * 2^fd.exp vs p
  let lhs;
  let rhs;
  if (fd.exp >= 0) {
    lhs = (fd.num << BigInt(fd.exp)) * q;
    rhs = p;
  } else {
    lhs = fd.num * q;
    rhs = p << BigInt(-fd.exp);
  }
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/**
 * Computes exact rational sum of pairs [p, q] using BigInt GCD reduction.
 */
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

function addRational([p1, q1], [p2, q2]) {
  const num = p1 * q2 + p2 * q1;
  const den = q1 * q2;
  const g = gcdBigInt(num, den);
  return [num / g, den / g];
}

/**
 * Computes an enclosing float64 interval [lo, hi] for exact rational p/q (q > 0n)
 * by testing the nearest binary64 approximation and stepping 1 ULP if needed.
 */
function rationalToEnclosingInterval(p, q) {
  const approx = Number(p) / Number(q);
  const cmp = compareFloatToRational(approx, p, q);
  if (cmp === 0) return [approx, approx];
  const stepUp = (x) => {
    if (x === 0) return Number.MIN_VALUE;
    dv.setFloat64(0, x, false);
    const b = dv.getBigUint64(0, false);
    dv.setBigUint64(0, x > 0 ? b + 1n : b - 1n, false);
    return dv.getFloat64(0, false);
  };
  const stepDown = (x) => {
    if (x === 0) return -Number.MIN_VALUE;
    dv.setFloat64(0, x, false);
    const b = dv.getBigUint64(0, false);
    dv.setBigUint64(0, x > 0 ? b - 1n : b + 1n, false);
    return dv.getFloat64(0, false);
  };
  if (cmp < 0) {
    return [approx, stepUp(approx)];
  }
  return [stepDown(approx), approx];
}

/**
 * Verifies that `result = [resLo, resHi]` strictly encloses the exact dyadic
 * sums of the lower and upper endpoints of `intervals`.
 */
function assertEnclosesExactDyadic(result, intervals) {
  assert.ok(Array.isArray(result) && result.length === 2);
  const [resLo, resHi] = result;
  assert.ok(resLo <= resHi, `Expected resLo (${resLo}) <= resHi (${resHi})`);

  const exactLo = exactDyadicSum(intervals.map((iv) => iv[0]));
  const exactHi = exactDyadicSum(intervals.map((iv) => iv[1]));

  assert.ok(
    compareFloatToDyadic(resLo, exactLo) <= 0,
    `Lower bound ${resLo} failed to enclose exact lower sum`
  );
  assert.ok(
    compareFloatToDyadic(resHi, exactHi) >= 0,
    `Upper bound ${resHi} failed to enclose exact upper sum`
  );
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible fuzz tests.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('summationIntervalRecursive', () => {
  describe('normal cases', () => {
    it('sums exact integer intervals without spurious widening', () => {
      const result = summationIntervalRecursive([
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8],
      ]);
      assert.deepStrictEqual(result, [16, 20]);
    });

    it('sums point intervals of exact dyadic fractions', () => {
      const result = summationIntervalRecursive([
        [0.5, 0.5],
        [0.25, 0.25],
        [0.125, 0.125],
        [-0.875, -0.875],
      ]);
      assert.deepStrictEqual(result, [0, 0]);
    });

    it('sums negative and mixed-sign intervals accurately', () => {
      const intervals = [
        [-10, -2],
        [5, 12],
        [-3.5, 1.5],
        [0, 0],
        [4.25, 4.75],
      ];
      const result = summationIntervalRecursive(intervals);
      assert.deepStrictEqual(result, [-4.25, 16.25]);
      assertEnclosesExactDyadic(result, intervals);
    });

    it('supports indexed (start, end, termFn) signature', () => {
      const result = summationIntervalRecursive(1, 10, (k) => [k, k + 1]);
      // sum_{k=1}^{10} k = 55, sum_{k=1}^{10} (k+1) = 65
      assert.deepStrictEqual(result, [55, 65]);
    });

    it('supports negative start/end indices in (start, end, termFn)', () => {
      const result = summationIntervalRecursive(-5, 5, (k) => [k - 0.5, k + 0.5]);
      // 11 terms: sum k = 0, sum -0.5 = -5.5, sum +0.5 = 5.5
      assert.deepStrictEqual(result, [-5.5, 5.5]);
    });

    it('matches array form and indexed form on identical terms', () => {
      const n = 37;
      const termFn = (k) => [k * 0.1, k * 0.1 + 0.01];
      const arr = Array.from({ length: n }, (_, i) => termFn(i + 1));
      const resArr = summationIntervalRecursive(arr);
      const resIdx = summationIntervalRecursive(1, n, termFn);
      assert.deepStrictEqual(resArr, resIdx);
      assertEnclosesExactDyadic(resArr, arr);
    });
  });

  describe('edge cases', () => {
    it('returns [0, 0] for empty array', () => {
      assert.deepStrictEqual(summationIntervalRecursive([]), [0, 0]);
    });

    it('returns [0, 0] for empty indexed range (start > end)', () => {
      let called = false;
      const result = summationIntervalRecursive(5, 4, () => {
        called = true;
        return [1, 2];
      });
      assert.deepStrictEqual(result, [0, 0]);
      assert.strictEqual(called, false);
    });

    it('handles single element array and returns a fresh copy', () => {
      const original = [1.5, 2.5];
      const result = summationIntervalRecursive([original]);
      assert.deepStrictEqual(result, [1.5, 2.5]);
      assert.notStrictEqual(result, original);
    });

    it('handles single index in (start, end, termFn)', () => {
      const result = summationIntervalRecursive(7, 7, (k) => [k * 2, k * 3]);
      assert.deepStrictEqual(result, [14, 21]);
    });

    it('normalizes -0 to +0', () => {
      const res = summationIntervalRecursive([[-0, -0]]);
      assert.ok(Object.is(res[0], 0));
      assert.ok(Object.is(res[1], 0));
    });

    it('guarantees outward rounding on non-exact float 0.1 + 0.2', () => {
      const intervals = [
        [0.1, 0.1],
        [0.2, 0.2],
      ];
      const [lo, hi] = summationIntervalRecursive(intervals);
      // 0.1 + 0.2 in binary64 rounds UP to 0.30000000000000004,
      // so the tightest enclosing interval is [0.3, 0.30000000000000004].
      assert.strictEqual(lo, 0.3);
      assert.strictEqual(hi, 0.30000000000000004);
      assertEnclosesExactDyadic([lo, hi], intervals);
    });

    it('encloses exact sum of 1000 copies of [0.1, 0.1] tightly', () => {
      const intervals = Array.from({ length: 1000 }, () => [0.1, 0.1]);
      const result = summationIntervalRecursive(intervals);
      assertEnclosesExactDyadic(result, intervals);
      // Width should be very small (a few ULPs around 100) due to pairwise summation
      const width = result[1] - result[0];
      assert.ok(width > 0, 'Expected non-zero interval width for non-exact 0.1 sum');
      assert.ok(width < 1e-12, `Expected tight pairwise enclosure, got width ${width}`);
    });

    it('handles severe cancellation (large opposing terms plus tiny perturbations)', () => {
      const intervals = [
        [1e16, 1e16],
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
        [-1e16, -1e16],
      ];
      const result = summationIntervalRecursive(intervals);
      assertEnclosesExactDyadic(result, intervals);
      // Exact dyadic sum of inputs is ~0.6, must be enclosed
      assert.ok(result[0] <= 0.6 && result[1] >= 0.6);
    });

    it('handles subnormal numbers and Number.MIN_VALUE accurately', () => {
      const intervals = [
        [1, 1],
        [Number.MIN_VALUE, Number.MIN_VALUE],
      ];
      const [lo, hi] = summationIntervalRecursive(intervals);
      assert.strictEqual(lo, 1);
      assert.strictEqual(hi, 1 + Number.EPSILON);
      assertEnclosesExactDyadic([lo, hi], intervals);

      const negIntervals = [
        [1, 1],
        [-Number.MIN_VALUE, -Number.MIN_VALUE],
      ];
      const [nLo, nHi] = summationIntervalRecursive(negIntervals);
      assert.strictEqual(nLo, 1 - Number.EPSILON / 2);
      assert.strictEqual(nHi, 1);
      assertEnclosesExactDyadic([nLo, nHi], negIntervals);
    });

    it('preserves enclosure when intermediate sums overflow Number.MAX_VALUE', () => {
      const posOverflow = summationIntervalRecursive([
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
      ]);
      assert.strictEqual(posOverflow[0], Number.MAX_VALUE);
      assert.strictEqual(posOverflow[1], Infinity);
      assertEnclosesExactDyadic(posOverflow, [
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
      ]);

      const negOverflow = summationIntervalRecursive([
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
      ]);
      assert.strictEqual(negOverflow[0], -Infinity);
      assert.strictEqual(negOverflow[1], -Number.MAX_VALUE);
      assertEnclosesExactDyadic(negOverflow, [
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
      ]);
    });
  });

  describe('invalid inputs', () => {
    it('rejects wrong argument counts', () => {
      assert.throws(() => summationIntervalRecursive(), TypeError);
      assert.throws(() => summationIntervalRecursive(1, 2), TypeError);
      assert.throws(
        () => summationIntervalRecursive(1, 2, () => [0, 0], 'extra'),
        TypeError
      );
    });

    it('rejects non-array single argument', () => {
      assert.throws(() => summationIntervalRecursive(null), TypeError);
      assert.throws(() => summationIntervalRecursive(42), TypeError);
      assert.throws(() => summationIntervalRecursive('abc'), TypeError);
      assert.throws(() => summationIntervalRecursive({ 0: [1, 2] }), TypeError);
    });

    it('rejects malformed interval elements', () => {
      assert.throws(() => summationIntervalRecursive([1, 2]), TypeError);
      assert.throws(() => summationIntervalRecursive([[1]]), TypeError);
      assert.throws(() => summationIntervalRecursive([[1, 2, 3]]), TypeError);
      assert.throws(() => summationIntervalRecursive([['1', 2]]), TypeError);
      assert.throws(() => summationIntervalRecursive([[1, null]]), TypeError);
    });

    it('rejects non-finite bounds and inverted intervals (lo > hi)', () => {
      assert.throws(() => summationIntervalRecursive([[NaN, 1]]), RangeError);
      assert.throws(() => summationIntervalRecursive([[0, NaN]]), RangeError);
      assert.throws(() => summationIntervalRecursive([[0, Infinity]]), RangeError);
      assert.throws(() => summationIntervalRecursive([[-Infinity, 0]]), RangeError);
      assert.throws(() => summationIntervalRecursive([[2, 1]]), RangeError);
      assert.throws(
        () =>
          summationIntervalRecursive([
            [0, 1],
            [5, 3],
          ]),
        RangeError
      );
    });

    it('rejects invalid (start, end, termFn) parameters and bad termFn outputs', () => {
      assert.throws(() => summationIntervalRecursive('0', 5, () => [0, 0]), TypeError);
      assert.throws(() => summationIntervalRecursive(0, '5', () => [0, 0]), TypeError);
      assert.throws(() => summationIntervalRecursive(0.5, 5, () => [0, 0]), RangeError);
      assert.throws(() => summationIntervalRecursive(0, Infinity, () => [0, 0]), RangeError);
      assert.throws(
        () => summationIntervalRecursive(0, Number.MAX_SAFE_INTEGER + 1, () => [0, 0]),
        RangeError
      );
      assert.throws(() => summationIntervalRecursive(0, 5, 'not-a-fn'), TypeError);
      assert.throws(() => summationIntervalRecursive(0, 2, () => [5, 1]), RangeError);
      assert.throws(() => summationIntervalRecursive(0, 2, () => 123), TypeError);
    });
  });

  describe('independent BigInt exact rational cross-checks', () => {
    it('encloses exact rational harmonic sum H_50 = sum_{k=1}^{50} 1/k', () => {
      let exactRational = [0n, 1n];
      for (let k = 1; k <= 50; k++) {
        exactRational = addRational(exactRational, [1n, BigInt(k)]);
      }

      const [resLo, resHi] = summationIntervalRecursive(1, 50, (k) =>
        rationalToEnclosingInterval(1n, BigInt(k))
      );

      assert.ok(
        compareFloatToRational(resLo, exactRational[0], exactRational[1]) <= 0,
        `resLo (${resLo}) exceeded exact rational H_50`
      );
      assert.ok(
        compareFloatToRational(resHi, exactRational[0], exactRational[1]) >= 0,
        `resHi (${resHi}) fell below exact rational H_50`
      );
      // Confirm tight enclosure around H_50 (~4.499205338329425)
      assert.ok(resHi - resLo < 1e-13, `Unexpectedly wide interval: ${resHi - resLo}`);
    });

    it('encloses exact rational alternating Basel-like series sum_{k=1}^{40} (-1)^(k+1) / k^2', () => {
      let exactRational = [0n, 1n];
      for (let k = 1; k <= 40; k++) {
        const sign = k % 2 === 1 ? 1n : -1n;
        exactRational = addRational(exactRational, [sign, BigInt(k * k)]);
      }

      const [resLo, resHi] = summationIntervalRecursive(1, 40, (k) =>
        rationalToEnclosingInterval(k % 2 === 1 ? 1n : -1n, BigInt(k * k))
      );

      assert.ok(
        compareFloatToRational(resLo, exactRational[0], exactRational[1]) <= 0
      );
      assert.ok(
        compareFloatToRational(resHi, exactRational[0], exactRational[1]) >= 0
      );
      assert.ok(resHi - resLo < 1e-14);
    });

    it('encloses exact rational sum of decimal tenths sum_{k=1}^{100} k/10 = 505', () => {
      // Each exact rational k/10 is enclosed in a float64 interval
      const [resLo, resHi] = summationIntervalRecursive(1, 100, (k) =>
        rationalToEnclosingInterval(BigInt(k), 10n)
      );
      // Exact sum is 100*101 / 20 = 505
      assert.ok(compareFloatToRational(resLo, 505n, 1n) <= 0);
      assert.ok(compareFloatToRational(resHi, 505n, 1n) >= 0);
      assert.ok(resHi - resLo < 1e-11);
    });

    it('encloses exact BigInt dyadic sums across 200 randomized multi-scale trials', () => {
      const rand = mulberry32(20261123);
      const scales = [1e-300, 1e-100, 1e-15, 1, 1e15, 1e100, 1e200];

      for (let trial = 0; trial < 200; trial++) {
        const len = Math.floor(rand() * 64) + 1;
        const intervals = [];
        for (let i = 0; i < len; i++) {
          const scale = scales[Math.floor(rand() * scales.length)];
          const a = (rand() * 2 - 1) * scale;
          const b = (rand() * 2 - 1) * scale;
          intervals.push(a <= b ? [a, b] : [b, a]);
        }
        const result = summationIntervalRecursive(intervals);
        assertEnclosesExactDyadic(result, intervals);
      }
    });
  });
});
