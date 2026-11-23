import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationRationalRecursive } from './summationRationalRecursive.js';

/**
 * Independent helper to verify a rational is strictly normalized:
 * BigInt fields, den > 0n, and gcd(|num|, den) === 1n.
 */
function assertNormalized(r) {
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`);
  let x = r.num < 0n ? -r.num : r.num;
  let y = r.den;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  assert.equal(x, 1n, `Expected lowest terms, got gcd=${x} for ${r.num}/${r.den}`);
}

/**
 * Independent naive linear BigInt rational summation (common product denominator
 * then single reduction) used as a cross-check oracle.
 */
function naiveLinearSum(terms) {
  let num = 0n;
  let den = 1n;
  for (const t of terms) {
    let tn = t.num;
    let td = t.den;
    if (td < 0n) {
      tn = -tn;
      td = -td;
    }
    num = num * td + tn * den;
    den = den * td;
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let x = num < 0n ? -num : num;
  let y = den;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return { num: num / x, den: den / x };
}

describe('summationRationalRecursive', () => {
  describe('edge cases', () => {
    it('returns 0n/1n for an empty array', () => {
      const result = summationRationalRecursive([]);
      assert.deepEqual(result, { num: 0n, den: 1n });
      assertNormalized(result);
    });

    it('normalizes a single positive reduced element without aliasing input', () => {
      const input = { num: 3n, den: 7n };
      const result = summationRationalRecursive([input]);
      assert.deepEqual(result, { num: 3n, den: 7n });
      assert.notEqual(result, input);
      assertNormalized(result);
    });

    it('reduces a single unreduced element with negative denominator', () => {
      const result = summationRationalRecursive([{ num: 12n, den: -18n }]);
      assert.deepEqual(result, { num: -2n, den: 3n });
      assertNormalized(result);
    });

    it('normalizes both-negative single element to positive lowest terms', () => {
      const result = summationRationalRecursive([{ num: -15n, den: -25n }]);
      assert.deepEqual(result, { num: 3n, den: 5n });
      assertNormalized(result);
    });

    it('normalizes zero terms with positive or negative denominators to 0n/1n', () => {
      const result = summationRationalRecursive([
        { num: 0n, den: 7n },
        { num: 0n, den: -99n },
        { num: 0n, den: 1n },
      ]);
      assert.deepEqual(result, { num: 0n, den: 1n });
      assertNormalized(result);
    });

    it('handles complete cancellation to zero', () => {
      const result = summationRationalRecursive([
        { num: 1n, den: 3n },
        { num: 1n, den: 6n },
        { num: -1n, den: 2n },
      ]);
      assert.deepEqual(result, { num: 0n, den: 1n });
      assertNormalized(result);
    });
  });

  describe('normal cases', () => {
    it('sums two coprime-denominator fractions', () => {
      const result = summationRationalRecursive([
        { num: 1n, den: 2n },
        { num: 1n, den: 3n },
      ]);
      assert.deepEqual(result, { num: 5n, den: 6n });
      assertNormalized(result);
    });

    it('sums an odd number of terms reducing to an integer', () => {
      const result = summationRationalRecursive([
        { num: 1n, den: 2n },
        { num: 1n, den: 3n },
        { num: 1n, den: 6n },
      ]);
      assert.deepEqual(result, { num: 1n, den: 1n });
      assertNormalized(result);
    });

    it('sums mixed signs, shared factors, and negative denominators', () => {
      const result = summationRationalRecursive([
        { num: 5n, den: 12n },
        { num: 7n, den: -18n },
        { num: -11n, den: 24n },
        { num: 17n, den: 36n },
        { num: 0n, den: -5n },
      ]);
      // (30 - 28 - 33 + 34) / 72 = 3 / 72 = 1 / 24
      assert.deepEqual(result, { num: 1n, den: 24n });
      assertNormalized(result);
    });

    it('preserves exact precision for very large BigInt terms beyond Number.MAX_SAFE_INTEGER', () => {
      const big = 10n ** 40n;
      const result = summationRationalRecursive([
        { num: big + 1n, den: big },
        { num: big - 1n, den: big },
        { num: 1n, den: big * 3n },
      ]);
      // 2 + 1/(3*10^40) = (6*10^40 + 1) / (3*10^40)
      assert.deepEqual(result, { num: 6n * big + 1n, den: 3n * big });
      assertNormalized(result);
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches closed-form telescoping series sum_{k=1}^{n} 1/(k*(k+1)) = n/(n+1)', () => {
      for (const n of [1, 2, 7, 50, 250]) {
        const terms = [];
        for (let k = 1n; k <= BigInt(n); k++) {
          terms.push({ num: 1n, den: k * (k + 1n) });
        }
        const result = summationRationalRecursive(terms);
        assert.deepEqual(result, { num: BigInt(n), den: BigInt(n + 1) });
        assertNormalized(result);
      }
    });

    it('matches closed-form geometric series sum_{k=0}^{63} (1/2)^k = (2^64 - 1) / 2^63', () => {
      const terms = [];
      for (let k = 0n; k < 64n; k++) {
        terms.push({ num: 1n, den: 1n << k });
      }
      const result = summationRationalRecursive(terms);
      assert.deepEqual(result, { num: (1n << 64n) - 1n, den: 1n << 63n });
      assertNormalized(result);
    });

    it('matches exact known harmonic number H_20 and independent naive linear oracle', () => {
      const harmonicTerms = [];
      for (let k = 1n; k <= 20n; k++) {
        harmonicTerms.push({ num: 1n, den: k });
      }
      const result = summationRationalRecursive(harmonicTerms);
      // Exact H_20 = 55835135 / 15519504
      assert.deepEqual(result, { num: 55835135n, den: 15519504n });
      assert.deepEqual(result, naiveLinearSum(harmonicTerms));
      assertNormalized(result);
    });

    it('matches naive linear oracle across alternating unreduced terms and is order-invariant', () => {
      const terms = [];
      for (let k = 1n; k <= 35n; k++) {
        const sign = k % 2n === 0n ? -1n : 1n;
        const scale = (k % 5n) + 1n;
        const denSign = k % 3n === 0n ? -1n : 1n;
        terms.push({
          num: sign * (2n * k + 1n) * scale * denSign,
          den: (k * k + 1n) * scale * denSign,
        });
      }
      const forward = summationRationalRecursive(terms);
      const reversed = summationRationalRecursive([...terms].reverse());
      const oracle = naiveLinearSum(terms);

      assert.deepEqual(forward, oracle);
      assert.deepEqual(reversed, oracle);
      assertNormalized(forward);
    });
  });

  describe('invalid inputs', () => {
    it('throws TypeError when input is not an array', () => {
      for (const bad of [null, undefined, 0, '1/2', { num: 1n, den: 2n }, new Set()]) {
        assert.throws(() => summationRationalRecursive(bad), TypeError);
      }
    });

    it('throws TypeError for non-object or malformed elements', () => {
      const badArrays = [
        [null],
        [undefined],
        [42],
        ['1/2'],
        [[1n, 2n]],
        [{ num: 1n }],
        [{ den: 2n }],
        [{ num: 1, den: 2 }],
        [{ num: 1n, den: 2 }],
        [{ num: 1, den: 2n }],
        [{ num: 1n, den: 2n }, { num: NaN, den: 1n }],
      ];
      for (const bad of badArrays) {
        assert.throws(() => summationRationalRecursive(bad), TypeError);
      }
    });

    it('throws TypeError for sparse arrays with holes', () => {
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [{ num: 1n, den: 2n }, , { num: 1n, den: 3n }];
      assert.throws(() => summationRationalRecursive(sparse), TypeError);
    });

    it('throws RangeError when any element has denominator 0n', () => {
      assert.throws(
        () => summationRationalRecursive([{ num: 1n, den: 0n }]),
        RangeError
      );
      assert.throws(
        () => summationRationalRecursive([{ num: 0n, den: 0n }]),
        RangeError
      );
      assert.throws(
        () =>
          summationRationalRecursive([
            { num: 1n, den: 2n },
            { num: -5n, den: 0n },
            { num: 1n, den: 3n },
          ]),
        RangeError
      );
    });
  });
});
