import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideRationalRecursive } from './divideRationalRecursive.js';

/**
 * Independent reference helpers using iterative GCD and direct cross-multiplication
 * for cross-checking `divideRationalRecursive`.
 */
function gcdIter(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function normalizeRef(r) {
  if (r.num === 0n) return { num: 0n, den: 1n };
  const sign = r.den < 0n ? -1n : 1n;
  const n = r.num * sign;
  const d = r.den * sign;
  const g = gcdIter(n, d);
  return { num: n / g, den: d / g };
}

function mulRef(a, b) {
  return normalizeRef({ num: a.num * b.num, den: a.den * b.den });
}

function divDirectRef(a, b) {
  return normalizeRef({ num: a.num * b.den, den: a.den * b.num });
}

describe('divideRationalRecursive', () => {
  describe('basic two-argument division', () => {
    it('divides simple positive rationals and reduces to lowest terms', () => {
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 3n, den: 4n }, { num: 9n, den: 8n }),
        { num: 2n, den: 3n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 6n, den: 10n }, { num: 3n, den: 5n }),
        { num: 1n, den: 1n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 7n, den: 1n }, { num: 2n, den: 1n }),
        { num: 7n, den: 2n },
      );
    });

    it('handles negative numerators and negative denominators with den > 0n', () => {
      assert.deepStrictEqual(
        divideRationalRecursive({ num: -3n, den: 4n }, { num: 9n, den: 8n }),
        { num: -2n, den: 3n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 3n, den: -4n }, { num: 9n, den: 8n }),
        { num: -2n, den: 3n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 3n, den: 4n }, { num: -9n, den: 8n }),
        { num: -2n, den: 3n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 3n, den: -4n }, { num: 9n, den: -8n }),
        { num: 2n, den: 3n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: -6n, den: -10n }, { num: -3n, den: -5n }),
        { num: 1n, den: 1n },
      );
    });

    it('normalizes zero dividend to { num: 0n, den: 1n }', () => {
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 0n, den: 5n }, { num: 3n, den: 7n }),
        { num: 0n, den: 1n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 0n, den: -99n }, { num: -4n, den: -3n }),
        { num: 0n, den: 1n },
      );
    });
  });

  describe('chained division (variadic and array forms)', () => {
    it('supports variadic chained division a / b1 / b2 / ...', () => {
      // (12/5) / (3/2) / (4/7) / (-1/5) = (12/5) / ((3/2)*(4/7)*(-1/5))
      // = (12/5) / (-6/35) = -14/1
      assert.deepStrictEqual(
        divideRationalRecursive(
          { num: 12n, den: 5n },
          { num: 3n, den: 2n },
          { num: 4n, den: 7n },
          { num: -1n, den: 5n },
        ),
        { num: -14n, den: 1n },
      );
    });

    it('supports single array argument [a, b1, b2, ...]', () => {
      const chain = [
        { num: 100n, den: 3n },
        { num: 5n, den: 6n },
        { num: 4n, den: 9n },
        { num: 10n, den: 1n },
        { num: 3n, den: 2n },
      ];
      // 100/3 / (5/6 * 4/9 * 10/1 * 3/2) = (100/3) / (50/9) = 6/1
      assert.deepStrictEqual(divideRationalRecursive(chain), { num: 6n, den: 1n });
    });

    it('supports (dividend, divisorsArray) form', () => {
      assert.deepStrictEqual(
        divideRationalRecursive(
          { num: 100n, den: 3n },
          [
            { num: 5n, den: 6n },
            { num: 4n, den: 9n },
            { num: 10n, den: 1n },
            { num: 3n, den: 2n },
          ],
        ),
        { num: 6n, den: 1n },
      );
    });

    it('returns normalized dividend for single-element array or empty divisor array', () => {
      assert.deepStrictEqual(
        divideRationalRecursive([{ num: -12n, den: -18n }]),
        { num: 2n, den: 3n },
      );
      assert.deepStrictEqual(
        divideRationalRecursive({ num: 0n, den: -7n }, []),
        { num: 0n, den: 1n },
      );
    });

    it('matches sequential division for a long chain of 17 divisors', () => {
      const dividend = { num: 3628800n, den: 13n };
      const divisors = [];
      for (let i = 1n; i <= 17n; i++) {
        divisors.push({ num: (i % 2n === 0n ? -i : i), den: i + 1n });
      }
      const chained = divideRationalRecursive(dividend, ...divisors);
      const fromArray = divideRationalRecursive([dividend, ...divisors]);
      const fromDivisorArray = divideRationalRecursive(dividend, divisors);

      let expected = normalizeRef(dividend);
      for (const d of divisors) {
        expected = divDirectRef(expected, d);
      }

      assert.deepStrictEqual(chained, expected);
      assert.deepStrictEqual(fromArray, expected);
      assert.deepStrictEqual(fromDivisorArray, expected);
    });
  });

  describe('huge BigInts', () => {
    it('divides exact rationals with very large BigInt components accurately', () => {
      const p = 10n ** 120n + 39n;
      const q = 10n ** 110n + 7n;
      const k = 10n ** 95n + 19n;

      const a = { num: p * k, den: q * k };
      const b = { num: p, den: q * 3n };
      const res = divideRationalRecursive(a, b);
      assert.deepStrictEqual(res, { num: 3n, den: 1n });
    });

    it('handles huge coprime BigInts and satisfies cross-multiplication', () => {
      const a = { num: -(2n ** 300n + 1n), den: 3n ** 190n };
      const b = { num: 5n ** 120n, den: -(7n ** 90n) };
      const res = divideRationalRecursive(a, b);

      assert.ok(res.den > 0n);
      assert.strictEqual(gcdIter(res.num, res.den), 1n);
      assert.deepStrictEqual(res, divDirectRef(a, b));
      assert.deepStrictEqual(mulRef(res, b), normalizeRef(a));
    });
  });

  describe('algebraic cross-checks', () => {
    it('satisfies multiplicative inverse (a / b) * b === a and matches direct cross-multiplication', () => {
      const samples = [
        { num: 0n, den: 7n },
        { num: 1n, den: 1n },
        { num: -1n, den: 1n },
        { num: 22n, den: 7n },
        { num: -355n, den: 113n },
        { num: 48n, den: -64n },
        { num: -120n, den: -45n },
        { num: 10n ** 30n + 13n, den: 10n ** 25n + 9n },
      ];

      for (const a of samples) {
        const normA = normalizeRef(a);
        for (const b of samples) {
          if (b.num === 0n) continue;
          const q = divideRationalRecursive(a, b);
          assert.ok(q.den > 0n, 'denominator must be positive');
          assert.strictEqual(gcdIter(q.num, q.den), 1n, 'result must be in lowest terms');
          assert.deepStrictEqual(q, divDirectRef(a, b), 'must match direct cross-multiplication');
          assert.deepStrictEqual(mulRef(q, b), normA, 'must satisfy (a / b) * b === a');
        }
      }
    });
  });

  describe('error handling and input validation', () => {
    it('throws RangeError on division by zero', () => {
      assert.throws(
        () => divideRationalRecursive({ num: 1n, den: 2n }, { num: 0n, den: 3n }),
        RangeError,
      );
      assert.throws(
        () => divideRationalRecursive({ num: 0n, den: 1n }, { num: 0n, den: 5n }),
        RangeError,
      );
      assert.throws(
        () => divideRationalRecursive(
          { num: 0n, den: 1n },
          { num: 2n, den: 3n },
          { num: 0n, den: -7n },
        ),
        RangeError,
      );
      assert.throws(
        () => divideRationalRecursive([{ num: 5n, den: 2n }, { num: 1n, den: 3n }, { num: 0n, den: 1n }]),
        RangeError,
      );
    });

    it('throws RangeError on zero denominator in dividend or any divisor', () => {
      assert.throws(
        () => divideRationalRecursive({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
        RangeError,
      );
      assert.throws(
        () => divideRationalRecursive({ num: 0n, den: 0n }, { num: 1n, den: 2n }),
        RangeError,
      );
      assert.throws(
        () => divideRationalRecursive({ num: 0n, den: 1n }, { num: 1n, den: 0n }),
        RangeError,
      );
      assert.throws(
        () => divideRationalRecursive(
          { num: 0n, den: 1n },
          { num: 2n, den: 3n },
          { num: 5n, den: 0n },
        ),
        RangeError,
      );
    });

    it('throws RangeError on empty array input', () => {
      assert.throws(() => divideRationalRecursive([]), RangeError);
    });

    it('throws TypeError on missing or invalid types', () => {
      assert.throws(() => divideRationalRecursive(), TypeError);
      assert.throws(() => divideRationalRecursive({ num: 1n, den: 2n }), TypeError);
      assert.throws(() => divideRationalRecursive(null, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => divideRationalRecursive({ num: 1n, den: 2n }, null), TypeError);
      assert.throws(() => divideRationalRecursive({ num: 1, den: 2n }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => divideRationalRecursive({ num: 1n, den: 2 }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => divideRationalRecursive({ num: '1', den: '2' }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => divideRationalRecursive({ num: 1n, den: 2n }, { num: 1n }), TypeError);
      assert.throws(() => divideRationalRecursive(42n, 2n), TypeError);
      assert.throws(
        () => divideRationalRecursive({ num: 0n, den: 1n }, { num: 1n, den: 2n }, 'bad'),
        TypeError,
      );
      assert.throws(
        () => divideRationalRecursive([{ num: 1n, den: 2n }, { num: 3, den: 4n }]),
        TypeError,
      );
    });
  });
});
