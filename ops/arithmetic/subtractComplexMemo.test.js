import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractComplexMemo } from './subtractComplexMemo.js';

describe('subtractComplexMemo', () => {
	describe('normal cases', () => {
		it('subtracts positive complex numbers', () => {
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 5, im: 7 }, { re: 2, im: 3 }),
				{ re: 3, im: 4 }
			);
		});

		it('subtracts complex numbers with negative components', () => {
			assert.deepStrictEqual(
				subtractComplexMemo({ re: -5, im: -3 }, { re: -2, im: 7 }),
				{ re: -3, im: -10 }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 4, im: -6 }, { re: -9, im: -1 }),
				{ re: 13, im: -5 }
			);
		});

		it('subtracts purely real and purely imaginary numbers', () => {
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 10, im: 0 }, { re: 4, im: 0 }),
				{ re: 6, im: 0 }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 0, im: 10 }, { re: 0, im: 4 }),
				{ re: 0, im: 6 }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 3, im: 0 }, { re: 0, im: 5 }),
				{ re: 3, im: -5 }
			);
		});

		it('subtracts floating-point complex numbers', () => {
			const res = subtractComplexMemo({ re: 1.5, im: -2.25 }, { re: 0.75, im: 1.25 });
			assert.deepStrictEqual(res, { re: 0.75, im: -3.5 });
		});

		it('ignores extra properties on input objects and returns a clean { re, im }', () => {
			const res = subtractComplexMemo(
				{ re: 8, im: 2, label: 'z1' },
				{ re: 3, im: 5, extra: true }
			);
			assert.deepStrictEqual(res, { re: 5, im: -3 });
			assert.deepStrictEqual(Object.keys(res).sort(), ['im', 're']);
		});
	});

	describe('edge cases', () => {
		it('handles zero identities', () => {
			const z = { re: 12.5, im: -7.25 };
			const zero = { re: 0, im: 0 };
			assert.deepStrictEqual(subtractComplexMemo(z, zero), { re: 12.5, im: -7.25 });
			assert.deepStrictEqual(subtractComplexMemo(zero, z), { re: -12.5, im: 7.25 });
			assert.deepStrictEqual(subtractComplexMemo(z, z), { re: 0, im: 0 });
		});

		it('handles precomputed table boundary values (-32, 32) and adjacent values (-33, 33)', () => {
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 32, im: -32 }, { re: -32, im: 32 }),
				{ re: 64, im: -64 }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: -32, im: 32 }, { re: 32, im: -32 }),
				{ re: -64, im: 64 }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 33, im: -33 }, { re: -33, im: 33 }),
				{ re: 66, im: -66 }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 32, im: 33 }, { re: -33, im: -32 }),
				{ re: 65, im: 65 }
			);
		});

		it('distinguishes -0 from +0 accurately without cache collision', () => {
			const negZeroMinusPosZero = subtractComplexMemo({ re: -0, im: 0 }, { re: 0, im: 0 });
			const posZeroMinusPosZero = subtractComplexMemo({ re: 0, im: 0 }, { re: 0, im: 0 });
			assert.ok(Object.is(negZeroMinusPosZero.re, -0));
			assert.ok(Object.is(posZeroMinusPosZero.re, 0));
			// Re-query both to ensure memoized cache hits keep them distinct
			assert.ok(Object.is(subtractComplexMemo({ re: -0, im: 0 }, { re: 0, im: 0 }).re, -0));
			assert.ok(Object.is(subtractComplexMemo({ re: 0, im: 0 }, { re: 0, im: 0 }).re, 0));
		});

		it('handles large finite numbers and subnormals', () => {
			assert.deepStrictEqual(
				subtractComplexMemo(
					{ re: Number.MAX_SAFE_INTEGER, im: Number.MIN_VALUE },
					{ re: 1, im: 0 }
				),
				{ re: Number.MAX_SAFE_INTEGER - 1, im: Number.MIN_VALUE }
			);
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 1e300, im: -1e300 }, { re: 1e300, im: -1e300 }),
				{ re: 0, im: 0 }
			);
		});

		it('throws RangeError when subtraction overflows to Infinity or -Infinity', () => {
			assert.throws(
				() => subtractComplexMemo({ re: Number.MAX_VALUE, im: 0 }, { re: -Number.MAX_VALUE, im: 0 }),
				RangeError
			);
			assert.throws(
				() => subtractComplexMemo({ re: 0, im: -Number.MAX_VALUE }, { re: 0, im: Number.MAX_VALUE }),
				RangeError
			);
		});

		it('preserves cache integrity when callers mutate returned objects', () => {
			const first = subtractComplexMemo({ re: 11, im: 22 }, { re: 4, im: 5 });
			assert.deepStrictEqual(first, { re: 7, im: 17 });
			first.re = 9999;
			first.im = -9999;

			const second = subtractComplexMemo({ re: 11, im: 22 }, { re: 4, im: 5 });
			assert.deepStrictEqual(second, { re: 7, im: 17 });
			assert.notStrictEqual(first, second);
		});

		it('handles LRU cache eviction smoothly beyond 4096 distinct entries', () => {
			for (let i = 0; i < 4500; i++) {
				const res = subtractComplexMemo({ re: i + 100, im: -i }, { re: i, im: 2 * i });
				assert.deepStrictEqual(res, { re: 100, im: -3 * i });
			}
			// Re-verify an evicted early entry recomputes accurately
			assert.deepStrictEqual(
				subtractComplexMemo({ re: 100, im: 0 }, { re: 0, im: 0 }),
				{ re: 100, im: 0 }
			);
		});
	});

	describe('input validation', () => {
		it('rejects missing or non-object operands with TypeError', () => {
			const invalidOperands = [
				undefined,
				null,
				42,
				'1+2i',
				true,
				false,
				Symbol('z'),
				10n,
				[1, 2],
				() => ({ re: 1, im: 2 })
			];
			const valid = { re: 1, im: 2 };

			assert.throws(() => subtractComplexMemo(), TypeError);
			assert.throws(() => subtractComplexMemo(valid), TypeError);

			for (const bad of invalidOperands) {
				assert.throws(() => subtractComplexMemo(bad, valid), TypeError);
				assert.throws(() => subtractComplexMemo(valid, bad), TypeError);
			}
		});

		it('rejects objects with missing or non-numeric re/im properties with TypeError', () => {
			const invalidObjects = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: null, im: 2 },
				{ re: 1, im: undefined },
				{ re: true, im: 0 },
				{ re: 0, im: 1n }
			];
			const valid = { re: 1, im: 2 };

			for (const bad of invalidObjects) {
				assert.throws(() => subtractComplexMemo(bad, valid), TypeError);
				assert.throws(() => subtractComplexMemo(valid, bad), TypeError);
			}
		});

		it('rejects non-finite re/im components (NaN, Infinity, -Infinity) with RangeError', () => {
			const nonFinite = [NaN, Infinity, -Infinity];
			const valid = { re: 1, im: 2 };

			for (const badNum of nonFinite) {
				assert.throws(() => subtractComplexMemo({ re: badNum, im: 0 }, valid), RangeError);
				assert.throws(() => subtractComplexMemo({ re: 0, im: badNum }, valid), RangeError);
				assert.throws(() => subtractComplexMemo(valid, { re: badNum, im: 0 }), RangeError);
				assert.throws(() => subtractComplexMemo(valid, { re: 0, im: badNum }), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches algebraic identities: anti-commutativity, additive inverse, and law of cosines in C', () => {
			// Deterministic PRNG (Mulberry32) for reproducible coverage across integers and floats
			let seed = 0x5eed1234;
			const nextRand = () => {
				seed |= 0;
				seed = (seed + 0x6d2b79f5) | 0;
				let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};

			const samples = [];
			// Table-range integers
			for (let i = 0; i < 40; i++) {
				samples.push({
					re: Math.floor(nextRand() * 65) - 32,
					im: Math.floor(nextRand() * 65) - 32
				});
			}
			// Out-of-table floats
			for (let i = 0; i < 40; i++) {
				samples.push({
					re: (nextRand() - 0.5) * 1000,
					im: (nextRand() - 0.5) * 1000
				});
			}

			for (let i = 0; i < samples.length - 1; i++) {
				const a = samples[i];
				const b = samples[i + 1];

				const diff = subtractComplexMemo(a, b);
				const revDiff = subtractComplexMemo(b, a);

				// 1. Direct reference check
				assert.strictEqual(diff.re, a.re - b.re);
				assert.strictEqual(diff.im, a.im - b.im);

				// 2. Anti-commutativity: (a - b) === -(b - a)
				assert.strictEqual(diff.re, -revDiff.re === 0 ? 0 : -revDiff.re);
				assert.strictEqual(diff.im, -revDiff.im === 0 ? 0 : -revDiff.im);

				// 3. Inverse of addition: (a - b) + b ≈ a
				assert.ok(Math.abs(diff.re + b.re - a.re) <= 1e-11);
				assert.ok(Math.abs(diff.im + b.im - a.im) <= 1e-11);

				// 4. Law of cosines / inner-product identity in the complex plane:
				//    |a - b|^2 = |a|^2 + |b|^2 - 2 * Re(a * conj(b))
				const lhs = diff.re * diff.re + diff.im * diff.im;
				const rhs =
					a.re * a.re +
					a.im * a.im +
					(b.re * b.re + b.im * b.im) -
					2 * (a.re * b.re + a.im * b.im);
				const scale = Math.max(1, Math.abs(lhs), Math.abs(rhs));
				assert.ok(Math.abs(lhs - rhs) <= 1e-11 * scale);

				// 5. Repeat call (memoized hit) agrees strictly
				assert.deepStrictEqual(subtractComplexMemo(a, b), diff);
			}
		});
	});
});
