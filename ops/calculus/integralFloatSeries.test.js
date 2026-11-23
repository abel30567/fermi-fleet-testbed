import test from 'node:test';
import assert from 'node:assert/strict';
import { integralFloatSeries } from './integralFloatSeries.js';

function assertClose(actual, expected, tol = 1e-12, message) {
  const scale = Math.max(1, Math.abs(expected));
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol * scale,
    message ?? `Expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
  );
}

test('integrates polynomials accurately', () => {
  // Constant: ∫_2^7 5 dx = 25
  assertClose(integralFloatSeries(() => 5, 2, 7), 25, 1e-14);

  // Linear: ∫_0^4 (3x - 2) dx = [1.5x^2 - 2x]_0^4 = 16
  assertClose(integralFloatSeries((x) => 3 * x - 2, 0, 4), 16, 1e-14);

  // Higher-degree polynomial: ∫_-1^2 (x^5 - 2x^3 + 4x - 1) dx
  // Antiderivative F(x) = x^6/6 - x^4/2 + 2x^2 - x
  const F = (x) => x ** 6 / 6 - x ** 4 / 2 + 2 * x ** 2 - x;
  const expected = F(2) - F(-1);
  assertClose(
    integralFloatSeries((x) => x ** 5 - 2 * x ** 3 + 4 * x - 1, -1, 2),
    expected,
    1e-13
  );
});

test('integrates trigonometric functions accurately', () => {
  // ∫_0^π sin(x) dx = 2
  assertClose(integralFloatSeries(Math.sin, 0, Math.PI), 2, 1e-13);

  // ∫_0^(π/2) cos(x) dx = 1
  assertClose(integralFloatSeries(Math.cos, 0, Math.PI / 2), 1, 1e-13);

  // ∫_0^1 sin^2(2πx) dx = 0.5 (tests resistance to coarse-grid aliasing)
  assertClose(integralFloatSeries((x) => Math.sin(2 * Math.PI * x) ** 2, 0, 1), 0.5, 1e-13);

  // ∫_0^2π sin(x) dx = 0
  assertClose(integralFloatSeries(Math.sin, 0, 2 * Math.PI), 0, 1e-13);
});

test('integrates exponential and rational functions accurately', () => {
  // ∫_0^1 e^x dx = e - 1
  assertClose(integralFloatSeries(Math.exp, 0, 1), Math.E - 1, 1e-13);

  // ∫_0^1 1 / (1 + x^2) dx = π / 4
  assertClose(integralFloatSeries((x) => 1 / (1 + x * x), 0, 1), Math.PI / 4, 1e-13);

  // ∫_-1^1 1 / (1 + x^2) dx = π / 2
  assertClose(integralFloatSeries((x) => 1 / (1 + x * x), -1, 1), Math.PI / 2, 1e-13);

  // ∫_1^e (1 / x) dx = ln(e) - ln(1) = 1
  assertClose(integralFloatSeries((x) => 1 / x, 1, Math.E), 1, 1e-13);
});

test('handles edge cases: equal bounds, reversed bounds, and negative bounds', () => {
  // Equal bounds -> exact +0
  const zeroResult = integralFloatSeries((x) => x * x + 1, 3.5, 3.5);
  assert.equal(Object.is(zeroResult, 0), true);

  // Reversed bounds negate the sign exactly
  const forward = integralFloatSeries((x) => Math.exp(-x * x), 0, 2);
  const backward = integralFloatSeries((x) => Math.exp(-x * x), 2, 0);
  assert.equal(backward, -forward);

  // Negative bounds: ∫_-3^-1 (1 / x^2) dx = [-1/x]_-3^-1 = 1 - 1/3 = 2/3
  assertClose(integralFloatSeries((x) => 1 / (x * x), -3, -1), 2 / 3, 1e-13);

  // Odd function over symmetric negative-to-positive interval -> 0
  assertClose(integralFloatSeries((x) => x ** 3 * Math.cos(x), -2.5, 2.5), 0, 1e-13);
});

test('respects options: subdivisions, tolerance, and maxIterations', () => {
  // High-frequency oscillatory function with explicit base subdivisions
  // ∫_0^1 cos(40x) dx = sin(40) / 40
  const osc = integralFloatSeries((x) => Math.cos(40 * x), 0, 1, {
    subdivisions: 64,
    tolerance: 1e-13
  });
  assertClose(osc, Math.sin(40) / 40, 1e-12);

  // Custom tight tolerance and maxIterations
  const tight = integralFloatSeries((x) => 1 / (1 + x * x), 0, 1, {
    tolerance: 1e-14,
    maxIterations: 12
  });
  assertClose(tight, Math.PI / 4, 1e-13);

  // Single iteration with explicit subdivisions executes composite Simpson's rule
  // Exact for cubic polynomial: ∫_0^2 x^3 dx = 4
  const simpsonOnly = integralFloatSeries((x) => x ** 3, 0, 2, {
    subdivisions: 4,
    maxIterations: 1
  });
  assertClose(simpsonOnly, 4, 1e-14);
});

test('validates invalid inputs and throws appropriate errors', () => {
  assert.throws(() => integralFloatSeries(null, 0, 1), TypeError);
  assert.throws(() => integralFloatSeries(42, 0, 1), TypeError);

  assert.throws(() => integralFloatSeries(Math.sin, '0', 1), TypeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, '1'), TypeError);
  assert.throws(() => integralFloatSeries(Math.sin, NaN, 1), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, Infinity), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, -Infinity, 0), RangeError);

  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, null), TypeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, []), TypeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { subdivisions: '4' }), TypeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { subdivisions: 0 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { subdivisions: -4 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { subdivisions: 3 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { subdivisions: 2.5 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { tolerance: '1e-6' }), TypeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { tolerance: 0 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { tolerance: -1e-6 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { tolerance: NaN }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { maxIterations: 0 }), RangeError);
  assert.throws(() => integralFloatSeries(Math.sin, 0, 1, { maxIterations: 25 }), RangeError);

  // Non-finite return value from integrand
  assert.throws(() => integralFloatSeries(() => NaN, 0, 1), RangeError);
  assert.throws(() => integralFloatSeries(() => Infinity, 0, 1), RangeError);
});

test('cross-check: Fundamental Theorem of Calculus against exact antiderivatives', () => {
  const cases = [
    {
      name: 'x * exp(x)',
      f: (x) => x * Math.exp(x),
      F: (x) => (x - 1) * Math.exp(x),
      a: -1.5,
      b: 2.25
    },
    {
      name: '1 / sqrt(1 + x^2)',
      f: (x) => 1 / Math.sqrt(1 + x * x),
      F: (x) => Math.asinh(x),
      a: -2,
      b: 3
    },
    {
      name: 'exp(x) * cos(x)',
      f: (x) => Math.exp(x) * Math.cos(x),
      F: (x) => 0.5 * Math.exp(x) * (Math.sin(x) + Math.cos(x)),
      a: 0,
      b: Math.PI
    },
    {
      name: 'x / (1 + x^2)',
      f: (x) => x / (1 + x * x),
      F: (x) => 0.5 * Math.log(1 + x * x),
      a: -1,
      b: 4
    }
  ];

  for (const { name, f, F, a, b } of cases) {
    const numerical = integralFloatSeries(f, a, b);
    const analytical = F(b) - F(a);
    assertClose(numerical, analytical, 1e-12, `FTC mismatch for ${name}`);
  }
});

test('cross-check: interval additivity and linearity', () => {
  const f = (x) => Math.exp(-0.5 * x * x) * Math.cos(x);
  const g = (x) => Math.log(2 + x * x);

  // Interval additivity: ∫_a^c f = ∫_a^b f + ∫_b^c f
  const a = -2;
  const b = 0.7;
  const c = 3.1;
  const total = integralFloatSeries(f, a, c);
  const left = integralFloatSeries(f, a, b);
  const right = integralFloatSeries(f, b, c);
  assertClose(total, left + right, 1e-12);

  // Also holds when split point is outside [a, c]
  const splitOutside = integralFloatSeries(f, a, 5) + integralFloatSeries(f, 5, c);
  assertClose(total, splitOutside, 1e-12);

  // Linearity: ∫ (α f + β g) = α ∫ f + β ∫ g
  const alpha = 2.75;
  const beta = -1.4;
  const combined = integralFloatSeries((x) => alpha * f(x) + beta * g(x), a, c);
  const linear = alpha * integralFloatSeries(f, a, c) + beta * integralFloatSeries(g, a, c);
  assertClose(combined, linear, 1e-12);
});
