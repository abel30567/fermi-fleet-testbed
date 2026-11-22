import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orMultisetSeries } from './orMultisetSeries.js';

/**
 * Independent reference implementation computing multiset OR directly via
 * frequency-table iteration and `Math.max`.
 *
 * @template T
 * @param {...Map<T, number>} multisets
 * @returns {Map<T, number>}
 */
function referenceFrequencyTableMax(...multisets) {
  const keys = new Set();
  for (const ms of multisets) {
    for (const key of ms.keys()) {
      keys.add(key);
    }
  }

  const out = new Map();
  for (const key of keys) {
    let best = 0;
    for (const ms of multisets) {
      const value = ms.get(key) ?? 0;
      if (value > best) {
        best = value;
      }
    }
    if (best > 0) {
      out.set(key, best);
    }
  }
  return out;
}

/**
 * Independent reference implementation for multiset AND (min) over two maps,
 * used for inclusion-exclusion identity verification: max(a, b) + min(a, b) = a + b.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function referenceMin(a, b) {
  const out = new Map();
  for (const [key, countA] of a.entries()) {
    const countB = b.get(key) ?? 0;
    const minVal = Math.min(countA, countB);
    if (minVal > 0) {
      out.set(key, minVal);
    }
  }
  return out;
}

describe('orMultisetSeries', () => {
  it('computes elementwise max over two overlapping multisets', () => {
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

    const result = orMultisetSeries(a, b);
    assert.deepEqual(
      result,
      new Map([
        ['a', 2],
        ['b', 5],
        ['c', 4],
        ['d', 2],
      ])
    );
  });

  it('supports three or more multisets', () => {
    const m1 = new Map([
      ['x', 1],
      ['y', 4],
    ]);
    const m2 = new Map([
      ['x', 3],
      ['z', 2],
    ]);
    const m3 = new Map([
      ['y', 2],
      ['z', 7],
      ['w', 1],
    ]);
    const m4 = new Map([
      ['x', 3],
      ['w', 5],
    ]);

    const result = orMultisetSeries(m1, m2, m3, m4);
    assert.deepEqual(
      result,
      new Map([
        ['x', 3],
        ['y', 4],
        ['z', 7],
        ['w', 5],
      ])
    );
  });

  it('satisfies commutativity, associativity, and idempotence', () => {
    const a = new Map([
      ['p', 2],
      ['q', 6],
    ]);
    const b = new Map([
      ['q', 3],
      ['r', 5],
    ]);
    const c = new Map([
      ['p', 4],
      ['r', 1],
      ['s', 2],
    ]);

    assert.deepEqual(orMultisetSeries(a, b), orMultisetSeries(b, a));
    assert.deepEqual(
      orMultisetSeries(orMultisetSeries(a, b), c),
      orMultisetSeries(a, orMultisetSeries(b, c))
    );
    assert.deepEqual(orMultisetSeries(a, a), a);
  });

  it('handles empty maps', () => {
    const empty1 = new Map();
    const empty2 = new Map();
    const nonEmpty = new Map([
      ['k', 3],
      ['m', 1],
    ]);

    assert.deepEqual(orMultisetSeries(empty1, empty2), new Map());
    assert.deepEqual(orMultisetSeries(empty1, nonEmpty), nonEmpty);
    assert.deepEqual(orMultisetSeries(nonEmpty, empty2), nonEmpty);
    assert.deepEqual(orMultisetSeries(empty1, empty2, new Map()), new Map());
  });

  it('handles disjoint multisets', () => {
    const a = new Map([
      ['alpha', 2],
      ['beta', 4],
    ]);
    const b = new Map([
      ['gamma', 1],
      ['delta', 9],
    ]);

    assert.deepEqual(
      orMultisetSeries(a, b),
      new Map([
        ['alpha', 2],
        ['beta', 4],
        ['gamma', 1],
        ['delta', 9],
      ])
    );
  });

  it('omits zero counts (including -0) from output', () => {
    const a = new Map([
      ['zeroBoth', 0],
      ['zeroInA', 0],
      ['negZero', -0],
      ['posInA', 3],
    ]);
    const b = new Map([
      ['zeroBoth', 0],
      ['zeroInA', 2],
      ['zeroInB', 0],
      ['posInA', 0],
    ]);

    const result = orMultisetSeries(a, b);
    assert.deepEqual(
      result,
      new Map([
        ['posInA', 3],
        ['zeroInA', 2],
      ])
    );
    assert.equal(result.has('zeroBoth'), false);
    assert.equal(result.has('negZero'), false);
    assert.equal(result.has('zeroInB'), false);
  });

  it('handles identical multisets without mutating inputs', () => {
    const a = new Map([
      ['a', 4],
      ['b', 0],
    ]);
    const b = new Map([
      ['a', 4],
      ['b', 0],
    ]);

    const result = orMultisetSeries(a, b);
    assert.deepEqual(result, new Map([['a', 4]]));
    assert.notEqual(result, a);
    assert.notEqual(result, b);
    assert.deepEqual(
      a,
      new Map([
        ['a', 4],
        ['b', 0],
      ])
    );
    assert.deepEqual(
      b,
      new Map([
        ['a', 4],
        ['b', 0],
      ])
    );
  });

  it('supports mixed key types using Map SameValueZero semantics', () => {
    const objKey = { id: 1 };
    const otherObjKey = { id: 1 };
    const symKey = Symbol('token');

    const a = new Map([
      ['str', 1],
      [42, 3],
      [true, 2],
      [null, 1],
      [undefined, 4],
      [Number.NaN, 2],
      [objKey, 5],
      [symKey, 1],
    ]);
    const b = new Map([
      ['str', 4],
      [42, 1],
      [false, 2],
      [null, 3],
      [Number.NaN, 6],
      [objKey, 2],
      [otherObjKey, 7],
      [symKey, 3],
    ]);

    const result = orMultisetSeries(a, b);
    assert.equal(result.get('str'), 4);
    assert.equal(result.get(42), 3);
    assert.equal(result.get(true), 2);
    assert.equal(result.get(false), 2);
    assert.equal(result.get(null), 3);
    assert.equal(result.get(undefined), 4);
    assert.equal(result.get(Number.NaN), 6);
    assert.equal(result.get(objKey), 5);
    assert.equal(result.get(otherObjKey), 7);
    assert.equal(result.get(symKey), 3);
    assert.equal(result.size, 10);
  });

  it('preserves exactness near Number.MAX_SAFE_INTEGER without overflow', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const a = new Map([
      ['hi', max],
      ['pair', max - 1],
      ['same', max],
    ]);
    const b = new Map([
      ['hi', max - 1],
      ['pair', max],
      ['same', max],
    ]);

    const result = orMultisetSeries(a, b);
    assert.equal(result.get('hi'), max);
    assert.equal(result.get('pair'), max);
    assert.equal(result.get('same'), max);
  });

  it('rejects invalid argument counts and non-Map inputs', () => {
    assert.throws(() => orMultisetSeries(), TypeError);
    assert.throws(() => orMultisetSeries(new Map()), TypeError);
    assert.throws(() => orMultisetSeries(null, new Map()), TypeError);
    assert.throws(() => orMultisetSeries(new Map(), undefined), TypeError);
    assert.throws(() => orMultisetSeries({ a: 1 }, new Map()), TypeError);
    assert.throws(() => orMultisetSeries(new Map(), [['a', 1]]), TypeError);
    assert.throws(() => orMultisetSeries(new Map(), new Set(['a'])), TypeError);
    assert.throws(
      () => orMultisetSeries(new Map(), new Map(), 'not-a-map'),
      TypeError
    );
  });

  it('rejects invalid counts across all input maps', () => {
    const valid = new Map([['a', 1]]);

    // Non-number counts
    assert.throws(
      () => orMultisetSeries(new Map([['a', '2']]), valid),
      TypeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', null]])),
      TypeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', undefined]])),
      TypeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', 2n]])),
      TypeError
    );

    // Negative, fractional, non-finite, or unsafe integer counts
    assert.throws(
      () => orMultisetSeries(new Map([['a', -1]]), valid),
      RangeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', 1.5]])),
      RangeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', Number.NaN]])),
      RangeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', Number.POSITIVE_INFINITY]])),
      RangeError
    );
    assert.throws(
      () => orMultisetSeries(valid, new Map([['a', Number.NEGATIVE_INFINITY]])),
      RangeError
    );
    assert.throws(
      () =>
        orMultisetSeries(
          valid,
          new Map([['a', Number.MAX_SAFE_INTEGER + 1]])
        ),
      RangeError
    );
    // Validation must run even on a third map
    assert.throws(
      () => orMultisetSeries(new Map(), valid, new Map([['bad', -3]])),
      RangeError
    );
  });

  it('cross-checks against direct frequency-table max and inclusion-exclusion identity max(a,b) + min(a,b) = a + b', () => {
    // Deterministic LCG for reproducible pseudo-random multisets
    let seed = 0x12345678;
    const nextInt = (bound) => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed % bound;
    };

    const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'];

    const buildRandomMultiset = () => {
      const map = new Map();
      for (const key of universe) {
        const roll = nextInt(4);
        if (roll === 0) {
          continue; // absent
        }
        // Includes occasional explicit zeros and positive counts up to 15
        map.set(key, nextInt(16));
      }
      return map;
    };

    for (let trial = 0; trial < 50; trial += 1) {
      const a = buildRandomMultiset();
      const b = buildRandomMultiset();

      const actualOr = orMultisetSeries(a, b);
      const expectedOr = referenceFrequencyTableMax(a, b);
      const refAnd = referenceMin(a, b);

      // 1. Direct frequency-table max check
      assert.deepEqual(actualOr, expectedOr);

      // 2. Inclusion-exclusion / lattice identity per element:
      //    max(a(x), b(x)) + min(a(x), b(x)) === a(x) + b(x)
      let totalOr = 0;
      let totalAnd = 0;
      let totalA = 0;
      let totalB = 0;
      for (const key of universe) {
        const ca = a.get(key) ?? 0;
        const cb = b.get(key) ?? 0;
        const cor = actualOr.get(key) ?? 0;
        const cand = refAnd.get(key) ?? 0;

        assert.equal(cor + cand, ca + cb);
        totalOr += cor;
        totalAnd += cand;
        totalA += ca;
        totalB += cb;
      }

      // 3. Cardinality inclusion-exclusion check: |A v B| + |A ^ B| = |A| + |B|
      assert.equal(totalOr + totalAnd, totalA + totalB);

      // 4. Multi-way cross-check against direct frequency-table max
      const c = buildRandomMultiset();
      const d = buildRandomMultiset();
      assert.deepEqual(
        orMultisetSeries(a, b, c, d),
        referenceFrequencyTableMax(a, b, c, d)
      );
    }
  });
});
