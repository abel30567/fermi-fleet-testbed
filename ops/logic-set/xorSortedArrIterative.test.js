import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorSortedArrIterative } from './xorSortedArrIterative.js';

/**
 * Independent reference implementation of symmetric difference (XOR) using Set
 * membership and sorting, for cross-checking the merge-style implementation.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @param {(x: T, y: T) => number} [compare]
 * @returns {T[]}
 */
function referenceSetXor(a, b, compare) {
  const setA = new Set(a);
  const setB = new Set(b);
  const out = [];
  for (const x of setA) {
    if (!setB.has(x)) out.push(x);
  }
  for (const y of setB) {
    if (!setA.has(y)) out.push(y);
  }
  const cmp = compare ?? ((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return out.sort(cmp);
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('xorSortedArrIterative', () => {
  describe('normal cases', () => {
    it('computes symmetric difference of overlapping numeric arrays', () => {
      assert.deepEqual(
        xorSortedArrIterative([1, 2, 3, 5, 8], [2, 3, 4, 6, 8, 9]),
        [1, 4, 5, 6, 9],
      );
    });

    it('merges completely disjoint numeric arrays in sorted order', () => {
      assert.deepEqual(
        xorSortedArrIterative([1, 3, 5], [2, 4, 6]),
        [1, 2, 3, 4, 5, 6],
      );
      assert.deepEqual(
        xorSortedArrIterative([-10, -5, 0], [1, 2, 3]),
        [-10, -5, 0, 1, 2, 3],
      );
    });

    it('returns empty array for identical arrays', () => {
      assert.deepEqual(xorSortedArrIterative([1, 2, 3], [1, 2, 3]), []);
    });

    it('handles subset and superset relationships', () => {
      assert.deepEqual(xorSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5]);
      assert.deepEqual(xorSortedArrIterative([2, 4], [1, 2, 3, 4, 5]), [1, 3, 5]);
    });

    it('works with negative numbers, floats, and infinities', () => {
      assert.deepEqual(
        xorSortedArrIterative([-Infinity, -2.5, 0, 1.5, Infinity], [-2.5, 0.5, Infinity]),
        [-Infinity, 0, 0.5, 1.5],
      );
    });

    it('works with sorted de-duplicated string arrays', () => {
      assert.deepEqual(
        xorSortedArrIterative(['apple', 'banana', 'cherry'], ['banana', 'date']),
        ['apple', 'cherry', 'date'],
      );
    });

    it('works with sorted de-duplicated bigint arrays', () => {
      assert.deepEqual(
        xorSortedArrIterative([-10n, 0n, 10n, 2n ** 80n], [0n, 5n, 2n ** 80n]),
        [-10n, 5n, 10n],
      );
    });

    it('supports custom comparators (objects and descending order)', () => {
      const byId = (x, y) => x.id - y.id;
      const a = [{ id: 1, v: 'a' }, { id: 3, v: 'c' }, { id: 5, v: 'e' }];
      const b = [{ id: 2, v: 'b' }, { id: 3, v: 'c-other' }, { id: 6, v: 'f' }];
      assert.deepEqual(xorSortedArrIterative(a, b, byId), [
        { id: 1, v: 'a' },
        { id: 2, v: 'b' },
        { id: 5, v: 'e' },
        { id: 6, v: 'f' },
      ]);

      const desc = (x, y) => y - x;
      assert.deepEqual(
        xorSortedArrIterative([10, 7, 3, 1], [9, 7, 2, 1], desc),
        [10, 9, 3, 2],
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty arrays and returns a new array without mutating inputs', () => {
      assert.deepEqual(xorSortedArrIterative([], []), []);

      const a = [1, 2, 3];
      const b = [4, 5];
      const resA = xorSortedArrIterative(a, []);
      const resB = xorSortedArrIterative([], b);

      assert.deepEqual(resA, [1, 2, 3]);
      assert.notEqual(resA, a);
      assert.deepEqual(resB, [4, 5]);
      assert.notEqual(resB, b);

      const snapshotA = [...a];
      const snapshotB = [...b];
      xorSortedArrIterative(a, b);
      assert.deepEqual(a, snapshotA);
      assert.deepEqual(b, snapshotB);
    });

    it('handles single-element arrays', () => {
      assert.deepEqual(xorSortedArrIterative([1], [1]), []);
      assert.deepEqual(xorSortedArrIterative([1], [2]), [1, 2]);
      assert.deepEqual(xorSortedArrIterative([2], [1]), [1, 2]);
      assert.deepEqual(xorSortedArrIterative([1], []), [1]);
      assert.deepEqual(xorSortedArrIterative([], [1]), [1]);
    });

    it('treats -0 and +0 as equal', () => {
      assert.deepEqual(xorSortedArrIterative([-0], [0]), []);
      assert.deepEqual(xorSortedArrIterative([-1, -0, 1], [0]), [-1, 1]);
    });

    it('handles large arrays iteratively without stack overflow', () => {
      const n = 20000;
      const evens = [];
      const mult3 = [];
      for (let i = 0; i < n; i += 1) {
        if (i % 2 === 0) evens.push(i);
        if (i % 3 === 0) mult3.push(i);
      }
      const actual = xorSortedArrIterative(evens, mult3);
      const expected = [];
      for (let i = 0; i < n; i += 1) {
        const inEvens = i % 2 === 0;
        const inMult3 = i % 3 === 0;
        if (inEvens !== inMult3) expected.push(i);
      }
      assert.deepEqual(actual, expected);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array inputs', () => {
      for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
        assert.throws(() => xorSortedArrIterative(bad, [1]), TypeError);
        assert.throws(() => xorSortedArrIterative([1], bad), TypeError);
      }
    });

    it('throws TypeError for sparse arrays', () => {
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [1, , 3];
      assert.throws(() => xorSortedArrIterative(sparse, [2]), TypeError);
      assert.throws(() => xorSortedArrIterative([2], sparse), TypeError);
      assert.throws(() => xorSortedArrIterative(new Array(2), []), TypeError);
    });

    it('throws TypeError when compare is provided but not a function', () => {
      assert.throws(() => xorSortedArrIterative([1], [2], 'asc'), TypeError);
      assert.throws(() => xorSortedArrIterative([1], [2], null), TypeError);
      assert.throws(() => xorSortedArrIterative([1], [2], 123), TypeError);
    });

    it('throws TypeError for unsupported or mixed element types in default mode', () => {
      assert.throws(() => xorSortedArrIterative([null], []), TypeError);
      assert.throws(() => xorSortedArrIterative([undefined], []), TypeError);
      assert.throws(() => xorSortedArrIterative([{}], []), TypeError);
      assert.throws(() => xorSortedArrIterative([true], []), TypeError);
      assert.throws(() => xorSortedArrIterative([1, '2'], []), TypeError);
      assert.throws(() => xorSortedArrIterative([1, 2], ['a', 'b']), TypeError);
      assert.throws(() => xorSortedArrIterative([1n], [1]), TypeError);
    });

    it('throws RangeError for NaN elements in default mode', () => {
      assert.throws(() => xorSortedArrIterative([NaN], []), RangeError);
      assert.throws(() => xorSortedArrIterative([1, NaN], [2]), RangeError);
      assert.throws(() => xorSortedArrIterative([1], [NaN]), RangeError);
    });

    it('throws RangeError for unsorted or duplicate-containing arrays', () => {
      assert.throws(() => xorSortedArrIterative([2, 1], []), RangeError);
      assert.throws(() => xorSortedArrIterative([], [3, 2, 1]), RangeError);
      assert.throws(() => xorSortedArrIterative([1, 2, 2, 3], [4]), RangeError);
      assert.throws(() => xorSortedArrIterative([4], [1, 1]), RangeError);
      assert.throws(() => xorSortedArrIterative([-0, 0], []), RangeError);
      assert.throws(
        () => xorSortedArrIterative([1, 2, 3], [3, 2], (x, y) => x - y),
        RangeError,
      );
    });

    it('validates custom comparator return values', () => {
      assert.throws(
        () => xorSortedArrIterative([1], [2], () => '0'),
        TypeError,
      );
      assert.throws(
        () => xorSortedArrIterative([1], [2], () => NaN),
        RangeError,
      );
      assert.throws(
        () => xorSortedArrIterative([1, 2], [], () => NaN),
        RangeError,
      );
    });
  });

  describe('cross-checks and algebraic identities', () => {
    it('matches Set-based reference and satisfies Boolean ring identities across randomized inputs', () => {
      const rng = createRng(0x5eed1234);

      const makeSortedUnique = (maxLen, domain) => {
        const len = Math.floor(rng() * (maxLen + 1));
        const set = new Set();
        for (let k = 0; k < len; k += 1) {
          set.add(Math.floor(rng() * domain) - Math.floor(domain / 2));
        }
        return [...set].sort((x, y) => x - y);
      };

      for (let trial = 0; trial < 100; trial += 1) {
        const a = makeSortedUnique(25, 40);
        const b = makeSortedUnique(25, 40);
        const c = makeSortedUnique(25, 40);

        const ab = xorSortedArrIterative(a, b);
        const refAb = referenceSetXor(a, b);

        // 1. Exact agreement with independent Set-based reference implementation
        assert.deepEqual(ab, refAb);

        // 2. Output is strictly sorted and de-duplicated
        for (let i = 1; i < ab.length; i += 1) {
          assert.ok(ab[i - 1] < ab[i], 'output must be strictly increasing');
        }

        // 3. Commutativity: A ^ B === B ^ A
        assert.deepEqual(ab, xorSortedArrIterative(b, a));

        // 4. Associativity: (A ^ B) ^ C === A ^ (B ^ C)
        assert.deepEqual(
          xorSortedArrIterative(ab, c),
          xorSortedArrIterative(a, xorSortedArrIterative(b, c)),
        );

        // 5. Identity & self-inverse: A ^ [] === A, A ^ A === [], (A ^ B) ^ B === A
        assert.deepEqual(xorSortedArrIterative(a, []), a);
        assert.deepEqual(xorSortedArrIterative(a, a), []);
        assert.deepEqual(xorSortedArrIterative(ab, b), a);

        // 6. Cardinality identity: |A ^ B| = |A| + |B| - 2 * |A ∩ B|
        const setB = new Set(b);
        let intersectionSize = 0;
        for (const x of a) {
          if (setB.has(x)) intersectionSize += 1;
        }
        assert.equal(ab.length, a.length + b.length - 2 * intersectionSize);
      }
    });
  });
});
