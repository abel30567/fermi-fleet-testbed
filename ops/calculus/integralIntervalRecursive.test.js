import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { integralIntervalRecursive } from './integralIntervalRecursive.js';

// --- Helper outward-rounding utilities for rigorous interval extensions in tests ---
const _f64 = new Float64Array(1);
const _i64 = new BigInt64Array(_f64.buffer);

function nextUp(x) {
  if (x === 0) return Number.MIN_VALUE;
  _f64[0] = x;
  _i64[0] += x > 0 ? 1n : -1n;
  return _f64[0] === 0 ? 0 : _f64[0];
}

function nextDown(x) {
  if (x === 0) return -Number.MIN_VALUE;
  _f64[0] = x;
  _i64[0] += x > 0 ? -1n : 1n;
  return _f64[0] === 0 ? 0 : _f64[0];
}

// Rigorous interval extensions for standard test functions
function ivConst(c) {
  return () => [c, c];
}

function ivLinear(m, c) {
  return ([lo, hi]) => {
    const y1 = m * lo + c;
    const y2 = m * hi + c;
    return [nextDown(Math.min(y1, y2)), nextUp(Math.max(y1, y2))];
  };
}

function ivSquare([lo, hi]) {
  const a2 = lo * lo;
  const b2 = hi * hi;
  if (lo <= 0 && hi >= 0) {
    return [0, nextUp(Math.max(a2, b2))];
  }
  return [Math.max(0, nextDown(Math.min(a2, b2))), nextUp(Math.max(a2, b2))];
}

function ivCube([lo, hi]) {
  return [nextDown(lo * lo * lo), nextUp(hi * hi * hi)];
}

function ivExp([lo, hi]) {
  return [Math.max(0, nextDown(Math.exp(lo))), nextUp(Math.exp(hi))];
}

function ivSin([lo, hi]) {
  const TWO_PI = 2 * Math.PI;
  const HALF_PI = Math.PI / 2;
  if (hi - lo >= TWO_PI) {
    return [-1, 1];
  }
  let yLo = nextDown(Math.min(Math.sin(lo), Math.sin(hi)));
  let yHi = nextUp(Math.max(Math.sin(lo), Math.sin(hi)));

  // Check if pi/2 + 2*k*pi lies in [lo, hi] (maximum = 1)
  const kMax = Math.ceil((lo - HALF_PI) / TWO_PI);
  if (HALF_PI + kMax * TWO_PI <= hi) {
    yHi = 1;
  }
  // Check if -pi/2 + 2*k*pi lies in [lo, hi] (minimum = -1)
  const kMin = Math.ceil((lo + HALF_PI) / TWO_PI);
  if (-HALF_PI + kMin * TWO_PI <= hi) {
    yLo = -1;
  }
  return [Math.max(-1, yLo), Math.min(1, yHi)];
}

function ivReciprocalOnePlusSquare([lo, hi]) {
  // f(x) = 1 / (1 + x^2)
  const [sqLo, sqHi] = ivSquare([lo, hi]);
  const denomLo = 1 + sqLo;
  const denomHi = nextUp(1 + sqHi);
  return [nextDown(1 / denomHi), nextUp(1 / denomLo)];
}

// Independent composite Simpson's rule for numerical cross-checking
function compositeSimpson(f, a, b, n = 2000) {
  assert.equal(n % 2, 0, 'Simpson n must be even');
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * f(x);
  }
  return (h / 3) * sum;
}

function assertStrictlyEncloses(interval, target, label = '') {
  const [lo, hi] = interval;
  assert.equal(Array.isArray(interval), true, `${label}: result should be an array`);
  assert.equal(interval.length, 2, `${label}: result should have length 2`);
  assert.ok(Number.isFinite(lo) && Number.isFinite(hi), `${label}: endpoints must be finite`);
  assert.ok(lo <= hi, `${label}: expected lo <= hi, got [${lo}, ${hi}]`);
  assert.ok(
    lo <= target && target <= hi,
    `${label}: expected ${target} to be enclosed in [${lo}, ${hi}]`
  );
}

describe('integralIntervalRecursive', () => {
  it('encloses integrals of constant functions tightly', () => {
    const resPos = integralIntervalRecursive(ivConst(5), [2, 7]);
    assertStrictlyEncloses(resPos, 25, 'constant 5 on [2, 7]');
    assert.ok(resPos[1] - resPos[0] < 1e-11, `expected tight width, got ${resPos[1] - resPos[0]}`);

    const resNeg = integralIntervalRecursive(ivConst(-3.5), [-4, 2]);
    assertStrictlyEncloses(resNeg, -21, 'constant -3.5 on [-4, 2]');
    assert.ok(resNeg[1] - resNeg[0] < 1e-11);

    const resZero = integralIntervalRecursive(ivConst(0), [-10, 10]);
    assert.deepEqual(resZero, [0, 0]);
  });

  it('encloses integrals of linear functions and matches closed-form & Simpson', () => {
    // ∫_1^4 (2x + 3) dx = [x^2 + 3x]_1^4 = 28 - 4 = 24
    const exact = 24;
    const simpson = compositeSimpson((x) => 2 * x + 3, 1, 4);
    const res = integralIntervalRecursive(ivLinear(2, 3), [1, 4], { depth: 10 });
    assertStrictlyEncloses(res, exact, 'linear exact');
    assertStrictlyEncloses(res, simpson, 'linear simpson');
    assert.ok(res[1] - res[0] < 0.02);
  });

  it('encloses integrals of quadratic (x^2) over positive, mixed, and negative domains', () => {
    const cases = [
      [0, 1],
      [1, 3],
      [-2, 3],
      [-5, -2],
    ];
    for (const [a, b] of cases) {
      const exact = (b ** 3 - a ** 3) / 3;
      const simpson = compositeSimpson((x) => x * x, a, b);
      const res = integralIntervalRecursive(ivSquare, [a, b], { depth: 10 });
      assertStrictlyEncloses(res, exact, `x^2 on [${a}, ${b}] exact`);
      assertStrictlyEncloses(res, simpson, `x^2 on [${a}, ${b}] simpson`);
    }
  });

  it('encloses integrals of cubic (x^3) over symmetric and negative domains', () => {
    const cases = [
      [0, 2],
      [-2, 2],
      [-3, -1],
      [-1.5, 2.5],
    ];
    for (const [a, b] of cases) {
      const exact = (b ** 4 - a ** 4) / 4;
      const simpson = compositeSimpson((x) => x * x * x, a, b);
      const res = integralIntervalRecursive(ivCube, [a, b], { depth: 10 });
      assertStrictlyEncloses(res, exact, `x^3 on [${a}, ${b}] exact`);
      assertStrictlyEncloses(res, simpson, `x^3 on [${a}, ${b}] simpson`);
    }
  });

  it('encloses integrals of exp(x) and sin(x) and cross-checks closed-form & Simpson', () => {
    // exp(x) on [-2, 1.5]
    const expExact = Math.exp(1.5) - Math.exp(-2);
    const expSimpson = compositeSimpson(Math.exp, -2, 1.5);
    const expRes = integralIntervalRecursive(ivExp, [-2, 1.5], { depth: 10 });
    assertStrictlyEncloses(expRes, expExact, 'exp on [-2, 1.5] exact');
    assertStrictlyEncloses(expRes, expSimpson, 'exp on [-2, 1.5] simpson');

    // sin(x) on [0, 1]: exact 1 - cos(1)
    const sin1Exact = 1 - Math.cos(1);
    const sin1Simpson = compositeSimpson(Math.sin, 0, 1);
    const sin1Res = integralIntervalRecursive(ivSin, [0, 1], { depth: 10 });
    assertStrictlyEncloses(sin1Res, sin1Exact, 'sin on [0, 1] exact');
    assertStrictlyEncloses(sin1Res, sin1Simpson, 'sin on [0, 1] simpson');

    // sin(x) on [0, pi]: exact 2
    const sinPiExact = 2;
    const sinPiSimpson = compositeSimpson(Math.sin, 0, Math.PI);
    const sinPiRes = integralIntervalRecursive(ivSin, [0, Math.PI], { depth: 10 });
    assertStrictlyEncloses(sinPiRes, sinPiExact, 'sin on [0, pi] exact');
    assertStrictlyEncloses(sinPiRes, sinPiSimpson, 'sin on [0, pi] simpson');

    // sin(x) on [-2.5, -0.5] (negative domain): exact cos(-2.5) - cos(-0.5)
    const sinNegExact = Math.cos(-2.5) - Math.cos(-0.5);
    const sinNegSimpson = compositeSimpson(Math.sin, -2.5, -0.5);
    const sinNegRes = integralIntervalRecursive(ivSin, [-2.5, -0.5], { depth: 10 });
    assertStrictlyEncloses(sinNegRes, sinNegExact, 'sin on [-2.5, -0.5] exact');
    assertStrictlyEncloses(sinNegRes, sinNegSimpson, 'sin on [-2.5, -0.5] simpson');

    // 1 / (1 + x^2) on [0, 1]: exact pi / 4
    const atanExact = Math.PI / 4;
    const atanSimpson = compositeSimpson((x) => 1 / (1 + x * x), 0, 1);
    const atanRes = integralIntervalRecursive(ivReciprocalOnePlusSquare, [0, 1], { depth: 10 });
    assertStrictlyEncloses(atanRes, atanExact, '1/(1+x^2) on [0, 1] exact');
    assertStrictlyEncloses(atanRes, atanSimpson, '1/(1+x^2) on [0, 1] simpson');
  });

  it('handles zero-width domains [a, a] and returns [0, 0]', () => {
    for (const a of [0, 3.5, -7.25, 1e10]) {
      let called = 0;
      const res = integralIntervalRecursive(
        (iv) => {
          called++;
          return ivSquare(iv);
        },
        [a, a],
        { depth: 10 }
      );
      assert.deepEqual(res, [0, 0]);
      assert.equal(called, 1, 'should evaluate fn once for validation and not subdivide');
    }
  });

  it('strictly tightens enclosure width as depth increases while maintaining enclosure', () => {
    const exact = 1 / 3;
    const depths = [0, 1, 2, 4, 6, 8, 10];
    let prevWidth = Infinity;

    for (const depth of depths) {
      const res = integralIntervalRecursive(ivSquare, [0, 1], { depth });
      assertStrictlyEncloses(res, exact, `x^2 depth=${depth}`);
      const width = res[1] - res[0];
      assert.ok(
        width < prevWidth,
        `expected width at depth ${depth} (${width}) < previous width (${prevWidth})`
      );
      prevWidth = width;
    }

    // At depth 10 (1024 subintervals), width of x^2 on [0,1] should be ~1/1024 ≈ 0.000977
    assert.ok(prevWidth < 0.0011, `expected final width < 0.0011, got ${prevWidth}`);
  });

  it('supports early-stop tolerance to reduce evaluations while guaranteeing enclosure', () => {
    // Constant function should stop at root when tolerance > 0
    let constCalls = 0;
    const constRes = integralIntervalRecursive(
      (iv) => {
        constCalls++;
        return [4, 4];
      },
      [0, 5],
      { depth: 12, tolerance: 1e-6 }
    );
    assertStrictlyEncloses(constRes, 20, 'constant with tolerance');
    assert.equal(constCalls, 1, 'constant function should stop immediately at root');

    // Non-constant function with tolerance stops well below full 2^14 leaves
    let sqCalls = 0;
    const sqRes = integralIntervalRecursive(
      (iv) => {
        sqCalls++;
        return ivSquare(iv);
      },
      [0, 1],
      { depth: 14, tolerance: 1e-2 }
    );
    assertStrictlyEncloses(sqRes, 1 / 3, 'x^2 with tolerance');
    assert.ok(sqRes[1] - sqRes[0] <= 1e-2 + 1e-12, `width ${sqRes[1] - sqRes[0]} should respect tolerance`);
    assert.ok(sqCalls < 1000, `expected early stopping (<1000 calls), got ${sqCalls}`);
  });

  it('terminates cleanly on adjacent floating-point intervals with high depth', () => {
    const a = 1;
    const b = 1 + Number.EPSILON;
    const res = integralIntervalRecursive(ivSquare, [a, b], { depth: 30 });
    const exact = (b ** 3 - a ** 3) / 3;
    assertStrictlyEncloses(res, exact, 'adjacent floats [1, 1 + eps]');
  });

  it('throws on invalid inputs and invalid fn return values', () => {
    // Invalid fn
    assert.throws(() => integralIntervalRecursive(null, [0, 1]), TypeError);
    assert.throws(() => integralIntervalRecursive(42, [0, 1]), TypeError);

    // Invalid domain
    assert.throws(() => integralIntervalRecursive(ivSquare, null), TypeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0]), TypeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1, 2]), TypeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, ['0', 1]), TypeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [NaN, 1]), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, Infinity]), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [-Infinity, 0]), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [2, 1]), RangeError);

    // Invalid options
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], null), TypeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], []), TypeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { depth: -1 }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { depth: 2.5 }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { depth: Infinity }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { depth: '4' }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { tolerance: -0.1 }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { tolerance: NaN }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { tolerance: Infinity }), RangeError);
    assert.throws(() => integralIntervalRecursive(ivSquare, [0, 1], { tolerance: '0' }), RangeError);

    // Invalid fn return values
    assert.throws(() => integralIntervalRecursive(() => 5, [0, 1]), TypeError);
    assert.throws(() => integralIntervalRecursive(() => [1], [0, 1]), TypeError);
    assert.throws(() => integralIntervalRecursive(() => ['1', 2], [0, 1]), TypeError);
    assert.throws(() => integralIntervalRecursive(() => [NaN, 1], [0, 1]), RangeError);
    assert.throws(() => integralIntervalRecursive(() => [0, Infinity], [0, 1]), RangeError);
    assert.throws(() => integralIntervalRecursive(() => [2, 1], [0, 1]), RangeError);
  });
});
