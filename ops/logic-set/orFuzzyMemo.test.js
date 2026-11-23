import test from 'node:test';
import assert from 'node:assert/strict';
import { orFuzzyMemo } from './orFuzzyMemo.js';

/**
 * Independent reference implementation of Zadeh fuzzy OR via De Morgan's Law:
 *   a OR b = NOT(AND(NOT(a), NOT(b))) = 1 - min(1 - a, 1 - b)
 */
function zadehOrDeMorgan(a, b) {
  const notA = 1 - a;
  const notB = 1 - b;
  return 1 - (notA < notB ? notA : notB);
}

/**
 * Independent algebraic reference for max(a, b): (a + b + |a - b|) / 2.
 */
function zadehOrAlgebraic(a, b) {
  return (a + b + Math.abs(a - b)) / 2;
}

test('scalar crisp Boolean truth table', () => {
  assert.equal(orFuzzyMemo(0, 0), 0);
  assert.equal(orFuzzyMemo(0, 1), 1);
  assert.equal(orFuzzyMemo(1, 0), 1);
  assert.equal(orFuzzyMemo(1, 1), 1);
});

test('scalar fuzzy values on precomputed hundredths grid', () => {
  assert.equal(orFuzzyMemo(0.25, 0.75), 0.75);
  assert.equal(orFuzzyMemo(0.83, 0.12), 0.83);
  assert.equal(orFuzzyMemo(0.5, 0.5), 0.5);
  assert.equal(orFuzzyMemo(0.01, 0.0), 0.01);
  assert.equal(orFuzzyMemo(0.99, 1.0), 1.0);
});

test('scalar off-grid floating-point values and memoized repeat lookups', () => {
  const a = 1 / 3;
  const b = Math.SQRT1_2;
  const c = 0.123456789;
  const d = 0.987654321;

  assert.equal(orFuzzyMemo(a, b), b);
  assert.equal(orFuzzyMemo(a, b), b); // cache hit
  assert.equal(orFuzzyMemo(b, a), b);
  assert.equal(orFuzzyMemo(c, d), d);
  assert.equal(orFuzzyMemo(d, c), d);
  assert.equal(orFuzzyMemo(Number.MIN_VALUE, 0), Number.MIN_VALUE);
  assert.equal(orFuzzyMemo(1 - Number.EPSILON, 1), 1);
});

test('normalizes -0 to +0', () => {
  assert.ok(Object.is(orFuzzyMemo(-0, -0), 0));
  assert.ok(Object.is(orFuzzyMemo(-0, 0), 0));
  assert.ok(Object.is(orFuzzyMemo(0, -0), 0));
  assert.equal(orFuzzyMemo(-0, 0.4), 0.4);
});

test('variadic scalar Zadeh OR', () => {
  assert.equal(orFuzzyMemo(0.1, 0.4, 0.2), 0.4);
  assert.equal(orFuzzyMemo(0, 0.05, 0.7, 0.3, 0.95, 0.6), 0.95);
  assert.equal(orFuzzyMemo(1 / 7, 1 / 3, 2 / 5, 1 / 9), 2 / 5);
});

test('fuzzy set union over arrays', () => {
  const a = [0, 0.2, 0.75, 1];
  const b = [0.5, 0.2, 0.3, 0.4];
  const out = orFuzzyMemo(a, b);
  assert.deepEqual(out, [0.5, 0.2, 0.75, 1]);
  // Ensure inputs are not mutated
  assert.deepEqual(a, [0, 0.2, 0.75, 1]);
  assert.deepEqual(b, [0.5, 0.2, 0.3, 0.4]);
  // Empty arrays
  assert.deepEqual(orFuzzyMemo([], []), []);
  // Variadic arrays
  assert.deepEqual(orFuzzyMemo([0.1, 0.8], [0.5, 0.2], [0.3, 0.9]), [0.5, 0.9]);
});

test('fuzzy set union over plain objects', () => {
  const a = { cold: 0.8, warm: 0.2 };
  const b = { warm: 0.6, hot: 0.9 };
  const out = orFuzzyMemo(a, b);
  assert.deepEqual(out, { cold: 0.8, warm: 0.6, hot: 0.9 });
  assert.deepEqual(a, { cold: 0.8, warm: 0.2 });
  assert.deepEqual(b, { warm: 0.6, hot: 0.9 });

  // Empty objects and null-prototype objects
  assert.deepEqual(orFuzzyMemo({}, {}), {});
  const nullProto = Object.assign(Object.create(null), { x: 0.3, y: 0.7 });
  assert.deepEqual(orFuzzyMemo(nullProto, { y: 0.2, z: 0.5 }), { x: 0.3, y: 0.7, z: 0.5 });

  // Safe handling of __proto__ own property
  const withProtoKey = Object.defineProperty({}, '__proto__', {
    value: 0.4,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  const merged = orFuzzyMemo(withProtoKey, { a: 0.2 });
  assert.equal(Object.hasOwn(merged, '__proto__'), true);
  assert.equal(Object.getOwnPropertyDescriptor(merged, '__proto__').value, 0.4);
  assert.equal(merged.a, 0.2);
});

test('fuzzy set union over Maps', () => {
  const a = new Map([['x', 0.25], ['y', 0.9]]);
  const b = new Map([['y', 0.4], ['z', 0.6]]);
  const out = orFuzzyMemo(a, b);
  assert.ok(out instanceof Map);
  assert.deepEqual([...out.entries()], [['x', 0.25], ['y', 0.9], ['z', 0.6]]);
  assert.deepEqual([...a.entries()], [['x', 0.25], ['y', 0.9]]);
  assert.deepEqual([...b.entries()], [['y', 0.4], ['z', 0.6]]);
  assert.equal(orFuzzyMemo(new Map(), new Map()).size, 0);
});

test('algebraic laws: identity, annihilator, idempotence, commutativity, associativity, monotonicity', () => {
  const samples = [0, 0.01, 0.123456, 0.25, 1 / 3, 0.5, Math.SQRT1_2, 0.99, 1];
  for (const a of samples) {
    assert.equal(orFuzzyMemo(a, 0), a);
    assert.equal(orFuzzyMemo(0, a), a);
    assert.equal(orFuzzyMemo(a, 1), 1);
    assert.equal(orFuzzyMemo(1, a), 1);
    assert.equal(orFuzzyMemo(a, a), a);
    for (const b of samples) {
      assert.equal(orFuzzyMemo(a, b), orFuzzyMemo(b, a));
      for (const c of samples) {
        assert.equal(
          orFuzzyMemo(orFuzzyMemo(a, b), c),
          orFuzzyMemo(a, orFuzzyMemo(b, c))
        );
      }
    }
  }

  // Monotonicity check on sorted samples
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i; j < samples.length; j += 1) {
      for (let k = 0; k < samples.length; k += 1) {
        for (let l = k; l < samples.length; l += 1) {
          assert.ok(
            orFuzzyMemo(samples[i], samples[k]) <= orFuzzyMemo(samples[j], samples[l])
          );
        }
      }
    }
  }
});

test('independent cross-check against De Morgan law and algebraic max across full grid and off-grid samples', () => {
  // Full 101x101 precomputed grid verification
  for (let i = 0; i <= 100; i += 1) {
    const a = i / 100;
    for (let j = 0; j <= 100; j += 1) {
      const b = j / 100;
      const got = orFuzzyMemo(a, b);
      const dm = zadehOrDeMorgan(a, b);
      const alg = zadehOrAlgebraic(a, b);
      assert.ok(Math.abs(got - dm) <= 1e-15, `De Morgan mismatch at (${a}, ${b}): ${got} vs ${dm}`);
      assert.ok(Math.abs(got - alg) <= 1e-15, `Algebraic mismatch at (${a}, ${b}): ${got} vs ${alg}`);
    }
  }

  // Deterministic pseudo-random off-grid values exceeding memo capacity (> 4096 entries)
  let seed = 0x12345678;
  const nextRand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let n = 0; n < 4500; n += 1) {
    const a = nextRand();
    const b = nextRand();
    const got = orFuzzyMemo(a, b);
    const dm = zadehOrDeMorgan(a, b);
    const alg = zadehOrAlgebraic(a, b);
    assert.ok(Math.abs(got - dm) <= 1e-15, `Off-grid De Morgan mismatch at (${a}, ${b})`);
    assert.ok(Math.abs(got - alg) <= 1e-15, `Off-grid algebraic mismatch at (${a}, ${b})`);
  }
});

test('input validation rejects invalid types, ranges, arities, and mismatched representations', () => {
  // Arity
  assert.throws(() => orFuzzyMemo(), TypeError);
  assert.throws(() => orFuzzyMemo(0.5), TypeError);

  // Invalid scalar types
  assert.throws(() => orFuzzyMemo('0.5', 0.5), TypeError);
  assert.throws(() => orFuzzyMemo(0.5, null), TypeError);
  assert.throws(() => orFuzzyMemo(undefined, 0.5), TypeError);
  assert.throws(() => orFuzzyMemo(true, 0.5), TypeError);
  assert.throws(() => orFuzzyMemo(new Date(), new Date()), TypeError);
  assert.throws(() => orFuzzyMemo(new Set([0.5]), new Set([0.5])), TypeError);

  // Out-of-range / non-finite scalars
  assert.throws(() => orFuzzyMemo(-0.0001, 0.5), RangeError);
  assert.throws(() => orFuzzyMemo(0.5, 1.0001), RangeError);
  assert.throws(() => orFuzzyMemo(Number.NaN, 0.5), RangeError);
  assert.throws(() => orFuzzyMemo(0.5, Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => orFuzzyMemo(Number.NEGATIVE_INFINITY, 0.5), RangeError);

  // Mismatched operand kinds
  assert.throws(() => orFuzzyMemo(0.5, [0.5]), TypeError);
  assert.throws(() => orFuzzyMemo([0.5], { a: 0.5 }), TypeError);
  assert.throws(() => orFuzzyMemo({ a: 0.5 }, new Map([['a', 0.5]])), TypeError);
  assert.throws(() => orFuzzyMemo(0.2, 0.5, [0.8]), TypeError);

  // Invalid fuzzy set contents / lengths
  assert.throws(() => orFuzzyMemo([0.2], [0.2, 0.5]), RangeError);
  assert.throws(() => orFuzzyMemo([0.2, 1.5], [0.2, 0.5]), RangeError);
  assert.throws(() => orFuzzyMemo([0.2, 'x'], [0.2, 0.5]), TypeError);
  assert.throws(() => orFuzzyMemo({ a: -0.1 }, { a: 0.5 }), RangeError);
  assert.throws(() => orFuzzyMemo({ a: 0.2 }, { b: Number.NaN }), RangeError);
  assert.throws(() => orFuzzyMemo({ a: 0.2 }, { b: '0.5' }), TypeError);
  assert.throws(() => orFuzzyMemo(new Map([['a', 1.2]]), new Map()), RangeError);
  assert.throws(() => orFuzzyMemo(new Map(), new Map([['a', null]])), TypeError);
});
