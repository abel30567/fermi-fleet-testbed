import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeTypedSeries } from './magnitudeTypedSeries.js';

function assertAlmostEqual(actual, expected, relTol = 1e-14, absTol = 0) {
  if (expected === 0) {
    assert.ok(Math.abs(actual) <= absTol, `expected ${actual} ≈ 0`);
    return;
  }
  const diff = Math.abs(actual - expected);
  const bound = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(
    diff <= bound,
    `expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`
  );
}

describe('magnitudeTypedSeries', () => {
  it('computes accurate magnitudes for standard Pythagorean vectors', () => {
    assert.equal(magnitudeTypedSeries(new Float64Array([3, 4])), 5);
    assert.equal(magnitudeTypedSeries(new Float64Array([1, 2, 2])), 3);
    assertAlmostEqual(magnitudeTypedSeries(new Float64Array([5, 12])), 13, 1e-14);
    assertAlmostEqual(magnitudeTypedSeries(new Float64Array([2, 3, 6])), 7, 1e-14);
  });

  it('handles empty Float64Array and zero vectors', () => {
    assert.ok(Object.is(magnitudeTypedSeries(new Float64Array(0)), 0));
    assert.ok(Object.is(magnitudeTypedSeries(new Float64Array([0, 0, 0])), 0));
    assert.ok(Object.is(magnitudeTypedSeries(new Float64Array([-0, -0])), 0));
  });

  it('handles single-element and negative-value vectors', () => {
    assert.equal(magnitudeTypedSeries(new Float64Array([42.5])), 42.5);
    assert.equal(magnitudeTypedSeries(new Float64Array([-42.5])), 42.5);
    assert.equal(magnitudeTypedSeries(new Float64Array([-3, -4])), 5);
    assert.equal(magnitudeTypedSeries(new Float64Array([-1, 2, -2])), 3);
  });

  it('supports Float64Array subarray views', () => {
    const base = new Float64Array([100, 3, 4, 200]);
    const view = base.subarray(1, 3);
    assert.equal(magnitudeTypedSeries(view), 5);
  });

  it('avoids overflow for very large magnitudes', () => {
    const big = new Float64Array([3e307, 4e307]);
    assertAlmostEqual(magnitudeTypedSeries(big), 5e307, 1e-14);

    const nearMax = new Float64Array([1e308, 1e308]);
    assertAlmostEqual(magnitudeTypedSeries(nearMax), Math.SQRT2 * 1e308, 1e-14);

    const overflowResult = magnitudeTypedSeries(
      new Float64Array([Number.MAX_VALUE, Number.MAX_VALUE])
    );
    assert.equal(overflowResult, Infinity);
  });

  it('avoids underflow for very small and subnormal magnitudes', () => {
    const tiny = new Float64Array([3e-308, 4e-308]);
    assertAlmostEqual(magnitudeTypedSeries(tiny), 5e-308, 1e-14);

    const subnormal = new Float64Array([Number.MIN_VALUE, Number.MIN_VALUE]);
    const expected = Math.hypot(Number.MIN_VALUE, Number.MIN_VALUE);
    assert.equal(magnitudeTypedSeries(subnormal), expected);

    const mixedScale = new Float64Array([1e308, 1e-308]);
    assert.equal(magnitudeTypedSeries(mixedScale), 1e308);
  });

  it('handles NaN and Infinity consistently with IEEE-754 hypot', () => {
    assert.ok(Number.isNaN(magnitudeTypedSeries(new Float64Array([1, NaN, 3]))));
    assert.ok(Number.isNaN(magnitudeTypedSeries(new Float64Array([NaN]))));
    assert.equal(magnitudeTypedSeries(new Float64Array([1, Infinity, 2])), Infinity);
    assert.equal(magnitudeTypedSeries(new Float64Array([-Infinity, 0])), Infinity);
    assert.equal(magnitudeTypedSeries(new Float64Array([NaN, Infinity])), Infinity);
    assert.equal(magnitudeTypedSeries(new Float64Array([-Infinity, NaN])), Infinity);
  });

  it('rejects non-Float64Array inputs with TypeError', () => {
    const invalidInputs = [
      null,
      undefined,
      [3, 4],
      new Float32Array([3, 4]),
      new Int32Array([3, 4]),
      new Uint8Array([3, 4]),
      42,
      '123',
      { length: 2, 0: 3, 1: 4 },
    ];
    for (const bad of invalidInputs) {
      assert.throws(() => magnitudeTypedSeries(bad), TypeError);
    }
  });

  it('matches Math.hypot across varied vector lengths and values', () => {
    const vectors = [
      new Float64Array([0.1, -0.2, 0.3, -0.4, 0.5]),
      new Float64Array([1e150, -2e150, 3e150, 4e150]),
      new Float64Array([1e-150, 2e-150, -3e-150, 4e-150]),
      Float64Array.from({ length: 1000 }, (_, i) => Math.sin(i + 1) * (i % 7 - 3)),
    ];
    for (const v of vectors) {
      assertAlmostEqual(magnitudeTypedSeries(v), Math.hypot(...v), 1e-14);
    }
  });

  it('satisfies norm axioms: homogeneity and triangle inequality', () => {
    const u = new Float64Array([1.5, -2.25, 3.75, -0.5, 4.125]);
    const w = new Float64Array([-0.75, 3.5, -1.25, 2.0, -2.5]);
    const k = -7.3;

    const ku = new Float64Array(u.length);
    const sum = new Float64Array(u.length);
    for (let i = 0; i < u.length; i++) {
      ku[i] = k * u[i];
      sum[i] = u[i] + w[i];
    }

    // Homogeneity: ||k * u|| = |k| * ||u||
    assertAlmostEqual(
      magnitudeTypedSeries(ku),
      Math.abs(k) * magnitudeTypedSeries(u),
      1e-14
    );

    // Triangle inequality: ||u + w|| <= ||u|| + ||w||
    assert.ok(
      magnitudeTypedSeries(sum) <=
        magnitudeTypedSeries(u) + magnitudeTypedSeries(w) + 1e-15
    );
  });
});
