import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceSortedArrSeries } from './setDifferenceSortedArrSeries.js';

/**
 * Independent reference implementation using JavaScript Set.
 * Computes A \ (B_1 ∪ B_2 ∪ ... ∪ B_k) sorted numerically ascending.
 */
function setDifferenceReference(a, ...subtrahends) {
  const excluded = new Set();
  for (const b of subtrahends) {
    for (const v of b) {
      excluded.add(v);
    }
  }
  const out = [];
  for (const v of new Set(a)) {
    if (!excluded.has(v)) {
      out.push(v);
    }
  }
  return out.sort((x, y) => x - y);
}

/**
 * Independent Set-based union helper for verifying set-theoretic identities.
 */
function setUnionReference(...arrays) {
  const s = new Set();
  for (const arr of arrays) {
    for (const v of arr) {
      s.add(v);
    }
  }
  return Array.from(s).sort((x, y) => x - y);
}

/**
 * Independent Set-based intersection helper for verifying partition identities.
 */
function setIntersectionReference(a, b) {
  const setB = new Set(b);
  return Array.from(new Set(a))
    .filter((v) => setB.has(v))
    .sort((x, y) => x - y);
}

/**
 * Deterministic LCG PRNG for reproducible property-based cross-checks.
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomSortedUnique(rand, maxLen, minVal, maxVal) {
  const len = Math.floor(rand() * (maxLen + 1));
  const set = new Set();
  const span = maxVal - minVal + 1;
  for (let i = 0; i < len; i++) {
    set.add(minVal + Math.floor(rand() * span));
  }
  return Array.from(set).sort((x, y) => x - y);
}

describe('setDifferenceSortedArrSeries', () => {
  describe('binary set difference A \\ B', () => {
    it('computes basic overlapping difference', () => {
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries([1, 2, 3, 4, 5], [2, 4, 6]),
        [1, 3, 5]
      );
    });

    it('returns all elements of A when A and B are disjoint', () => {
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries([1, 3, 5], [2, 4, 6]),
        [1, 3, 5]
      );
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries([-10, -5, -1], [0, 1, 5, 10]),
        [-10, -5, -1]
      );
    });

    it('returns empty array when A is a subset of B or equal to B', () => {
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries([2, 4], [1, 2, 3, 4, 5]),
        []
      );
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries([1, 2, 3], [1, 2, 3]),
        []
      );
    });

    it('handles empty inputs properly', () => {
      assert.deepStrictEqual(setDifferenceSortedArrSeries([], []), []);
      assert.deepStrictEqual(setDifferenceSortedArrSeries([], [1, 2, 3]), []);
      assert.deepStrictEqual(setDifferenceSortedArrSeries([1, 2, 3], []), [1, 2, 3]);
    });

    it('handles single-element arrays', () => {
      assert.deepStrictEqual(setDifferenceSortedArrSeries([42], [42]), []);
      assert.deepStrictEqual(setDifferenceSortedArrSeries([42], [41]), [42]);
      assert.deepStrictEqual(setDifferenceSortedArrSeries([42], [43]), [42]);
    });

    it('handles negative numbers, floats, subnormals, and extreme finite values', () => {
      const a = [
        -Number.MAX_VALUE,
        Number.MIN_SAFE_INTEGER,
        -1.5,
        -Number.MIN_VALUE,
        0,
        Number.MIN_VALUE,
        Math.PI,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_VALUE
      ];
      const b = [
        Number.MIN_SAFE_INTEGER,
        -Number.MIN_VALUE,
        Math.PI,
        Number.MAX_VALUE
      ];
      assert.deepStrictEqual(setDifferenceSortedArrSeries(a, b), [
        -Number.MAX_VALUE,
        -1.5,
        0,
        Number.MIN_VALUE,
        Number.MAX_SAFE_INTEGER
      ]);
    });

    it('treats -0 as equal to +0 and normalizes -0 to +0 in output', () => {
      assert.deepStrictEqual(setDifferenceSortedArrSeries([-1, -0, 1], [0]), [-1, 1]);
      assert.deepStrictEqual(setDifferenceSortedArrSeries([-1, 0, 1], [-0]), [-1, 1]);

      const res = setDifferenceSortedArrSeries([-1, -0, 1], [2]);
      assert.deepStrictEqual(res, [-1, 0, 1]);
      assert.equal(Object.is(res[1], 0), true);
    });

    it('does not mutate inputs and returns a fresh array copy', () => {
      const a = [1, 2, 3];
      const b = [4, 5];
      const res = setDifferenceSortedArrSeries(a, b);
      assert.deepStrictEqual(res, [1, 2, 3]);
      assert.notStrictEqual(res, a);
      res.push(99);
      assert.deepStrictEqual(a, [1, 2, 3]);
      assert.deepStrictEqual(b, [4, 5]);
    });
  });

  describe('left-associative series A \\ B1 \\ B2 \\ ... \\ Bk', () => {
    it('returns a normalized shallow copy when no subtrahends are supplied (A \\ ∅ = A)', () => {
      const a = [-2, -0, 5];
      const res = setDifferenceSortedArrSeries(a);
      assert.deepStrictEqual(res, [-2, 0, 5]);
      assert.equal(Object.is(res[1], 0), true);
      assert.notStrictEqual(res, a);
      assert.deepStrictEqual(setDifferenceSortedArrSeries([]), []);
    });

    it('computes multi-array left-associative difference accurately', () => {
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries(
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          [2, 4, 6, 8, 10],
          [3, 6, 9],
          [5, 10]
        ),
        [1, 7]
      );
    });

    it('matches explicit left-associative folding (((A \\ B1) \\ B2) \\ B3)', () => {
      const a = [-5, -2, 0, 1, 3, 4, 7, 9, 12];
      const b1 = [-2, 1, 7];
      const b2 = [-5, 1, 4, 100];
      const b3 = [0, 9];

      const seriesRes = setDifferenceSortedArrSeries(a, b1, b2, b3);
      const folded = setDifferenceSortedArrSeries(
        setDifferenceSortedArrSeries(
          setDifferenceSortedArrSeries(a, b1),
          b2
        ),
        b3
      );
      assert.deepStrictEqual(seriesRes, folded);
      assert.deepStrictEqual(seriesRes, [3, 12]);
    });

    it('demonstrates left-associativity vs right-associativity: (A \\ B) \\ C != A \\ (B \\ C)', () => {
      const a = [1, 2, 3];
      const b = [2, 3];
      const c = [3];

      const leftAssoc = setDifferenceSortedArrSeries(a, b, c); // (A \ B) \ C = [1]
      const rightAssoc = setDifferenceSortedArrSeries(
        a,
        setDifferenceSortedArrSeries(b, c)
      ); // A \ (B \ C) = [1, 3]

      assert.deepStrictEqual(leftAssoc, [1]);
      assert.deepStrictEqual(rightAssoc, [1, 3]);
      assert.notDeepStrictEqual(leftAssoc, rightAssoc);
    });

    it('is invariant under permutation of subtrahends', () => {
      const a = [1, 2, 3, 4, 5, 6, 7, 8];
      const b1 = [1, 4, 7];
      const b2 = [2, 4, 8];
      const b3 = [3, 6];

      const expected = setDifferenceSortedArrSeries(a, b1, b2, b3);
      assert.deepStrictEqual(setDifferenceSortedArrSeries(a, b3, b1, b2), expected);
      assert.deepStrictEqual(setDifferenceSortedArrSeries(a, b2, b3, b1), expected);
      assert.deepStrictEqual(expected, [5]);
    });

    it('handles empty subtrahends interleaved in a series', () => {
      assert.deepStrictEqual(
        setDifferenceSortedArrSeries([1, 2, 3, 4], [], [2], [], [4], []),
        [1, 3]
      );
    });

    it('handles large sorted arrays efficiently in linear time', () => {
      const n = 20000;
      const a = Array.from({ length: n }, (_, i) => i);
      const evens = Array.from({ length: n / 2 }, (_, i) => i * 2);
      const mult3 = Array.from({ length: Math.ceil(n / 3) }, (_, i) => i * 3);

      const res = setDifferenceSortedArrSeries(a, evens, mult3);
      const expected = a.filter((x) => x % 2 !== 0 && x % 3 !== 0);
      assert.deepStrictEqual(res, expected);
    });
  });

  describe('mathematical identities and Set-based cross-checks', () => {
    it('matches Set-based difference and satisfies partition identity (A \\ B) ∪ (A ∩ B) = A across randomized cases', () => {
      const rand = createPrng(0x5eed1234);

      for (let trial = 0; trial < 150; trial++) {
        const a = randomSortedUnique(rand, 40, -30, 30);
        const b = randomSortedUnique(rand, 40, -30, 30);

        const diff = setDifferenceSortedArrSeries(a, b);
        const refDiff = setDifferenceReference(a, b);
        const inter = setIntersectionReference(a, b);

        // 1. Cross-check against Set-based reference
        assert.deepStrictEqual(diff, refDiff);

        // 2. Partition identity: (A \ B) ∪ (A ∩ B) = A
        assert.deepStrictEqual(setUnionReference(diff, inter), a);

        // 3. Disjointness of partition: (A \ B) ∩ (A ∩ B) = ∅
        assert.deepStrictEqual(setIntersectionReference(diff, inter), []);

        // 4. Cardinality identity: |A \ B| = |A| - |A ∩ B|
        assert.equal(diff.length, a.length - inter.length);

        // 5. Symmetric difference identity: (A \ B) ∪ (B \ A) = (A ∪ B) \ (A ∩ B)
        const bMinusA = setDifferenceSortedArrSeries(b, a);
        const symFromDiffs = setUnionReference(diff, bMinusA);
        const symFromUnion = setDifferenceSortedArrSeries(
          setUnionReference(a, b),
          inter
        );
        assert.deepStrictEqual(symFromDiffs, symFromUnion);
      }
    });

    it('satisfies De Morgan / union-absorption identity A \\ B1 \\ ... \\ Bk = A \\ (⋃ Bm) across randomized series', () => {
      const rand = createPrng(0xdeadbeef);

      for (let trial = 0; trial < 100; trial++) {
        const k = 2 + Math.floor(rand() * 5); // 2..6 subtrahends
        const a = randomSortedUnique(rand, 50, -40, 40);
        const subs = Array.from({ length: k }, () =>
          randomSortedUnique(rand, 25, -40, 40)
        );

        const seriesResult = setDifferenceSortedArrSeries(a, ...subs);
        const refResult = setDifferenceReference(a, ...subs);
        const unionSubs = setUnionReference(...subs);
        const binaryAgainstUnion = setDifferenceSortedArrSeries(a, unionSubs);

        // Cross-check against Set reference
        assert.deepStrictEqual(seriesResult, refResult);

        // Union-absorption identity: A \ B1 \ ... \ Bk === A \ (B1 ∪ ... ∪ Bk)
        assert.deepStrictEqual(seriesResult, binaryAgainstUnion);

        // Partition identity generalized to union of subtrahends:
        // (A \ U) ∪ (A ∩ U) = A
        const interUnion = setIntersectionReference(a, unionSubs);
        assert.deepStrictEqual(setUnionReference(seriesResult, interUnion), a);
        assert.deepStrictEqual(setIntersectionReference(seriesResult, interUnion), []);

        // Verify output is strictly increasing
        for (let i = 1; i < seriesResult.length; i++) {
          assert.ok(seriesResult[i] > seriesResult[i - 1]);
        }
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError when minuend or any subtrahend is not an Array', () => {
      assert.throws(() => setDifferenceSortedArrSeries(), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries(null, []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries(undefined, []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries('123', []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries(new Set([1, 2]), []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries(new Float64Array([1, 2]), []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], null), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], { 0: 1, length: 1 }), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([], [1], 'bad'), TypeError);
    });

    it('throws TypeError for sparse arrays or non-number elements', () => {
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [1, , 3];
      assert.throws(() => setDifferenceSortedArrSeries(sparse, []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], new Array(2)), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, '2', 3], []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], [null]), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], [undefined]), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([1n, 2n], []), TypeError);
      assert.throws(() => setDifferenceSortedArrSeries([true], []), TypeError);
    });

    it('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
      assert.throws(() => setDifferenceSortedArrSeries([1, NaN, 3], []), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], [NaN]), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([-Infinity, 0], []), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([0, Infinity], []), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], [0, Infinity]), RangeError);
    });

    it('throws RangeError for unsorted arrays', () => {
      assert.throws(() => setDifferenceSortedArrSeries([3, 1, 2], []), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2, 3], [5, 4]), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], [1], [2, 1]), RangeError);
    });

    it('throws RangeError for duplicate elements (including -0 and +0 together)', () => {
      assert.throws(() => setDifferenceSortedArrSeries([1, 2, 2, 3], []), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([1, 2], [2, 2]), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([-0, 0], []), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([0, -0], []), RangeError);
    });

    it('validates all subtrahends even when minuend is empty', () => {
      assert.throws(() => setDifferenceSortedArrSeries([], [3, 2, 1]), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([], [1, 1]), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([], [1], [NaN]), RangeError);
      assert.throws(() => setDifferenceSortedArrSeries([], [1], 'not-array'), TypeError);
    });
  });
});
