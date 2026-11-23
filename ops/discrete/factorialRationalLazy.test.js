import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialRationalLazy } from './factorialRationalLazy.js';

describe('factorialRationalLazy', () => {
  describe('single rational inputs', () => {
    it('computes 0! and 1! as exact rationals in lowest terms', () => {
      assert.deepEqual(factorialRationalLazy({ num: 0n, den: 1n }), { num: 1n, den: 1n });
      assert.deepEqual(factorialRationalLazy({ num: 1n, den: 1n }), { num: 1n, den: 1n });
    });

    it('computes small factorials 2! through 10! accurately', () => {
      const expected = [
        [2n, 2n],
        [3n, 6n],
        [4n, 24n],
        [5n, 120n],
        [6n, 720n],
        [7n, 5040n],
        [8n, 40320n],
        [9n, 362880n],
        [10n, 3628800n],
      ];
      for (const [n, fact] of expected) {
        assert.deepEqual(factorialRationalLazy({ num: n, den: 1n }), {
          num: fact,
          den: 1n,
        });
      }
    });

    it('reduces unreduced and negative-denominator integer rationals before computing', () => {
      assert.deepEqual(factorialRationalLazy({ num: 0n, den: 9n }), { num: 1n, den: 1n });
      assert.deepEqual(factorialRationalLazy({ num: 0n, den: -7n }), { num: 1n, den: 1n });
      assert.deepEqual(factorialRationalLazy({ num: 10n, den: 2n }), { num: 120n, den: 1n });
      assert.deepEqual(factorialRationalLazy({ num: -12n, den: -3n }), { num: 24n, den: 1n });
      assert.deepEqual(factorialRationalLazy({ num: 21n, den: 3n }), { num: 5040n, den: 1n });
    });

    it('computes large factorials beyond Number.MAX_SAFE_INTEGER with full BigInt precision', () => {
      assert.deepEqual(factorialRationalLazy({ num: 20n, den: 1n }), {
        num: 2432902008176640000n,
        den: 1n,
      });
      assert.deepEqual(factorialRationalLazy({ num: 25n, den: 1n }), {
        num: 15511210043330985984000000n,
        den: 1n,
      });
      const fact50 = factorialRationalLazy({ num: 50n, den: 1n });
      assert.equal(fact50.den, 1n);
      assert.equal(
        fact50.num,
        30414093201713378043612608166064768844377641568960512000000000000n
      );
    });
  });

  describe('lazy iterable / streaming inputs', () => {
    it('handles an empty iterable', () => {
      const gen = factorialRationalLazy([]);
      assert.deepEqual([...gen], []);
    });

    it('streams factorials for both monotonic and non-monotonic sequences', () => {
      const inputs = [
        { num: 5n, den: 1n },
        { num: 2n, den: 1n },
        { num: 6n, den: 1n },
        { num: 0n, den: 5n },
        { num: -12n, den: -2n },
        { num: 3n, den: 1n },
      ];
      const results = [...factorialRationalLazy(inputs)];
      assert.deepEqual(results, [
        { num: 120n, den: 1n },
        { num: 2n, den: 1n },
        { num: 720n, den: 1n },
        { num: 1n, den: 1n },
        { num: 720n, den: 1n },
        { num: 6n, den: 1n },
      ]);
    });

    it('consumes infinite generators lazily one element at a time and closes cleanly on early stop', () => {
      let pulled = 0;
      let closed = false;

      function* naturals() {
        try {
          for (let n = 0n; ; n += 1n) {
            pulled += 1;
            yield { num: n, den: 1n };
          }
        } finally {
          closed = true;
        }
      }

      const stream = factorialRationalLazy(naturals());
      // Constructing the lazy generator must not consume any elements yet.
      assert.equal(pulled, 0);

      const taken = [];
      for (const value of stream) {
        taken.push(value);
        assert.equal(pulled, taken.length);
        if (taken.length === 6) {
          break;
        }
      }

      assert.equal(pulled, 6);
      assert.equal(closed, true);
      assert.deepEqual(taken, [
        { num: 1n, den: 1n },
        { num: 1n, den: 1n },
        { num: 2n, den: 1n },
        { num: 6n, den: 1n },
        { num: 24n, den: 1n },
        { num: 120n, den: 1n },
      ]);
    });

    it('does not touch invalid later items when consumer stops early', () => {
      function* sourceWithLateError() {
        yield { num: 3n, den: 1n };
        yield { num: 4n, den: 1n };
        yield { num: -1n, den: 1n }; // invalid if pulled
      }

      const gen = factorialRationalLazy(sourceWithLateError());
      assert.deepEqual(gen.next(), { value: { num: 6n, den: 1n }, done: false });
      assert.deepEqual(gen.next(), { value: { num: 24n, den: 1n }, done: false });
      assert.throws(() => gen.next(), RangeError);
    });

    it('isolates internal streaming state if caller mutates yielded objects', () => {
      const gen = factorialRationalLazy([
        { num: 3n, den: 1n },
        { num: 4n, den: 1n },
        { num: 4n, den: 1n },
      ]);
      const first = gen.next().value;
      assert.deepEqual(first, { num: 6n, den: 1n });
      first.num = 999999n;
      first.den = 7n;

      const second = gen.next().value;
      assert.deepEqual(second, { num: 24n, den: 1n });
      second.num = 0n;

      const third = gen.next().value;
      assert.deepEqual(third, { num: 24n, den: 1n });
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-rational primitives and malformed objects', () => {
      const badTypes = [
        undefined,
        null,
        5,
        5n,
        '5',
        new String('5'),
        true,
        {},
        { num: 5n },
        { den: 1n },
        { num: 5, den: 1n },
        { num: 5n, den: 1 },
        { num: '5', den: '1' },
      ];
      for (const bad of badTypes) {
        assert.throws(() => factorialRationalLazy(bad), TypeError);
      }
    });

    it('throws RangeError for zero denominators, negative integers, and non-integer rationals', () => {
      const badRanges = [
        { num: 1n, den: 0n },
        { num: 0n, den: 0n },
        { num: -1n, den: 1n },
        { num: 4n, den: -2n },
        { num: -10n, den: 2n },
        { num: 1n, den: 2n },
        { num: 7n, den: 3n },
        { num: -3n, den: 2n },
      ];
      for (const bad of badRanges) {
        assert.throws(() => factorialRationalLazy(bad), RangeError);
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('satisfies the recurrence (n+1)! / n! = n + 1 across a streamed range', () => {
      function* range(limit) {
        for (let i = 0n; i <= limit; i += 1n) {
          yield { num: i, den: 1n };
        }
      }

      const stream = factorialRationalLazy(range(40n));
      let prev = stream.next().value;
      assert.deepEqual(prev, { num: 1n, den: 1n });

      for (let n = 1n; n <= 40n; n += 1n) {
        const curr = stream.next().value;
        assert.equal(curr.den, 1n);
        assert.equal(curr.num % prev.num, 0n);
        assert.equal(curr.num / prev.num, n);
        prev = curr;
      }
      assert.equal(stream.next().done, true);
    });

    it('satisfies the binomial sum identity sum_{k=0}^n n! / (k!(n-k)!) = 2^n', () => {
      for (let n = 0n; n <= 20n; n += 1n) {
        const nFact = factorialRationalLazy({ num: n, den: 1n });
        assert.equal(nFact.den, 1n);
        let sum = 0n;
        for (let k = 0n; k <= n; k += 1n) {
          const kFact = factorialRationalLazy({ num: k, den: 1n }).num;
          const nkFact = factorialRationalLazy({ num: n - k, den: 1n }).num;
          const denom = kFact * nkFact;
          assert.equal(nFact.num % denom, 0n);
          sum += nFact.num / denom;
        }
        assert.equal(sum, 1n << n);
      }
    });

    it("matches Legendre's formula for p-adic valuation v_p(n!) at n = 100", () => {
      const n = 100n;
      const { num: fact100, den } = factorialRationalLazy({ num: n, den: 1n });
      assert.equal(den, 1n);

      const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n];
      for (const p of primes) {
        // Independent computation via Legendre's formula: sum_{j>=1} floor(n / p^j)
        let legendre = 0n;
        let power = p;
        while (power <= n) {
          legendre += n / power;
          power *= p;
        }

        // Exact valuation extracted from fact100
        let actual = 0n;
        let rem = fact100;
        while (rem % p === 0n) {
          rem /= p;
          actual += 1n;
        }

        assert.equal(actual, legendre, `p-adic valuation mismatch for p=${p}`);
      }
    });

    it("satisfies Wilson's theorem for primes and composites", () => {
      const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n];
      for (const p of primes) {
        const { num, den } = factorialRationalLazy({ num: p - 1n, den: 1n });
        assert.equal(den, 1n);
        assert.equal(num % p, p - 1n);
      }

      const composites = [6n, 8n, 9n, 10n, 12n, 15n, 21n];
      for (const m of composites) {
        const { num, den } = factorialRationalLazy({ num: m - 1n, den: 1n });
        assert.equal(den, 1n);
        assert.equal(num % m, 0n);
      }
    });
  });
});
