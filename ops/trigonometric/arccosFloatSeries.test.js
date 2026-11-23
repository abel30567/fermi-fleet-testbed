import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arccosFloatSeries } from './arccosFloatSeries.js';

/**
 * Independent numerical integration cross-check:
 *   arccos(x) = pi/2 - integral_0^x dt / sqrt(1 - t^2)
 * Evaluated via composite Simpson's rule (completely independent of series/Math.acos).
 *
 * @param {number} x - Value in (-0.99, 0.99).
 * @param {number} steps - Even number of subintervals.
 * @returns {number} Approximate arccos(x).
 */
function arccosBySimpson(x, steps = 4000) {
  const h = x / steps;
  let sum = 1 + 1 / Math.sqrt(1 - x * x);
  for (let i = 1; i < steps; i += 1) {
    const t = i * h;
    const weight = i % 2 === 0 ? 2 : 4;
    sum += weight / Math.sqrt(1 - t * t);
  }
  const integral = (h / 3) * sum;
  return Math.PI / 2 - integral;
}

describe('arccosFloatSeries', () => {
  it('computes exact cardinal and special angle values', () => {
    assert.strictEqual(arccosFloatSeries(1), 0);
    assert.strictEqual(Object.is(arccosFloatSeries(1), 0), true);
    assert.strictEqual(arccosFloatSeries(-1), Math.PI);
    assert.strictEqual(arccosFloatSeries(0), Math.PI / 2);
    assert.strictEqual(arccosFloatSeries(-0), Math.PI / 2);

    const specialCases = [
      [Math.sqrt(3) / 2, Math.PI / 6],
      [Math.SQRT1_2, Math.PI / 4],
      [0.5, Math.PI / 3],
      [-0.5, (2 * Math.PI) / 3],
      [-Math.SQRT1_2, (3 * Math.PI) / 4],
      [-Math.sqrt(3) / 2, (5 * Math.PI) / 6],
    ];

    for (const [x, expected] of specialCases) {
      const actual = arccosFloatSeries(x);
      assert.ok(
        Math.abs(actual - expected) <= 1e-15,
        `arccosFloatSeries(${x}) = ${actual}, expected ${expected}`
      );
    }
  });

  it('handles edge cases near 0, +-0.5 boundaries, and +-1 endpoints', () => {
    const eps = Number.EPSILON;
    const edgeInputs = [
      -1 + eps,
      -1 + 1e-12,
      -1 + 1e-8,
      -0.5 - eps,
      -0.5,
      -0.5 + eps,
      -1e-15,
      -1e-8,
      -Number.MIN_VALUE,
      Number.MIN_VALUE,
      1e-15,
      1e-8,
      0.5 - eps,
      0.5,
      0.5 + eps,
      1 - 1e-8,
      1 - 1e-12,
      1 - eps,
    ];

    for (const x of edgeInputs) {
      const actual = arccosFloatSeries(x);
      const ref = Math.acos(x);
      const tol = Math.max(4 * Number.EPSILON * Math.max(1, Math.abs(ref)), 1e-15);
      assert.ok(
        Math.abs(actual - ref) <= tol,
        `Edge input x=${x}: got ${actual}, ref ${ref}, diff=${Math.abs(actual - ref)}`
      );
    }
  });

  it('satisfies algebraic and trigonometric identities across [-1, 1]', () => {
    // Reflection identity: arccos(x) + arccos(-x) === pi
    for (let i = 0; i <= 100; i += 1) {
      const x = i / 100;
      const sum = arccosFloatSeries(x) + arccosFloatSeries(-x);
      assert.ok(
        Math.abs(sum - Math.PI) <= 2e-15,
        `Reflection identity failed at x=${x}: sum=${sum}`
      );
    }

    // Strict monotonicity: x1 < x2 => arccos(x1) > arccos(x2)
    let prev = arccosFloatSeries(-1);
    for (let i = -99; i <= 100; i += 1) {
      const curr = arccosFloatSeries(i / 100);
      assert.ok(curr < prev, `Monotonicity failed at x=${i / 100}: ${curr} >= ${prev}`);
      prev = curr;
    }

    // Inverse property: cos(arccos(x)) === x and arccos(cos(theta)) === theta
    for (let i = 0; i <= 200; i += 1) {
      const x = -1 + (2 * i) / 200;
      const roundTripX = Math.cos(arccosFloatSeries(x));
      assert.ok(
        Math.abs(roundTripX - x) <= 2e-15,
        `cos(arccos(${x})) = ${roundTripX}`
      );

      const theta = (Math.PI * i) / 200;
      const roundTripTheta = arccosFloatSeries(Math.cos(theta));
      assert.ok(
        Math.abs(roundTripTheta - theta) <= 2e-15,
        `arccos(cos(${theta})) = ${roundTripTheta}`
      );
    }
  });

  it('matches Math.acos across a dense sweep of [-1, 1] within 2 ULPs', () => {
    const samples = 2000;
    let maxErr = 0;
    for (let i = 0; i <= samples; i += 1) {
      const x = -1 + (2 * i) / samples;
      const actual = arccosFloatSeries(x);
      const expected = Math.acos(x);
      const err = Math.abs(actual - expected);
      if (err > maxErr) {
        maxErr = err;
      }
      const ulpBound = 4 * Number.EPSILON * Math.max(1, Math.abs(expected));
      assert.ok(
        err <= ulpBound,
        `x=${x}: actual=${actual}, expected=${expected}, err=${err}`
      );
    }
    assert.ok(maxErr <= 1e-15, `maxErr=${maxErr} exceeded 1e-15`);
  });

  it('agrees with an independent Simpson numerical integration cross-check', () => {
    const testPoints = [-0.95, -0.75, -0.6, -0.35, -0.1, 0.1, 0.35, 0.6, 0.75, 0.95];
    for (const x of testPoints) {
      const actual = arccosFloatSeries(x);
      const integrated = arccosBySimpson(x);
      assert.ok(
        Math.abs(actual - integrated) <= 1e-10,
        `Simpson cross-check failed at x=${x}: actual=${actual}, integrated=${integrated}`
      );
    }
  });

  it('throws TypeError for non-number inputs', () => {
    const invalidTypes = [
      undefined,
      null,
      '0.5',
      '',
      true,
      false,
      0n,
      {},
      [0],
      Symbol('x'),
      () => 0,
    ];

    for (const value of invalidTypes) {
      assert.throws(() => arccosFloatSeries(value), TypeError);
    }
  });

  it('throws RangeError for non-finite and out-of-domain numbers', () => {
    const outOfRange = [
      NaN,
      Infinity,
      -Infinity,
      -1 - Number.EPSILON,
      1 + Number.EPSILON,
      -1.0001,
      1.0001,
      -2,
      2,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ];

    for (const value of outOfRange) {
      assert.throws(() => arccosFloatSeries(value), RangeError);
    }
  });
});
