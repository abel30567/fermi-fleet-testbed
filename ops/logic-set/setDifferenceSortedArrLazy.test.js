import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceSortedArrLazy } from './setDifferenceSortedArrLazy.js';

describe('setDifferenceSortedArrLazy', () => {
  describe('normal cases', () => {
    it('computes set difference of sorted numeric arrays', () => {
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 2, 3, 4, 5], [2, 4])),
        [1, 3, 5]
      );
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 3, 5, 7, 9], [2, 3, 6, 7, 10])),
        [1, 5, 9]
      );
    });

    it('handles disjoint, identical, subset, and superset arrays', () => {
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 3, 5], [2, 4, 6])),
        [1, 3, 5]
      );
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 2, 3], [1, 2, 3])),
        []
      );
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([2, 3], [1, 2, 3, 4])),
        []
      );
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 2, 3, 4], [2, 3])),
        [1, 4]
      );
    });

    it('handles negative numbers, floats, infinities, and signed zero', () => {
      assert.deepEqual(
        Array.from(
          setDifferenceSortedArrLazy(
            [-Infinity, -10.5, -0, 1.25, Infinity],
            [-10.5, 0, Infinity]
          )
        ),
        [-Infinity, 1.25]
      );
    });

    it('supports bigint and string sorted arrays with default comparator', () => {
      assert.deepEqual(
        Array.from(
          setDifferenceSortedArrLazy([1n, 2n, 10n, 100n], [2n, 50n, 100n])
        ),
        [1n, 10n]
      );
      assert.deepEqual(
        Array.from(
          setDifferenceSortedArrLazy(
            ['apple', 'banana', 'cherry', 'date'],
            ['banana', 'date', 'elderberry']
          )
        ),
        ['apple', 'cherry']
      );
    });

    it('supports custom comparators for objects and descending sequences', () => {
      const a = [
        { id: 1, name: 'a' },
        { id: 3, name: 'c' },
        { id: 5, name: 'e' },
      ];
      const b = [
        { id: 2, name: 'b' },
        { id: 3, name: 'c-other' },
      ];
      const byId = (x, y) => x.id - y.id;
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy(a, b, byId)), [
        { id: 1, name: 'a' },
        { id: 5, name: 'e' },
      ]);

      const desc = (x, y) => y - x;
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([10, 7, 4, 1], [8, 7, 1], desc)),
        [10, 4]
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty inputs', () => {
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([], [])), []);
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([], [1, 2, 3])), []);
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 2, 3], [])),
        [1, 2, 3]
      );
    });

    it('handles single-element arrays and non-overlapping ranges', () => {
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([5], [5])), []);
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([5], [6])), [5]);
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([6], [5])), [6]);
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([1, 2, 3], [10, 20, 30])),
        [1, 2, 3]
      );
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy([10, 20, 30], [1, 2, 3])),
        [10, 20, 30]
      );
    });

    it('accepts TypedArrays, Sets, and custom iterable objects', () => {
      const typedA = new Int32Array([1, 2, 4, 8]);
      const setB = new Set([2, 4, 6]);
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy(typedA, setB)),
        [1, 8]
      );

      const customIterable = {
        *[Symbol.iterator]() {
          yield 1;
          yield 4;
          yield 9;
        },
      };
      assert.deepEqual(
        Array.from(setDifferenceSortedArrLazy(customIterable, [4])),
        [1, 9]
      );
    });
  });

  describe('lazy and streaming behavior', () => {
    it('does not pull any elements until iterated', () => {
      let pullsA = 0;
      let pullsB = 0;
      const genA = (function* () {
        for (const v of [1, 2, 3]) {
          pullsA++;
          yield v;
        }
      })();
      const genB = (function* () {
        for (const v of [2]) {
          pullsB++;
          yield v;
        }
      })();

      const diff = setDifferenceSortedArrLazy(genA, genB);
      assert.equal(pullsA, 0);
      assert.equal(pullsB, 0);

      assert.deepEqual(diff.next(), { value: 1, done: false });
      assert.equal(pullsA, 1);
      assert.equal(pullsB, 1);

      assert.deepEqual(diff.next(), { value: 3, done: false });
      assert.equal(pullsA, 3);
      assert.equal(pullsB, 1);

      assert.deepEqual(diff.next(), { value: undefined, done: true });
    });

    it('never pulls from sortedB when sortedA is empty', () => {
      let openedB = false;
      const iterableB = {
        [Symbol.iterator]() {
          openedB = true;
          return [1, 2, 3][Symbol.iterator]();
        },
      };
      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([], iterableB)), []);
      assert.equal(openedB, false);
    });

    it('defers advancing sortedB after an equal match', () => {
      let pullsB = 0;
      const genB = (function* () {
        for (const v of [1, 2, 3, 4]) {
          pullsB++;
          yield v;
        }
      })();

      assert.deepEqual(Array.from(setDifferenceSortedArrLazy([1], genB)), []);
      assert.equal(pullsB, 1);
    });

    it('streams over infinite sequences and closes iterators on early break', () => {
      let closedA = false;
      let closedB = false;
      let pullsA = 0;
      let pullsB = 0;

      function* naturals() {
        try {
          for (let i = 0; ; i++) {
            pullsA++;
            yield i;
          }
        } finally {
          closedA = true;
        }
      }

      function* evens() {
        try {
          for (let i = 0; ; i += 2) {
            pullsB++;
            yield i;
          }
        } finally {
          closedB = true;
        }
      }

      const firstFiveOdds = [];
      for (const value of setDifferenceSortedArrLazy(naturals(), evens())) {
        firstFiveOdds.push(value);
        if (firstFiveOdds.length === 5) {
          break;
        }
      }

      assert.deepEqual(firstFiveOdds, [1, 3, 5, 7, 9]);
      assert.equal(closedA, true);
      assert.equal(closedB, true);
      assert.equal(pullsA, 10); // 0..9
      assert.equal(pullsB, 6); // 0, 2, 4, 6, 8, 10
    });
  });

  describe('invalid input handling', () => {
    it('throws TypeError eagerly for non-iterable or primitive inputs', () => {
      const badInputs = [null, undefined, 42, true, 'abc', {}, () => {}];
      for (const bad of badInputs) {
        assert.throws(() => setDifferenceSortedArrLazy(bad, []), TypeError);
        assert.throws(() => setDifferenceSortedArrLazy([], bad), TypeError);
      }
    });

    it('throws TypeError eagerly when compareFn is not a function', () => {
      assert.throws(() => setDifferenceSortedArrLazy([], [], null), TypeError);
      assert.throws(() => setDifferenceSortedArrLazy([], [], 'asc'), TypeError);
      assert.throws(() => setDifferenceSortedArrLazy([], [], 123), TypeError);
    });

    it('throws RangeError for unsorted or duplicate elements in sortedA or sortedB', () => {
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1, 3, 2], [])),
        RangeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1, 2, 2], [])),
        RangeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([-0, 0], [])),
        RangeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1, 5], [3, 2])),
        RangeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1, 5], [2, 2])),
        RangeError
      );
    });

    it('throws RangeError for NaN elements under default comparator', () => {
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([NaN], [])),
        RangeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1], [NaN])),
        RangeError
      );
    });

    it('throws TypeError for incomparable types or invalid compareFn returns', () => {
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1, '2'], [])),
        TypeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1], ['1'])),
        TypeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([{}], [])),
        TypeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1], [1], () => NaN)),
        TypeError
      );
      assert.throws(
        () => Array.from(setDifferenceSortedArrLazy([1], [1], () => '0')),
        TypeError
      );
    });
  });

  describe('independent cross-check and algebraic properties', () => {
    it('matches Set-based reference implementation across 200 seeded random pairs', () => {
      // Mulberry32 deterministic PRNG
      let state = 0x5eed1234;
      const rand = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      const genSortedUnique = (maxLen, domain) => {
        const len = Math.floor(rand() * (maxLen + 1));
        const s = new Set();
        for (let i = 0; i < len; i++) {
          s.add(Math.floor(rand() * domain) - Math.floor(domain / 2));
        }
        return Array.from(s).sort((x, y) => x - y);
      };

      for (let trial = 0; trial < 200; trial++) {
        const domain = 5 + (trial % 60);
        const a = genSortedUnique(40, domain);
        const b = genSortedUnique(40, domain);

        const actual = Array.from(setDifferenceSortedArrLazy(a, b));
        const setB = new Set(b);
        const expected = a.filter((x) => !setB.has(x));

        assert.deepEqual(actual, expected);

        // Verify algebraic set identities:
        // 1. (A \ B) ∩ B = ∅
        for (const x of actual) {
          assert.equal(setB.has(x), false);
        }
        // 2. Output is strictly ascending
        for (let i = 1; i < actual.length; i++) {
          assert.ok(actual[i - 1] < actual[i]);
        }
        // 3. |(A \ B)| + |(A ∩ B)| = |A|
        const intersectionCount = a.filter((x) => setB.has(x)).length;
        assert.equal(actual.length + intersectionCount, a.length);
      }
    });
  });
});
