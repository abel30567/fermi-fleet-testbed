import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	SCALE,
	summationBigIntIterative,
} from './summationBigIntIterative.js';

describe('summationBigIntIterative', () => {
	describe('normal cases — iterable form', () => {
		it('sums arrays of positive, negative, and mixed BigInts', () => {
			assert.equal(summationBigIntIterative([1n, 2n, 3n, 4n, 5n]), 15n);
			assert.equal(summationBigIntIterative([-10n, -20n, -30n]), -60n);
			assert.equal(summationBigIntIterative([-5n, 10n, -3n, 8n, -10n]), 0n);
		});

		it('accepts Sets, generators, and BigInt64Array iterables', () => {
			const set = new Set([10n, 20n, 30n]);
			assert.equal(summationBigIntIterative(set), 60n);

			function* fibTerms(count) {
				let a = 1n;
				let b = 1n;
				for (let i = 0; i < count; i += 1) {
					yield a;
					[a, b] = [b, a + b];
				}
			}
			// 1 + 1 + 2 + 3 + 5 + 8 + 13 = 33
			assert.equal(summationBigIntIterative(fibTerms(7)), 33n);

			const typed = new BigInt64Array([100n, -25n, 75n]);
			assert.equal(summationBigIntIterative(typed), 150n);
		});

		it('preserves exactness for 10^18-scaled fixed-point decimal sums', () => {
			// 0.1 + 0.2 === 0.3 exactly in 10^18 fixed-point (no IEEE-754 drift)
			const oneTenth = SCALE / 10n;
			const twoTenths = (2n * SCALE) / 10n;
			const threeTenths = (3n * SCALE) / 10n;
			assert.equal(
				summationBigIntIterative([oneTenth, twoTenths]),
				threeTenths,
			);
			assert.equal(
				summationBigIntIterative(Array.from({ length: 10 }, () => oneTenth)),
				SCALE,
			);
		});
	});

	describe('normal cases — sigma (index-range) form', () => {
		it('sums basic index functions over positive and negative bounds', () => {
			assert.equal(summationBigIntIterative((k) => k, 1n, 10n), 55n);
			assert.equal(summationBigIntIterative((k) => k * k, 1n, 5n), 55n);
			assert.equal(summationBigIntIterative((k) => k, -5n, 5n), 0n);
			assert.equal(summationBigIntIterative((k) => k, -4n, -1n), -10n);
		});

		it('supports custom positive step increments', () => {
			// Odd numbers 1 + 3 + 5 + 7 + 9 = 25
			assert.equal(summationBigIntIterative((k) => k, 1n, 10n, 2n), 25n);
			// Multiples of 3 from 0 to 12: 0 + 3 + 6 + 9 + 12 = 30
			assert.equal(summationBigIntIterative((k) => k, 0n, 12n, 3n), 30n);
			// Step larger than range evaluates only lower bound
			assert.equal(summationBigIntIterative((k) => k * 10n, 2n, 5n, 100n), 20n);
		});
	});

	describe('edge cases', () => {
		it('returns 0n for empty iterables and empty index ranges (lower > upper)', () => {
			assert.equal(summationBigIntIterative([]), 0n);
			assert.equal(summationBigIntIterative(new Set()), 0n);

			let called = false;
			const result = summationBigIntIterative(
				(k) => {
					called = true;
					return k;
				},
				10n,
				5n,
			);
			assert.equal(result, 0n);
			assert.equal(called, false);
		});

		it('handles singleton inputs and all-zero inputs', () => {
			assert.equal(summationBigIntIterative([0n]), 0n);
			assert.equal(summationBigIntIterative([-42n]), -42n);
			assert.equal(summationBigIntIterative([0n, 0n, 0n]), 0n);
			assert.equal(summationBigIntIterative((k) => k * 3n, 7n, 7n), 21n);
		});

		it('handles very large BigInt values without precision loss or cancellation', () => {
			const huge = 10n ** 100n;
			assert.equal(summationBigIntIterative([huge, 1n, -huge]), 1n);

			// Shift arithmetic sum by 10^30: sum_{k=base}^{base+99} k = 100*base + 4950
			const base = 10n ** 30n;
			const expected = 100n * base + 4950n;
			assert.equal(
				summationBigIntIterative((k) => k, base, base + 99n),
				expected,
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for invalid first argument (primitives, strings, objects)', () => {
			for (const bad of [null, undefined, 42, 42n, true, {}, '123', new String('123')]) {
				assert.throws(() => summationBigIntIterative(bad), TypeError);
			}
		});

		it('throws TypeError when iterable contains non-BigInt elements or sparse holes', () => {
			assert.throws(() => summationBigIntIterative([1n, 2, 3n]), TypeError);
			assert.throws(() => summationBigIntIterative(['1']), TypeError);
			assert.throws(() => summationBigIntIterative([1n, null]), TypeError);
			assert.throws(() => summationBigIntIterative([1n, Number.NaN]), TypeError);

			// Sparse array yields undefined at index 1
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1n, , 3n];
			assert.throws(() => summationBigIntIterative(sparse), TypeError);
		});

		it('throws TypeError when unexpected extra arguments are passed with an iterable', () => {
			assert.throws(() => summationBigIntIterative([1n, 2n], 0n), TypeError);
			assert.throws(
				() => summationBigIntIterative([1n, 2n], undefined, 5n),
				TypeError,
			);
		});

		it('throws TypeError for missing or non-BigInt bounds/step in sigma form', () => {
			assert.throws(() => summationBigIntIterative((k) => k), TypeError);
			assert.throws(() => summationBigIntIterative((k) => k, 1, 5n), TypeError);
			assert.throws(() => summationBigIntIterative((k) => k, 1n, 5), TypeError);
			assert.throws(() => summationBigIntIterative((k) => k, 1n, 5n, 1), TypeError);
			assert.throws(
				() => summationBigIntIterative((k) => k, 1n, 5n, null),
				TypeError,
			);
		});

		it('throws RangeError for non-positive step (including when lower > upper)', () => {
			assert.throws(
				() => summationBigIntIterative((k) => k, 1n, 5n, 0n),
				RangeError,
			);
			assert.throws(
				() => summationBigIntIterative((k) => k, 1n, 5n, -1n),
				RangeError,
			);
			assert.throws(
				() => summationBigIntIterative((k) => k, 10n, 1n, -2n),
				RangeError,
			);
		});

		it('throws TypeError if termFn returns a non-BigInt value', () => {
			assert.throws(
				() => summationBigIntIterative((k) => Number(k), 1n, 5n),
				TypeError,
			);
			assert.throws(
				() => summationBigIntIterative((k) => (k === 3n ? '3' : k), 1n, 5n),
				TypeError,
			);
			assert.throws(
				() => summationBigIntIterative(() => undefined, 1n, 1n),
				TypeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches closed-form polynomial sum identities (Gauss, squares, Nicomachus cubes)', () => {
			for (const n of [1n, 10n, 100n, 1000n]) {
				const sum1 = summationBigIntIterative((k) => k, 1n, n);
				const closed1 = (n * (n + 1n)) / 2n;
				assert.equal(sum1, closed1);

				const sum2 = summationBigIntIterative((k) => k * k, 1n, n);
				const closed2 = (n * (n + 1n) * (2n * n + 1n)) / 6n;
				assert.equal(sum2, closed2);

				const sum3 = summationBigIntIterative((k) => k * k * k, 1n, n);
				// Nicomachus's theorem: sum(k^3) = (sum(k))^2
				assert.equal(sum3, closed1 * closed1);
			}
		});

		it('matches exact closed-form geometric series far beyond MAX_SAFE_INTEGER', () => {
			const r = 3n;
			const n = 40n;
			const sumGeom = summationBigIntIterative((k) => r ** k, 0n, n);
			const closedGeom = (r ** (n + 1n) - 1n) / (r - 1n);
			assert.equal(sumGeom, closedGeom);
			assert.ok(sumGeom > BigInt(Number.MAX_SAFE_INTEGER));
		});

		it('satisfies telescoping sum, linearity, and interval-splitting identities', () => {
			const f = (k) => k * k * k + 2n * k;
			const g = (k) => 5n * k - 7n;

			// Telescoping: sum_{k=1}^{200} (f(k) - f(k-1)) = f(200) - f(0)
			const telescoping = summationBigIntIterative(
				(k) => f(k) - f(k - 1n),
				1n,
				200n,
			);
			assert.equal(telescoping, f(200n) - f(0n));

			// Linearity and interval splitting over [-50, 75] split at 10
			const p = 7n;
			const q = -13n;
			const combined = summationBigIntIterative(
				(k) => p * f(k) + q * g(k),
				-50n,
				75n,
			);
			const split =
				p *
					(summationBigIntIterative(f, -50n, 10n) +
						summationBigIntIterative(f, 11n, 75n)) +
				q * summationBigIntIterative(g, -50n, 75n);
			assert.equal(combined, split);

			// Equivalence between iterable form and sigma form
			const materialized = [];
			for (let k = -50n; k <= 75n; k += 1n) {
				materialized.push(p * f(k) + q * g(k));
			}
			assert.equal(summationBigIntIterative(materialized), combined);
		});

		it('cross-checks 10^18-scaled harmonic sum against independent floating-point computation', () => {
			const n = 200n;
			const scaledHarmonic = summationBigIntIterative(
				(k) => SCALE / k,
				1n,
				n,
			);

			let floatHarmonic = 0;
			for (let k = 1; k <= Number(n); k += 1) {
				floatHarmonic += 1 / k;
			}

			const fixedAsFloat = Number(scaledHarmonic) / Number(SCALE);
			assert.ok(
				Math.abs(fixedAsFloat - floatHarmonic) < 1e-12,
				`Expected ${fixedAsFloat} to match ${floatHarmonic} within 1e-12`,
			);
		});
	});
});
