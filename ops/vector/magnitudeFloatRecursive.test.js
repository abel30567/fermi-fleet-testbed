import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeFloatRecursive } from './magnitudeFloatRecursive.js';

function assertClose(actual, expected, relTol = 1e-14, absTol = 0) {
  assert.ok(Number.isFinite(actual), `expected finite actual, got ${actual}`);
  const diff = Math.abs(actual - expected);
  const tol = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(
    diff <= tol,
    `expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
  );
}

describe('magnitudeFloatRecursive', () => {
  it('computes exact magnitudes for classic Pythagorean vectors', () => {
    assert.equal(magnitudeFloatRecursive([3, 4]), 5);
    assert.equal(magnitudeFloatRecursive([-3, -4]), 5);
    assert.equal(magnitudeFloatRecursive([5, 12]), 13);
    assert.equal(magnitudeFloatRecursive([2, 3, 6]), 7);
    assert.equal(magnitudeFloatRecursive([1, 2, 2, 4]), 5);
  });

  it('handles empty, single-element, and zero vectors', () => {
    assert.ok(Object.is(magnitudeFloatRecursive([]), 0));
    assert.ok(Object.is(magnitudeFloatRecursive([0]), 0));
    assert.ok(Object.is(magnitudeFloatRecursive([-0]), 0));
    assert.ok(Object.is(magnitudeFloatRecursive([0, -0, 0]), 0));
    assert.equal(magnitudeFloatRecursive([7.5]), 7.5);
    assert.equal(magnitudeFloatRecursive([-7.5]), 7.5);
  });

  it('supports Float64Array inputs', () => {
    const typed = new Float64Array([3, -4, 12]);
    assert.equal(magnitudeFloatRecursive(typed), 13);
    assert.ok(Object.is(magnitudeFloatRecursive(new Float64Array()), 0));
  });

  it('prevents overflow for very large float64 values', () => {
    assertClose(magnitudeFloatRecursive([1e300, 1e300]), 1e300 * Math.SQRT2);
    assertClose(magnitudeFloatRecursive([3e307, 4e307]), 5e307);
    assert.equal(magnitudeFloatRecursive([Number.MAX_VALUE, 0]), Number.MAX_VALUE);
    assert.equal(
      magnitudeFloatRecursive([Number.MAX_VALUE, Number.MAX_VALUE]),
      Infinity,
    );
  });

  it('prevents underflow for very small and subnormal float64 values', () => {
    assertClose(magnitudeFloatRecursive([1e-300, 1e-300]), 1e-300 * Math.SQRT2);
    assertClose(magnitudeFloatRecursive([3e-308, 4e-308]), 5e-308);
    assert.equal(
      magnitudeFloatRecursive([Number.MIN_VALUE, 0]),
      Number.MIN_VALUE,
    );
    assert.equal(
      magnitudeFloatRecursive([Number.MIN_VALUE, Number.MIN_VALUE]),
      Math.hypot(Number.MIN_VALUE, Number.MIN_VALUE),
    );
  });

  it('handles extreme mixed-scale vectors accurately', () => {
    assert.equal(magnitudeFloatRecursive([1e300, 1e-300]), 1e300);
    assert.equal(magnitudeFloatRecursive([1e-300, 1e300, -1e-300]), 1e300);
    assertClose(
      magnitudeFloatRecursive([1e-160, 1e-160, 3e150, 4e150]),
      5e150,
    );
  });

  it('follows IEEE-754 hypot semantics for Infinity and NaN', () => {
    assert.equal(magnitudeFloatRecursive([Infinity]), Infinity);
    assert.equal(magnitudeFloatRecursive([-Infinity, 1]), Infinity);
    assert.equal(magnitudeFloatRecursive([NaN, Infinity]), Infinity);
    assert.equal(magnitudeFloatRecursive([-Infinity, NaN, 0]), Infinity);
    assert.ok(Number.isNaN(magnitudeFloatRecursive([NaN])));
    assert.ok(Number.isNaN(magnitudeFloatRecursive([3, NaN, 4])));
  });

  it('cross-checks against Math.hypot across varied lengths and distributions', () => {
    // Deterministic PRNG (Mulberry32) for reproducible cross-checking
    let seed = 0x12345678;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const lengths = [1, 2, 3, 5, 8, 13, 31, 64, 127, 500, 2048];
    for (const len of lengths) {
      const vec = new Array(len);
      for (let i = 0; i < len; i++) {
        // Mix signs and exponents across wide dynamic ranges
        const exp = Math.floor(rand() * 400) - 200;
        const sign = rand() < 0.5 ? -1 : 1;
        vec[i] = sign * (rand() + 0.5) * 10 ** exp;
      }
      const actual = magnitudeFloatRecursive(vec);
      const expected = Math.hypot(...vec);
      assertClose(actual, expected, 1e-13);
    }
  });

  it('handles large vectors without stack overflow and matches known analytical norms', () => {
    const n = 10000;
    const ones = new Array(n).fill(1);
    assertClose(magnitudeFloatRecursive(ones), Math.sqrt(n), 1e-14);
  });

  it('throws TypeError on invalid inputs', () => {
    assert.throws(() => magnitudeFloatRecursive(null), TypeError);
    assert.throws(() => magnitudeFloatRecursive(undefined), TypeError);
    assert.throws(() => magnitudeFloatRecursive(42), TypeError);
    assert.throws(() => magnitudeFloatRecursive('123'), TypeError);
    assert.throws(() => magnitudeFloatRecursive({ length: 2, 0: 3, 1: 4 }), TypeError);
    assert.throws(() => magnitudeFloatRecursive([1, '2']), TypeError);
    assert.throws(() => magnitudeFloatRecursive([Infinity, 'bad']), TypeError);
    assert.throws(() => magnitudeFloatRecursive([1, null]), TypeError);
    assert.throws(() => magnitudeFloatRecursive([1, undefined]), TypeError);
    assert.throws(() => magnitudeFloatRecursive([1n, 2n]), TypeError);
    // Sparse array with hole
    const sparse = new Array(3);
    sparse[0] = 3;
    sparse[2] = 4;
    assert.throws(() => magnitudeFloatRecursive(sparse), TypeError);
  });
});
