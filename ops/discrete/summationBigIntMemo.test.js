import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationBigIntMemo } from './summationBigIntMemo.js';

/**
 * Independent naive discrete summation reference for cross-checking.
 *
 * @param {bigint} start
 * @param {bigint} end
 * @param {(k: bigint) => bigint} [termFn]
 * @returns {bigint}
 */
function naiveSummation(start, end, termFn = (k) => k) {
	let total = 0n;
	for (let k = start; k <= end; k++) {
		total += termFn(k);
	}
	return total;
}

describe('summationBigIntMemo', () => {
	describe('identity summation (precomputed table and memoized exact formula)', () => {
		it('computes sums within the precomputed prefix-sum table [0n, 1024n]', () => {
			assert.equal(summationBigIntMemo(0n, 0n), 0n);
			assert.equal(summationBigIntMemo(1n, 10n), 55n);
			assert.equal(summationBigIntMemo(0n, 100n), 5050n);
			assert.equal(summationBigIntMemo(10n, 20n), 165n);
			assert.equal(summationBigIntMemo(0n, 1024n), 524800n);
			assert.equal(summationBigIntMemo(512n, 1024n), naiveSummation(512n, 1024n));
		});

		it('computes sums beyond the precomputed table and caches results', () => {
			assert.equal(summationBigIntMemo(0n, 1025n), naiveSummation(0n, 1025n));
			assert.equal(summationBigIntMemo(1000n, 2000n), naiveSummation(1000n, 2000n));
			// Repeated call exercises range cache
			assert.equal(summationBigIntMemo(1000n, 2000n), 1501500n);
		});

		it('handles negative and zero-crossing ranges', () => {
			assert.equal(summationBigIntMemo(-10n, -1n), -55n);
			assert.equal(summationBigIntMemo(-5n, 5n), 0n);
			assert.equal(summationBigIntMemo(-3n, 5n), 9n);
			assert.equal(summationBigIntMemo(-200n, 150n), naiveSummation(-200n, 150n));
		});

		it('handles very large BigInt bounds without precision loss', () => {
			const base = 10n ** 30n;
			const expected = 1001n * base + 500500n;
			assert.equal(summationBigIntMemo(base, base + 1000n), expected);

			const n = 10n ** 25n;
			assert.equal(summationBigIntMemo(1n, n), (n * (n + 1n)) / 2n);
		});
	});

	describe('edge cases', () => {
		it('returns 0n for empty ranges (start > end) without calling termFn', () => {
			let calls = 0;
			const fn = (k) => {
				calls++;
				return k * 2n;
			};
			assert.equal(summationBigIntMemo(5n, 4n), 0n);
			assert.equal(summationBigIntMemo(10n, -10n), 0n);
			assert.equal(summationBigIntMemo(5n, 4n, fn), 0n);
			assert.equal(calls, 0);
		});

		it('handles single-element ranges (start === end)', () => {
			assert.equal(summationBigIntMemo(42n, 42n), 42n);
			assert.equal(summationBigIntMemo(-42n, -42n), -42n);
			assert.equal(summationBigIntMemo(7n, 7n, (k) => k * k), 49n);
		});

		it('never evaluates termFn outside [start, end]', () => {
			const SCALE = 10n ** 18n;
			// Division by k would throw RangeError if k = 0n were ever evaluated
			const scaledReciprocal = (k) => SCALE / k;
			const sum = summationBigIntMemo(1n, 10n, scaledReciprocal);
			assert.equal(sum, naiveSummation(1n, 10n, scaledReciprocal));
		});
	});

	describe('custom termFn and independent mathematical cross-checks', () => {
		it('cross-checks sum of squares against Faulhaber closed form n(n+1)(2n+1)/6', () => {
			const sq = (k) => k * k;
			for (const n of [1n, 10n, 63n, 64n, 65n, 200n, 300n]) {
				const closedForm = (n * (n + 1n) * (2n * n + 1n)) / 6n;
				assert.equal(summationBigIntMemo(1n, n, sq), closedForm);
			}
		});

		it('cross-checks sum of cubes against Nicomachus theorem (sum k)^2', () => {
			const cube = (k) => k * k * k;
			for (const n of [1n, 7n, 64n, 130n]) {
				const linearSum = summationBigIntMemo(1n, n);
				assert.equal(summationBigIntMemo(1n, n, cube), linearSum * linearSum);
			}
		});

		it('satisfies interval additivity across positive and negative block boundaries', () => {
			const poly = (k) => 3n * k * k - 5n * k + 11n;
			const full = summationBigIntMemo(-140n, 150n, poly);
			const left = summationBigIntMemo(-140n, -17n, poly);
			const right = summationBigIntMemo(-16n, 150n, poly);
			assert.equal(full, left + right);
			assert.equal(full, naiveSummation(-140n, 150n, poly));
		});

		it('preserves 10^18 fixed-point BigInt scaling under summation', () => {
			const SCALE = 10n ** 18n;
			// Sum of (k / 2) scaled by 10^18 for k = 1..100 -> 5050 / 2 * 10^18 = 2525 * 10^18
			const halfK = (k) => (k * SCALE) / 2n;
			assert.equal(summationBigIntMemo(1n, 100n, halfK), 2525n * SCALE);
		});
	});

	describe('memoization and block-table reuse', () => {
		it('reuses cached range, block, and term results without redundant termFn calls', () => {
			let calls = 0;
			const tracked = (k) => {
				calls++;
				return k * 3n + 1n;
			};

			// First query spans 2 full 64-element blocks [0..63], [64..127] plus edges
			const first = summationBigIntMemo(-5n, 135n, tracked);
			assert.equal(first, naiveSummation(-5n, 135n, (k) => k * 3n + 1n));
			assert.equal(calls, 141);

			// Exact repeat hits range cache: 0 new calls
			const repeat = summationBigIntMemo(-5n, 135n, tracked);
			assert.equal(repeat, first);
			assert.equal(calls, 141);

			// Subrange [0n, 127n] hits cached 64-element blocks: 0 new calls
			const sub = summationBigIntMemo(0n, 127n, tracked);
			assert.equal(sub, naiveSummation(0n, 127n, (k) => k * 3n + 1n));
			assert.equal(calls, 141);

			// Overlapping range extending by 10 new indices (-10..-6 and 136..140)
			const extended = summationBigIntMemo(-10n, 140n, tracked);
			assert.equal(extended, naiveSummation(-10n, 140n, (k) => k * 3n + 1n));
			assert.equal(calls, 151);
		});
	});

	describe('input validation', () => {
		it('rejects non-BigInt start or end arguments', () => {
			assert.throws(() => summationBigIntMemo(0, 10n), TypeError);
			assert.throws(() => summationBigIntMemo('0', 10n), TypeError);
			assert.throws(() => summationBigIntMemo(null, 10n), TypeError);
			assert.throws(() => summationBigIntMemo(undefined, 10n), TypeError);
			assert.throws(() => summationBigIntMemo(0n, 10), TypeError);
			assert.throws(() => summationBigIntMemo(0n, '10'), TypeError);
			assert.throws(() => summationBigIntMemo(0n, null), TypeError);
			assert.throws(() => summationBigIntMemo(0n, undefined), TypeError);
		});

		it('rejects invalid termFn or non-BigInt termFn return values', () => {
			assert.throws(() => summationBigIntMemo(0n, 5n, null), TypeError);
			assert.throws(() => summationBigIntMemo(0n, 5n, 123), TypeError);
			assert.throws(() => summationBigIntMemo(0n, 5n, 'k => k'), TypeError);
			assert.throws(() => summationBigIntMemo(0n, 5n, (k) => Number(k)), TypeError);
			assert.throws(() => summationBigIntMemo(0n, 5n, () => undefined), TypeError);
		});
	});
});
