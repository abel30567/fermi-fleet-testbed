import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialRationalMemo } from './factorialRationalMemo.js';

/**
 * Independent iterative BigInt factorial used for cross-checking.
 * @param {bigint} n
 * @returns {bigint}
 */
function iterativeFactorial(n) {
	let result = 1n;
	for (let i = 2n; i <= n; i++) {
		result *= i;
	}
	return result;
}

describe('factorialRationalMemo', () => {
	describe('normal cases (precomputed and dynamically memoized)', () => {
		it('computes 0! = 1/1', () => {
			assert.deepEqual(factorialRationalMemo({ num: 0n, den: 1n }), { num: 1n, den: 1n });
		});

		it('computes 1! = 1/1', () => {
			assert.deepEqual(factorialRationalMemo({ num: 1n, den: 1n }), { num: 1n, den: 1n });
		});

		it('computes 5! = 120/1', () => {
			assert.deepEqual(factorialRationalMemo({ num: 5n, den: 1n }), { num: 120n, den: 1n });
		});

		it('computes 20! at the precomputed table boundary', () => {
			assert.deepEqual(factorialRationalMemo({ num: 20n, den: 1n }), {
				num: 2432902008176640000n,
				den: 1n,
			});
		});

		it('computes 21! immediately beyond the precomputed table', () => {
			assert.deepEqual(factorialRationalMemo({ num: 21n, den: 1n }), {
				num: 51090942171709440000n,
				den: 1n,
			});
		});

		it('computes 30! dynamically beyond the precomputed table', () => {
			assert.deepEqual(factorialRationalMemo({ num: 30n, den: 1n }), {
				num: 265252859812191058636308480000000n,
				den: 1n,
			});
		});
	});

	describe('edge cases: unreduced rationals and negative denominators', () => {
		it('reduces positive unreduced integer rationals', () => {
			assert.deepEqual(factorialRationalMemo({ num: 0n, den: 7n }), { num: 1n, den: 1n });
			assert.deepEqual(factorialRationalMemo({ num: 6n, den: 2n }), { num: 6n, den: 1n });
			assert.deepEqual(factorialRationalMemo({ num: 10n, den: 2n }), { num: 120n, den: 1n });
			assert.deepEqual(factorialRationalMemo({ num: 100n, den: 5n }), {
				num: 2432902008176640000n,
				den: 1n,
			});
			assert.deepEqual(factorialRationalMemo({ num: 90n, den: 3n }), {
				num: 265252859812191058636308480000000n,
				den: 1n,
			});
		});

		it('handles negative denominators yielding non-negative integers', () => {
			assert.deepEqual(factorialRationalMemo({ num: 0n, den: -5n }), { num: 1n, den: 1n });
			assert.deepEqual(factorialRationalMemo({ num: -6n, den: -2n }), { num: 6n, den: 1n });
			assert.deepEqual(factorialRationalMemo({ num: -20n, den: -4n }), { num: 120n, den: 1n });
			assert.deepEqual(factorialRationalMemo({ num: -250n, den: -10n }), {
				num: iterativeFactorial(25n),
				den: 1n,
			});
		});
	});

	describe('error handling: domain and input validation', () => {
		it('throws RangeError for negative integer rationals', () => {
			assert.throws(() => factorialRationalMemo({ num: -1n, den: 1n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: -10n, den: 2n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: 6n, den: -2n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: 1n, den: -1n }), RangeError);
		});

		it('throws RangeError for non-integer rationals', () => {
			assert.throws(() => factorialRationalMemo({ num: 1n, den: 2n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: 3n, den: 2n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: -3n, den: 2n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: -3n, den: -2n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: 41n, den: 2n }), RangeError);
		});

		it('throws RangeError for zero denominator', () => {
			assert.throws(() => factorialRationalMemo({ num: 0n, den: 0n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: 5n, den: 0n }), RangeError);
			assert.throws(() => factorialRationalMemo({ num: -5n, den: 0n }), RangeError);
		});

		it('throws TypeError for invalid input types', () => {
			const invalidInputs = [
				null,
				undefined,
				5,
				5n,
				'5',
				true,
				[],
				[5n, 1n],
				{},
				{ num: 5n },
				{ den: 1n },
				{ num: 5, den: 1n },
				{ num: 5n, den: 1 },
				{ num: '5', den: '1' },
				{ num: NaN, den: 1n },
			];
			for (const input of invalidInputs) {
				assert.throws(() => factorialRationalMemo(input), TypeError);
			}
		});
	});

	describe('memoization consistency and cache isolation', () => {
		it('returns consistent results across repeated and out-of-order lookups', () => {
			const r35First = factorialRationalMemo({ num: 35n, den: 1n });
			const r25 = factorialRationalMemo({ num: 25n, den: 1n });
			const r10 = factorialRationalMemo({ num: 10n, den: 1n });
			const r35Second = factorialRationalMemo({ num: 70n, den: 2n });

			assert.deepEqual(r35First, r35Second);
			assert.equal(r25.num, iterativeFactorial(25n));
			assert.equal(r10.num, iterativeFactorial(10n));
			assert.equal(r35First.den, 1n);
		});

		it('returns fresh objects so caller mutations cannot corrupt the memo cache', () => {
			const first = factorialRationalMemo({ num: 12n, den: 1n });
			first.num = -999n;
			first.den = 42n;

			const second = factorialRationalMemo({ num: 12n, den: 1n });
			assert.deepEqual(second, { num: 479001600n, den: 1n });

			const dynFirst = factorialRationalMemo({ num: 28n, den: 1n });
			dynFirst.num = 0n;
			dynFirst.den = 0n;

			const dynSecond = factorialRationalMemo({ num: 28n, den: 1n });
			assert.deepEqual(dynSecond, { num: iterativeFactorial(28n), den: 1n });
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies recurrence n! == n * (n - 1)! for n = 1..60', () => {
			let prev = factorialRationalMemo({ num: 0n, den: 1n });
			assert.deepEqual(prev, { num: 1n, den: 1n });

			for (let n = 1n; n <= 60n; n++) {
				const curr = factorialRationalMemo({ num: n, den: 1n });
				assert.equal(curr.den, 1n);
				assert.equal(curr.num, n * prev.num);
				prev = curr;
			}
		});

		it('matches independent iterative product for n = 0..60 and n = 100', () => {
			for (let n = 0n; n <= 60n; n++) {
				const res = factorialRationalMemo({ num: n, den: 1n });
				assert.deepEqual(res, { num: iterativeFactorial(n), den: 1n });
			}
			assert.deepEqual(factorialRationalMemo({ num: 100n, den: 1n }), {
				num: iterativeFactorial(100n),
				den: 1n,
			});
		});

		it('is invariant under rational scaling (k*n)/(k) for positive and negative k', () => {
			const factors = [1n, 2n, 7n, -1n, -13n, 1000003n];
			for (const n of [0n, 1n, 6n, 20n, 21n, 32n]) {
				const expected = factorialRationalMemo({ num: n, den: 1n });
				for (const k of factors) {
					assert.deepEqual(factorialRationalMemo({ num: n * k, den: k }), expected);
				}
			}
		});
	});
});
