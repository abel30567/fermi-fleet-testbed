import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { permutationsDecimalRecursive } from './permutationsDecimalRecursive.js';

/**
 * Independent iterative factorial helper for cross-checking P(n, k) = n! / (n - k)!.
 *
 * @param {bigint} value - Non-negative integer.
 * @returns {bigint} Exact factorial `value!`.
 */
function iterativeFactorial(value) {
  let acc = 1n;
  for (let i = 2n; i <= value; i += 1n) {
    acc *= i;
  }
  return acc;
}

describe('permutationsDecimalRecursive', () => {
  describe('normal cases', () => {
    it('computes small and moderate permutations accurately', () => {
      assert.equal(permutationsDecimalRecursive('5', '3'), '60');
      assert.equal(permutationsDecimalRecursive('10', '4'), '5040');
      assert.equal(permutationsDecimalRecursive('7', '2'), '42');
      assert.equal(permutationsDecimalRecursive('12', '5'), '95040');
    });

    it('computes large permutations exceeding IEEE-754 limits with exact precision', () => {
      // P(100, 30) = 100! / 70! (58 digits, far beyond Number.MAX_SAFE_INTEGER)
      const expected100_30 = (iterativeFactorial(100n) / iterativeFactorial(70n)).toString(10);
      assert.equal(
        permutationsDecimalRecursive('100', '30'),
        '7791097137057804874587232499277321440358327700684800000000',
      );
      assert.equal(permutationsDecimalRecursive('100', '30'), expected100_30);

      // P(200, 200) = 200! (~7.89e374, exceeding IEEE-754 Number.MAX_VALUE ~1.8e308)
      const expected200 = iterativeFactorial(200n).toString(10);
      assert.equal(permutationsDecimalRecursive('200', '200'), expected200);
      assert.equal(expected200.length, 375);

      // Huge n with small k (arbitrary-precision n far beyond 64-bit integers)
      const bigN = '1000000000000000000000000000000';
      const expectedBig =
        BigInt(bigN) * (BigInt(bigN) - 1n) * (BigInt(bigN) - 2n);
      assert.equal(permutationsDecimalRecursive(bigN, '3'), expectedBig.toString(10));
    });

    it('accepts decimal strings representing exact integers', () => {
      assert.equal(permutationsDecimalRecursive('8.00', '3.000'), '336');
      assert.equal(permutationsDecimalRecursive('5.0', '3.00'), '60');
      assert.equal(permutationsDecimalRecursive('+10.00', '+4.0'), '5040');
      assert.equal(permutationsDecimalRecursive('00005.00', '003.0'), '60');
      assert.equal(permutationsDecimalRecursive('  6.00  ', '  2.0  '), '30');
    });

    it('formats results with configurable precision', () => {
      assert.equal(permutationsDecimalRecursive('5', '3', 0), '60');
      assert.equal(permutationsDecimalRecursive('5', '3', 2), '60.00');
      assert.equal(permutationsDecimalRecursive('10', '4', 5), '5040.00000');
      assert.equal(permutationsDecimalRecursive('8.00', '3.00', 4), '336.0000');
      assert.equal(permutationsDecimalRecursive('5', '0', 3), '1.000');
      assert.equal(permutationsDecimalRecursive('3', '5', 4), '0.0000');
    });
  });

  describe('edge cases', () => {
    it('returns "1" for P(0, 0) and P(n, 0)', () => {
      assert.equal(permutationsDecimalRecursive('0', '0'), '1');
      assert.equal(permutationsDecimalRecursive('0.00', '0.0'), '1');
      assert.equal(permutationsDecimalRecursive('0', '0', 2), '1.00');
      assert.equal(permutationsDecimalRecursive('1', '0'), '1');
      assert.equal(permutationsDecimalRecursive('42', '0'), '1');
      assert.equal(
        permutationsDecimalRecursive('999999999999999999999999999999', '0'),
        '1',
      );
    });

    it('returns n for P(n, 1)', () => {
      assert.equal(permutationsDecimalRecursive('1', '1'), '1');
      assert.equal(permutationsDecimalRecursive('17', '1'), '17');
      assert.equal(
        permutationsDecimalRecursive('123456789012345678901234567890', '1'),
        '123456789012345678901234567890',
      );
    });

    it('returns n! for P(n, n)', () => {
      assert.equal(permutationsDecimalRecursive('1', '1'), '1');
      assert.equal(permutationsDecimalRecursive('5', '5'), '120');
      assert.equal(permutationsDecimalRecursive('10', '10'), '3628800');
      assert.equal(permutationsDecimalRecursive('20', '20'), '2432902008176640000');
      assert.equal(
        permutationsDecimalRecursive('25', '25'),
        '15511210043330985984000000',
      );
    });

    it('returns "0" when k > n', () => {
      assert.equal(permutationsDecimalRecursive('0', '1'), '0');
      assert.equal(permutationsDecimalRecursive('5', '6'), '0');
      assert.equal(permutationsDecimalRecursive('10', '100'), '0');
      assert.equal(
        permutationsDecimalRecursive('10', '999999999999999999999999999999'),
        '0',
      );
      assert.equal(permutationsDecimalRecursive('5', '6', 3), '0.000');
    });
  });

  describe('input validation', () => {
    it('rejects negative values for n or k', () => {
      assert.throws(() => permutationsDecimalRecursive('-1', '0'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('-5', '2'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '-2'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('-0', '0'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '-0.00'), RangeError);
    });

    it('rejects non-integer fractional decimal strings', () => {
      assert.throws(() => permutationsDecimalRecursive('5.5', '2'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '2.1'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('10.0001', '3'), RangeError);
      assert.throws(() => permutationsDecimalRecursive('10', '0.0000001'), RangeError);
    });

    it('rejects malformed decimal strings and non-string inputs', () => {
      const malformed = ['', '   ', 'abc', '1e3', '1.2.3', '5.', '.5', 'NaN', 'Infinity', '1_000', '1 0'];
      for (const bad of malformed) {
        assert.throws(() => permutationsDecimalRecursive(bad, '1'), TypeError);
        assert.throws(() => permutationsDecimalRecursive('5', bad), TypeError);
      }

      const nonStrings = [5, 3n, null, undefined, {}, [], true];
      for (const bad of nonStrings) {
        assert.throws(() => permutationsDecimalRecursive(bad, '1'), TypeError);
        assert.throws(() => permutationsDecimalRecursive('5', bad), TypeError);
      }
    });

    it('rejects invalid precision arguments', () => {
      assert.throws(() => permutationsDecimalRecursive('5', '3', -1), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', 1.5), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', Number.NaN), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', Number.POSITIVE_INFINITY), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', Number.MAX_SAFE_INTEGER + 1), RangeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', '2'), TypeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', null), TypeError);
      assert.throws(() => permutationsDecimalRecursive('5', '3', 2n), TypeError);
    });
  });

  describe('mathematical cross-checks', () => {
    it('matches independent n! / (n - k)! computation across a range of values', () => {
      const pairs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [6, 3],
        [15, 7],
        [30, 15],
        [50, 25],
        [80, 40],
        [100, 30],
        [120, 60],
      ];

      for (const [n, k] of pairs) {
        const expected = (iterativeFactorial(BigInt(n)) / iterativeFactorial(BigInt(n - k))).toString(10);
        const actual = permutationsDecimalRecursive(String(n), String(k));
        assert.equal(actual, expected, `Mismatch for P(${n}, ${k})`);
      }
    });

    it('satisfies the recurrence P(n, k) = n * P(n - 1, k - 1)', () => {
      const pairs = [
        [1n, 1n],
        [5n, 3n],
        [12n, 8n],
        [45n, 20n],
        [100n, 30n],
        [1000000000000000000000n, 7n],
      ];

      for (const [n, k] of pairs) {
        const lhs = BigInt(permutationsDecimalRecursive(n.toString(10), k.toString(10)));
        const rhs = n * BigInt(permutationsDecimalRecursive((n - 1n).toString(10), (k - 1n).toString(10)));
        assert.equal(lhs, rhs, `Recurrence failed for P(${n}, ${k})`);
      }
    });

    it('satisfies the falling-factorial split identity P(n, k) = P(n, j) * P(n - j, k - j)', () => {
      const cases = [
        [20n, 12n, 5n],
        [60n, 35n, 17n],
        [100n, 40n, 13n],
      ];

      for (const [n, k, j] of cases) {
        const full = BigInt(permutationsDecimalRecursive(n.toString(10), k.toString(10)));
        const part1 = BigInt(permutationsDecimalRecursive(n.toString(10), j.toString(10)));
        const part2 = BigInt(permutationsDecimalRecursive((n - j).toString(10), (k - j).toString(10)));
        assert.equal(full, part1 * part2, `Split identity failed for n=${n}, k=${k}, j=${j}`);
      }
    });
  });
});
