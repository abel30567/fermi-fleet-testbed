import test from 'node:test';
import assert from 'node:assert/strict';
import { dotProductBigIntIterative } from './dotProductBigIntIterative.js';

test('computes dot product for normal small vectors', () => {
  assert.equal(dotProductBigIntIterative([1n, 2n, 3n], [4n, 5n, 6n]), 32n);
  assert.equal(dotProductBigIntIterative([7n], [-3n]), -21n);
  assert.equal(dotProductBigIntIterative([-1n, 2n, -3n, 4n], [5n, -6n, 7n, -8n]), -70n);
});

test('handles orthogonal and zero vectors', () => {
  assert.equal(dotProductBigIntIterative([1n, 0n, -1n], [1n, 5n, 1n]), 0n);
  assert.equal(dotProductBigIntIterative([0n, 0n, 0n], [99n, -42n, 123456n]), 0n);
});

test('handles empty vectors', () => {
  assert.equal(dotProductBigIntIterative([], []), 0n);
});

test('preserves exact precision beyond Number.MAX_SAFE_INTEGER', () => {
  const big = 10n ** 50n;
  const a = [big + 1n, -big, 2n ** 200n];
  const b = [big, big + 1n, 2n ** 200n];
  // (big + 1) * big + (-big) * (big + 1) + 2^400 = 2^400
  assert.equal(dotProductBigIntIterative(a, b), 2n ** 400n);
});

test('does not mutate input arrays', () => {
  const a = [10n, -20n, 30n];
  const b = [3n, 4n, -5n];
  const aCopy = [...a];
  const bCopy = [...b];

  assert.equal(dotProductBigIntIterative(a, b), -200n);
  assert.deepEqual(a, aCopy);
  assert.deepEqual(b, bCopy);
});

test('validates input types and vector lengths', () => {
  assert.throws(() => dotProductBigIntIterative(null, []), TypeError);
  assert.throws(() => dotProductBigIntIterative([], undefined), TypeError);
  assert.throws(() => dotProductBigIntIterative('123', [1n, 2n, 3n]), TypeError);
  assert.throws(() => dotProductBigIntIterative([1n], { length: 1, 0: 1n }), TypeError);

  assert.throws(() => dotProductBigIntIterative([1n, 2n], [1n]), RangeError);
  assert.throws(() => dotProductBigIntIterative([], [0n]), RangeError);

  assert.throws(() => dotProductBigIntIterative([1, 2n], [3n, 4n]), TypeError);
  assert.throws(() => dotProductBigIntIterative([1n, 2n], [3n, '4']), TypeError);
  assert.throws(() => dotProductBigIntIterative([1n, null], [3n, 4n]), TypeError);

  // Sparse array check
  const sparse = new Array(2);
  sparse[0] = 1n;
  assert.throws(() => dotProductBigIntIterative(sparse, [1n, 2n]), TypeError);
});

test('cross-check against closed-form analytical identities', () => {
  const N = 200n;
  const linear = [];
  const squares = [];
  for (let i = 1n; i <= N; i++) {
    linear.push(i);
    squares.push(i * i);
  }

  // sum_{i=1}^N i^2 = N(N+1)(2N+1)/6
  const expectedSumOfSquares = (N * (N + 1n) * (2n * N + 1n)) / 6n;
  assert.equal(dotProductBigIntIterative(linear, linear), expectedSumOfSquares);

  // sum_{i=1}^N i^3 = (N(N+1)/2)^2
  const triangle = (N * (N + 1n)) / 2n;
  const expectedSumOfCubes = triangle * triangle;
  assert.equal(dotProductBigIntIterative(linear, squares), expectedSumOfCubes);
});

test('cross-check algebraic properties and divide-and-conquer reference', () => {
  // Independent divide-and-conquer recursive reference implementation
  function referenceDot(u, v, lo = 0, hi = u.length) {
    const len = hi - lo;
    if (len === 0) return 0n;
    if (len === 1) return u[lo] * v[lo];
    const mid = lo + (len >> 1);
    return referenceDot(u, v, lo, mid) + referenceDot(u, v, mid, hi);
  }

  // Deterministic LCG producing large signed BigInts
  let seed = 0x123456789abcdef0123456789abcdef1n;
  const mod = 1n << 128n;
  const half = 1n << 127n;
  function nextBigInt() {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod;
    return seed - half;
  }

  const n = 64;
  const a = Array.from({ length: n }, () => nextBigInt());
  const b = Array.from({ length: n }, () => nextBigInt());
  const c = Array.from({ length: n }, () => nextBigInt());
  const k = -7919n;

  const dotAB = dotProductBigIntIterative(a, b);
  const dotBA = dotProductBigIntIterative(b, a);
  const dotAA = dotProductBigIntIterative(a, a);
  const dotBB = dotProductBigIntIterative(b, b);

  // Matches independent reference implementation
  assert.equal(dotAB, referenceDot(a, b));

  // Commutativity: a . b == b . a
  assert.equal(dotAB, dotBA);

  // Bilinearity: (k*a + c) . b == k*(a . b) + (c . b)
  const combined = a.map((ai, i) => k * ai + c[i]);
  assert.equal(
    dotProductBigIntIterative(combined, b),
    k * dotAB + dotProductBigIntIterative(c, b),
  );

  // Cauchy-Schwarz: (a . b)^2 <= (a . a) * (b . b)
  assert.ok(dotAB * dotAB <= dotAA * dotBB);
  assert.ok(dotAA > 0n);
});
