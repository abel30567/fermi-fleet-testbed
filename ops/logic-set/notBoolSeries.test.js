import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notBoolSeries } from './notBoolSeries.js';

/**
 * Helper: checks structural equality of two Sets.
 * @template T
 * @param {Set<T>} actual
 * @param {Set<T>} expected
 */
function assertSetEqual(actual, expected) {
  assert.ok(actual instanceof Set, 'expected a Set instance');
  assert.equal(actual.size, expected.size);
  for (const item of expected) {
    assert.ok(actual.has(item), `missing expected element: ${String(item)}`);
  }
}

describe('notBoolSeries — boolean mode', () => {
  it('negates plain booleans accurately', () => {
    assert.strictEqual(notBoolSeries(true), false);
    assert.strictEqual(notBoolSeries(false), true);
    assert.strictEqual(notBoolSeries(true, undefined), false);
    assert.strictEqual(notBoolSeries(false, undefined), true);
  });

  it('satisfies involution, excluded middle, non-contradiction, and ANF/XOR cross-check', () => {
    for (const a of [false, true]) {
      const negated = notBoolSeries(a);
      // Cross-check against native logical negation and Z_2 XOR-with-1 identity
      assert.strictEqual(negated, !a);
      assert.strictEqual(Number(negated), Number(a) ^ 1);
      // Involution: ¬(¬a) = a
      assert.strictEqual(notBoolSeries(negated), a);
      // Excluded middle & non-contradiction
      assert.strictEqual(a || negated, true);
      assert.strictEqual(a && negated, false);
    }
  });

  it('satisfies De Morgan laws across all boolean pairs', () => {
    for (const a of [false, true]) {
      for (const b of [false, true]) {
        assert.strictEqual(
          notBoolSeries(a && b),
          notBoolSeries(a) || notBoolSeries(b)
        );
        assert.strictEqual(
          notBoolSeries(a || b),
          notBoolSeries(a) && notBoolSeries(b)
        );
      }
    }
  });
});

describe('notBoolSeries — Set mode', () => {
  it('computes relative complement U \\ A for typical sets', () => {
    const universe = new Set([1, 2, 3, 4, 5]);
    const a = new Set([2, 4]);
    const result = notBoolSeries(a, universe);
    assertSetEqual(result, new Set([1, 3, 5]));
  });

  it('does not mutate input sets and always returns a fresh Set instance', () => {
    const universe = new Set(['a', 'b', 'c']);
    const empty = new Set();
    const result = notBoolSeries(empty, universe);

    assertSetEqual(result, universe);
    assert.notStrictEqual(result, universe);
    assert.notStrictEqual(result, empty);

    result.add('z');
    assert.equal(universe.has('z'), false);
    assert.equal(empty.size, 0);
  });

  it('handles edge cases: empty sets, equal sets, disjoint sets, and supersets', () => {
    // Empty universe and empty set
    assertSetEqual(notBoolSeries(new Set(), new Set()), new Set());

    // Empty universe and non-empty set
    assertSetEqual(notBoolSeries(new Set([1, 2]), new Set()), new Set());

    // a === universe (same reference and equal contents)
    const u = new Set([10, 20, 30]);
    assertSetEqual(notBoolSeries(u, u), new Set());
    assertSetEqual(notBoolSeries(new Set([10, 20, 30]), u), new Set());

    // Disjoint sets
    assertSetEqual(notBoolSeries(new Set([40, 50]), u), new Set([10, 20, 30]));

    // Partial overlap with elements outside universe
    assertSetEqual(
      notBoolSeries(new Set([20, 99, 100]), u),
      new Set([10, 30])
    );

    // Superset of universe
    assertSetEqual(
      notBoolSeries(new Set([10, 20, 30, 40]), u),
      new Set()
    );
  });

  it('preserves JS Set SameValueZero semantics for NaN, signed zero, objects, and symbols', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const sym1 = Symbol('s1');
    const sym2 = Symbol('s2');

    const universe = new Set([NaN, 0, null, undefined, obj1, obj2, sym1, sym2]);
    const a = new Set([NaN, -0, null, obj1, sym2]);
    const result = notBoolSeries(a, universe);

    assertSetEqual(result, new Set([undefined, obj2, sym1]));
    assert.equal(result.has(NaN), false);
    assert.equal(result.has(0), false);
    assert.equal(result.has(-0), false);
  });

  it('cross-checks against independent filter computation, involution, partition, and De Morgan laws', () => {
    const universe = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const a = new Set([1, 2, 3, 5, 8]);
    const b = new Set([0, 2, 4, 6, 8]);

    const compA = notBoolSeries(a, universe);
    const compB = notBoolSeries(b, universe);

    // Independent filter-based relative complement
    const expectedCompA = new Set([...universe].filter((x) => !a.has(x)));
    assertSetEqual(compA, expectedCompA);

    // Partition & cardinality: A ∪ (U \ A) = U, A ∩ (U \ A) = ∅, |A| + |U \ A| = |U|
    const unionACompA = new Set([...a, ...compA]);
    const interACompA = new Set([...a].filter((x) => compA.has(x)));
    assertSetEqual(unionACompA, universe);
    assertSetEqual(interACompA, new Set());
    assert.equal(a.size + compA.size, universe.size);

    // Involution for subset A ⊆ U: U \ (U \ A) = A
    assertSetEqual(notBoolSeries(compA, universe), a);

    // General double-complement identity: U \ (U \ C) = C ∩ U
    const c = new Set([2, 5, 99, 100]);
    const doubleCompC = notBoolSeries(notBoolSeries(c, universe), universe);
    const cInterU = new Set([...c].filter((x) => universe.has(x)));
    assertSetEqual(doubleCompC, cInterU);

    // De Morgan's laws:
    // U \ (A ∪ B) = (U \ A) ∩ (U \ B)
    const unionAB = new Set([...a, ...b]);
    const interCompACompB = new Set([...compA].filter((x) => compB.has(x)));
    assertSetEqual(notBoolSeries(unionAB, universe), interCompACompB);

    // U \ (A ∩ B) = (U \ A) ∪ (U \ B)
    const interAB = new Set([...a].filter((x) => b.has(x)));
    const unionCompACompB = new Set([...compA, ...compB]);
    assertSetEqual(notBoolSeries(interAB, universe), unionCompACompB);
  });

  it('handles large sets accurately', () => {
    const n = 10_000;
    const universe = new Set();
    const evens = new Set();
    for (let i = 0; i < n; i++) {
      universe.add(i);
      if (i % 2 === 0) evens.add(i);
    }
    const odds = notBoolSeries(evens, universe);
    assert.equal(odds.size, n / 2);
    assert.equal(odds.has(0), false);
    assert.equal(odds.has(1), true);
    assert.equal(odds.has(n - 1), true);
    assert.equal(odds.has(n - 2), false);
  });
});

describe('notBoolSeries — input validation', () => {
  it('throws TypeError for non-boolean, non-Set first arguments', () => {
    const invalidInputs = [
      undefined,
      null,
      0,
      1,
      NaN,
      '',
      'true',
      'false',
      [],
      [true],
      {},
      new Boolean(true),
      new Boolean(false),
      new Map(),
      new WeakSet(),
      Symbol('bool'),
      1n,
      () => true,
    ];

    for (const input of invalidInputs) {
      assert.throws(
        () => notBoolSeries(/** @type {any} */ (input)),
        { name: 'TypeError' },
        `expected TypeError for input: ${String(input)}`
      );
    }
  });

  it('throws TypeError when first argument is a Set and universe is missing or not a Set', () => {
    const a = new Set([1, 2]);
    const invalidUniverses = [
      undefined,
      null,
      [1, 2, 3],
      {},
      true,
      false,
      42,
      '123',
      new Map([[1, true]]),
      new WeakSet(),
    ];

    assert.throws(() => notBoolSeries(/** @type {any} */ (a)), {
      name: 'TypeError',
    });

    for (const universe of invalidUniverses) {
      assert.throws(
        () => notBoolSeries(a, /** @type {any} */ (universe)),
        { name: 'TypeError' },
        `expected TypeError for universe: ${String(universe)}`
      );
    }
  });

  it('throws TypeError when first argument is a boolean and an extra universe argument is passed', () => {
    assert.throws(
      () => notBoolSeries(true, /** @type {any} */ (new Set([true, false]))),
      { name: 'TypeError' }
    );
    assert.throws(
      () => notBoolSeries(false, /** @type {any} */ (null)),
      { name: 'TypeError' }
    );
    assert.throws(
      () => notBoolSeries(true, /** @type {any} */ (false)),
      { name: 'TypeError' }
    );
  });
});
