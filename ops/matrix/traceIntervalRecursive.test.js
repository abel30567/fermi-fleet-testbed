import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceIntervalRecursive } from './traceIntervalRecursive.js';

/**
 * Builds an n x n interval matrix with given diagonal intervals and off-diagonal filler.
 *
 * @param {Array<[number, number]>} diag
 * @param {[number, number]} [offDiag=[0, 0]]
 * @returns {Array<Array<[number, number]>>}
 */
function makeDiagMatrix(diag, offDiag = [0, 0]) {
  const n = diag.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? diag[i] : [...offDiag]))
  );
}

/**
 * Exact dyadic rational representation of a finite IEEE-754 binary64 number
 * as `{ num: BigInt, exp: number }` representing `num * 2^exp`.
 *
 * @param {number} x
 * @returns {{ num: bigint, exp: number }}
 */
function float64ToDyadic(x) {
  assert.ok(Number.isFinite(x), `Expected finite number, got ${x}`);
  if (x === 0) {
    return { num: 0n, exp: 0 };
  }
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, x, false);
  const bits = view.getBigUint64(0, false);
  const sign = (bits >> 63n) === 1n ? -1n : 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);

  if (rawExp === 0) {
    // Subnormal: (-1)^s * frac * 2^(-1074)
    return { num: sign * frac, exp: -1074 };
  }
  // Normal: (-1)^s * (2^52 + frac) * 2^(rawExp - 1023 - 52)
  const mantissa = (1n << 52n) | frac;
  return { num: sign * mantissa, exp: rawExp - 1075 };
}

/**
 * Exact sum of an array of finite IEEE-754 binary64 numbers as a dyadic rational.
 *
 * @param {number[]} values
 * @returns {{ num: bigint, exp: number }}
 */
function exactDyadicSum(values) {
  const dyadics = values.map(float64ToDyadic);
  let minExp = 0;
  for (const d of dyadics) {
    if (d.num !== 0n && d.exp < minExp) {
      minExp = d.exp;
    }
  }
  let total = 0n;
  for (const d of dyadics) {
    if (d.num !== 0n) {
      total += d.num << BigInt(d.exp - minExp);
    }
  }
  return { num: total, exp: minExp };
}

/**
 * Compares two dyadic rationals `a` and `b`. Returns -1, 0, or 1.
 *
 * @param {{ num: bigint, exp: number }} a
 * @param {{ num: bigint, exp: number }} b
 * @returns {-1 | 0 | 1}
 */
function compareDyadic(a, b) {
  if (a.num === 0n && b.num === 0n) return 0;
  if (a.num === 0n) return b.num > 0n ? -1 : 1;
  if (b.num === 0n) return a.num > 0n ? 1 : -1;
  const minExp = Math.min(a.exp, b.exp);
  const lhs = a.num << BigInt(a.exp - minExp);
  const rhs = b.num << BigInt(b.exp - minExp);
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/**
 * Checks whether an interval `[lo, hi]` (possibly infinite endpoints) encloses
 * an exact dyadic rational `target`.
 *
 * @param {[number, number]} interval
 * @param {{ num: bigint, exp: number }} target
 */
function assertEnclosesDyadic(interval, target) {
  const [lo, hi] = interval;
  assert.ok(lo <= hi, `Expected lo (${lo}) <= hi (${hi})`);
  if (lo !== -Infinity) {
    const cmpLo = compareDyadic(float64ToDyadic(lo), target);
    assert.ok(cmpLo <= 0, `Lower bound ${lo} exceeds exact value`);
  }
  if (hi !== Infinity) {
    const cmpHi = compareDyadic(target, float64ToDyadic(hi));
    assert.ok(cmpHi <= 0, `Upper bound ${hi} is below exact value`);
  }
}

/**
 * Independent iterative point-matrix trace computation.
 *
 * @param {number[][]} pointMatrix
 * @returns {number}
 */
function iterativePointTrace(pointMatrix) {
  let sum = 0;
  for (let i = 0; i < pointMatrix.length; i++) {
    sum += pointMatrix[i][i];
  }
  return sum;
}

/**
 * Deterministic xorshift32 PRNG returning values in [0, 1).
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

describe('traceIntervalRecursive', () => {
  describe('basic matrix sizes', () => {
    it('handles 1x1 matrices accurately and does not alias input', () => {
      const entry = [2.5, 4.75];
      const matrix = [[entry]];
      const result = traceIntervalRecursive(matrix);
      assert.deepEqual(result, [2.5, 4.75]);
      assert.notEqual(result, entry);
    });

    it('handles 1x1 matrix with -0 endpoints normalized to +0', () => {
      const result = traceIntervalRecursive([[[-0, -0]]]);
      assert.deepEqual(result, [0, 0]);
      assert.ok(Object.is(result[0], 0));
      assert.ok(Object.is(result[1], 0));
    });

    it('handles 2x2 matrices and ignores off-diagonal entries', () => {
      const matrix = [
        [[1, 2], [100, 200]],
        [[-500, -400], [3, 4]],
      ];
      assert.deepEqual(traceIntervalRecursive(matrix), [4, 6]);
    });

    it('handles 3x3 matrices (odd dimension)', () => {
      const matrix = [
        [[1, 2], [9, 10], [-1, 1]],
        [[5, 6], [-3, 4], [7, 8]],
        [[0, 0], [2, 3], [5.5, 6.5]],
      ];
      assert.deepEqual(traceIntervalRecursive(matrix), [3.5, 12.5]);
    });

    it('handles larger matrices (5x5, 16x16, 65x65)', () => {
      for (const n of [5, 16, 65]) {
        const diag = Array.from({ length: n }, (_, i) => [i, i + 1]);
        const matrix = makeDiagMatrix(diag, [-99, 99]);
        const expectedLo = (n * (n - 1)) / 2;
        const expectedHi = (n * (n + 1)) / 2;
        assert.deepEqual(traceIntervalRecursive(matrix), [expectedLo, expectedHi]);
      }
    });
  });

  describe('negative, mixed, and cancelling intervals', () => {
    it('handles all-negative intervals', () => {
      const matrix = makeDiagMatrix([
        [-10, -5],
        [-2.5, -1.25],
        [-0.75, -0.5],
      ]);
      assert.deepEqual(traceIntervalRecursive(matrix), [-13.25, -6.75]);
    });

    it('handles mixed-sign intervals with exact cancellation to [0, 0]', () => {
      const matrix = makeDiagMatrix([
        [-5, 5],
        [5, 5],
        [-5, -5],
        [5, -5].reverse(),
      ]);
      assert.deepEqual(traceIntervalRecursive(matrix), [-10, 10]);

      const zeroCancel = makeDiagMatrix([
        [3.25, 3.25],
        [-3.25, -3.25],
      ]);
      assert.deepEqual(traceIntervalRecursive(zeroCancel), [0, 0]);
    });

    it('encloses exact sum under catastrophic cancellation across extreme scales', () => {
      // Exact trace is 1; naive left-to-right float sum (1e16 + 1) - 1e16 gives 0,
      // and (1e16 + 0.125) + (-1e16) loses 0.125 without outward rounding.
      const matrix = makeDiagMatrix([
        [1e16, 1e16],
        [0.125, 0.125],
        [-1e16, -1e16],
        [0.25, 0.25],
      ]);
      const result = traceIntervalRecursive(matrix);
      const exact = exactDyadicSum([1e16, 0.125, -1e16, 0.25]);
      assertEnclosesDyadic(result, exact);
      assert.ok(result[0] <= 0.375 && 0.375 <= result[1]);
    });
  });

  describe('non-exact floats and outward rounding enclosure', () => {
    it('encloses 1.0 when summing [0.1, 0.1] 10 times', () => {
      const diag = Array.from({ length: 10 }, () => [0.1, 0.1]);
      const matrix = makeDiagMatrix(diag);
      const [lo, hi] = traceIntervalRecursive(matrix);

      // Must enclose the exact rational sum of 10 copies of float64(0.1)
      const exactFloatSum = exactDyadicSum(Array(10).fill(0.1));
      assertEnclosesDyadic([lo, hi], exactFloatSum);

      // Also encloses mathematical 1.0
      assert.ok(lo <= 1.0, `Expected lo (${lo}) <= 1.0`);
      assert.ok(hi >= 1.0, `Expected hi (${hi}) >= 1.0`);
      // And width stays tight (within a few ULPs around 1.0)
      assert.ok(hi - lo > 0, 'Non-exact summation should widen outward');
      assert.ok(hi - lo < 1e-14, `Interval width too large: ${hi - lo}`);
    });

    it('encloses exact rational 1/10 * 10 = 1 when each entry encloses true 1/10', () => {
      // True 1/10 lies strictly between 0.09999999999999999 and 0.1
      const tenthLo = 0.09999999999999999;
      const tenthHi = 0.1;
      const matrix = makeDiagMatrix(
        Array.from({ length: 10 }, () => [tenthLo, tenthHi])
      );
      const [lo, hi] = traceIntervalRecursive(matrix);
      assert.ok(lo <= 1.0 && 1.0 <= hi);
      assertEnclosesDyadic([lo, hi], exactDyadicSum(Array(10).fill(tenthLo)));
      assertEnclosesDyadic([lo, hi], exactDyadicSum(Array(10).fill(tenthHi)));
    });

    it('encloses 0.1 + 0.2 + 0.3 and 1/3 repeated 3 times', () => {
      const m1 = makeDiagMatrix([
        [0.1, 0.1],
        [0.2, 0.2],
        [0.3, 0.3],
      ]);
      const r1 = traceIntervalRecursive(m1);
      assertEnclosesDyadic(r1, exactDyadicSum([0.1, 0.2, 0.3]));

      const third = 1 / 3;
      const m2 = makeDiagMatrix([
        [third, third],
        [third, third],
        [third, third],
      ]);
      const r2 = traceIntervalRecursive(m2);
      assertEnclosesDyadic(r2, exactDyadicSum([third, third, third]));
      assert.ok(r2[0] <= 1 && 1 <= r2[1]);
    });

    it('handles subnormal numbers without losing enclosure', () => {
      const matrix = makeDiagMatrix([
        [Number.MIN_VALUE, Number.MIN_VALUE],
        [Number.MIN_VALUE, Number.MIN_VALUE],
        [-Number.MIN_VALUE, Number.MIN_VALUE],
      ]);
      const result = traceIntervalRecursive(matrix);
      assertEnclosesDyadic(
        result,
        exactDyadicSum([Number.MIN_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE])
      );
      assertEnclosesDyadic(
        result,
        exactDyadicSum([Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE])
      );
      assert.deepEqual(result, [Number.MIN_VALUE, 3 * Number.MIN_VALUE]);
    });

    it('handles overflow outward to [-Infinity, ...] / [..., Infinity]', () => {
      const posOverflow = makeDiagMatrix([
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
      ]);
      assert.deepEqual(traceIntervalRecursive(posOverflow), [
        Number.MAX_VALUE,
        Infinity,
      ]);

      const negOverflow = makeDiagMatrix([
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
        [-Number.MAX_VALUE, -Number.MAX_VALUE],
      ]);
      assert.deepEqual(traceIntervalRecursive(negOverflow), [
        -Infinity,
        -Number.MAX_VALUE,
      ]);

      const fourOverflow = makeDiagMatrix([
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE],
      ]);
      const res4 = traceIntervalRecursive(fourOverflow);
      assert.equal(res4[0], Number.MAX_VALUE);
      assert.equal(res4[1], Infinity);
    });
  });

  describe('cross-checks against iterative point traces and exact rational arithmetic', () => {
    it('encloses all 2^n corner point matrices for n = 4', () => {
      const diag = [
        [-1.3, 2.7],
        [0.1, 0.2],
        [-100.125, -99.875],
        [1e-7, 3.141592653589793],
      ];
      const matrix = makeDiagMatrix(diag, [-1, 1]);
      const result = traceIntervalRecursive(matrix);

      // Exact rational enclosure of extreme lower and upper sums
      assertEnclosesDyadic(result, exactDyadicSum(diag.map((d) => d[0])));
      assertEnclosesDyadic(result, exactDyadicSum(diag.map((d) => d[1])));

      // All 2^4 = 16 corner combinations
      const n = diag.length;
      for (let mask = 0; mask < 1 << n; mask++) {
        const pointMatrix = Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) =>
            i === j ? diag[i][(mask >> i) & 1] : 0
          )
        );
        const pointDiag = pointMatrix.map((row, i) => row[i]);
        const exactPointSum = exactDyadicSum(pointDiag);
        assertEnclosesDyadic(result, exactPointSum);

        // Also check iterative point trace (exact float check for wide intervals)
        const iterTrace = iterativePointTrace(pointMatrix);
        assert.ok(
          result[0] <= iterTrace && iterTrace <= result[1],
          `Corner mask ${mask}: iterative trace ${iterTrace} not in [${result[0]}, ${result[1]}]`
        );
      }
    });

    it('encloses exact rational and iterative traces across randomized matrices of varying sizes', () => {
      const rng = makeRng(0x5eed1234);
      const sizes = [1, 2, 3, 4, 7, 13, 32, 50];

      for (const n of sizes) {
        for (let trial = 0; trial < 5; trial++) {
          const diag = Array.from({ length: n }, () => {
            const scale = 10 ** ((rng() * 12) - 6);
            const a = (rng() * 2 - 1) * scale;
            const b = a + rng() * scale;
            return a <= b ? [a, b] : [b, a];
          });
          const matrix = makeDiagMatrix(diag, [0, 0]);
          const result = traceIntervalRecursive(matrix);

          // Exact rational check on interval lower and upper sums
          const exactLo = exactDyadicSum(diag.map((d) => d[0]));
          const exactHi = exactDyadicSum(diag.map((d) => d[1]));
          assertEnclosesDyadic(result, exactLo);
          assertEnclosesDyadic(result, exactHi);

          // Sample 20 random point matrices inside the interval matrix
          for (let s = 0; s < 20; s++) {
            const pointDiag = diag.map(([lo, hi]) => {
              const t = rng();
              const val = lo + (hi - lo) * t;
              return Math.min(hi, Math.max(lo, val));
            });
            const exactSample = exactDyadicSum(pointDiag);
            assertEnclosesDyadic(result, exactSample);

            const pointMatrix = Array.from({ length: n }, (_, i) =>
              Array.from({ length: n }, (_, j) => (i === j ? pointDiag[i] : 0))
            );
            const iterTrace = iterativePointTrace(pointMatrix);
            // Only compare iterative trace directly when intervals aren't degenerate
            // (iterative float rounding can drift outside exact bounds by ~n ULP for point intervals,
            //  whereas for non-trivial intervals interior points stay well inside).
            if (result[1] - result[0] > 1e-9 * Math.abs(iterTrace)) {
              assert.ok(result[0] <= iterTrace && iterTrace <= result[1]);
            }
          }
        }
      }
    });
  });

  describe('input validation', () => {
    it('rejects non-array and empty matrices', () => {
      for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
        assert.throws(() => traceIntervalRecursive(bad), TypeError);
      }
      assert.throws(() => traceIntervalRecursive([]), RangeError);
    });

    it('rejects non-square and jagged matrices', () => {
      assert.throws(
        () =>
          traceIntervalRecursive([
            [[1, 1], [2, 2]],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          traceIntervalRecursive([
            [[1, 1]],
            [[2, 2]],
          ]),
        RangeError
      );
      assert.throws(
        () =>
          traceIntervalRecursive([
            [[1, 1], [2, 2]],
            [[3, 3]],
          ]),
        RangeError
      );
      assert.throws(
        () => traceIntervalRecursive(['not-a-row']),
        TypeError
      );
    });

    it('rejects malformed, non-finite, and inverted intervals (including off-diagonal)', () => {
      const badIntervals = [
        null,
        undefined,
        5,
        [],
        [1],
        [1, 2, 3],
        ['1', 2],
        [1, '2'],
      ];
      for (const bad of badIntervals) {
        assert.throws(() => traceIntervalRecursive([[bad]]), TypeError);
      }

      const badRangeIntervals = [
        [NaN, 1],
        [0, NaN],
        [-Infinity, 0],
        [0, Infinity],
        [2, 1],
        [0.1, -0.1],
      ];
      for (const bad of badRangeIntervals) {
        assert.throws(() => traceIntervalRecursive([[bad]]), RangeError);
      }

      // Off-diagonal validation
      assert.throws(
        () =>
          traceIntervalRecursive([
            [[1, 2], [5, 1]],
            [[0, 0], [3, 4]],
          ]),
        RangeError
      );
    });
  });
});
