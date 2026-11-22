import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialRationalIterative } from './factorialRationalIterative.js';

describe('factorialRationalIterative', () => {
  it('computes base and standard factorials accurately', () => {
    assert.deepEqual(factorialRationalIterative({ num: 0n, den: 1n }), { num: 1n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 1n, den: 1n }), { num: 1n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 2n, den: 1n }), { num: 2n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 3n, den: 1n }), { num: 6n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 5n, den: 1n }), { num: 120n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 10n, den: 1n }), { num: 3628800n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 20n, den: 1n }), {
      num: 2432902008176640000n,
      den: 1n,
    });
    assert.deepEqual(factorialRationalIterative({ num: 25n, den: 1n }), {
      num: 15511210043330985984000000n,
      den: 1n,
    });
  });

  it('handles unreduced integer rationals including double-negative and zero forms', () => {
    assert.deepEqual(factorialRationalIterative({ num: 10n, den: 2n }), { num: 120n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 6n, den: 2n }), { num: 6n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: -6n, den: -2n }), { num: 6n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: -10n, den: -2n }), { num: 120n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 0n, den: 5n }), { num: 1n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: 0n, den: -7n }), { num: 1n, den: 1n });
    assert.deepEqual(factorialRationalIterative({ num: -42n, den: -42n }), { num: 1n, den: 1n });

    const scale = 10n ** 30n;
    assert.deepEqual(factorialRationalIterative({ num: 7n * scale, den: scale }), {
      num: 5040n,
      den: 1n,
    });
  });

  it('does not mutate the input object', () => {
    const input = { num: -12n, den: -3n };
    const result = factorialRationalIterative(input);
    assert.deepEqual(result, { num: 24n, den: 1n });
    assert.deepEqual(input, { num: -12n, den: -3n });
  });

  it('throws TypeError for non-object or malformed rational inputs', () => {
    const badTypeInputs = [
      null,
      undefined,
      5,
      5n,
      '5',
      true,
      [5n, 1n],
      {},
      { num: 5n },
      { den: 1n },
      { num: 5, den: 1n },
      { num: 5n, den: 1 },
      { num: '5', den: '1' },
      { num: 5n, den: null },
    ];

    for (const bad of badTypeInputs) {
      assert.throws(() => factorialRationalIterative(bad), TypeError);
    }
  });

  it('throws RangeError for zero denominator, non-integer rationals, and negative integers', () => {
    const badRangeInputs = [
      // Zero denominator
      { num: 5n, den: 0n },
      { num: 0n, den: 0n },
      { num: -3n, den: 0n },
      // Non-integer rationals
      { num: 3n, den: 2n },
      { num: 1n, den: 2n },
      { num: 7n, den: 3n },
      { num: -3n, den: 2n },
      { num: -7n, den: -4n },
      { num: 5n, den: -2n },
      // Negative integers (reduced and unreduced)
      { num: -1n, den: 1n },
      { num: -5n, den: 1n },
      { num: 6n, den: -2n },
      { num: -10n, den: 2n },
    ];

    for (const bad of badRangeInputs) {
      assert.throws(() => factorialRationalIterative(bad), RangeError);
    }
  });

  it('satisfies the recurrence n! === n * (n - 1)! for n = 1..40', () => {
    let prev = factorialRationalIterative({ num: 0n, den: 1n });
    assert.deepEqual(prev, { num: 1n, den: 1n });

    for (let k = 1n; k <= 40n; k += 1n) {
      // Alternate between reduced and unreduced/double-negative representations
      const input =
        k % 3n === 0n
          ? { num: -k * 5n, den: -5n }
          : k % 3n === 1n
            ? { num: k * 3n, den: 3n }
            : { num: k, den: 1n };

      const curr = factorialRationalIterative(input);
      assert.equal(curr.den, 1n);
      assert.equal(curr.num, k * prev.num);
      prev = curr;
    }
  });

  it('matches an independent product computation for n = 0..35', () => {
    const independentProduct = (n) =>
      Array.from({ length: n }, (_, idx) => BigInt(idx + 1)).reduce(
        (acc, val) => acc * val,
        1n
      );

    for (let n = 0; n <= 35; n += 1) {
      const actual = factorialRationalIterative({ num: BigInt(n), den: 1n });
      assert.deepEqual(actual, { num: independentProduct(n), den: 1n });
    }
  });

  it('cross-checks against Pascal triangle binomial coefficients', () => {
    const maxN = 15;
    // Build Pascal's triangle independently using addition only
    const pascal = [];
    for (let n = 0; n <= maxN; n += 1) {
      const row = new Array(n + 1).fill(1n);
      for (let k = 1; k < n; k += 1) {
        row[k] = pascal[n - 1][k - 1] + pascal[n - 1][k];
      }
      pascal.push(row);
    }

    for (let n = 0; n <= maxN; n += 1) {
      const nFact = factorialRationalIterative({ num: BigInt(n), den: 1n }).num;
      for (let k = 0; k <= n; k += 1) {
        const kFact = factorialRationalIterative({ num: BigInt(k), den: 1n }).num;
        const nkFact = factorialRationalIterative({ num: BigInt(n - k), den: 1n }).num;
        assert.equal(nFact % (kFact * nkFact), 0n);
        assert.equal(nFact / (kFact * nkFact), pascal[n][k]);
      }
    }
  });
});
