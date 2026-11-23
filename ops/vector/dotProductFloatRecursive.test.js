import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductFloatRecursive } from './dotProductFloatRecursive.js';

/**
 * Independent reference: Neumaier compensated summation for float64 dot product.
 *
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
function neumaierDotProduct(a, b) {
  let sum = 0;
  let c = 0;
  for (let i = 0; i < a.length; i++) {
    const prod = a[i] * b[i];
    const t = sum + prod;
    if (Math.abs(sum) >= Math.abs(prod)) {
      c += (sum - t) + prod;
    } else {
      c += (prod - t) + sum;
    }
    sum = t;
  }
  return sum + c;
}

/**
 * Independent deterministic PRNG (Mulberry32) for reproducible tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('dotProductFloatRecursive', () => {
  it('computes dot product for standard integer and floating-point vectors', () => {
    assert.equal(dotProductFloatRecursive([1, 2, 3], [4, 5, 6]), 32);
    assert.equal(dotProductFloatRecursive([-1, 2, -3], [4, -5, 6]), -32);
    assert.ok(
      Math.abs(dotProductFloatRecursive([0.5, 1.5, 2.5], [2, 4, 6]) - 22) < 1e-12
    );
  });

  it('handles orthogonal and antiparallel vectors', () => {
    assert.equal(dotProductFloatRecursive([1, 0, -1], [0, 5, 0]), 0);
    assert.equal(dotProductFloatRecursive([3, 4], [-4, 3]), 0);
    assert.equal(dotProductFloatRecursive([3, 4], [-3, -4]), -25);
  });

  it('handles empty, single-element, and varied small lengths (odd/even/powers of 2)', () => {
    assert.equal(dotProductFloatRecursive([], []), 0);
    assert.equal(dotProductFloatRecursive([7.5], [-2]), -15);
    assert.equal(dotProductFloatRecursive([2, 3], [5, 7]), 31);

    for (let len = 1; len <= 17; len++) {
      const a = Array.from({ length: len }, (_, i) => i + 1);
      const b = Array.from({ length: len }, () => 1);
      const expected = (len * (len + 1)) / 2;
      assert.equal(dotProductFloatRecursive(a, b), expected);
    }
  });

  it('supports Float64Array inputs and mixed Array / Float64Array inputs', () => {
    const a = new Float64Array([1.25, -2.5, 3.75, 4.0]);
    const b = new Float64Array([2.0, 4.0, -2.0, 0.5]);
    assert.equal(dotProductFloatRecursive(a, b), -13);
    assert.equal(dotProductFloatRecursive(Array.from(a), b), -13);
    assert.equal(dotProductFloatRecursive(a, Array.from(b)), -13);
  });

  it('preserves IEEE-754 special values (NaN, Infinity, subnormals)', () => {
    assert.ok(Number.isNaN(dotProductFloatRecursive([1, NaN, 3], [4, 5, 6])));
    assert.equal(dotProductFloatRecursive([Infinity, 1], [2, 3]), Infinity);
    assert.equal(dotProductFloatRecursive([-Infinity, 1], [2, 3]), -Infinity);
    assert.ok(
      Number.isNaN(dotProductFloatRecursive([Infinity, -Infinity], [1, 1]))
    );
    assert.equal(
      dotProductFloatRecursive([Number.MIN_VALUE, Number.MIN_VALUE], [1, 1]),
      2 * Number.MIN_VALUE
    );
  });

  it('validates input types, vector shapes, and elements', () => {
    assert.throws(() => dotProductFloatRecursive(null, [1]), TypeError);
    assert.throws(() => dotProductFloatRecursive([1], undefined), TypeError);
    assert.throws(() => dotProductFloatRecursive('123', [1, 2, 3]), TypeError);
    assert.throws(() => dotProductFloatRecursive({ length: 1, 0: 1 }, [1]), TypeError);
    assert.throws(() => dotProductFloatRecursive(new Int32Array([1]), [1]), TypeError);

    assert.throws(() => dotProductFloatRecursive([1, 2], [1, 2, 3]), RangeError);
    assert.throws(() => dotProductFloatRecursive([], [1]), RangeError);

    assert.throws(() => dotProductFloatRecursive([1, '2'], [1, 2]), TypeError);
    assert.throws(() => dotProductFloatRecursive([1, 2], [1, null]), TypeError);
    assert.throws(() => dotProductFloatRecursive([1n], [1]), TypeError);

    // Sparse array hole
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3];
    assert.throws(() => dotProductFloatRecursive(sparse, [1, 2, 3]), TypeError);
  });

  it('cross-checks exact integer vectors against BigInt arithmetic', () => {
    const rand = createPrng(20261123);
    const n = 1023;
    const a = [];
    const b = [];
    let expectedBig = 0n;

    for (let i = 0; i < n; i++) {
      const ai = Math.floor(rand() * 2001) - 1000;
      const bi = Math.floor(rand() * 2001) - 1000;
      a.push(ai);
      b.push(bi);
      expectedBig += BigInt(ai) * BigInt(bi);
    }

    assert.equal(dotProductFloatRecursive(a, b), Number(expectedBig));
  });

  it('cross-checks large float vectors against Neumaier compensated summation and improves over naive summation', () => {
    const rand = createPrng(42);
    const n = 10000;
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = (rand() - 0.5) * 100;
      b[i] = (rand() - 0.5) * 100;
    }

    const recursiveResult = dotProductFloatRecursive(a, b);
    const neumaierResult = neumaierDotProduct(a, b);
    const relErr =
      Math.abs(recursiveResult - neumaierResult) /
      Math.max(1, Math.abs(neumaierResult));
    assert.ok(
      relErr < 1e-13,
      `Expected relative error < 1e-13, got ${relErr}`
    );

    // Pairwise summation accuracy check on repeated small fractional values
    const m = 100000;
    const u = new Float64Array(m).fill(0.1);
    const v = new Float64Array(m).fill(1.0);
    const exact = 10000;
    let naive = 0;
    for (let i = 0; i < m; i++) {
      naive += u[i] * v[i];
    }
    const pairwise = dotProductFloatRecursive(u, v);
    assert.ok(
      Math.abs(pairwise - exact) <= Math.abs(naive - exact),
      `Expected pairwise error (${Math.abs(pairwise - exact)}) <= naive error (${Math.abs(naive - exact)})`
    );
    assert.ok(Math.abs(pairwise - exact) < 1e-10);
  });

  it('satisfies commutativity and Cauchy-Schwarz inequality', () => {
    const rand = createPrng(999);
    const n = 257;
    const a = Array.from({ length: n }, () => (rand() - 0.5) * 20);
    const b = Array.from({ length: n }, () => (rand() - 0.5) * 20);

    const ab = dotProductFloatRecursive(a, b);
    const ba = dotProductFloatRecursive(b, a);
    assert.equal(ab, ba);

    const aa = dotProductFloatRecursive(a, a);
    const bb = dotProductFloatRecursive(b, b);
    assert.ok(aa >= 0 && bb >= 0);
    assert.ok(Math.abs(ab) <= Math.sqrt(aa) * Math.sqrt(bb) * (1 + 1e-12));
  });
});
