import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productBigIntIterative } from './productBigIntIterative.js';

describe('productBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes the product of small positive BigInts', () => {
			assert.equal(productBigIntIterative([2n, 3n, 4n]), 24n);
			assert.equal(productBigIntIterative([1n, 2n, 3n, 4n, 5n]), 120n);
		});

		it('returns the single element for singleton inputs', () => {
			assert.equal(productBigIntIterative([42n]), 42n);
			assert.equal(productBigIntIterative([-7n]), -7n);
			assert.equal(productBigIntIterative([0n]), 0n);
		});

		it('handles negative values with exact sign semantics', () => {
			assert.equal(productBigIntIterative([-2n, 3n, -4n]), 24n);
			assert.equal(productBigIntIterative([-2n, 3n, 4n]), -24n);
			assert.equal(productBigIntIterative([-1n, -1n, -1n]), -1n);
			assert.equal(productBigIntIterative([-1n, -1n, -1n, -1n]), 1n);
		});

		it('accepts arbitrary non-string iterables', () => {
			assert.equal(productBigIntIterative(new Set([2n, 5n, 7n])), 70n);
			assert.equal(
				productBigIntIterative(new BigInt64Array([3n, -4n, 5n])),
				-60n
			);
			assert.equal(
				productBigIntIterative(new BigUint64Array([2n, 3n, 11n])),
				66n
			);

			function* gen() {
				yield 2n;
				yield 3n;
				yield 13n;
			}
			assert.equal(productBigIntIterative(gen()), 78n);
		});

		it('does not mutate the input array', () => {
			const input = [2n, -3n, 5n, 7n];
			const snapshot = [...input];
			assert.equal(productBigIntIterative(input), -210n);
			assert.deepEqual(input, snapshot);
		});
	});

	describe('edge cases', () => {
		it('returns 1n (multiplicative identity) for empty iterables', () => {
			assert.equal(productBigIntIterative([]), 1n);
			assert.equal(productBigIntIterative(new Set()), 1n);
			assert.equal(productBigIntIterative(new BigInt64Array(0)), 1n);
			function* emptyGen() {}
			assert.equal(productBigIntIterative(emptyGen()), 1n);
		});

		it('returns 0n when any element is 0n', () => {
			assert.equal(productBigIntIterative([5n, 0n, 9n]), 0n);
			assert.equal(productBigIntIterative([0n, 10n ** 100n]), 0n);
			assert.equal(productBigIntIterative([10n ** 100n, -3n, 0n]), 0n);
		});

		it('computes exact products for arbitrarily large BigInts without precision loss', () => {
			const a = 10n ** 18n + 7n;
			const b = 10n ** 18n + 13n;
			const expected = 10n ** 36n + 20n * 10n ** 18n + 91n;
			assert.equal(productBigIntIterative([a, b]), expected);

			assert.equal(
				productBigIntIterative([2n ** 64n, 2n ** 64n, 2n ** 64n]),
				2n ** 192n
			);
		});

		it('handles long sequences iteratively without stack overflow', () => {
			const n = 20000;
			const ones = new Array(n).fill(1n);
			ones[0] = -1n;
			ones[n - 1] = 3n;
			assert.equal(productBigIntIterative(ones), -3n);
		});

		it('throws TypeError for non-iterable or invalid container inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				0,
				42,
				42n,
				true,
				false,
				'123',
				'',
				{},
				() => [1n, 2n],
				Symbol('x'),
			];

			for (const bad of invalidInputs) {
				assert.throws(
					() => productBigIntIterative(bad),
					TypeError
				);
			}
		});

		it('throws TypeError when any element is not a bigint', () => {
			assert.throws(() => productBigIntIterative([1n, 2, 3n]), TypeError);
			assert.throws(() => productBigIntIterative([1n, '2']), TypeError);
			assert.throws(() => productBigIntIterative([1n, null]), TypeError);
			assert.throws(() => productBigIntIterative([1n, undefined]), TypeError);
			assert.throws(() => productBigIntIterative([1n, NaN]), TypeError);
			assert.throws(() => productBigIntIterative([1n, {}]), TypeError);

			// Sparse array hole yields undefined
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [2n, , 3n];
			assert.throws(() => productBigIntIterative(sparse), TypeError);

			// Must still validate elements occurring after 0n
			assert.throws(() => productBigIntIterative([0n, 'bad']), TypeError);
			assert.throws(() => productBigIntIterative([0n, 1]), TypeError);
		});
	});

	describe('cross-checks against independent computations', () => {
		it('matches exact factorial 25! computed independently', () => {
			const seq = [];
			for (let i = 1n; i <= 25n; i += 1n) {
				seq.push(i);
			}
			const expected25Factorial = 15511210043330985984000000n;
			assert.equal(productBigIntIterative(seq), expected25Factorial);
		});

		it('satisfies algebraic power, commutativity, and associativity identities', () => {
			// Power identity: product of k copies of b equals b^k
			for (const base of [-17n, -2n, 0n, 1n, 3n, 10n ** 9n + 7n]) {
				const k = 12;
				const repeated = new Array(k).fill(base);
				assert.equal(productBigIntIterative(repeated), base ** BigInt(k));
			}

			// Split-product associativity & reversal commutativity
			const left = [7n, -11n, 13n, 17n, -19n];
			const right = [23n, -29n, 31n, 37n];
			const combined = [...left, ...right];
			const reversed = [...combined].reverse();

			const fullProduct = productBigIntIterative(combined);
			assert.equal(
				fullProduct,
				productBigIntIterative(left) * productBigIntIterative(right)
			);
			assert.equal(fullProduct, productBigIntIterative(reversed));
		});

		it('matches independent divide-and-conquer product on large sequence', () => {
			function productDivideAndConquer(arr, lo = 0, hi = arr.length) {
				if (lo >= hi) return 1n;
				if (hi - lo === 1) return arr[lo];
				const mid = (lo + hi) >> 1;
				return (
					productDivideAndConquer(arr, lo, mid) *
					productDivideAndConquer(arr, mid, hi)
				);
			}

			// Deterministic pseudo-random BigInt sequence via LCG
			let state = 123456789n;
			const mod = 2n ** 31n - 1n;
			const values = [];
			for (let i = 0; i < 64; i += 1) {
				state = (1103515245n * state + 12345n) % mod;
				const signed = i % 3 === 0 ? -state : state;
				values.push(signed === 0n ? 1n : signed);
			}

			assert.equal(
				productBigIntIterative(values),
				productDivideAndConquer(values)
			);
		});

		it('agrees with floating-point exp(sum(ln(x))) reference on positive integers', () => {
			const values = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n];
			const exact = productBigIntIterative(values);
			const logSum = values.reduce((acc, v) => acc + Math.log(Number(v)), 0);
			const floatApprox = Math.round(Math.exp(logSum));
			assert.equal(Number(exact), floatApprox);
		});
	});
});
