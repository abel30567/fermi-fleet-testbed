import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addRationalRecursive } from './addRationalRecursive.js';

/**
 * Independent iterative GCD used strictly for test cross-checking.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function iterativeGcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Independently checks that `result` equals the exact sum of `terms` via
 * a naive common denominator, and satisfies canonical lowest-terms invariants.
 * @param {{ num: bigint, den: bigint }[]} terms
 * @param {{ num: bigint, den: bigint }} result
 */
function assertMatchesCommonDenominator(terms, result) {
  assert.equal(typeof result.num, 'bigint');
  assert.equal(typeof result.den, 'bigint');
  assert.ok(result.den > 0n, `expected den > 0n, got ${result.den}`);

  if (result.num === 0n) {
    assert.equal(result.den, 1n);
  } else {
    assert.equal(iterativeGcd(result.num, result.den), 1n);
  }

  let commonDen = 1n;
  for (const t of terms) {
    commonDen *= t.den < 0n ? -t.den : t.den;
  }
  let commonNum = 0n;
  for (const t of terms) {
    const sign = t.den < 0n ? -1n : 1n;
    const absDen = t.den < 0n ? -t.den : t.den;
    commonNum += (sign * t.num) * (commonDen / absDen);
  }

  assert.equal(result.num * commonDen, commonNum * result.den);
}

describe('addRationalRecursive - normal cases', () => {
  test('adds two rationals with same denominator without reduction', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 1n, den: 5n }, { num: 2n, den: 5n }),
      { num: 3n, den: 5n },
    );
  });

  test('adds two rationals with same denominator and reduces to lowest terms', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 1n, den: 6n }, { num: 2n, den: 6n }),
      { num: 1n, den: 2n },
    );
  });

  test('adds two rationals with different denominators', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
      { num: 5n, den: 6n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: 3n, den: 4n }, { num: 5n, den: 6n }),
      { num: 19n, den: 12n },
    );
  });

  test('reduces unreduced inputs and single-argument rational', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 2n, den: 4n }, { num: 3n, den: 6n }),
      { num: 1n, den: 1n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: 6n, den: 8n }),
      { num: 3n, den: 4n },
    );
  });

  test('supports variadic arguments', () => {
    assert.deepEqual(
      addRationalRecursive(
        { num: 1n, den: 2n },
        { num: 1n, den: 3n },
        { num: 1n, den: 6n },
      ),
      { num: 1n, den: 1n },
    );
    assert.deepEqual(
      addRationalRecursive(
        { num: 1n, den: 2n },
        { num: 1n, den: 4n },
        { num: 1n, den: 8n },
        { num: 1n, den: 16n },
      ),
      { num: 15n, den: 16n },
    );
  });

  test('supports array of rationals including telescoping series', () => {
    const terms = [];
    for (let k = 1n; k <= 50n; k += 1n) {
      terms.push({ num: 1n, den: k * (k + 1n) });
    }
    assert.deepEqual(addRationalRecursive(terms), { num: 50n, den: 51n });
  });

  test('returns additive identity 0n/1n for empty array', () => {
    assert.deepEqual(addRationalRecursive([]), { num: 0n, den: 1n });
  });

  test('does not mutate input objects', () => {
    const a = { num: -4n, den: -6n };
    const b = { num: 2n, den: -3n };
    const res = addRationalRecursive(a, b);
    assert.deepEqual(res, { num: 0n, den: 1n });
    assert.deepEqual(a, { num: -4n, den: -6n });
    assert.deepEqual(b, { num: 2n, den: -3n });
  });
});

describe('addRationalRecursive - edge cases', () => {
  test('handles zeros and canonicalizes zero to 0n/1n', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
      { num: 0n, den: 1n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: 0n, den: 7n }, { num: 3n, den: 4n }),
      { num: 3n, den: 4n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: 0n, den: -9n }, { num: 0n, den: 5n }),
      { num: 0n, den: 1n },
    );
  });

  test('handles negative numerators and additive inverses', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 3n, den: 4n }, { num: -3n, den: 4n }),
      { num: 0n, den: 1n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: -1n, den: 2n }, { num: -1n, den: 3n }),
      { num: -5n, den: 6n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: -5n, den: 6n }, { num: 1n, den: 2n }),
      { num: -1n, den: 3n },
    );
  });

  test('normalizes negative denominators to positive den', () => {
    assert.deepEqual(
      addRationalRecursive({ num: 1n, den: -2n }, { num: 1n, den: 3n }),
      { num: -1n, den: 6n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: -1n, den: -2n }, { num: -2n, den: -4n }),
      { num: 1n, den: 1n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: 2n, den: -4n }, { num: -2n, den: 4n }),
      { num: -1n, den: 1n },
    );
    assert.deepEqual(
      addRationalRecursive({ num: 0n, den: -123n }),
      { num: 0n, den: 1n },
    );
  });

  test('handles very large BigInt numerators and denominators accurately', () => {
    const scale = 10n ** 60n;
    const p = 10n ** 50n + 151n;
    const q = 10n ** 50n + 163n;
    const a = { num: 3n * scale, den: p * scale };
    const b = { num: 5n * scale, den: q * scale };
    const result = addRationalRecursive(a, b);
    assertMatchesCommonDenominator([a, b], result);
    assert.deepEqual(result, { num: 3n * q + 5n * p, den: p * q });
  });

  test('throws RangeError when any denominator is 0n', () => {
    assert.throws(
      () => addRationalRecursive({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
      RangeError,
    );
    assert.throws(
      () => addRationalRecursive({ num: 1n, den: 2n }, { num: 0n, den: 0n }),
      RangeError,
    );
    assert.throws(
      () => addRationalRecursive([{ num: 1n, den: 2n }, { num: 3n, den: 0n }]),
      RangeError,
    );
  });

  test('throws TypeError on invalid inputs', () => {
    assert.throws(() => addRationalRecursive(), TypeError);
    assert.throws(() => addRationalRecursive(null, { num: 1n, den: 2n }), TypeError);
    assert.throws(() => addRationalRecursive(undefined), TypeError);
    assert.throws(() => addRationalRecursive(1n, 2n), TypeError);
    assert.throws(() => addRationalRecursive({ num: 1, den: 2 }, { num: 1n, den: 2n }), TypeError);
    assert.throws(() => addRationalRecursive({ num: 1n, den: '2' }), TypeError);
    assert.throws(() => addRationalRecursive({ num: 1n }), TypeError);
    assert.throws(
      () => addRationalRecursive([{ num: 1n, den: 2n }], { num: 1n, den: 3n }),
      TypeError,
    );
    assert.throws(
      () => addRationalRecursive([{ num: 1n, den: 2n }, { num: 1, den: 3n }]),
      TypeError,
    );
  });
});

describe('addRationalRecursive - algebraic & independent cross-checks', () => {
  const sampleRationals = [
    { num: 0n, den: 5n },
    { num: 1n, den: 2n },
    { num: -3n, den: 4n },
    { num: 7n, den: -10n },
    { num: -14n, den: -21n },
    { num: 11n, den: 15n },
    { num: 1234567890123456789n, den: 9876543210987654321n },
  ];

  test('satisfies commutativity: add(a, b) === add(b, a)', () => {
    for (const a of sampleRationals) {
      for (const b of sampleRationals) {
        const ab = addRationalRecursive(a, b);
        const ba = addRationalRecursive(b, a);
        assert.deepEqual(ab, ba);
        assertMatchesCommonDenominator([a, b], ab);
      }
    }
  });

  test('satisfies associativity across binary, variadic, and array forms', () => {
    for (let i = 0; i < sampleRationals.length - 2; i += 1) {
      const a = sampleRationals[i];
      const b = sampleRationals[i + 1];
      const c = sampleRationals[i + 2];

      const leftAssoc = addRationalRecursive(addRationalRecursive(a, b), c);
      const rightAssoc = addRationalRecursive(a, addRationalRecursive(b, c));
      const variadic = addRationalRecursive(a, b, c);
      const fromArray = addRationalRecursive([a, b, c]);

      assert.deepEqual(leftAssoc, rightAssoc);
      assert.deepEqual(leftAssoc, variadic);
      assert.deepEqual(leftAssoc, fromArray);
      assertMatchesCommonDenominator([a, b, c], fromArray);
    }
  });

  test('matches independent common-denominator sum and is permutation invariant', () => {
    const forward = addRationalRecursive(sampleRationals);
    const reversed = addRationalRecursive([...sampleRationals].reverse());
    const rotated = addRationalRecursive([
      ...sampleRationals.slice(3),
      ...sampleRationals.slice(0, 3),
    ]);

    assert.deepEqual(forward, reversed);
    assert.deepEqual(forward, rotated);
    assertMatchesCommonDenominator(sampleRationals, forward);
  });
});
