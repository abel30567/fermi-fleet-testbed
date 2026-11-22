import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsDecimalIterative } from './permutationsDecimalIterative.js';

/**
 * Independent BigInt factorial helper for cross-checking P(n, k) = n! / (n - k)!.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function factorialBigInt(m) {
  let acc = 1n;
  for (let i = 2n; i <= m; i += 1n) {
    acc *= i;
  }
  return acc;
}

describe('permutationsDecimalIterative', () => {
  describe('normal cases', () => {
    it('computes standard small permutations accurately', () => {
      assert.equal(permutationsDecimalIterative('5', '3'), '60');
      assert.equal(permutationsDecimalIterative('10', '4'), '5040');
      assert.equal(permutationsDecimalIterative('7', '2'), '42');
      assert.equal(permutationsDecimalIterative('6', '6'), '720');
      assert.equal(permutationsDecimalIterative('12', '5'), '95040');
    });

    it('computes large permutations beyond IEEE-754 float64 precision exactly', () => {
      // P(100, 30) = 100! / 70! (59 digits, far exceeding float64's 15-17 digits)
      const expected100_30 = (factorialBigInt(100n) / factorialBigInt(70n)).toString();
      assert.equal(expected100_30.length > 50, true);
      assert.equal(permutationsDecimalIterative('100', '30'), expected100_30);

      // P(25, 25) = 25! = 15511210043330985984000000 (26 digits)
      assert.equal(
        permutationsDecimalIterative('25', '25'),
        '15511210043330985984000000'
      );
    });

    it('handles huge arbitrary-precision decimal strings for n (50+ digits)', () => {
      // n = 10^50, k = 3 => P(n, 3) = n*(n-1)*(n-2) = n^3 - 3n^2 + 2n
      const nBig = 10n ** 50n;
      const expected = (nBig ** 3n - 3n * nBig ** 2n + 2n * nBig).toString();
      assert.equal(
        permutationsDecimalIterative(nBig.toString(), '3'),
        expected
      );
    });

    it('formats exact integer results cleanly with non-zero precision', () => {
      assert.equal(permutationsDecimalIterative('5', '3', 0), '60');
      assert.equal(permutationsDecimalIterative('5', '3', 2), '60.00');
      assert.equal(permutationsDecimalIterative('10', '4', 5), '5040.00000');
      assert.equal(permutationsDecimalIterative('3', '5', 3), '0.000');
      assert.equal(permutationsDecimalIterative('0', '0', 4), '1.0000');
    });
  });

  describe('edge cases', () => {
    it('returns 1 when k = 0 (including n = 0, k = 0)', () => {
      assert.equal(permutationsDecimalIterative('0', '0'), '1');
      assert.equal(permutationsDecimalIterative('5', '0'), '1');
      assert.equal(permutationsDecimalIterative('999999999999999999999999999999', '0'), '1');
    });

    it('returns n! when k = n', () => {
      assert.equal(permutationsDecimalIterative('1', '1'), '1');
      assert.equal(permutationsDecimalIterative('5', '5'), '120');
      assert.equal(permutationsDecimalIterative('10', '10'), '3628800');
    });

    it('returns 0 when k > n', () => {
      assert.equal(permutationsDecimalIterative('0', '1'), '0');
      assert.equal(permutationsDecimalIterative('3', '5'), '0');
      assert.equal(permutationsDecimalIterative('10', '100'), '0');
      assert.equal(
        permutationsDecimalIterative('100000000000000000000', '100000000000000000001'),
        '0'
      );
    });

    it('accepts signed, padded, fractional-zero, and scientific integer forms', () => {
      assert.equal(permutationsDecimalIterative('+10', '+4'), '5040');
      assert.equal(permutationsDecimalIterative('10.00', '4.000'), '5040');
      assert.equal(permutationsDecimalIterative('  005.0  ', ' 3. '), '60');
      assert.equal(permutationsDecimalIterative('-0', '-0.0'), '1');
      assert.equal(permutationsDecimalIterative('.0', '0.0e5'), '1');
      assert.equal(permutationsDecimalIterative('1e1', '4e0'), '5040');
      assert.equal(permutationsDecimalIterative('0.5e1', '30e-1'), '60');
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-string n or k', () => {
      assert.throws(() => permutationsDecimalIterative(5, '3'), TypeError);
      assert.throws(() => permutationsDecimalIterative('5', 3), TypeError);
      assert.throws(() => permutationsDecimalIterative(5n, '3'), TypeError);
      assert.throws(() => permutationsDecimalIterative(null, '3'), TypeError);
      assert.throws(() => permutationsDecimalIterative('5', undefined), TypeError);
      assert.throws(() => permutationsDecimalIterative({}, '3'), TypeError);
    });

    it('throws RangeError for malformed decimal strings', () => {
      for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '1.2.3', '.', '+', '-', '1e', '1_000']) {
        assert.throws(() => permutationsDecimalIterative(bad, '1'), RangeError);
        assert.throws(() => permutationsDecimalIterative('5', bad), RangeError);
      }
    });

    it('throws RangeError for negative or non-integer decimal strings', () => {
      assert.throws(() => permutationsDecimalIterative('-1', '0'), RangeError);
      assert.throws(() => permutationsDecimalIterative('5', '-2'), RangeError);
      assert.throws(() => permutationsDecimalIterative('-10.0', '2'), RangeError);
      assert.throws(() => permutationsDecimalIterative('5.5', '2'), RangeError);
      assert.throws(() => permutationsDecimalIterative('5', '2.1'), RangeError);
      assert.throws(() => permutationsDecimalIterative('10.0000000000000000000001', '2'), RangeError);
      assert.throws(() => permutationsDecimalIterative('1e-1', '1'), RangeError);
    });

    it('validates precision is a non-negative integer number', () => {
      assert.throws(() => permutationsDecimalIterative('5', '3', '2'), TypeError);
      assert.throws(() => permutationsDecimalIterative('5', '3', null), TypeError);
      assert.throws(() => permutationsDecimalIterative('5', '3', -1), RangeError);
      assert.throws(() => permutationsDecimalIterative('5', '3', 1.5), RangeError);
      assert.throws(() => permutationsDecimalIterative('5', '3', Number.NaN), RangeError);
      assert.throws(() => permutationsDecimalIterative('5', '3', Number.POSITIVE_INFINITY), RangeError);
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches independent n! / (n - k)! computation across a range of (n, k)', () => {
      const pairs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [12, 7],
        [30, 15],
        [60, 25],
        [120, 40],
      ];

      for (const [n, k] of pairs) {
        const expected = (factorialBigInt(BigInt(n)) / factorialBigInt(BigInt(n - k))).toString();
        const actual = permutationsDecimalIterative(String(n), String(k));
        assert.equal(actual, expected, `Mismatch for P(${n}, ${k})`);
      }
    });

    it('satisfies the recurrence P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)', () => {
      const cases = [
        [5, 3],
        [10, 4],
        [25, 12],
        [80, 35],
        [50, 50],
      ];

      for (const [n, k] of cases) {
        const lhs = BigInt(permutationsDecimalIterative(String(n), String(k)));
        const term1 = BigInt(permutationsDecimalIterative(String(n - 1), String(k)));
        const term2 = BigInt(k) * BigInt(permutationsDecimalIterative(String(n - 1), String(k - 1)));
        assert.equal(lhs, term1 + term2, `Recurrence failed for P(${n}, ${k})`);
      }
    });

    it('satisfies multiplicative decomposition P(n, a + b) = P(n, a) * P(n - a, b)', () => {
      const n = 90;
      const a = 20;
      const b = 15;
      const lhs = BigInt(permutationsDecimalIterative(String(n), String(a + b)));
      const rhs =
        BigInt(permutationsDecimalIterative(String(n), String(a))) *
        BigInt(permutationsDecimalIterative(String(n - a), String(b)));
      assert.equal(lhs, rhs);
    });
  });
});
