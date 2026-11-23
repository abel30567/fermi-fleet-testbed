import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arctanDualRecursive } from './arctanDualRecursive.js';

/**
 * Helper to assert two numbers are within absolute or relative tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-14]
 * @param {string} [label]
 */
function assertClose(actual, expected, tol = 1e-14, label = '') {
  const scale = Math.max(1, Math.abs(expected));
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol * scale,
    `${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
  );
}

describe('arctanDualRecursive', () => {
  test('normal cases: special angles and exact derivatives', () => {
    const cases = [
      { v: Math.sqrt(3) / 3, d: 1, expectedV: Math.PI / 6, expectedD: 0.75 },
      { v: -Math.sqrt(3) / 3, d: 1, expectedV: -Math.PI / 6, expectedD: 0.75 },
      { v: Math.sqrt(3), d: 1, expectedV: Math.PI / 3, expectedD: 0.25 },
      { v: -Math.sqrt(3), d: 1, expectedV: -Math.PI / 3, expectedD: 0.25 },
      { v: 0.5, d: 3.5, expectedV: Math.atan(0.5), expectedD: 3.5 / 1.25 },
      { v: -0.25, d: -2.25, expectedV: Math.atan(-0.25), expectedD: -2.25 / 1.0625 },
      { v: 2, d: 5, expectedV: Math.atan(2), expectedD: 1 },
    ];

    for (const { v, d, expectedV, expectedD } of cases) {
      const res = arctanDualRecursive({ v, d });
      assertClose(res.v, expectedV, 1e-14, `v for (${v}, ${d})`);
      assertClose(res.d, expectedD, 1e-14, `d for (${v}, ${d})`);
    }
  });

  test('linearity in derivative component d and odd symmetry', () => {
    const base = arctanDualRecursive({ v: 0.7, d: 1 });
    const scaled = arctanDualRecursive({ v: 0.7, d: -4.2 });
    const zeroD = arctanDualRecursive({ v: 0.7, d: 0 });
    const negated = arctanDualRecursive({ v: -0.7, d: 1 });

    assertClose(scaled.v, base.v, 1e-15);
    assertClose(scaled.d, -4.2 * base.d, 1e-14);
    assert.equal(zeroD.d, 0);
    assertClose(negated.v, -base.v, 1e-15);
    assertClose(negated.d, base.d, 1e-15);
  });

  test('does not mutate input dual object', () => {
    const input = Object.freeze({ v: 0.75, d: 2.5 });
    const res = arctanDualRecursive(input);
    assert.notEqual(res, input);
    assertClose(res.v, Math.atan(0.75), 1e-14);
    assertClose(res.d, 2.5 / (1 + 0.75 * 0.75), 1e-14);
  });

  test('edge cases: zero, -0, and ±1', () => {
    const z0 = arctanDualRecursive({ v: 0, d: 1 });
    assert.equal(z0.v, 0);
    assert.equal(z0.d, 1);

    const zZeroD = arctanDualRecursive({ v: 0, d: 0 });
    assert.equal(zZeroD.v, 0);
    assert.equal(zZeroD.d, 0);

    const negZero = arctanDualRecursive({ v: -0, d: 2 });
    assert.ok(Object.is(negZero.v, -0));
    assert.equal(negZero.d, 2);

    const posOne = arctanDualRecursive({ v: 1, d: 1 });
    assertClose(posOne.v, Math.PI / 4, 1e-15, 'v at +1');
    assertClose(posOne.d, 0.5, 1e-15, 'd at +1');

    const negOne = arctanDualRecursive({ v: -1, d: 3 });
    assertClose(negOne.v, -Math.PI / 4, 1e-15, 'v at -1');
    assertClose(negOne.d, 1.5, 1e-15, 'd at -1');
  });

  test('edge cases: threshold and reciprocal boundaries, tiny and very large values', () => {
    const boundaryValues = [
      1 / 64,
      -(1 / 64),
      1 / 64 + 1e-9,
      1 / 64 - 1e-9,
      1 - 1e-12,
      1 + 1e-12,
      -1 + 1e-12,
      -1 - 1e-12,
      1e-12,
      -1e-12,
      1e-100,
      1e4,
      -1e4,
      1e8,
      -1e8,
      1e15,
      -1e15,
    ];

    for (const v of boundaryValues) {
      const res = arctanDualRecursive({ v, d: 1 });
      const expectedV = Math.atan(v);
      const expectedD = 1 / (1 + v * v);
      assertClose(res.v, expectedV, 1e-14, `v at ${v}`);
      assertClose(res.d, expectedD, 1e-14, `d at ${v}`);
    }

    // Extreme magnitudes that would overflow naive v * v
    const hugePos = arctanDualRecursive({ v: 1e200, d: 1e300 });
    assertClose(hugePos.v, Math.PI / 2, 1e-15, 'v at 1e200');
    assertClose(hugePos.d, 1e-100, 1e-14, 'd at (1e200, 1e300)');

    const hugeNeg = arctanDualRecursive({ v: -1e200, d: 1e300 });
    assertClose(hugeNeg.v, -Math.PI / 2, 1e-15, 'v at -1e200');
    assertClose(hugeNeg.d, 1e-100, 1e-14, 'd at (-1e200, 1e300)');

    const extremeUnderflow = arctanDualRecursive({ v: 1e200, d: 1 });
    assertClose(extremeUnderflow.v, Math.PI / 2, 1e-15);
    assert.equal(extremeUnderflow.d, 0);

    assert.equal(arctanDualRecursive({ v: 10, d: 0 }).d, 0);
    assert.equal(arctanDualRecursive({ v: -10, d: 0 }).d, 0);
  });

  test('input validation errors', () => {
    const typeErrorInputs = [
      null,
      undefined,
      0.5,
      '0.5',
      true,
      [1, 1],
      {},
      { v: 1 },
      { d: 1 },
      { v: '1', d: 1 },
      { v: 1, d: '1' },
      { v: 1, d: null },
      { v: undefined, d: 1 },
    ];

    for (const bad of typeErrorInputs) {
      assert.throws(() => arctanDualRecursive(bad), TypeError);
    }

    const rangeErrorInputs = [
      { v: Number.NaN, d: 1 },
      { v: 1, d: Number.NaN },
      { v: Number.POSITIVE_INFINITY, d: 1 },
      { v: Number.NEGATIVE_INFINITY, d: 1 },
      { v: 1, d: Number.POSITIVE_INFINITY },
      { v: 1, d: Number.NEGATIVE_INFINITY },
    ];

    for (const bad of rangeErrorInputs) {
      assert.throws(() => arctanDualRecursive(bad), RangeError);
    }
  });

  test('cross-check 1: dense sweep against Math.atan and exact derivative', () => {
    const xs = [
      -1e6, -1e3, -50, -5, -2.5, -1.0001, -0.9999, -0.6, -0.1, -0.005,
      0, 0.005, 0.1, 0.6, 0.9999, 1.0001, 2.5, 5, 50, 1e3, 1e6,
    ];
    for (const v of xs) {
      const d = 1.7320508075688772;
      const res = arctanDualRecursive({ v, d });
      assertClose(res.v, Math.atan(v), 1e-14, `Math.atan sweep v=${v}`);
      assertClose(res.d, d / (1 + v * v), 1e-14, `derivative sweep v=${v}`);
    }
  });

  test('cross-check 2: round-trip dual identity tan(arctan(x)) = x', () => {
    const dualTan = ({ v, d }) => {
      const c = Math.cos(v);
      return { v: Math.tan(v), d: d / (c * c) };
    };

    const samples = [
      { v: 0, d: 1 },
      { v: 0.01, d: -2.5 },
      { v: 0.42, d: 3.14 },
      { v: -0.95, d: 0.7 },
      { v: 1, d: -1 },
      { v: 3.7, d: 2.2 },
      { v: -12.5, d: 4.8 },
    ];

    for (const x of samples) {
      const y = arctanDualRecursive(x);
      const recovered = dualTan(y);
      assertClose(recovered.v, x.v, 1e-13, `tan(arctan(x)).v for v=${x.v}`);
      assertClose(recovered.d, x.d, 1e-12, `tan(arctan(x)).d for v=${x.v}`);
    }
  });

  test('cross-check 3: central finite-difference derivative and chain rule', () => {
    const h = 1e-6;
    const points = [-10, -1.5, -0.3, 0, 0.3, 1.5, 10];

    for (const v of points) {
      const d = 2.75;
      const { d: dualDeriv } = arctanDualRecursive({ v, d });
      const fPlus = arctanDualRecursive({ v: v + h, d: 0 }).v;
      const fMinus = arctanDualRecursive({ v: v - h, d: 0 }).v;
      const fdDeriv = d * (fPlus - fMinus) / (2 * h);
      assertClose(dualDeriv, fdDeriv, 1e-8, `finite diff at v=${v}`);
    }

    // Chain rule: d/dt arctan(g(t)) where g(t) = t^3 - 2t + 0.5
    const g = (t) => t * t * t - 2 * t + 0.5;
    const gPrime = (t) => 3 * t * t - 2;
    for (const t of [-1.2, 0.4, 1.8]) {
      const res = arctanDualRecursive({ v: g(t), d: gPrime(t) });
      const fd = (Math.atan(g(t + h)) - Math.atan(g(t - h))) / (2 * h);
      assertClose(res.v, Math.atan(g(t)), 1e-14, `chain rule v at t=${t}`);
      assertClose(res.d, fd, 1e-8, `chain rule d at t=${t}`);
    }
  });
});
