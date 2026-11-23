import test from 'node:test';
import assert from 'node:assert/strict';
import { unionFuzzyStable } from './unionFuzzyStable.js';

/**
 * Independent Neumaier compensated summation for accurate scalar cardinality
 * (sigma-count) verification over large or ill-conditioned fuzzy sets.
 *
 * @param {Iterable<number>} values
 * @returns {number}
 */
function neumaierSum(values) {
  let sum = 0;
  let comp = 0;
  for (const x of values) {
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) {
      comp += (sum - t) + x;
    } else {
      comp += (x - t) + sum;
    }
    sum = t;
  }
  return sum + comp;
}

/**
 * Independent exact BigInt De Morgan Zadeh union over scaled integer memberships:
 *   union(a, b) = scale - min(scale - a, scale - b)
 * Used as an independent exact reference oracle.
 *
 * @param {bigint} aScaled
 * @param {bigint} bScaled
 * @param {bigint} scale
 * @returns {bigint}
 */
function exactDeMorganUnionBigInt(aScaled, bScaled, scale) {
  const compA = scale - aScaled;
  const compB = scale - bScaled;
  const minComp = compA <= compB ? compA : compB;
  return scale - minComp;
}

test('scalar fuzzy memberships: normal binary, variadic, and unary calls', () => {
  assert.equal(unionFuzzyStable(0.2, 0.7), 0.7);
  assert.equal(unionFuzzyStable(0.9, 0.3), 0.9);
  assert.equal(unionFuzzyStable(0.1, 0.4, 0.85, 0.2), 0.85);
  assert.equal(unionFuzzyStable(0.5), 0.5);
  assert.equal(unionFuzzyStable(0, 0), 0);
  assert.equal(unionFuzzyStable(1, 0), 1);
  assert.equal(unionFuzzyStable(0, 1), 1);
  assert.equal(unionFuzzyStable(1, 1), 1);
});

test('plain object fuzzy sets: union of overlapping and disjoint supports', () => {
  const a = { x: 0.2, y: 0.8, z: 0.0 };
  const b = { y: 0.5, z: 0.6, w: 0.9 };
  const c = { x: 0.75, q: 0.1 };

  assert.deepEqual(unionFuzzyStable(a, b), { x: 0.2, y: 0.8, z: 0.6, w: 0.9 });
  assert.deepEqual(unionFuzzyStable(a, b, c), { x: 0.75, y: 0.8, z: 0.6, w: 0.9, q: 0.1 });
  assert.deepEqual(unionFuzzyStable({}, {}), {});
  assert.deepEqual(unionFuzzyStable(a), { x: 0.2, y: 0.8, z: 0 });

  // Inputs must not be mutated
  assert.deepEqual(a, { x: 0.2, y: 0.8, z: 0.0 });
  assert.deepEqual(b, { y: 0.5, z: 0.6, w: 0.9 });
});

test('plain object fuzzy sets: handles null-prototype objects and __proto__ keys safely', () => {
  const a = Object.create(null);
  a.alpha = 0.3;
  a.__proto__ = 0.4;

  const b = {};
  Object.defineProperty(b, '__proto__', {
    value: 0.8,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  b.beta = 0.2;

  const result = unionFuzzyStable(a, b);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true);
  assert.equal(result.__proto__, 0.8);
  assert.equal(result.alpha, 0.3);
  assert.equal(result.beta, 0.2);
});

test('Map fuzzy sets: union with diverse key types and immutability', () => {
  const sym = Symbol('u');
  const keyObj = { id: 1 };
  const m1 = new Map([
    ['a', 0.25],
    [sym, 0.7],
    [keyObj, 0.1],
  ]);
  const m2 = new Map([
    ['a', 0.6],
    ['b', 0.4],
    [keyObj, 0.95],
  ]);

  const result = unionFuzzyStable(m1, m2);
  assert.ok(result instanceof Map);
  assert.equal(result.size, 4);
  assert.equal(result.get('a'), 0.6);
  assert.equal(result.get('b'), 0.4);
  assert.equal(result.get(sym), 0.7);
  assert.equal(result.get(keyObj), 0.95);
  assert.equal(m1.size, 3);
  assert.equal(m2.size, 3);
  assert.deepEqual(unionFuzzyStable(new Map(), new Map()), new Map());
});

test('Array and TypedArray fuzzy sets: pointwise union', () => {
  assert.deepEqual(
    unionFuzzyStable([0.1, 0.9, 0.0, 0.5], [0.4, 0.2, 0.0, 0.5], [0.2, 0.8, 1.0, 0.3]),
    [0.4, 0.9, 1.0, 0.5]
  );
  assert.deepEqual(unionFuzzyStable([], []), []);

  const ta1 = new Float64Array([0.1, 0.75, 0.0]);
  const ta2 = new Float64Array([0.3, 0.25, 1.0]);
  const taOut = unionFuzzyStable(ta1, ta2);
  assert.ok(taOut instanceof Float64Array);
  assert.deepEqual(Array.from(taOut), [0.3, 0.75, 1.0]);

  const f32a = new Float32Array([0.25, 0.5]);
  const f32b = new Float32Array([0.75, 0.125]);
  const f32Out = unionFuzzyStable(f32a, f32b);
  assert.ok(f32Out instanceof Float64Array);
  assert.deepEqual(Array.from(f32Out), [0.75, 0.5]);
});

test('numerical edge cases: -0 canonicalization, subnormals, near-1, and large universes', () => {
  // Signed zero canonicalization to +0
  assert.equal(Object.is(unionFuzzyStable(-0, -0), 0), true);
  assert.equal(Object.is(unionFuzzyStable(-0, 0), 0), true);
  assert.equal(Object.is(unionFuzzyStable([-0], [-0])[0], 0), true);
  assert.equal(Object.is(unionFuzzyStable({ a: -0 }, { a: -0 }).a, 0), true);
  assert.equal(Object.is(unionFuzzyStable(new Map([['a', -0]])).get('a'), 0), true);

  // Subnormal and extreme precision near 0 (where naive De Morgan 1 - min(1-a, 1-b) collapses to 0)
  const tiny1 = Number.MIN_VALUE;
  const tiny2 = Number.MIN_VALUE * 4;
  assert.equal(unionFuzzyStable(tiny1, tiny2), tiny2);
  assert.equal(unionFuzzyStable(0, tiny1), tiny1);
  // Confirm naive floating-point De Morgan indeed fails on subnormals while unionFuzzyStable is exact
  const naiveDeMorgan = 1 - Math.min(1 - tiny1, 1 - tiny2);
  assert.equal(naiveDeMorgan, 0);
  assert.notEqual(unionFuzzyStable(tiny1, tiny2), naiveDeMorgan);

  // Near-1 precision boundary
  const nearOneA = 1 - Number.EPSILON;
  const nearOneB = 1 - Number.EPSILON / 2;
  assert.equal(unionFuzzyStable(nearOneA, nearOneB), nearOneB);
  assert.equal(unionFuzzyStable(nearOneB, 1), 1);

  // Large universe (200,000 elements) — verifies no stack overflow
  const n = 200_000;
  const bigA = new Array(n);
  const bigB = new Array(n);
  for (let i = 0; i < n; i += 1) {
    bigA[i] = (i % 1000) / 1000;
    bigB[i] = ((i * 7) % 1000) / 1000;
  }
  const bigUnion = unionFuzzyStable(bigA, bigB);
  assert.equal(bigUnion.length, n);
  assert.equal(bigUnion[0], 0);
  assert.equal(bigUnion[1], 0.007);
  assert.equal(bigUnion[999], 0.999);
});

test('algebraic axioms: commutativity, associativity, idempotence, identity, domination, crisp reduction', () => {
  const A = { a: 0.15, b: 0.82, c: 0.0, d: 0.44 };
  const B = { a: 0.63, b: 0.21, d: 0.44, e: 0.91 };
  const C = { b: 0.95, c: 0.37, e: 0.12, f: 0.5 };
  const empty = {};
  const universe = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 };

  // Commutativity
  assert.deepEqual(unionFuzzyStable(A, B), unionFuzzyStable(B, A));

  // Associativity
  assert.deepEqual(
    unionFuzzyStable(unionFuzzyStable(A, B), C),
    unionFuzzyStable(A, unionFuzzyStable(B, C))
  );
  assert.deepEqual(unionFuzzyStable(A, B, C), unionFuzzyStable(unionFuzzyStable(A, B), C));

  // Idempotence
  assert.deepEqual(unionFuzzyStable(A, A), A);

  // Identity with empty fuzzy set
  assert.deepEqual(unionFuzzyStable(A, empty), A);

  // Domination with full universe
  assert.deepEqual(unionFuzzyStable(A, universe), universe);

  // Crisp Boolean reduction ({0, 1} matches logical OR)
  for (const x of [0, 1]) {
    for (const y of [0, 1]) {
      assert.equal(unionFuzzyStable(x, y), x | y);
    }
  }
});

test('independent cross-check 1: exact BigInt De Morgan dual across dyadic and decimal grid', () => {
  // Use exact power-of-two denominators so every value is exact in IEEE-754 binary64
  const scale = 1n << 52n;
  const numerators = [
    0n,
    1n,
    2n,
    7n,
    1023n,
    1n << 20n,
    1n << 40n,
    (1n << 51n) - 1n,
    1n << 51n,
    scale - 2n,
    scale - 1n,
    scale,
  ];
  const scaleNum = Number(scale);

  for (const aNum of numerators) {
    for (const bNum of numerators) {
      const a = Number(aNum) / scaleNum;
      const b = Number(bNum) / scaleNum;
      const expected = Number(exactDeMorganUnionBigInt(aNum, bNum, scale)) / scaleNum;
      const actual = unionFuzzyStable(a, b);
      assert.equal(actual, expected);
    }
  }
});

test('independent cross-check 2: fuzzy inclusion-exclusion cardinality identity via Neumaier summation', () => {
  // Verify |A ∪ B| + |A ∩ B| === |A| + |B| with wide dynamic range memberships
  const n = 5000;
  const arrA = new Array(n);
  const arrB = new Array(n);
  const inter = new Array(n);

  // Deterministic LCG for reproducibility
  let seed = 0x12345678;
  const nextRand = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let i = 0; i < n; i += 1) {
    // Mix O(1) and tiny O(1e-15) memberships to stress summation accuracy
    if (i % 10 === 0) {
      arrA[i] = nextRand();
      arrB[i] = nextRand();
    } else {
      arrA[i] = nextRand() * 1e-15;
      arrB[i] = nextRand() * 1e-15;
    }
    inter[i] = arrA[i] < arrB[i] ? arrA[i] : arrB[i];
  }

  const uni = unionFuzzyStable(arrA, arrB);
  const lhs = neumaierSum(uni) + neumaierSum(inter);
  const rhs = neumaierSum(arrA) + neumaierSum(arrB);
  const relErr = Math.abs(lhs - rhs) / Math.max(1, Math.abs(rhs));
  assert.ok(relErr <= 4 * Number.EPSILON, `Expected relErr <= 4*eps, got ${relErr}`);
});

test('input validation: rejects invalid arguments, out-of-range values, NaN, and type mismatches', () => {
  // No arguments
  assert.throws(() => unionFuzzyStable(), RangeError);

  // Out-of-range and non-finite scalars
  assert.throws(() => unionFuzzyStable(-0.0001, 0.5), RangeError);
  assert.throws(() => unionFuzzyStable(0.5, 1.0001), RangeError);
  assert.throws(() => unionFuzzyStable(NaN, 0.5), RangeError);
  assert.throws(() => unionFuzzyStable(1, NaN), RangeError); // Must not short-circuit on 1!
  assert.throws(() => unionFuzzyStable(Infinity, 0.5), RangeError);
  assert.throws(() => unionFuzzyStable(0.5, -Infinity), RangeError);

  // Out-of-range inside objects, maps, arrays, and typed arrays (even when another set has 1)
  assert.throws(() => unionFuzzyStable({ a: 1 }, { a: NaN }), RangeError);
  assert.throws(() => unionFuzzyStable({ a: 1 }, { a: 1.5 }), RangeError);
  assert.throws(() => unionFuzzyStable({ a: -1e-12 }, { a: 0.5 }), RangeError);
  assert.throws(() => unionFuzzyStable([1, 0.5], [NaN, 0.5]), RangeError);
  assert.throws(() => unionFuzzyStable(new Float64Array([1]), new Float64Array([1.1])), RangeError);
  assert.throws(() => unionFuzzyStable(new Map([['k', 1]]), new Map([['k', -0.1]])), RangeError);

  // Non-numeric memberships
  assert.throws(() => unionFuzzyStable({ a: '0.5' }, { a: 0.5 }), TypeError);
  assert.throws(() => unionFuzzyStable([0.5], [null]), TypeError);
  assert.throws(() => unionFuzzyStable(new Map([['a', undefined]])), TypeError);

  // Sparse arrays
  const sparse = [0.2, , 0.5]; // eslint-disable-line no-sparse-arrays
  assert.throws(() => unionFuzzyStable(sparse, [0.1, 0.2, 0.3]), TypeError);

  // Length mismatches
  assert.throws(() => unionFuzzyStable([0.1, 0.2], [0.1]), RangeError);
  assert.throws(() => unionFuzzyStable(new Float64Array([0.1]), new Float64Array([0.1, 0.2])), RangeError);

  // Representation mismatches and unsupported types
  assert.throws(() => unionFuzzyStable(0.5, [0.5]), TypeError);
  assert.throws(() => unionFuzzyStable({ a: 0.5 }, new Map([['a', 0.5]])), TypeError);
  assert.throws(() => unionFuzzyStable([0.5], new Float64Array([0.5])), TypeError);
  assert.throws(() => unionFuzzyStable(null, null), TypeError);
  assert.throws(() => unionFuzzyStable(new Date(), new Date()), TypeError);
  assert.throws(() => unionFuzzyStable(new Set([0.5]), new Set([0.5])), TypeError);
  assert.throws(() => unionFuzzyStable(new DataView(new ArrayBuffer(8))), TypeError);
  assert.throws(() => unionFuzzyStable(new BigInt64Array(1)), TypeError);
});
