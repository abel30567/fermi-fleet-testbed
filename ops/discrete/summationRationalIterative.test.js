import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationRationalIterative } from './summationRationalIterative.js';

describe('summationRationalIterative', () => {
	describe('normal cases', () => {
		it('sums simple fractions and reduces to lowest terms', () => {
			assert.deepEqual(
				summationRationalIterative([
					{ num: 1n, den: 2n },
					{ num: 1n, den: 3n },
				]),
				{ num: 5n, den: 6n }
			);

			assert.deepEqual(
				summationRationalIterative([
					{ num: 1n, den: 6n },
					{ num: 1n, den: 3n },
				]),
				{ num: 1n, den: 2n }
			);
		});

		it('computes exact harmonic numbers H_n', () => {
			// H_5 = 1 + 1/2 + 1/3 + 1/4 + 1/5 = 137/60
			const h5 = Array.from({ length: 5 }, (_, i) => ({
				num: 1n,
				den: BigInt(i + 1),
			}));
			assert.deepEqual(summationRationalIterative(h5), { num: 137n, den: 60n });

			// H_10 = 7381/2520
			const h10 = Array.from({ length: 10 }, (_, i) => ({
				num: 1n,
				den: BigInt(i + 1),
			}));
			assert.deepEqual(summationRationalIterative(h10), { num: 7381n, den: 2520n });
		});

		it('handles mixed positive and negative rationals', () => {
			const terms = [
				{ num: 3n, den: 4n },
				{ num: -5n, den: 6n },
				{ num: 7n, den: 12n },
				{ num: -1n, den: 3n },
			];
			// 9/12 - 10/12 + 7/12 - 4/12 = 2/12 = 1/6
			assert.deepEqual(summationRationalIterative(terms), { num: 1n, den: 6n });
		});

		it('works with arbitrary iterables such as generators and Sets', () => {
			function* gen() {
				yield { num: 1n, den: 2n };
				yield { num: 1n, den: 4n };
				yield { num: 1n, den: 8n };
			}
			assert.deepEqual(summationRationalIterative(gen()), { num: 7n, den: 8n });

			const set = new Set([
				{ num: 2n, den: 5n },
				{ num: 3n, den: 10n },
			]);
			assert.deepEqual(summationRationalIterative(set), { num: 7n, den: 10n });
		});

		it('handles large BigInt numerators and denominators exactly', () => {
			const big = 10n ** 30n;
			const result = summationRationalIterative([
				{ num: 1n, den: big },
				{ num: 2n, den: big },
				{ num: big - 3n, den: big },
			]);
			assert.deepEqual(result, { num: 1n, den: 1n });
		});
	});

	describe('edge cases', () => {
		it('returns { num: 0n, den: 1n } for an empty array or empty generator', () => {
			assert.deepEqual(summationRationalIterative([]), { num: 0n, den: 1n });

			function* emptyGen() {}
			assert.deepEqual(summationRationalIterative(emptyGen()), { num: 0n, den: 1n });
		});

		it('handles a single element and normalizes it to lowest terms', () => {
			assert.deepEqual(summationRationalIterative([{ num: 6n, den: 9n }]), {
				num: 2n,
				den: 3n,
			});
			assert.deepEqual(summationRationalIterative([{ num: 0n, den: 7n }]), {
				num: 0n,
				den: 1n,
			});
			assert.deepEqual(summationRationalIterative([{ num: 0n, den: -7n }]), {
				num: 0n,
				den: 1n,
			});
		});

		it('normalizes negative denominators and unreduced inputs', () => {
			assert.deepEqual(
				summationRationalIterative([
					{ num: 12n, den: -18n }, // -2/3
					{ num: -10n, den: -15n }, // +2/3
					{ num: 4n, den: -8n }, // -1/2
				]),
				{ num: -1n, den: 2n }
			);
		});

		it('handles exact cancellation to canonical zero { num: 0n, den: 1n }', () => {
			assert.deepEqual(
				summationRationalIterative([
					{ num: 1n, den: 3n },
					{ num: 1n, den: 6n },
					{ num: -1n, den: 2n },
				]),
				{ num: 0n, den: 1n }
			);

			// Cancellation mid-sum followed by another term
			assert.deepEqual(
				summationRationalIterative([
					{ num: 5n, den: 7n },
					{ num: -5n, den: 7n },
					{ num: 2n, den: 9n },
				]),
				{ num: 2n, den: 9n }
			);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-iterable or primitive inputs', () => {
			for (const bad of [null, undefined, 42, 42n, true, '1/2', {}, () => {}]) {
				assert.throws(() => summationRationalIterative(bad), TypeError);
			}
		});

		it('throws TypeError for malformed term elements', () => {
			assert.throws(() => summationRationalIterative([null]), TypeError);
			assert.throws(() => summationRationalIterative([undefined]), TypeError);
			assert.throws(() => summationRationalIterative([1]), TypeError);
			assert.throws(() => summationRationalIterative([{ num: 1, den: 2n }]), TypeError);
			assert.throws(() => summationRationalIterative([{ num: 1n, den: 2 }]), TypeError);
			assert.throws(() => summationRationalIterative([{ num: '1', den: 2n }]), TypeError);
			assert.throws(() => summationRationalIterative([{ num: 1n }]), TypeError);
		});

		it('throws RangeError for zero denominator, even when numerator is 0n', () => {
			assert.throws(() => summationRationalIterative([{ num: 1n, den: 0n }]), RangeError);
			assert.throws(() => summationRationalIterative([{ num: 0n, den: 0n }]), RangeError);
			assert.throws(
				() =>
					summationRationalIterative([
						{ num: 1n, den: 2n },
						{ num: 3n, den: 0n },
					]),
				RangeError
			);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches telescoping series sum_{k=1}^{n} 1/(k*(k+1)) = n/(n+1)', () => {
			for (const n of [1, 5, 20, 100]) {
				const terms = [];
				for (let k = 1n; k <= BigInt(n); k += 1n) {
					terms.push({ num: 1n, den: k * (k + 1n) });
				}
				assert.deepEqual(summationRationalIterative(terms), {
					num: BigInt(n),
					den: BigInt(n + 1),
				});
			}
		});

		it('is invariant under reverse-order summation', () => {
			const terms = [];
			for (let k = 1n; k <= 40n; k += 1n) {
				const sign = k % 2n === 0n ? -1n : 1n;
				terms.push({ num: sign * (2n * k + 1n), den: k * k + 3n });
			}
			const forward = summationRationalIterative(terms);
			const reversed = summationRationalIterative([...terms].reverse());
			assert.deepEqual(forward, reversed);
			assert.ok(forward.den > 0n);
		});

		it('matches closed-form geometric series sum_{k=0}^{n-1} (1/3)^k = (3^n - 1) / (2 * 3^(n-1))', () => {
			const n = 25n;
			const terms = [];
			let denom = 1n;
			for (let k = 0n; k < n; k += 1n) {
				terms.push({ num: 1n, den: denom });
				denom *= 3n;
			}
			// (3^25 - 1) / (2 * 3^24) is already in lowest terms because 3^25 - 1 is even,
			// so divide numerator and denominator by 2: ((3^25 - 1) / 2) / 3^24
			const expectedNum = (3n ** n - 1n) / 2n;
			const expectedDen = 3n ** (n - 1n);
			assert.deepEqual(summationRationalIterative(terms), {
				num: expectedNum,
				den: expectedDen,
			});
		});
	});
});
