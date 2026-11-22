import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceIntervalIterative } from './setDifferenceIntervalIterative.js';

/**
 * Independent helper: checks if a point x lies strictly in the interior of
 * at least one interval in a set, or inside any closed interval.
 */
function inSetClosed(intervals, x) {
  for (const [lo, hi] of intervals) {
    if (lo <= x && x <= hi) return true;
  }
  return false;
}

/**
 * Independent helper: computes total Lebesgue measure of a normalized
 * disjoint set of finite intervals.
 */
function measure(normalizedIntervals) {
  let total = 0;
  for (const [lo, hi] of normalizedIntervals) {
    total += hi - lo;
  }
  return total;
}

/**
 * Independent reference computation via elementary sub-intervals between all
 * distinct endpoints (coordinate compression + midpoint indicator).
 */
function elementaryStats(setA, setB) {
  const ptsSet = new Set();
  for (const [lo, hi] of setA) {
    ptsSet.add(lo);
    ptsSet.add(hi);
  }
  for (const [lo, hi] of setB) {
    ptsSet.add(lo);
    ptsSet.add(hi);
  }
  const pts = [...ptsSet].sort((a, b) => a - b);

  let lenA = 0;
  let lenDiff = 0;
  let lenInter = 0;
  let lenUnion = 0;
  const diffPieces = [];

  for (let i = 0; i + 1 < pts.length; i++) {
    const lo = pts[i];
    const hi = pts[i + 1];
    const mid = (lo + hi) / 2;
    const inA = inSetClosed(setA, mid);
    const inB = inSetClosed(setB, mid);
    const width = hi - lo;

    if (inA) lenA += width;
    if (inA && !inB) {
      lenDiff += width;
      if (diffPieces.length > 0 && diffPieces[diffPieces.length - 1][1] === lo) {
        diffPieces[diffPieces.length - 1][1] = hi;
      } else {
        diffPieces.push([lo, hi]);
      }
    }
    if (inA && inB) lenInter += width;
    if (inA || inB) lenUnion += width;
  }

  return { lenA, lenDiff, lenInter, lenUnion, diffPieces };
}

/**
 * Verifies canonical normalization invariant: sorted, valid bounds, strictly
 * disjoint (no overlapping or touching intervals).
 */
function assertNormalized(result) {
  for (let i = 0; i < result.length; i++) {
    const [lo, hi] = result[i];
    assert.ok(lo <= hi, `Expected lo <= hi at index ${i}, got [${lo}, ${hi}]`);
    if (i > 0) {
      assert.ok(
        result[i - 1][1] < lo,
        `Expected strictly disjoint intervals at ${i - 1}..${i}, got [${result[i - 1]}] and [${result[i]}]`
      );
    }
  }
}

/**
 * Deterministic LCG PRNG for reproducible property tests.
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('setDifferenceIntervalIterative', () => {
  describe('normal cases', () => {
    it('subtracts partial left, right, and middle overlaps', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[-5, 4]]),
        [[4, 10]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[6, 15]]),
        [[0, 6]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[3, 7]]),
        [[0, 3], [7, 10]]
      );
    });

    it('splits a single interval into multiple pieces', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative(
          [[0, 20]],
          [[2, 4], [6, 9], [12, 15], [18, 19]]
        ),
        [[0, 2], [4, 6], [9, 12], [15, 18], [19, 20]]
      );
    });

    it('handles one B interval spanning multiple A intervals', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative(
          [[0, 3], [5, 8], [10, 13], [15, 20]],
          [[2, 17]]
        ),
        [[0, 2], [17, 20]]
      );
    });

    it('handles negative and floating-point intervals', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative(
          [[-10.5, -2.5], [1.25, 4.75]],
          [[-8, -5.5], [0, 2.5], [4, 6]]
        ),
        [[-10.5, -8], [-5.5, -2.5], [2.5, 4]]
      );
    });

    it('does not mutate input arrays or intervals', () => {
      const setA = [[5, 10], [1, 4]];
      const setB = [[3, 6]];
      const snapshotA = structuredClone(setA);
      const snapshotB = structuredClone(setB);

      const res = setDifferenceIntervalIterative(setA, setB);
      assert.deepStrictEqual(res, [[1, 3], [6, 10]]);
      assert.deepStrictEqual(setA, snapshotA);
      assert.deepStrictEqual(setB, snapshotB);

      // Mutating returned array does not affect subsequent calls or inputs
      res[0][0] = 999;
      assert.deepStrictEqual(setA, snapshotA);
    });
  });

  describe('edge cases', () => {
    it('handles complete removal', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[0, 10]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[-5, 15]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[0, 5], [5, 10]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[1, 3], [5, 7]], [[0, 4], [4, 10]]),
        []
      );
    });

    it('handles empty A, empty B, and both empty', () => {
      assert.deepStrictEqual(setDifferenceIntervalIterative([], []), []);
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([], [[0, 5], [10, 20]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 10], [0, 3], [2, 6]], []),
        [[0, 10]]
      );
    });

    it('handles disjoint and endpoint-touching sets', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 5], [10, 15]], [[-5, -1], [6, 9], [16, 20]]),
        [[0, 5], [10, 15]]
      );
      // Touching at endpoints does not remove interior of non-degenerate intervals
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 5]], [[5, 10]]),
        [[0, 5]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 10]], [[0, 5]]),
        [[5, 10]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[0, 10]], [[-5, 0], [10, 15]]),
        [[0, 10]]
      );
    });

    it('normalizes and merges unsorted, overlapping, duplicate, and adjacent inputs', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative(
          [[8, 12], [0, 5], [3, 8], [0, 5], [15, 20], [14, 16]],
          [[10, 15], [4, 6], [6, 7], [1, 2], [1, 2]]
        ),
        [[0, 1], [2, 4], [7, 10], [15, 20]]
      );
    });

    it('handles degenerate point intervals [x, x]', () => {
      // Point in A removed when covered by B
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 5]], [[5, 5]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 5]], [[0, 10]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 5]], [[0, 5]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 5]], [[5, 10]]),
        []
      );

      // Point in A preserved when disjoint from B
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[5, 5]], [[0, 4], [6, 10]]),
        [[5, 5]]
      );

      // Point in B inside non-degenerate interval in A does not create adjacent fragments
      const res = setDifferenceIntervalIterative([[0, 10]], [[5, 5]]);
      assert.deepStrictEqual(res, [[0, 10]]);
      assertNormalized(res);
    });

    it('handles infinite bounds', () => {
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[-Infinity, Infinity]], [[0, 1]]),
        [[-Infinity, 0], [1, Infinity]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[-Infinity, Infinity]], [[-Infinity, 0]]),
        [[0, Infinity]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[-Infinity, Infinity]], [[0, Infinity]]),
        [[-Infinity, 0]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[-Infinity, Infinity]], [[-Infinity, Infinity]]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative([[-Infinity, 0]], [[0, Infinity]]),
        [[-Infinity, 0]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative(
          [[5, Infinity], [-Infinity, 5]],
          [[-2, 2], [10, 20]]
        ),
        [[-Infinity, -2], [2, 10], [20, Infinity]]
      );
      assert.deepStrictEqual(
        setDifferenceIntervalIterative(
          [[-Infinity, 10]],
          [[-Infinity, -5], [0, 5], [10, Infinity]]
        ),
        [[-5, 0], [5, 10]]
      );
    });

    it('normalizes -0 to +0 and handles extreme finite bounds without overflow', () => {
      const resZero = setDifferenceIntervalIterative([[-0, 1]], [[-1, -0]]);
      assert.strictEqual(Object.is(resZero[0][0], 0), true);
      assert.deepStrictEqual(resZero, [[0, 1]]);

      const resExtreme = setDifferenceIntervalIterative(
        [[-Number.MAX_VALUE, Number.MAX_VALUE]],
        [[0, Number.MAX_VALUE]]
      );
      assert.deepStrictEqual(resExtreme, [[-Number.MAX_VALUE, 0]]);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array setA or setB', () => {
      for (const bad of [null, undefined, 42, '[]', {}, new Set()]) {
        assert.throws(() => setDifferenceIntervalIterative(bad, []), TypeError);
        assert.throws(() => setDifferenceIntervalIterative([], bad), TypeError);
      }
    });

    it('throws TypeError for non-array interval elements or sparse holes', () => {
      assert.throws(() => setDifferenceIntervalIterative([null], []), TypeError);
      assert.throws(() => setDifferenceIntervalIterative([{}], []), TypeError);
      assert.throws(() => setDifferenceIntervalIterative([[0, 1]], [42]), TypeError);
      // eslint-disable-next-line no-sparse-arrays
      assert.throws(() => setDifferenceIntervalIterative([, [0, 1]], []), TypeError);
    });

    it('throws RangeError for intervals with length !== 2', () => {
      assert.throws(() => setDifferenceIntervalIterative([[]], []), RangeError);
      assert.throws(() => setDifferenceIntervalIterative([[1]], []), RangeError);
      assert.throws(() => setDifferenceIntervalIterative([[1, 2, 3]], []), RangeError);
      assert.throws(() => setDifferenceIntervalIterative([], [[1, 2, 3]]), RangeError);
    });

    it('throws TypeError for non-number bounds', () => {
      assert.throws(() => setDifferenceIntervalIterative([['0', 1]], []), TypeError);
      assert.throws(() => setDifferenceIntervalIterative([[0, null]], []), TypeError);
      assert.throws(() => setDifferenceIntervalIterative([[0, undefined]], []), TypeError);
      assert.throws(() => setDifferenceIntervalIterative([], [[0n, 1n]]), TypeError);
    });

    it('throws RangeError for NaN, inverted bounds, or degenerate infinite bounds', () => {
      assert.throws(() => setDifferenceIntervalIterative([[NaN, 1]], []), RangeError);
      assert.throws(() => setDifferenceIntervalIterative([[0, NaN]], []), RangeError);
      assert.throws(() => setDifferenceIntervalIterative([[5, 2]], []), RangeError);
      assert.throws(() => setDifferenceIntervalIterative([], [[5, 2]]), RangeError);
      assert.throws(
        () => setDifferenceIntervalIterative([[Infinity, Infinity]], []),
        RangeError
      );
      assert.throws(
        () => setDifferenceIntervalIterative([[-Infinity, -Infinity]], []),
        RangeError
      );
    });
  });

  describe('cross-checks against independent computations', () => {
    it('matches dense interior-point indicator check (inA && !inB) and Lebesgue measure identity', () => {
      const rng = makeRng(20261122);

      for (let trial = 0; trial < 50; trial++) {
        const countA = Math.floor(rng() * 12);
        const countB = Math.floor(rng() * 12);
        const setA = [];
        const setB = [];

        // Generate integer endpoints in [-20, 20] with non-zero widths so
        // binary floats are exact and every interior midpoint is clean.
        for (let i = 0; i < countA; i++) {
          const lo = Math.floor(rng() * 40) - 20;
          const width = 1 + Math.floor(rng() * 10);
          setA.push([lo, lo + width]);
        }
        for (let i = 0; i < countB; i++) {
          const lo = Math.floor(rng() * 40) - 20;
          const width = 1 + Math.floor(rng() * 10);
          setB.push([lo, lo + width]);
        }

        const diff = setDifferenceIntervalIterative(setA, setB);
        assertNormalized(diff);

        // 1. Exact agreement with independent coordinate-compression reference
        const ref = elementaryStats(setA, setB);
        assert.deepStrictEqual(diff, ref.diffPieces);

        // 2. Dense interior-point indicator check at half-integer sample points
        //    (avoiding integer endpoints where open/closed boundary differs)
        for (let x = -20.5; x <= 30.5; x += 0.5) {
          if (Number.isInteger(x)) continue;
          const expected = inSetClosed(setA, x) && !inSetClosed(setB, x);
          const actual = inSetClosed(diff, x);
          assert.strictEqual(
            actual,
            expected,
            `Indicator mismatch at x=${x} on trial ${trial}`
          );
        }

        // 3. Lebesgue measure identities:
        //    len(A \ B) + len(A ∩ B) === len(A)
        //    len(A \ B) + len(B \ A) + len(A ∩ B) === len(A ∪ B)
        const diffBA = setDifferenceIntervalIterative(setB, setA);
        const lenAB = measure(diff);
        const lenBA = measure(diffBA);
        assert.strictEqual(lenAB + ref.lenInter, ref.lenA);
        assert.strictEqual(lenAB + lenBA + ref.lenInter, ref.lenUnion);

        // 4. Algebraic identities: A \ A === [] and (A \ B) \ B === A \ B
        assert.deepStrictEqual(setDifferenceIntervalIterative(setA, setA), []);
        assert.deepStrictEqual(setDifferenceIntervalIterative(diff, setB), diff);
      }
    });

    it('satisfies De Morgan / sequential difference identity (A \\ B) \\ C === A \\ (B ∪ C)', () => {
      const setA = [[-10, 10], [12, 25], [30, 50]];
      const setB = [[-5, 0], [8, 15], [40, 45]];
      const setC = [[-12, -4], [14, 20], [32, 42]];

      const lhs = setDifferenceIntervalIterative(
        setDifferenceIntervalIterative(setA, setB),
        setC
      );
      const rhs = setDifferenceIntervalIterative(setA, [...setB, ...setC]);

      assertNormalized(lhs);
      assert.deepStrictEqual(lhs, rhs);
    });
  });
});
