import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorBoolSeries } from './xorBoolSeries.js';

/**
 * Helper to assert two Sets have identical membership.
 *
 * @param {Set<*>} actual
 * @param {Set<*>} expected
 */
function assertSetEqual(actual, expected) {
  assert.ok(actual instanceof Set, 'Expected result to be a Set');
  assert.equal(actual.size, expected.size, 'Set sizes should match');
  for (const item of expected) {
    assert.ok(actual.has(item), `Expected result Set to contain ${String(item)}`);
  }
}

describe('xorBoolSeries', () => {
  describe('plain booleans — normal cases', () => {
    it('matches the complete XOR truth table', () => {
      assert.strictEqual(xorBoolSeries(false, false), false);
      assert.strictEqual(xorBoolSeries(false, true), true);
      assert.strictEqual(xorBoolSeries(true, false), true);
      assert.strictEqual(xorBoolSeries(true, true), false);
    });
  });

  describe('Set symmetric difference — normal cases', () => {
    it('computes symmetric difference for partially overlapping sets', () => {
      const a = new Set([1, 2, 3, 4]);
      const b = new Set([3, 4, 5, 6]);
      assertSetEqual(xorBoolSeries(a, b), new Set([1, 2, 5, 6]));
    });

    it('returns union for disjoint sets', () => {
      const a = new Set(['a', 'b']);
      const b = new Set(['c', 'd']);
      assertSetEqual(xorBoolSeries(a, b), new Set(['a', 'b', 'c', 'd']));
    });

    it('returns relative complement when one set is a subset of the other', () => {
      const sub = new Set([2, 4]);
      const sup = new Set([1, 2, 3, 4, 5]);
      assertSetEqual(xorBoolSeries(sub, sup), new Set([1, 3, 5]));
      assertSetEqual(xorBoolSeries(sup, sub), new Set([1, 3, 5]));
    });
  });

  describe('Set symmetric difference — edge cases', () => {
    it('handles empty sets and returns fresh Set instances', () => {
      const emptyA = new Set();
      const emptyB = new Set();
      const nonEmpty = new Set([10, 20]);

      const resEmpty = xorBoolSeries(emptyA, emptyB);
      assertSetEqual(resEmpty, new Set());
      assert.notStrictEqual(resEmpty, emptyA);
      assert.notStrictEqual(resEmpty, emptyB);

      const resRight = xorBoolSeries(nonEmpty, emptyA);
      assertSetEqual(resRight, nonEmpty);
      assert.notStrictEqual(resRight, nonEmpty);

      const resLeft = xorBoolSeries(emptyA, nonEmpty);
      assertSetEqual(resLeft, nonEmpty);
      assert.notStrictEqual(resLeft, nonEmpty);
    });

    it('returns an empty set for identical sets or the same Set reference', () => {
      const a = new Set([1, 'x', true]);
      const b = new Set([1, 'x', true]);

      assertSetEqual(xorBoolSeries(a, b), new Set());
      assertSetEqual(xorBoolSeries(a, a), new Set());
      // Ensure self-XOR did not mutate input set
      assertSetEqual(a, new Set([1, 'x', true]));
    });

    it('does not mutate input sets and decouples returned set', () => {
      const a = new Set([1, 2]);
      const b = new Set([2, 3]);
      const res = xorBoolSeries(a, b);
      res.add(999);

      assertSetEqual(a, new Set([1, 2]));
      assertSetEqual(b, new Set([2, 3]));
    });

    it('respects SameValueZero semantics for NaN, -0/+0, null, undefined, objects, and symbols', () => {
      const objShared = { id: 1 };
      const objOnlyA = { id: 2 };
      const symShared = Symbol('shared');
      const symOnlyB = Symbol('onlyB');

      const a = new Set([NaN, -0, null, objShared, objOnlyA, symShared]);
      const b = new Set([NaN, +0, undefined, objShared, symShared, symOnlyB]);

      const res = xorBoolSeries(a, b);
      assertSetEqual(res, new Set([null, undefined, objOnlyA, symOnlyB]));
      assert.strictEqual(res.has(NaN), false);
      assert.strictEqual(res.has(0), false);

      // NaN present in only one set is retained
      const resNaN = xorBoolSeries(new Set([NaN]), new Set([1]));
      assertSetEqual(resNaN, new Set([NaN, 1]));
    });

    it('handles larger sets accurately', () => {
      const a = new Set();
      const b = new Set();
      for (let i = 0; i < 1000; i++) a.add(i);
      for (let i = 500; i < 1500; i++) b.add(i);

      const res = xorBoolSeries(a, b);
      assert.equal(res.size, 1000);
      for (let i = 0; i < 500; i++) assert.ok(res.has(i));
      for (let i = 500; i < 1000; i++) assert.ok(!res.has(i));
      for (let i = 1000; i < 1500; i++) assert.ok(res.has(i));
    });
  });

  describe('input validation', () => {
    it('throws TypeError on mixed boolean and Set arguments', () => {
      assert.throws(() => xorBoolSeries(true, new Set()), TypeError);
      assert.throws(() => xorBoolSeries(new Set(), false), TypeError);
    });

    it('throws TypeError on non-boolean primitives and boxed Boolean objects', () => {
      const invalidPairs = [
        [0, 1],
        [1, 0],
        ['true', 'false'],
        ['', 'a'],
        [null, null],
        [undefined, undefined],
        [NaN, true],
        [true, 1],
        [false, 0],
        [new Boolean(true), false],
        [new Boolean(true), new Boolean(false)],
      ];

      for (const [a, b] of invalidPairs) {
        assert.throws(() => xorBoolSeries(a, b), TypeError);
      }
    });

    it('throws TypeError on non-Set collections and missing arguments', () => {
      assert.throws(() => xorBoolSeries([1, 2], [2, 3]), TypeError);
      assert.throws(() => xorBoolSeries(new Set([1]), [1]), TypeError);
      assert.throws(() => xorBoolSeries(new Map(), new Map()), TypeError);
      assert.throws(() => xorBoolSeries(new WeakSet(), new WeakSet()), TypeError);
      assert.throws(() => xorBoolSeries({}, {}), TypeError);
      assert.throws(() => xorBoolSeries(), TypeError);
      assert.throws(() => xorBoolSeries(true), TypeError);
      assert.throws(() => xorBoolSeries(new Set()), TypeError);
    });
  });

  describe('independent cross-checks and algebraic identities', () => {
    it('cross-checks boolean XOR against logical and Walsh-Hadamard identities', () => {
      const bools = [false, true];
      const toSign = (p) => (p ? -1 : 1);

      for (const a of bools) {
        // Identity, negation, and self-inverse
        assert.strictEqual(xorBoolSeries(a, false), a);
        assert.strictEqual(xorBoolSeries(a, true), !a);
        assert.strictEqual(xorBoolSeries(a, a), false);

        for (const b of bools) {
          const got = xorBoolSeries(a, b);
          // Independent logical definition: (a || b) && !(a && b)
          const logicalXor = (a || b) && !(a && b);
          assert.strictEqual(got, logicalXor);

          // Walsh-Hadamard multiplicative character identity: (-1)^χ(a⊕b) = (-1)^χ(a) · (-1)^χ(b)
          assert.strictEqual(toSign(got), toSign(a) * toSign(b));

          // Commutativity
          assert.strictEqual(got, xorBoolSeries(b, a));

          for (const c of bools) {
            // Associativity: (a ⊕ b) ⊕ c === a ⊕ (b ⊕ c)
            assert.strictEqual(
              xorBoolSeries(xorBoolSeries(a, b), c),
              xorBoolSeries(a, xorBoolSeries(b, c))
            );
          }
        }
      }
    });

    it('cross-checks Set symmetric difference against (A ∪ B) \\ (A ∩ B) and inclusion-exclusion cardinality', () => {
      const a = new Set([1, 2, 3, 4, 5]);
      const b = new Set([4, 5, 6, 7]);
      const c = new Set([2, 5, 7, 8, 9]);

      const union = new Set([...a, ...b]);
      const intersection = new Set([...a].filter((x) => b.has(x)));
      const independentDiff = new Set([...union].filter((x) => !intersection.has(x)));

      const got = xorBoolSeries(a, b);
      assertSetEqual(got, independentDiff);

      // Inclusion-exclusion cardinality identity: |A Δ B| = |A| + |B| - 2|A ∩ B|
      assert.strictEqual(got.size, a.size + b.size - 2 * intersection.size);

      // Commutativity: A Δ B = B Δ A
      assertSetEqual(got, xorBoolSeries(b, a));

      // Associativity: (A Δ B) Δ C = A Δ (B Δ C)
      assertSetEqual(
        xorBoolSeries(xorBoolSeries(a, b), c),
        xorBoolSeries(a, xorBoolSeries(b, c))
      );

      // Cancellation / self-inverse: (A Δ B) Δ B = A
      assertSetEqual(xorBoolSeries(got, b), a);
    });
  });
});
