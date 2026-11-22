import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnDualIterative } from './lnDualIterative.js';

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
  if (expected === 0) {
    assert.ok(
      Math.abs(actual) <= absTol,
      `${label}: expected ~0, got ${actual} (absTol=${absTol})`,
    );
    return;
  }
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(actual), Math.abs(expected));
  assert.ok(
    diff <= Math.max(absTol, relTol * scale),
    `${label}: expected ${expected}, got ${actual} (diff=${diff}, rel=${diff / scale})`,
  );
}

describe('lnDualIterative', () => {
  describe('normal cases', () => {
    it('evaluates ln at v = 1 with various derivatives', () => {
      assert.deepStrictEqual(lnDualIterative({ v: 1, d: 0 }), { v: 0, d: 0 });
      assert.deepStrictEqual(lnDualIterative({ v: 1, d: 1 }), { v: 0, d: 1 });
      assert.deepStrictEqual(lnDualIterative({ v: 1, d: -3.5 }), { v: 0, d: -3.5 });
      assert.deepStrictEqual(lnDualIterative({ v: 1, d: -0 }), { v: 0, d: 0 });
    });

    it('evaluates ln at canonical values (e, powers of 2, 10, fractions)', () => {
      const cases = [
        { v: Math.E, d: 1 },
        { v: Math.E, d: Math.E },
        { v: Math.E ** 3, d: -2 },
        { v: 2, d: 1 },
        { v: 0.5, d: 4 },
        { v: 10, d: 2.5 },
        { v: 0.1, d: -0.3 },
        { v: 2 ** 20, d: 7 },
        { v: 2 ** -20, d: -7 },
      ];

      for (const c of cases) {
        const res = lnDualIterative(c);
        assertClose(res.v, Math.log(c.v), 1e-14, 1e-15, `v for (${c.v}, ${c.d})`);
        assertClose(res.d, c.d / c.v, 1e-14, 1e-15, `d for (${c.v}, ${c.d})`);
      }
    });

    it('does not mutate the input object', () => {
      const input = Object.freeze({ v: 3.25, d: -1.75 });
      const res = lnDualIterative(input);
      assert.strictEqual(input.v, 3.25);
      assert.strictEqual(input.d, -1.75);
      assertClose(res.v, Math.log(3.25), 1e-14);
      assertClose(res.d, -1.75 / 3.25, 1e-14);
    });
  });

  describe('edge cases and extreme magnitudes', () => {
    it('maintains accuracy very close to v = 1', () => {
      const nearOne = [
        1 + 1e-15,
        1 - 1e-15,
        1 + Number.EPSILON,
        1 - Number.EPSILON / 2,
        1 + 1e-8,
        1 - 1e-8,
      ];

      for (const v of nearOne) {
        const d = 1.25;
        const res = lnDualIterative({ v, d });
        assertClose(res.v, Math.log(v), 1e-14, 1e-16, `near-one v=${v}`);
        assertClose(res.d, d / v, 1e-14, 1e-16, `near-one d at v=${v}`);
      }
    });

    it('handles range-reduction boundaries around sqrt(0.5) and sqrt(2)', () => {
      const boundaries = [
        Math.SQRT1_2,
        Math.SQRT1_2 * (1 - 1e-12),
        Math.SQRT1_2 * (1 + 1e-12),
        Math.SQRT2,
        Math.SQRT2 * (1 - 1e-12),
        Math.SQRT2 * (1 + 1e-12),
      ];

      for (const v of boundaries) {
        const res = lnDualIterative({ v, d: -2.5 });
        assertClose(res.v, Math.log(v), 1e-14, 1e-15, `boundary v=${v}`);
        assertClose(res.d, -2.5 / v, 1e-14, 1e-15, `boundary d at v=${v}`);
      }
    });

    it('handles very large, very small, and subnormal inputs', () => {
      const extremes = [
        { v: 1e100, d: 1e100 },
        { v: 1e300, d: -5e299 },
        { v: Number.MAX_VALUE, d: Number.MAX_VALUE },
        { v: 1e-100, d: 1e-100 },
        { v: 1e-300, d: -3e-300 },
        { v: 1e-320, d: 1e-320 },
        { v: Number.MIN_VALUE, d: Number.MIN_VALUE },
        { v: 1.4, d: 1e308 }, // would overflow naive 2 * d
        { v: 0.75, d: 1e308 },
      ];

      for (const c of extremes) {
        const res = lnDualIterative(c);
        assertClose(res.v, Math.log(c.v), 1e-14, 1e-15, `extreme v=${c.v}`);
        assertClose(res.d, c.d / c.v, 1e-14, 1e-15, `extreme d=(${c.v}, ${c.d})`);
      }
    });

    it('handles IEEE-754 derivative overflow and underflow cleanly without NaN', () => {
      const overflowRes = lnDualIterative({ v: 1e-300, d: 1e100 });
      assertClose(overflowRes.v, Math.log(1e-300), 1e-14);
      assert.strictEqual(overflowRes.d, Infinity);

      const negOverflowRes = lnDualIterative({ v: 1e-300, d: -1e100 });
      assertClose(negOverflowRes.v, Math.log(1e-300), 1e-14);
      assert.strictEqual(negOverflowRes.d, -Infinity);

      const underflowRes = lnDualIterative({ v: 1e300, d: 1e-300 });
      assertClose(underflowRes.v, Math.log(1e300), 1e-14);
      assert.strictEqual(underflowRes.d, 0);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-object or malformed inputs', () => {
      const invalidTypes = [
        null,
        undefined,
        42,
        '1',
        true,
        [1, 1],
        {},
        { v: 1 },
        { d: 1 },
        { v: '1', d: 1 },
        { v: 1, d: '0' },
        { v: 1n, d: 0 },
      ];

      for (const bad of invalidTypes) {
        assert.throws(() => lnDualIterative(bad), TypeError);
      }
    });

    it('throws RangeError for non-finite/NaN components', () => {
      const nonFinite = [
        { v: Number.NaN, d: 1 },
        { v: 1, d: Number.NaN },
        { v: Number.POSITIVE_INFINITY, d: 1 },
        { v: Number.NEGATIVE_INFINITY, d: 1 },
        { v: 1, d: Number.POSITIVE_INFINITY },
        { v: 1, d: Number.NEGATIVE_INFINITY },
      ];

      for (const bad of nonFinite) {
        assert.throws(() => lnDualIterative(bad), RangeError);
      }
    });

    it('throws RangeError for domain violations v <= 0', () => {
      const nonPositive = [
        { v: 0, d: 1 },
        { v: -0, d: 1 },
        { v: -1, d: 1 },
        { v: -1e-300, d: 0 },
        { v: -Number.MIN_VALUE, d: 2 },
      ];

      for (const bad of nonPositive) {
        assert.throws(() => lnDualIterative(bad), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    it('matches Math.log(v) and analytic d / v across a wide logarithmic sweep', () => {
      for (let exp = -30; exp <= 30; exp += 1) {
        for (const mantissa of [0.73, 1.0, 1.37, 2.718281828459045, 3.141592653589793]) {
          const v = mantissa * 10 ** exp;
          const d = (exp % 2 === 0 ? 1 : -1) * (0.5 + mantissa);
          const res = lnDualIterative({ v, d });
          assertClose(res.v, Math.log(v), 1e-14, 1e-15, `sweep v=${v}`);
          assertClose(res.d, d / v, 1e-14, 1e-15, `sweep d at v=${v}`);
        }
      }
    });

    it('agrees with central finite differences for composite functions ln(g(t))', () => {
      const h = 1e-6;
      const functions = [
        {
          name: 'g(t) = t^2 + 1',
          g: (t) => t * t + 1,
          gp: (t) => 2 * t,
          points: [-3, -0.5, 0, 0.7, 2.5],
        },
        {
          name: 'g(t) = exp(t) + 2',
          g: (t) => Math.exp(t) + 2,
          gp: (t) => Math.exp(t),
          points: [-2, -0.3, 0, 1.2, 3],
        },
        {
          name: 'g(t) = 3*t + 0.5',
          g: (t) => 3 * t + 0.5,
          gp: () => 3,
          points: [0.05, 0.5, 2, 10],
        },
      ];

      for (const { name, g, gp, points } of functions) {
        for (const t of points) {
          const dual = lnDualIterative({ v: g(t), d: gp(t) });
          const fd = (Math.log(g(t + h)) - Math.log(g(t - h))) / (2 * h);
          assertClose(dual.d, fd, 1e-8, 1e-9, `central FD for ${name} at t=${t}`);
        }
      }
    });

    it('satisfies dual logarithmic identities ln(a*b) = ln(a) + ln(b) and ln(a/b) = ln(a) - ln(b)', () => {
      const a = { v: 2.3, d: 1.7 };
      const b = { v: 5.9, d: -0.8 };

      const prod = { v: a.v * b.v, d: a.v * b.d + a.d * b.v };
      const quot = { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) };

      const lnA = lnDualIterative(a);
      const lnB = lnDualIterative(b);
      const lnProd = lnDualIterative(prod);
      const lnQuot = lnDualIterative(quot);

      assertClose(lnProd.v, lnA.v + lnB.v, 1e-14, 1e-15, 'ln(a*b).v');
      assertClose(lnProd.d, lnA.d + lnB.d, 1e-14, 1e-15, 'ln(a*b).d');
      assertClose(lnQuot.v, lnA.v - lnB.v, 1e-14, 1e-15, 'ln(a/b).v');
      assertClose(lnQuot.d, lnA.d - lnB.d, 1e-14, 1e-15, 'ln(a/b).d');
    });
  });
});
