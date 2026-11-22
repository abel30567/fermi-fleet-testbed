import test from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceMultisetIterative } from './setDifferenceMultisetIterative.js';

/**
 * Independent helper: expands a multiset Map into an array bag of repeated elements.
 */
function toArrayBag(multiset) {
  const bag = [];
  for (const [key, count] of multiset.entries()) {
    for (let i = 0; i < count; i += 1) {
      bag.push(key);
    }
  }
  return bag;
}

/**
 * Independent helper: computes multiset difference via array-bag element removal
 * (using SameValueZero equality to match JavaScript Map key semantics)
 * and tallies the remaining elements back into a canonical Map.
 */
function arrayBagDifference(a, b) {
  const remaining = toArrayBag(a);
  const toRemove = toArrayBag(b);

  for (const item of toRemove) {
    const idx = remaining.findIndex((el) => Object.is(el, item) || (el === 0 && item === 0));
    if (idx !== -1) {
      remaining.splice(idx, 1);
    }
  }

  const tally = new Map();
  for (const item of remaining) {
    tally.set(item, (tally.get(item) ?? 0) + 1);
  }
  return tally;
}

/**
 * Independent helper: total cardinality |M| = sum of multiplicities.
 */
function cardinality(multiset) {
  let total = 0;
  for (const count of multiset.values()) {
    total += count;
  }
  return total;
}

/**
 * Independent helper: multiset intersection A ∩ B where m(x) = min(m_A(x), m_B(x)).
 */
function multisetIntersection(a, b) {
  const result = new Map();
  for (const [key, countA] of a.entries()) {
    const countB = b.get(key) ?? 0;
    const minCount = Math.min(countA, countB);
    if (minCount > 0) {
      result.set(key, minCount);
    }
  }
  return result;
}

/**
 * Independent helper: multiset sum A ⊎ B where m(x) = m_A(x) + m_B(x).
 */
function multisetSum(a, b) {
  const result = new Map();
  for (const [key, count] of a.entries()) {
    if (count > 0) {
      result.set(key, count);
    }
  }
  for (const [key, count] of b.entries()) {
    if (count > 0) {
      result.set(key, (result.get(key) ?? 0) + count);
    }
  }
  return result;
}

/**
 * Independent helper: canonical copy of a multiset (omitting zero counts).
 */
function canonicalize(multiset) {
  const result = new Map();
  for (const [key, count] of multiset.entries()) {
    if (count > 0) {
      result.set(key, count);
    }
  }
  return result;
}

test('normal multiset difference with partial, exact, excess, and disjoint counts', () => {
  const a = new Map([
    ['apple', 5],
    ['banana', 3],
    ['cherry', 2],
    ['date', 4],
  ]);
  const b = new Map([
    ['apple', 2],   // partial subtraction -> 3
    ['banana', 3],  // exact cancellation -> omitted
    ['cherry', 7],  // excess subtraction -> clamped to 0, omitted
    ['elderberry', 6], // key only in b -> ignored
  ]);

  const diff = setDifferenceMultisetIterative(a, b);

  assert.deepEqual(
    diff,
    new Map([
      ['apple', 3],
      ['date', 4],
    ])
  );
  // Inputs must not be mutated and result must be a new Map.
  assert.notEqual(diff, a);
  assert.notEqual(diff, b);
  assert.deepEqual(
    a,
    new Map([
      ['apple', 5],
      ['banana', 3],
      ['cherry', 2],
      ['date', 4],
    ])
  );
  assert.deepEqual(
    b,
    new Map([
      ['apple', 2],
      ['banana', 3],
      ['cherry', 7],
      ['elderberry', 6],
    ])
  );
});

test('edge cases: empty maps, zero counts, -0 counts, and identical map reference', () => {
  const empty = new Map();
  assert.deepEqual(setDifferenceMultisetIterative(empty, empty), new Map());

  const aWithZeros = new Map([
    ['x', 0],
    ['y', 2],
    ['z', -0],
  ]);
  const bWithZeros = new Map([
    ['y', 0],
    ['w', -0],
  ]);

  const diff1 = setDifferenceMultisetIterative(aWithZeros, bWithZeros);
  assert.deepEqual(diff1, new Map([['y', 2]]));
  assert.equal(diff1.has('x'), false);
  assert.equal(diff1.has('z'), false);

  // Subtracting a map from itself (same reference) yields an empty canonical Map.
  const same = new Map([
    ['a', 4],
    ['b', 1],
  ]);
  const selfDiff = setDifferenceMultisetIterative(same, same);
  assert.deepEqual(selfDiff, new Map());
  assert.equal(same.get('a'), 4);
  assert.equal(same.get('b'), 1);

  // Empty minuend always yields empty Map.
  assert.deepEqual(setDifferenceMultisetIterative(empty, same), new Map());
});

test('edge cases: diverse JS key types and SameValueZero semantics', () => {
  const obj1 = { id: 1 };
  const obj2 = { id: 2 };
  const nullProtoObj = Object.create(null);
  const sym = Symbol('token');

  const a = new Map([
    [NaN, 4],
    [-0, 3],
    [obj1, 5],
    [obj2, 2],
    [nullProtoObj, 3],
    [sym, 2],
    [null, 3],
    [undefined, 2],
    [true, 4],
  ]);
  const b = new Map([
    [NaN, 1],
    [0, 2],
    [obj1, 5],
    [nullProtoObj, 1],
    [sym, 5],
    [null, 1],
    [undefined, 2],
    [false, 3],
  ]);

  const diff = setDifferenceMultisetIterative(a, b);
  assert.deepEqual(
    diff,
    new Map([
      [NaN, 3],
      [0, 1],
      [obj2, 2],
      [nullProtoObj, 2],
      [null, 2],
      [true, 4],
    ])
  );
  assert.deepEqual(diff, arrayBagDifference(a, b));
});

test('edge cases: Number.MAX_SAFE_INTEGER counts remain exact', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const a = new Map([
    ['unchanged', max],
    ['minusOne', max],
    ['toOne', max],
    ['cancelled', max],
  ]);
  const b = new Map([
    ['unchanged', 0],
    ['minusOne', 1],
    ['toOne', max - 1],
    ['cancelled', max],
  ]);

  const diff = setDifferenceMultisetIterative(a, b);
  assert.deepEqual(
    diff,
    new Map([
      ['unchanged', max],
      ['minusOne', max - 1],
      ['toOne', 1],
    ])
  );
});

test('input validation: throws TypeError for non-Map arguments or non-number counts', () => {
  const valid = new Map([['a', 1]]);

  for (const invalid of [null, undefined, {}, [], new Set(['a']), 'abc', 42]) {
    assert.throws(() => setDifferenceMultisetIterative(invalid, valid), TypeError);
    assert.throws(() => setDifferenceMultisetIterative(valid, invalid), TypeError);
  }

  for (const badCount of ['1', true, false, null, undefined, 2n, {}, []]) {
    assert.throws(
      () => setDifferenceMultisetIterative(new Map([['a', badCount]]), valid),
      TypeError
    );
    // Validate entries in `b` even when key is not present in `a`.
    assert.throws(
      () => setDifferenceMultisetIterative(valid, new Map([['other', badCount]])),
      TypeError
    );
  }
});

test('input validation: throws RangeError for negative, non-integer, non-finite, or unsafe counts', () => {
  const valid = new Map([['a', 1]]);
  const badCounts = [
    -1,
    -100,
    0.5,
    3.14,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    -Number.MAX_SAFE_INTEGER,
  ];

  for (const badCount of badCounts) {
    assert.throws(
      () => setDifferenceMultisetIterative(new Map([['a', badCount]]), valid),
      RangeError
    );
    // Must also reject invalid counts in `b` for keys absent from `a`.
    assert.throws(
      () => setDifferenceMultisetIterative(valid, new Map([['unmatched', badCount]])),
      RangeError
    );
  }

  // Null-prototype object keys should not cause formatting errors while throwing RangeError.
  const nullProtoKey = Object.create(null);
  assert.throws(
    () => setDifferenceMultisetIterative(new Map([[nullProtoKey, -2]]), valid),
    RangeError
  );
});

test('cross-check against array-bag removal and multiset algebraic identities', () => {
  // Deterministic PRNG (LCG) for reproducible randomized property testing.
  let seed = 1337;
  const nextInt = (maxExclusive) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % maxExclusive;
  };

  const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
  const randomMultiset = () => {
    const m = new Map();
    for (const key of universe) {
      const mode = nextInt(4);
      if (mode === 0) {
        // omit key
      } else if (mode === 1) {
        m.set(key, 0); // explicit zero count
      } else {
        m.set(key, nextInt(8) + 1);
      }
    }
    return m;
  };

  const empty = new Map();

  for (let trial = 0; trial < 100; trial += 1) {
    const a = randomMultiset();
    const b = randomMultiset();
    const c = randomMultiset();

    const diff = setDifferenceMultisetIterative(a, b);

    // 1. Canonical invariant: all counts in result are strictly positive safe integers.
    for (const count of diff.values()) {
      assert.equal(Number.isSafeInteger(count), true);
      assert.equal(count > 0, true);
    }

    // 2. Cross-check against independent array-bag element removal.
    assert.deepEqual(diff, arrayBagDifference(a, b));

    // 3. Identity: A \ A = empty
    assert.deepEqual(setDifferenceMultisetIterative(a, a), empty);

    // 4. Identity: A \ empty = canonical(A)
    assert.deepEqual(setDifferenceMultisetIterative(a, empty), canonicalize(a));

    // 5. Cardinality identity: |A \ B| = |A| - |A ∩ B|
    const inter = multisetIntersection(a, b);
    assert.equal(cardinality(diff), cardinality(a) - cardinality(inter));

    // 6. Partition identity: (A \ B) ⊎ (A ∩ B) = canonical(A)
    assert.deepEqual(multisetSum(diff, inter), canonicalize(a));

    // 7. Sequential subtraction identity: (A \ B) \ C = A \ (B ⊎ C)
    const lhs = setDifferenceMultisetIterative(diff, c);
    const rhs = setDifferenceMultisetIterative(a, multisetSum(b, c));
    assert.deepEqual(lhs, rhs);
  }
});
