import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyRationalRecursive } from './multiplyRationalRecursive.js';

/**
 * Independent iterative GCD for test cross-checks.
 */
function iterativeGcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Independent naive rational product (multiply all numerators and denominators,
 * then reduce once at the end) used as an oracle for cross-checks.
 */
function naiveProduct(rationals) {
  let num = 1n;
  let den = 1n;
  for (const r of rationals) {
    num *= r.num;
    den *= r.den;
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = iterativeGcd(num, den);
  return { num: num / g, den: den / g };
}

describe('multiplyRationalRecursive', () => {
  describe('normal cases', () => {
    it('multiplies two simple coprime rationals', () => {
      const res = multiplyRationalRecursive({ num: 2n, den: 3n }, { num: 5n, den: 7n });
      assert.deepEqual(res, { num: 10n, den: 21n });
    });

    it('reduces product via cross-cancellation', () => {
      const res = multiplyRationalRecursive({ num: 6n, den: 35n }, { num: 14n, den: 9n });
      assert.deepEqual(res, { num: 4n, den: 15n });
    });

    it('reduces unnormalized inputs to lowest terms', () => {
      const res = multiplyRationalRecursive({ num: 12n, den: 18n }, { num: 15n, den: 25n });
      assert.deepEqual(res, { num: 2n, den: 5n });
    });

    it('supports variadic arguments (3+ rationals)', () => {
      const res = multiplyRationalRecursive(
        { num: 2n, den: 3n },
        { num: 9n, den: 4n },
        { num: 5n, den: 6n },
        { num: 8n, den: 15n },
      );
      assert.deepEqual(res, { num: 2n, den: 3n });
    });

    it('supports an array of rationals', () => {
      const res = multiplyRationalRecursive([
        { num: 3n, den: 4n },
        { num: 8n, den: 9n },
        { num: 15n, den: 2n },
      ]);
      assert.deepEqual(res, { num: 5n, den: 1n });
    });

    it('normalizes a single rational argument', () => {
      assert.deepEqual(multiplyRationalRecursive({ num: 14n, den: 21n }), { num: 2n, den: 3n });
      assert.deepEqual(multiplyRationalRecursive([{ num: -14n, den: -21n }]), { num: 2n, den: 3n });
    });

    it('returns multiplicative identity { num: 1n, den: 1n } for an empty array', () => {
      assert.deepEqual(multiplyRationalRecursive([]), { num: 1n, den: 1n });
    });
  });

  describe('edge cases', () => {
    it('returns { num: 0n, den: 1n } when any operand is zero', () => {
      assert.deepEqual(
        multiplyRationalRecursive({ num: 0n, den: 7n }, { num: 5n, den: 3n }),
        { num: 0n, den: 1n },
      );
      assert.deepEqual(
        multiplyRationalRecursive({ num: 5n, den: 3n }, { num: 0n, den: -9n }),
        { num: 0n, den: 1n },
      );
      assert.deepEqual(
        multiplyRationalRecursive([
          { num: 2n, den: 3n },
          { num: 4n, den: 5n },
          { num: 0n, den: 11n },
          { num: 7n, den: 13n },
        ]),
        { num: 0n, den: 1n },
      );
    });

    it('handles negative numerators and negative denominators with den > 0n', () => {
      assert.deepEqual(
        multiplyRationalRecursive({ num: -3n, den: 4n }, { num: 2n, den: 9n }),
        { num: -1n, den: 6n },
      );
      assert.deepEqual(
        multiplyRationalRecursive({ num: -3n, den: 4n }, { num: -2n, den: 9n }),
        { num: 1n, den: 6n },
      );
      assert.deepEqual(
        multiplyRationalRecursive({ num: 3n, den: -4n }, { num: 2n, den: 9n }),
        { num: -1n, den: 6n },
      );
      assert.deepEqual(
        multiplyRationalRecursive({ num: 3n, den: -4n }, { num: 2n, den: -9n }),
        { num: 1n, den: 6n },
      );
      assert.deepEqual(
        multiplyRationalRecursive({ num: -3n, den: -4n }, { num: -2n, den: -9n }),
        { num: 1n, den: 6n },
      );
    });

    it('handles very large BigInts accurately', () => {
      const p = 10n ** 100n + 267n;
      const q = 10n ** 100n + 949n;
      const k = 10n ** 80n + 13n;
      const a = { num: p * k, den: q };
      const b = { num: q * 3n, den: k * 7n };
      const res = multiplyRationalRecursive(a, b);
      assert.deepEqual(res, { num: p * 3n, den: 7n });
      assert.ok(res.den > 0n);
      assert.equal(iterativeGcd(res.num, res.den), 1n);
    });

    it('does not share mutable state across zero returns', () => {
      const z1 = multiplyRationalRecursive({ num: 0n, den: 1n }, { num: 2n, den: 3n });
      z1.num = 99n;
      const z2 = multiplyRationalRecursive({ num: 0n, den: 5n }, { num: 7n, den: 11n });
      assert.deepEqual(z2, { num: 0n, den: 1n });
    });

    it('throws RangeError on zero denominator, even when another operand is zero', () => {
      assert.throws(
        () => multiplyRationalRecursive({ num: 1n, den: 0n }, { num: 2n, den: 3n }),
        RangeError,
      );
      assert.throws(
        () => multiplyRationalRecursive({ num: 0n, den: 0n }, { num: 2n, den: 3n }),
        RangeError,
      );
      assert.throws(
        () => multiplyRationalRecursive({ num: 0n, den: 1n }, { num: 5n, den: 0n }),
        RangeError,
      );
    });

    it('throws TypeError on invalid inputs', () => {
      assert.throws(() => multiplyRationalRecursive(), TypeError);
      assert.throws(() => multiplyRationalRecursive(null, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => multiplyRationalRecursive(undefined, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => multiplyRationalRecursive({ num: 1, den: 2n }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => multiplyRationalRecursive({ num: 1n, den: 2 }, { num: 1n, den: 2n }), TypeError);
      assert.throws(() => multiplyRationalRecursive({ num: '1', den: '2' }), TypeError);
      assert.throws(() => multiplyRationalRecursive({}, { num: 1n, den: 2n }), TypeError);
      assert.throws(
        () => multiplyRationalRecursive([{ num: 1n, den: 2n }], { num: 3n, den: 4n }),
        TypeError,
      );
      assert.throws(
        () => multiplyRationalRecursive([{ num: 0n, den: 1n }, { num: 1, den: 2 }]),
        TypeError,
      );
    });
  });

  describe('algebraic properties and independent cross-checks', () => {
    it('satisfies commutativity: a * b === b * a', () => {
      const pairs = [
        [{ num: 17n, den: 24n }, { num: -36n, den: 85n }],
        [{ num: -1024n, den: -729n }, { num: 243n, den: -512n }],
        [{ num: 10n ** 30n, den: 3n ** 20n }, { num: 3n ** 15n, den: 2n ** 25n }],
      ];
      for (const [a, b] of pairs) {
        assert.deepEqual(multiplyRationalRecursive(a, b), multiplyRationalRecursive(b, a));
      }
    });

    it('satisfies associativity: (a * b) * c === a * (b * c) === multiply(a, b, c)', () => {
      const a = { num: -42n, den: 55n };
      const b = { num: 121n, den: -84n };
      const c = { num: 10n, den: 33n };

      const leftAssoc = multiplyRationalRecursive(multiplyRationalRecursive(a, b), c);
      const rightAssoc = multiplyRationalRecursive(a, multiplyRationalRecursive(b, c));
      const direct = multiplyRationalRecursive(a, b, c);
      const oracle = naiveProduct([a, b, c]);

      assert.deepEqual(leftAssoc, rightAssoc);
      assert.deepEqual(direct, leftAssoc);
      assert.deepEqual(direct, oracle);
    });

    it('evaluates telescoping product prod_{k=1}^{N} (k / (k + 1)) === 1 / (N + 1)', () => {
      const n = 200n;
      const factors = [];
      for (let k = 1n; k <= n; k += 1n) {
        factors.push({ num: k, den: k + 1n });
      }
      assert.deepEqual(multiplyRationalRecursive(factors), { num: 1n, den: n + 1n });
    });

    it('evaluates quadratic telescoping product prod_{k=2}^{N} ((k^2 - 1) / k^2) === (N + 1) / (2N)', () => {
      const n = 150n;
      const factors = [];
      for (let k = 2n; k <= n; k += 1n) {
        factors.push({ num: k * k - 1n, den: k * k });
      }
      const expected = naiveProduct([{ num: n + 1n, den: 2n * n }]);
      assert.deepEqual(multiplyRationalRecursive(factors), expected);
    });

    it('matches naive oracle across a larger mixed list of rationals', () => {
      const list = [];
      for (let i = 1n; i <= 35n; i += 1n) {
        const signNum = i % 3n === 0n ? -1n : 1n;
        const signDen = i % 5n === 0n ? -1n : 1n;
        list.push({
          num: signNum * (i * 6n + 3n),
          den: signDen * (i * 4n + 2n),
        });
      }
      const res = multiplyRationalRecursive(list);
      const expected = naiveProduct(list);
      assert.deepEqual(res, expected);
      assert.ok(res.den > 0n);
      assert.equal(iterativeGcd(res.num, res.den), 1n);
    });

    it('multiplies a rational with its reciprocal to yield { num: 1n, den: 1n }', () => {
      const r = { num: -(10n ** 40n + 7n), den: 10n ** 39n + 19n };
      const inv = { num: r.den, den: r.num };
      assert.deepEqual(multiplyRationalRecursive(r, inv), { num: 1n, den: 1n });
    });
  });
});
