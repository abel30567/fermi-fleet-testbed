import test from 'node:test';
import assert from 'node:assert/strict';
import { arcsinFloatStable } from './arcsinFloatStable.js';

/**
 * Computes the ULP distance between two finite IEEE-754 float64 numbers.
 *
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function ulpDistance(a, b) {
  if (a === b) return 0n;
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  const toOrdered = (v) => {
    view.setFloat64(0, v, false);
    const bits = view.getBigUint64(0, false);
    return (bits & (1n << 63n)) !== 0n ? ~bits : bits ^ (1n << 63n);
  };
  const oa = toOrdered(a);
  const ob = toOrdered(b);
  return oa >= ob ? oa - ob : ob - oa;
}

/**
 * Independent arbitrary-precision BigInt reference for arcsin(x) on [-1, 1],
 * completely independent of Math.asin and IEEE-754 float64 arithmetic.
 * Uses 10^45 fixed-point scaling, Machin's formula for pi, integer square root,
 * and exact rational Maclaurin summation.
 */
const BIG_SCALE = 10n ** 45n;

function float64ToScaledBigInt(x, scale) {
  if (x === 0) return 0n;
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, x, false);
  const bits = view.getBigUint64(0, false);
  const sign = (bits >> 63n) !== 0n ? -1n : 1n;
  const exp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  const mant = exp === 0 ? frac : (1n << 52n) | frac;
  const shift = (exp === 0 ? 1 - 1023 : exp - 1023) - 52;
  if (shift >= 0) {
    return sign * (mant << BigInt(shift)) * scale;
  }
  const denom = 1n << BigInt(-shift);
  return sign * ((mant * scale + denom / 2n) / denom);
}

function bigIntSqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  while (true) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

function computeHalfPiScaled(scale) {
  const atanInv = (m) => {
    const m2 = m * m;
    let term = scale / m;
    let sum = term;
    let k = 1n;
    while (term !== 0n) {
      term = term / m2;
      const contrib = term / (2n * k + 1n);
      if (contrib === 0n) break;
      sum = k % 2n === 1n ? sum - contrib : sum + contrib;
      k++;
    }
    return sum;
  };
  const pi = 4n * (4n * atanInv(5n) - atanInv(239n));
  return pi / 2n;
}

const HALF_PI_BIG = computeHalfPiScaled(BIG_SCALE);

function asinSeriesScaled(sScaled, scale) {
  // Computes asin(s) for 0 <= s <= 0.5 using exact BigInt fixed-point Maclaurin series.
  const tScaled = (sScaled * sScaled) / scale;
  let sum = sScaled;
  let term = sScaled;
  for (let k = 1n; k <= 120n; k++) {
    term = (term * (2n * k - 1n) * (2n * k - 1n) * tScaled) / (2n * k * (2n * k + 1n) * scale);
    if (term === 0n) break;
    sum += term;
  }
  return sum;
}

function asinBigIntReference(x) {
  const neg = x < 0;
  const ax = Math.abs(x);
  if (ax === 0) return x;
  if (ax === 1) return neg ? -Math.PI / 2 : Math.PI / 2;

  const axScaled = float64ToScaledBigInt(ax, BIG_SCALE);
  let resScaled;
  if (ax < 0.5) {
    resScaled = asinSeriesScaled(axScaled, BIG_SCALE);
  } else {
    // t = (1 - ax) / 2, s = sqrt(t), asin(ax) = pi/2 - 2 * asin(s)
    const tScaled = (BIG_SCALE - axScaled) / 2n;
    const sScaled = bigIntSqrt(tScaled * BIG_SCALE);
    resScaled = HALF_PI_BIG - 2n * asinSeriesScaled(sScaled, BIG_SCALE);
  }

  // Convert scaled BigInt back to float64 via decimal string for exact parsing.
  const str = resScaled.toString().padStart(46, '0');
  const intPart = str.slice(0, str.length - 45);
  const fracPart = str.slice(str.length - 45);
  const val = Number(`${intPart}.${fracPart}`);
  return neg ? -val : val;
}

test('input validation: throws TypeError on non-number inputs', () => {
  const invalidInputs = [undefined, null, '0.5', '', true, false, {}, [], 0n, Symbol('x')];
  for (const val of invalidInputs) {
    assert.throws(
      () => arcsinFloatStable(val),
      TypeError,
      `Expected TypeError for ${String(val)}`
    );
  }
});

test('domain boundaries: returns NaN for NaN and |x| > 1', () => {
  const outOfDomain = [
    NaN,
    Infinity,
    -Infinity,
    1 + Number.EPSILON,
    -1 - Number.EPSILON,
    1.000001,
    -1.000001,
    2,
    -1e100,
  ];
  for (const x of outOfDomain) {
    assert.ok(Number.isNaN(arcsinFloatStable(x)), `Expected NaN for x=${x}`);
  }
});

test('exact special values and signed zero preservation', () => {
  assert.ok(Object.is(arcsinFloatStable(0), 0), '+0 should map to +0');
  assert.ok(Object.is(arcsinFloatStable(-0), -0), '-0 should map to -0');
  assert.equal(arcsinFloatStable(1), Math.PI / 2);
  assert.equal(arcsinFloatStable(-1), -Math.PI / 2);

  // Known exact trigonometric values
  assert.ok(ulpDistance(arcsinFloatStable(0.5), Math.PI / 6) <= 1n);
  assert.ok(ulpDistance(arcsinFloatStable(-0.5), -Math.PI / 6) <= 1n);
  assert.ok(ulpDistance(arcsinFloatStable(Math.SQRT1_2), Math.PI / 4) <= 1n);
  assert.ok(ulpDistance(arcsinFloatStable(-Math.SQRT1_2), -Math.PI / 4) <= 1n);
  assert.ok(ulpDistance(arcsinFloatStable(Math.sqrt(3) / 2), Math.PI / 3) <= 1n);
  assert.ok(ulpDistance(arcsinFloatStable(-Math.sqrt(3) / 2), -Math.PI / 3) <= 1n);
});

test('subnormal and tiny arguments avoid underflow and preserve sign', () => {
  const tinyValues = [
    Number.MIN_VALUE,
    -Number.MIN_VALUE,
    1e-310,
    -1e-310,
    1e-200,
    -1e-200,
    1e-50,
    -1e-50,
    1e-16,
    -1e-16,
    2 ** -28,
    -(2 ** -28),
    2 ** -27,
    -(2 ** -27),
    2 ** -26,
    -(2 ** -26),
    1e-6,
    -1e-6,
  ];
  for (const x of tinyValues) {
    const actual = arcsinFloatStable(x);
    const expected = Math.asin(x);
    assert.ok(
      ulpDistance(actual, expected) <= 1n,
      `Mismatch for tiny x=${x}: actual=${actual}, expected=${expected}`
    );
  }
});

test('seam continuity around |x| = 0.5 and cancellation regime near |x| = 1', () => {
  // Continuity and strict monotonicity across the x = 0.5 range-reduction boundary
  const seamLow = 0.5 - Number.EPSILON / 2;
  const seamMid = 0.5;
  const seamHigh = 0.5 + Number.EPSILON;
  const yLow = arcsinFloatStable(seamLow);
  const yMid = arcsinFloatStable(seamMid);
  const yHigh = arcsinFloatStable(seamHigh);
  assert.ok(yLow < yMid && yMid < yHigh, 'Must be strictly increasing across x = 0.5');

  // Extreme values near |x| = 1 where naive sqrt(1 - x^2) loses half its precision
  const nearOne = [
    1 - Number.EPSILON / 2, // largest float64 < 1 (1 - 2^-53)
    1 - Number.EPSILON,
    1 - 2 * Number.EPSILON,
    1 - 1e-15,
    1 - 1e-12,
    1 - 1e-9,
    1 - 1e-6,
    1 - 1e-3,
  ];
  for (const x of nearOne) {
    for (const sgn of [1, -1]) {
      const v = sgn * x;
      const actual = arcsinFloatStable(v);
      const bigRef = asinBigIntReference(v);
      const dist = ulpDistance(actual, bigRef);
      assert.ok(
        dist <= 1n,
        `Near-1 accuracy failure for x=${v}: actual=${actual}, bigRef=${bigRef}, ulp=${dist}`
      );
    }
  }
});

test('odd symmetry and strict monotonicity across [-1, 1]', () => {
  const N = 500;
  let prev = -Infinity;
  for (let i = -N; i <= N; i++) {
    const x = i / N;
    const y = arcsinFloatStable(x);
    assert.ok(y > prev, `Monotonicity violated at x=${x}: prev=${prev}, y=${y}`);
    prev = y;
    if (i > 0) {
      assert.equal(arcsinFloatStable(-x), -y, `Odd symmetry failed at x=${x}`);
    }
  }
});

test('independent cross-check 1: arbitrary-precision BigInt reference across all regimes', () => {
  const testPoints = [
    -0.9999999999999999,
    -0.999999999,
    -0.987654321,
    -0.75,
    -0.5000000000000001,
    -0.5,
    -0.49999999999999994,
    -0.25,
    -0.1234567890123456,
    -1e-5,
    1e-5,
    0.001,
    0.1234567890123456,
    0.3333333333333333,
    0.49999999999999994,
    0.5,
    0.5000000000000001,
    0.6180339887498949,
    0.85,
    0.999,
    0.9999999,
    0.999999999999,
    0.9999999999999999,
  ];
  for (const x of testPoints) {
    const actual = arcsinFloatStable(x);
    const bigRef = asinBigIntReference(x);
    const dist = ulpDistance(actual, bigRef);
    assert.ok(
      dist <= 1n,
      `BigInt cross-check failed for x=${x}: actual=${actual}, bigRef=${bigRef}, ulp=${dist}`
    );
  }
});

test('independent cross-check 2: sin(arcsin(x)) = x and complementarity identity', () => {
  for (let i = 1; i < 200; i++) {
    const x = -1 + (2 * i) / 200;
    const y = arcsinFloatStable(x);
    const roundTripErr = Math.abs(Math.sin(y) - x);
    assert.ok(
      roundTripErr <= 2 * Number.EPSILON,
      `sin(arcsin(${x})) error too large: ${roundTripErr}`
    );
  }

  // Complementarity on exact Pythagorean triples: arcsin(a/c) + arcsin(b/c) = pi/2
  const triples = [
    [3, 4, 5],
    [5, 12, 13],
    [8, 15, 17],
    [7, 24, 25],
    [20, 21, 29],
  ];
  for (const [a, b, c] of triples) {
    const sum = arcsinFloatStable(a / c) + arcsinFloatStable(b / c);
    assert.ok(
      Math.abs(sum - Math.PI / 2) <= 4 * Number.EPSILON,
      `Pythagorean complementarity failed for (${a},${b},${c}): sum=${sum}`
    );
  }

  // Complementarity on general x in (0, 1): rounding error in comp = sqrt(1 - x^2)
  // is amplified by the condition factor d(arcsin)/du = 1 / x.
  for (const x of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
    const comp = Math.sqrt((1 - x) * (1 + x));
    const sum = arcsinFloatStable(x) + arcsinFloatStable(comp);
    const tol = (2 / x + 4) * Number.EPSILON;
    assert.ok(
      Math.abs(sum - Math.PI / 2) <= tol,
      `Complementarity failed for x=${x}: sum=${sum}, err=${Math.abs(sum - Math.PI / 2)}, tol=${tol}`
    );
  }
});

test('cross-check 3: agreement within 1 ULP of Math.asin over broad sweep', () => {
  let maxUlp = 0n;
  for (let i = 0; i <= 1000; i++) {
    const x = -1 + (2 * i) / 1000;
    const actual = arcsinFloatStable(x);
    const expected = Math.asin(x);
    const dist = ulpDistance(actual, expected);
    if (dist > maxUlp) maxUlp = dist;
    assert.ok(
      dist <= 1n,
      `Sweep mismatch at x=${x}: actual=${actual}, expected=${expected}, ulp=${dist}`
    );
  }
  assert.ok(maxUlp <= 1n);
});
