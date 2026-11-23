import test from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceFuzzySeries } from './setDifferenceFuzzySeries.js';

const EPS = 1e-12;

function assertClose(actual, expected, tol = EPS, message) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    message ?? `Expected ${actual} to be within ${tol} of ${expected}`
  );
}

/**
 * Independent Fourier cosine series approximation for |u| on [-1, 1]:
 *   |u| = 1/2 - (4 / pi^2) * sum_{k=0}^{N-1} cos((2k + 1) * pi * u) / (2k + 1)^2
 * Yields min(a, 1 - b) = (1 + a - b - |a + b - 1|) / 2.
 */
function fuzzyDiffFourierSeries(a, b, terms = 2000) {
  const u = a + b - 1;
  let sum = 0;
  for (let k = 0; k < terms; k++) {
    const m = 2 * k + 1;
    sum += Math.cos(m * Math.PI * u) / (m * m);
  }
  const absApprox = 0.5 - (4 / (Math.PI * Math.PI)) * sum;
  return 0.5 * (1 + a - b - absApprox);
}

test('scalar fuzzy set difference: normal cases', () => {
  assertClose(setDifferenceFuzzySeries(0.8, 0.3), 0.7);
  assertClose(setDifferenceFuzzySeries(0.4, 0.2), 0.4);
  assertClose(setDifferenceFuzzySeries(0.5, 0.5), 0.5);
  assertClose(setDifferenceFuzzySeries(0.9, 0.8), 0.2);
  assertClose(setDifferenceFuzzySeries(0.25, 0.75), 0.25);
});

test('scalar fuzzy set difference: crisp boundary values {0, 1}', () => {
  assert.equal(setDifferenceFuzzySeries(0, 0), 0);
  assert.equal(setDifferenceFuzzySeries(0, 1), 0);
  assert.equal(setDifferenceFuzzySeries(1, 0), 1);
  assert.equal(setDifferenceFuzzySeries(1, 1), 0);
  // Negative zero normalization
  assert.equal(Object.is(setDifferenceFuzzySeries(-0, 0), 0), true);
  assert.equal(Object.is(setDifferenceFuzzySeries(0.5, 1), 0), true);
});

test('array representation: element-wise fuzzy difference and empty arrays', () => {
  assert.deepEqual(setDifferenceFuzzySeries([], []), []);

  const a = [0.0, 0.2, 0.5, 0.8, 1.0];
  const b = [0.4, 0.9, 0.5, 0.1, 1.0];
  const expected = [0.0, 0.1, 0.5, 0.8, 0.0];
  const actual = setDifferenceFuzzySeries(a, b);

  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assertClose(actual[i], expected[i]);
  }
});

test('plain object representation: overlapping, disjoint, and empty fuzzy sets', () => {
  assert.deepEqual(setDifferenceFuzzySeries({}, {}), {});

  const a = { x: 0.8, y: 0.4, onlyA: 0.65 };
  const b = { x: 0.6, y: 0.2, onlyB: 0.9 };
  const res = setDifferenceFuzzySeries(a, b);

  assert.deepEqual(Object.keys(res).sort(), ['onlyA', 'onlyB', 'x', 'y']);
  assertClose(res.x, 0.4);
  assertClose(res.y, 0.4);
  assertClose(res.onlyA, 0.65);
  assert.equal(res.onlyB, 0);
});

test('Map representation: overlapping, disjoint, and empty fuzzy sets', () => {
  const empty = setDifferenceFuzzySeries(new Map(), new Map());
  assert.ok(empty instanceof Map);
  assert.equal(empty.size, 0);

  const sym = Symbol('u');
  const a = new Map([
    ['alpha', 0.9],
    ['beta', 0.3],
    [sym, 0.7],
  ]);
  const b = new Map([
    ['alpha', 0.5],
    ['gamma', 0.8],
    [sym, 0.4],
  ]);

  const res = setDifferenceFuzzySeries(a, b);
  assert.ok(res instanceof Map);
  assert.equal(res.size, 4);
  assertClose(res.get('alpha'), 0.5);
  assertClose(res.get('beta'), 0.3);
  assert.equal(res.get('gamma'), 0);
  assertClose(res.get(sym), 0.6);
});

test('Zadeh fuzzy set algebraic laws and identities', () => {
  const samples = [0, 0.1, 0.25, 0.5, 0.73, 0.9, 1];
  for (const a of samples) {
    // Identity with empty set and universal set
    assertClose(setDifferenceFuzzySeries(a, 0), a);
    assert.equal(setDifferenceFuzzySeries(a, 1), 0);
    assert.equal(setDifferenceFuzzySeries(0, a), 0);
    assertClose(setDifferenceFuzzySeries(1, a), 1 - a);

    // Non-emptiness of A \ A for fuzzy memberships in (0, 1): <= 0.5
    const selfDiff = setDifferenceFuzzySeries(a, a);
    assertClose(selfDiff, Math.min(a, 1 - a));
    assert.ok(selfDiff <= 0.5 + EPS);

    for (const b of samples) {
      const diff = setDifferenceFuzzySeries(a, b);
      // Direct Zadeh definition cross-check
      assertClose(diff, Math.min(a, 1 - b));
      // De Morgan duality: 1 - (A \ B) = max(1 - A, B)
      assertClose(1 - diff, Math.max(1 - a, b));
      // Bounds
      assert.ok(diff >= 0 && diff <= 1);
      assert.ok(diff <= a + EPS);
      assert.ok(diff <= 1 - b + EPS);
    }
  }
});

test('independent cross-check against Fourier cosine series representation', () => {
  const pairs = [
    [0.0, 0.0],
    [0.15, 0.42],
    [0.37, 0.63],
    [0.85, 0.25],
    [0.95, 0.90],
    [1.0, 0.0],
    [0.5, 0.5],
  ];
  for (const [a, b] of pairs) {
    const closedForm = setDifferenceFuzzySeries(a, b);
    const seriesApprox = fuzzyDiffFourierSeries(a, b, 2000);
    assertClose(closedForm, seriesApprox, 1e-3);
  }
});

test('input validation rejects invalid types, mismatched kinds, and out-of-range values', () => {
  // Out-of-range and non-finite scalar memberships
  assert.throws(() => setDifferenceFuzzySeries(-0.01, 0.5), RangeError);
  assert.throws(() => setDifferenceFuzzySeries(0.5, 1.01), RangeError);
  assert.throws(() => setDifferenceFuzzySeries(NaN, 0.5), RangeError);
  assert.throws(() => setDifferenceFuzzySeries(0.5, Infinity), RangeError);
  assert.throws(() => setDifferenceFuzzySeries(-Infinity, 0.5), RangeError);

  // Mismatched or unsupported types
  assert.throws(() => setDifferenceFuzzySeries(0.5, [0.5]), TypeError);
  assert.throws(() => setDifferenceFuzzySeries([0.5], { a: 0.5 }), TypeError);
  assert.throws(() => setDifferenceFuzzySeries(new Map(), {}), TypeError);
  assert.throws(() => setDifferenceFuzzySeries('0.5', '0.2'), TypeError);
  assert.throws(() => setDifferenceFuzzySeries(null, {}), TypeError);
  assert.throws(() => setDifferenceFuzzySeries(new Set([0.5]), new Set([0.2])), TypeError);

  // Array length mismatch and invalid element
  assert.throws(() => setDifferenceFuzzySeries([0.5], [0.5, 0.2]), RangeError);
  assert.throws(() => setDifferenceFuzzySeries([0.5, '0.2'], [0.1, 0.2]), TypeError);
  assert.throws(() => setDifferenceFuzzySeries([0.5, 1.2], [0.1, 0.2]), RangeError);

  // Invalid values in objects and Maps (including keys present only in b)
  assert.throws(() => setDifferenceFuzzySeries({ x: 0.5 }, { y: 1.5 }), RangeError);
  assert.throws(() => setDifferenceFuzzySeries({ x: 'bad' }, { x: 0.2 }), TypeError);
  assert.throws(
    () => setDifferenceFuzzySeries(new Map([['x', 0.5]]), new Map([['y', -0.1]])),
    RangeError
  );
  assert.throws(
    () => setDifferenceFuzzySeries(new Map([['x', 0.5]]), new Map([['y', null]])),
    TypeError
  );
});
