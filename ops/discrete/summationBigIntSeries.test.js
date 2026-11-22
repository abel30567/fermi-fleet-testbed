import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationBigIntSeries } from './summationBigIntSeries.js';

describe('summationBigIntSeries', () => {
  describe('array form', () => {
    it('sums positive, negative, and mixed BigInt arrays', () => {
      assert.equal(summationBigIntSeries([1n, 2n, 3n, 4n, 5n]), 15n);
      assert.equal(summationBigIntSeries([-10n, 4n, -6n, 12n]), 0n);
      assert.equal(summationBigIntSeries([42n]), 42n);
      assert.equal(summationBigIntSeries([-7n, -3n]), -10n);
    });

    it('returns 0n for an empty array', () => {
      assert.equal(summationBigIntSeries([]), 0n);
    });

    it('preserves exact precision for huge and 10^18 fixed-point scaled BigInts', () => {
      const SCALE = 10n ** 18n;
      const huge = 10n ** 50n;
      assert.equal(
        summationBigIntSeries([huge, 1n, -huge, 2n]),
        3n
      );

      // Fixed-point 10^18-scaled values: 0.25 + 0.50 + 0.75 + 1.50 = 3.00
      const scaledTerms = [
        SCALE / 4n,
        SCALE / 2n,
        (3n * SCALE) / 4n,
        (3n * SCALE) / 2n,
      ];
      assert.equal(summationBigIntSeries(scaledTerms), 3n * SCALE);
    });
  });

  describe('range/series form (identity closed form)', () => {
    it('computes arithmetic range sums via Gauss closed form', () => {
      assert.equal(summationBigIntSeries(1n, 10n), 55n);
      assert.equal(summationBigIntSeries(1n, 100n), 5050n);
      assert.equal(summationBigIntSeries(5n, 10n), 45n);
      assert.equal(summationBigIntSeries(1n, 10n, undefined), 55n);
    });

    it('handles start === end across positive, zero, and negative bounds', () => {
      assert.equal(summationBigIntSeries(0n, 0n), 0n);
      assert.equal(summationBigIntSeries(7n, 7n), 7n);
      assert.equal(summationBigIntSeries(-9n, -9n), -9n);
    });

    it('returns 0n when start > end', () => {
      assert.equal(summationBigIntSeries(10n, 1n), 0n);
      assert.equal(summationBigIntSeries(0n, -1n), 0n);
      assert.equal(summationBigIntSeries(-2n, -5n), 0n);
    });

    it('handles negative and cross-zero bounds', () => {
      assert.equal(summationBigIntSeries(-5n, 5n), 0n);
      assert.equal(summationBigIntSeries(-10n, -1n), -55n);
      assert.equal(summationBigIntSeries(-3n, 2n), -3n);
      assert.equal(summationBigIntSeries(-100n, 50n), -3775n);
    });

    it('computes huge ranges in O(1) without overflow', () => {
      const n = 10n ** 18n;
      const expected = (n * (n + 1n)) / 2n;
      assert.equal(
        summationBigIntSeries(1n, n),
        500000000000000000500000000000000000n
      );
      assert.equal(summationBigIntSeries(1n, n), expected);

      const bigStart = 10n ** 30n;
      const bigEnd = bigStart + 10n ** 18n;
      const count = 10n ** 18n + 1n;
      assert.equal(
        summationBigIntSeries(bigStart, bigEnd),
        (count * (bigStart + bigEnd)) / 2n
      );
    });
  });

  describe('range/series form (custom termFn)', () => {
    it('sums custom series such as k^2, k^3, and geometric series', () => {
      assert.equal(summationBigIntSeries(1n, 5n, (k) => k * k), 55n);
      assert.equal(summationBigIntSeries(1n, 5n, (k) => k * k * k), 225n);
      assert.equal(summationBigIntSeries(0n, 10n, (k) => 2n ** k), 2047n);
    });

    it('evaluates termFn in ascending order and handles edge ranges', () => {
      const seen = [];
      const sum = summationBigIntSeries(-2n, 2n, (k) => {
        seen.push(k);
        return k * k;
      });
      assert.deepEqual(seen, [-2n, -1n, 0n, 1n, 2n]);
      assert.equal(sum, 10n);

      let called = false;
      assert.equal(
        summationBigIntSeries(5n, 3n, () => {
          called = true;
          return 1n;
        }),
        0n
      );
      assert.equal(called, false);

      assert.equal(summationBigIntSeries(4n, 4n, (k) => k * 3n), 12n);
    });
  });

  describe('cross-checks against independent mathematical identities', () => {
    it('matches Faulhaber formulas for sum(k), sum(k^2), sum(k^3), and sum(k^4)', () => {
      for (const n of [1n, 2n, 7n, 25n, 100n, 250n]) {
        const expectedK = (n * (n + 1n)) / 2n;
        const expectedK2 = (n * (n + 1n) * (2n * n + 1n)) / 6n;
        const expectedK3 = expectedK * expectedK; // Nicomachus's theorem: sum(k^3) = (sum(k))^2
        const expectedK4 =
          (n * (n + 1n) * (2n * n + 1n) * (3n * n * n + 3n * n - 1n)) / 30n;

        // Cross-check array form, closed-form range, and explicit identity termFn
        const arr = [];
        for (let k = 1n; k <= n; k += 1n) {
          arr.push(k);
        }
        assert.equal(summationBigIntSeries(arr), expectedK);
        assert.equal(summationBigIntSeries(1n, n), expectedK);
        assert.equal(summationBigIntSeries(1n, n, (k) => k), expectedK);

        assert.equal(summationBigIntSeries(1n, n, (k) => k * k), expectedK2);
        assert.equal(summationBigIntSeries(1n, n, (k) => k * k * k), expectedK3);
        assert.equal(
          summationBigIntSeries(1n, n, (k) => k * k * k * k),
          expectedK4
        );
      }
    });

    it('matches geometric series identity sum_{k=0}^{n} 2^k = 2^(n+1) - 1', () => {
      const n = 128n;
      assert.equal(
        summationBigIntSeries(0n, n, (k) => 2n ** k),
        2n ** (n + 1n) - 1n
      );
    });

    it('satisfies range additivity across split intervals with negative bounds', () => {
      const start = -40n;
      const mid = 13n;
      const end = 60n;
      const fn = (k) => 3n * k * k - 2n * k + 7n;

      assert.equal(
        summationBigIntSeries(start, end, fn),
        summationBigIntSeries(start, mid, fn) +
          summationBigIntSeries(mid + 1n, end, fn)
      );
      assert.equal(
        summationBigIntSeries(start, end),
        summationBigIntSeries(start, mid) + summationBigIntSeries(mid + 1n, end)
      );
    });
  });

  describe('input validation', () => {
    it('rejects invalid argument counts', () => {
      assert.throws(() => summationBigIntSeries(), TypeError);
      assert.throws(
        () => summationBigIntSeries(1n, 2n, (k) => k, 'extra'),
        TypeError
      );
    });

    it('rejects non-array single arguments and non-BigInt array elements', () => {
      assert.throws(() => summationBigIntSeries(1n), TypeError);
      assert.throws(() => summationBigIntSeries(10), TypeError);
      assert.throws(() => summationBigIntSeries('123'), TypeError);
      assert.throws(() => summationBigIntSeries(null), TypeError);
      assert.throws(() => summationBigIntSeries(undefined), TypeError);
      assert.throws(() => summationBigIntSeries({}), TypeError);

      assert.throws(() => summationBigIntSeries([1n, 2]), TypeError);
      assert.throws(() => summationBigIntSeries([1n, '2']), TypeError);
      assert.throws(() => summationBigIntSeries([null]), TypeError);
      assert.throws(() => summationBigIntSeries([undefined]), TypeError);

      // Sparse array hole
      const sparse = new Array(3);
      sparse[0] = 1n;
      sparse[2] = 3n;
      assert.throws(() => summationBigIntSeries(sparse), TypeError);
    });

    it('rejects non-BigInt range bounds and invalid termFn', () => {
      assert.throws(() => summationBigIntSeries(1, 5n), TypeError);
      assert.throws(() => summationBigIntSeries(1n, 5), TypeError);
      assert.throws(() => summationBigIntSeries('1', '5'), TypeError);
      assert.throws(() => summationBigIntSeries([1n], 5n), TypeError);
      assert.throws(() => summationBigIntSeries(1n, null), TypeError);

      assert.throws(() => summationBigIntSeries(1n, 5n, null), TypeError);
      assert.throws(() => summationBigIntSeries(1n, 5n, 42), TypeError);
      assert.throws(() => summationBigIntSeries(1n, 5n, 'k => k'), TypeError);
      // Even when start > end, invalid termFn must still be rejected
      assert.throws(() => summationBigIntSeries(5n, 1n, 'invalid'), TypeError);
    });

    it('rejects termFn returning non-BigInt values', () => {
      assert.throws(
        () => summationBigIntSeries(1n, 3n, (k) => Number(k)),
        TypeError
      );
      assert.throws(
        () => summationBigIntSeries(1n, 3n, () => '1'),
        TypeError
      );
      assert.throws(
        () => summationBigIntSeries(1n, 3n, () => undefined),
        TypeError
      );
    });
  });
});
