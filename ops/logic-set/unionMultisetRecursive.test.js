import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionMultisetRecursive } from './unionMultisetRecursive.js';

/**
 * Independent iterative reference implementation of multiset union
 * using max(A(x), B(x)) semantics and omitting zero-count entries.
 *
 * @template T
 * @param {...Map<T, number>} multisets
 * @returns {Map<T, number>}
 */
function unionMultisetIterativeReference(...multisets) {
  const result = new Map();
  for (const ms of multisets) {
    for (const [key, count] of ms.entries()) {
      if (count > 0) {
        const current = result.get(key) ?? 0;
        if (count > current) {
          result.set(key, count);
        }
      }
    }
  }
  return result;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property and cross-check tests.
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

/**
 * Builds a random multiset over a small alphabet with optional zero counts.
 *
 * @param {() => number} rng
 * @param {string[]} alphabet
 * @param {number} maxCount
 * @returns {Map<string, number>}
 */
function randomMultiset(rng, alphabet, maxCount = 6) {
  const map = new Map();
  for (const key of alphabet) {
    if (rng() < 0.65) {
      map.set(key, Math.floor(rng() * (maxCount + 1)));
    }
  }
  return map;
}

/**
 * Asserts two multiset Maps have identical key-count pairs regardless of order.
 *
 * @template T
 * @param {Map<T, number>} actual
 * @param {Map<T, number>} expected
 */
function assertMultisetEqual(actual, expected) {
  assert.ok(actual instanceof Map, 'result should be a Map');
  assert.equal(actual.size, expected.size, 'multiset sizes should match');
  for (const [key, count] of expected.entries()) {
    assert.equal(actual.get(key), count, `count mismatch for key ${String(key)}`);
  }
}

describe('unionMultisetRecursive', () => {
  it('computes max multiplicity for overlapping multisets', () => {
    const a = new Map([
      ['a', 2],
      ['b', 5],
      ['c', 1],
    ]);
    const b = new Map([
      ['b', 3],
      ['c', 4],
      ['d', 2],
    ]);

    const result = unionMultisetRecursive(a, b);
    assertMultisetEqual(
      result,
      new Map([
        ['a', 2],
        ['b', 5],
        ['c', 4],
        ['d', 2],
      ])
    );
  });

  it('supports variadic union across 3 or more multisets', () => {
    const m1 = new Map([
      ['x', 1],
      ['y', 4],
    ]);
    const m2 = new Map([
      ['y', 2],
      ['z', 3],
    ]);
    const m3 = new Map([
      ['x', 5],
      ['z', 3],
      ['w', 1],
    ]);
    const m4 = new Map([
      ['w', 7],
      ['q', 0],
    ]);

    const result = unionMultisetRecursive(m1, m2, m3, m4);
    assertMultisetEqual(
      result,
      new Map([
        ['x', 5],
        ['y', 4],
        ['z', 3],
        ['w', 7],
      ])
    );
  });

  it('handles 0 arguments and 1 argument cleanly', () => {
    assertMultisetEqual(unionMultisetRecursive(), new Map());

    const single = new Map([
      ['alpha', 3],
      ['zero', 0],
      ['beta', 1],
    ]);
    const normalized = unionMultisetRecursive(single);
    assert.notEqual(normalized, single, 'should return a fresh Map instance');
    assertMultisetEqual(
      normalized,
      new Map([
        ['alpha', 3],
        ['beta', 1],
      ])
    );
  });

  it('handles empty maps, disjoint maps, and identical maps', () => {
    const empty1 = new Map();
    const empty2 = new Map();
    assertMultisetEqual(unionMultisetRecursive(empty1, empty2), new Map());

    const a = new Map([
      ['a', 2],
      ['b', 1],
    ]);
    const b = new Map([
      ['c', 3],
      ['d', 4],
    ]);
    assertMultisetEqual(unionMultisetRecursive(a, empty1), a);
    assertMultisetEqual(unionMultisetRecursive(empty1, a), a);
    assertMultisetEqual(
      unionMultisetRecursive(a, b),
      new Map([
        ['a', 2],
        ['b', 1],
        ['c', 3],
        ['d', 4],
      ])
    );
    assertMultisetEqual(unionMultisetRecursive(a, new Map(a)), a);
  });

  it('omits zero-count and -0-count entries', () => {
    const a = new Map([
      ['zeroOnly', 0],
      ['negZero', -0],
      ['mixed', 0],
      ['keep', 2],
    ]);
    const b = new Map([
      ['zeroOnly', 0],
      ['mixed', 3],
      ['otherZero', 0],
    ]);

    const result = unionMultisetRecursive(a, b);
    assert.equal(result.has('zeroOnly'), false);
    assert.equal(result.has('negZero'), false);
    assert.equal(result.has('otherZero'), false);
    assertMultisetEqual(
      result,
      new Map([
        ['mixed', 3],
        ['keep', 2],
      ])
    );
  });

  it('supports arbitrary JavaScript key types with Map SameValueZero semantics', () => {
    const objKey = { id: 1 };
    const symKey = Symbol('s');
    const a = new Map([
      [objKey, 2],
      [symKey, 1],
      [NaN, 3],
      [null, 1],
      [undefined, 4],
      [-0, 2],
    ]);
    const b = new Map([
      [objKey, 5],
      [symKey, 1],
      [NaN, 7],
      [null, 0],
      [0, 6],
    ]);

    const result = unionMultisetRecursive(a, b);
    assert.equal(result.get(objKey), 5);
    assert.equal(result.get(symKey), 1);
    assert.equal(result.get(NaN), 7);
    assert.equal(result.get(null), 1);
    assert.equal(result.get(undefined), 4);
    assert.equal(result.get(0), 6);
    assert.equal(result.size, 6);
  });

  it('does not mutate input multisets', () => {
    const a = new Map([
      ['a', 1],
      ['zero', 0],
    ]);
    const b = new Map([
      ['a', 5],
      ['b', 2],
    ]);
    const aSnapshot = Array.from(a.entries());
    const bSnapshot = Array.from(b.entries());

    const result = unionMultisetRecursive(a, b);
    result.set('mutated', 99);

    assert.deepEqual(Array.from(a.entries()), aSnapshot);
    assert.deepEqual(Array.from(b.entries()), bSnapshot);
  });

  it('handles large multisets without overflowing the call stack', () => {
    const size = 20000;
    const a = new Map();
    const b = new Map();
    for (let i = 0; i < size; i++) {
      a.set(i, i % 5);
      b.set(i + 10000, (i * 3) % 7);
    }

    const result = unionMultisetRecursive(a, b);
    const expected = unionMultisetIterativeReference(a, b);
    assertMultisetEqual(result, expected);
  });

  it('rejects non-Map inputs with TypeError', () => {
    assert.throws(() => unionMultisetRecursive(null), TypeError);
    assert.throws(() => unionMultisetRecursive(undefined), TypeError);
    assert.throws(() => unionMultisetRecursive({ a: 1 }), TypeError);
    assert.throws(() => unionMultisetRecursive([['a', 1]]), TypeError);
    assert.throws(() => unionMultisetRecursive(new Set(['a'])), TypeError);
    assert.throws(() => unionMultisetRecursive(new Map(), 'not-a-map'), TypeError);
  });

  it('rejects invalid counts (non-number, negative, float, NaN, Infinity)', () => {
    assert.throws(() => unionMultisetRecursive(new Map([['a', '2']])), TypeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', null]])), TypeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', undefined]])), TypeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', 1n]])), TypeError);

    assert.throws(() => unionMultisetRecursive(new Map([['a', -1]])), RangeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', 1.5]])), RangeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', NaN]])), RangeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', Infinity]])), RangeError);
    assert.throws(() => unionMultisetRecursive(new Map([['a', -Infinity]])), RangeError);

    // Invalid count in a later argument must still throw even if earlier map has larger count
    assert.throws(
      () => unionMultisetRecursive(new Map([['a', 10]]), new Map([['a', -2]])),
      RangeError
    );
  });

  it('matches independent iterative reference across randomized binary and variadic cases', () => {
    const rng = createRng(0x5eed1234);
    const alphabet = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (let trial = 0; trial < 100; trial++) {
      const k = 1 + (trial % 6);
      const inputs = [];
      for (let i = 0; i < k; i++) {
        inputs.push(randomMultiset(rng, alphabet, 8));
      }
      const actual = unionMultisetRecursive(...inputs);
      const expected = unionMultisetIterativeReference(...inputs);
      assertMultisetEqual(actual, expected);
    }
  });

  it('satisfies algebraic laws: commutativity, associativity, idempotence, and identity', () => {
    const rng = createRng(0xabcdef01);
    const alphabet = ['p', 'q', 'r', 's', 't', 'u'];
    const empty = new Map();

    for (let trial = 0; trial < 50; trial++) {
      const a = randomMultiset(rng, alphabet);
      const b = randomMultiset(rng, alphabet);
      const c = randomMultiset(rng, alphabet);

      // Commutativity: A ∪ B = B ∪ A
      assertMultisetEqual(unionMultisetRecursive(a, b), unionMultisetRecursive(b, a));

      // Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = union(A, B, C)
      const leftAssoc = unionMultisetRecursive(unionMultisetRecursive(a, b), c);
      const rightAssoc = unionMultisetRecursive(a, unionMultisetRecursive(b, c));
      const flat = unionMultisetRecursive(a, b, c);
      assertMultisetEqual(leftAssoc, rightAssoc);
      assertMultisetEqual(leftAssoc, flat);

      // Idempotence: A ∪ A = normalize(A)
      assertMultisetEqual(unionMultisetRecursive(a, a), unionMultisetRecursive(a));

      // Identity: A ∪ ∅ = ∅ ∪ A = normalize(A)
      assertMultisetEqual(unionMultisetRecursive(a, empty), unionMultisetRecursive(a));
      assertMultisetEqual(unionMultisetRecursive(empty, a), unionMultisetRecursive(a));
    }
  });
});
