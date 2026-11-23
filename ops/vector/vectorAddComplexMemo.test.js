import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddComplexMemo } from './vectorAddComplexMemo.js';

/**
 * Independent reference implementation for cross-checking.
 * @param {Array<{re: number, im: number}>} a
 * @param {Array<{re: number, im: number}>} b
 */
function naiveComplexVectorAdd(a, b) {
	return a.map((z, i) => ({ re: z.re + b[i].re, im: z.im + b[i].im }));
}

describe('vectorAddComplexMemo', () => {
	describe('normal cases', () => {
		it('adds small integer complex vectors (hits precomputed table)', () => {
			const a = [
				{ re: 1, im: 2 },
				{ re: -3, im: 4 },
				{ re: 64, im: -64 },
			];
			const b = [
				{ re: 5, im: -1 },
				{ re: 10, im: -4 },
				{ re: -64, im: 64 },
			];
			assert.deepStrictEqual(vectorAddComplexMemo(a, b), [
				{ re: 6, im: 1 },
				{ re: 7, im: 0 },
				{ re: 0, im: 0 },
			]);
		});

		it('adds large integer and floating-point complex vectors (outside table range)', () => {
			const a = [
				{ re: 1000, im: -2500 },
				{ re: 1.5, im: -2.25 },
				{ re: 1e12, im: -0.125 },
			];
			const b = [
				{ re: -500, im: 750 },
				{ re: 0.25, im: 3.75 },
				{ re: 2e12, im: 0.375 },
			];
			assert.deepStrictEqual(vectorAddComplexMemo(a, b), [
				{ re: 500, im: -1750 },
				{ re: 1.75, im: 1.5 },
				{ re: 3e12, im: 0.25 },
			]);
		});

		it('adds single-element complex vectors', () => {
			assert.deepStrictEqual(
				vectorAddComplexMemo([{ re: 7, im: -8 }], [{ re: -2, im: 11 }]),
				[{ re: 5, im: 3 }],
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty vectors and returns a fresh array each call', () => {
			const r1 = vectorAddComplexMemo([], []);
			const r2 = vectorAddComplexMemo([], []);
			assert.deepStrictEqual(r1, []);
			assert.notStrictEqual(r1, r2);
		});

		it('satisfies additive identity with zero vectors', () => {
			const v = [
				{ re: 3.5, im: -7.25 },
				{ re: 0, im: 42 },
				{ re: -100, im: 0 },
			];
			const zero = [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			];
			assert.deepStrictEqual(vectorAddComplexMemo(v, zero), v);
			assert.deepStrictEqual(vectorAddComplexMemo(zero, v), v);
		});

		it('satisfies additive inverses (v + (-v) = 0)', () => {
			const v = [
				{ re: 12, im: -9 },
				{ re: -0.5, im: 0.125 },
				{ re: 500, im: -1000 },
			];
			const negV = v.map(({ re, im }) => ({ re: -re, im: -im }));
			assert.deepStrictEqual(vectorAddComplexMemo(v, negV), [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			]);
		});

		it('preserves IEEE-754 negative zero semantics accurately', () => {
			const a = [{ re: -0, im: -0 }];
			const b = [{ re: -0, im: 0 }];
			const res = vectorAddComplexMemo(a, b);
			assert.ok(Object.is(res[0].re, -0));
			assert.ok(Object.is(res[0].im, 0));

			const c = [{ re: 0, im: 0 }];
			const res2 = vectorAddComplexMemo(c, c);
			assert.ok(Object.is(res2[0].re, 0));
			assert.ok(Object.is(res2[0].im, 0));
		});

		it('handles repeated elements within a vector (pair cache reuse)', () => {
			const a = Array.from({ length: 20 }, () => ({ re: 3, im: -4 }));
			const b = Array.from({ length: 20 }, () => ({ re: -1, im: 6 }));
			const res = vectorAddComplexMemo(a, b);
			assert.strictEqual(res.length, 20);
			for (let i = 0; i < res.length; i++) {
				assert.deepStrictEqual(res[i], { re: 2, im: 2 });
				if (i > 0) {
					assert.notStrictEqual(res[i], res[i - 1]);
				}
			}
		});
	});

	describe('memoization, commutativity cache hits, and immutability', () => {
		it('returns fresh cloned arrays and objects on cache hits and commutative cache hits', () => {
			const a = [
				{ re: 2, im: 3 },
				{ re: -5, im: 8 },
			];
			const b = [
				{ re: 4, im: -1 },
				{ re: 9, im: 2 },
			];

			const r1 = vectorAddComplexMemo(a, b);
			const r2 = vectorAddComplexMemo(a, b);
			const r3 = vectorAddComplexMemo(b, a);

			assert.deepStrictEqual(r1, [
				{ re: 6, im: 2 },
				{ re: 4, im: 10 },
			]);
			assert.deepStrictEqual(r2, r1);
			assert.deepStrictEqual(r3, r1);

			assert.notStrictEqual(r1, r2);
			assert.notStrictEqual(r1, r3);
			assert.notStrictEqual(r1[0], r2[0]);
			assert.notStrictEqual(r1[0], r3[0]);

			// Mutate returned result and inputs; cached entries must remain intact
			r1[0].re = 9999;
			r1.push({ re: 1, im: 1 });
			const aSnapshot = a.map((z) => ({ ...z }));
			const bSnapshot = b.map((z) => ({ ...z }));
			a[0].re = -999;
			b[1].im = -999;

			const r4 = vectorAddComplexMemo(aSnapshot, bSnapshot);
			assert.deepStrictEqual(r4, [
				{ re: 6, im: 2 },
				{ re: 4, im: 10 },
			]);
		});

		it('handles cache eviction smoothly beyond cache capacity', () => {
			for (let k = 0; k < 600; k++) {
				const a = [{ re: k, im: -k }];
				const b = [{ re: k + 1, im: 2 * k }];
				assert.deepStrictEqual(vectorAddComplexMemo(a, b), [
					{ re: 2 * k + 1, im: k },
				]);
			}
			// Re-query an evicted early entry to verify recomputation matches
			assert.deepStrictEqual(
				vectorAddComplexMemo([{ re: 0, im: 0 }], [{ re: 1, im: 0 }]),
				[{ re: 1, im: 0 }],
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 2 }, new Set()]) {
				assert.throws(() => vectorAddComplexMemo(bad, []), TypeError);
				assert.throws(() => vectorAddComplexMemo([], bad), TypeError);
			}
		});

		it('throws RangeError on vector length mismatch', () => {
			assert.throws(
				() => vectorAddComplexMemo([{ re: 1, im: 2 }], []),
				RangeError,
			);
			assert.throws(
				() =>
					vectorAddComplexMemo(
						[{ re: 1, im: 2 }],
						[
							{ re: 3, im: 4 },
							{ re: 5, im: 6 },
						],
					),
				RangeError,
			);
		});

		it('throws TypeError for invalid complex elements', () => {
			const invalidElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: true },
			];
			const valid = [{ re: 0, im: 0 }];
			for (const el of invalidElements) {
				assert.throws(() => vectorAddComplexMemo([el], valid), TypeError);
				assert.throws(() => vectorAddComplexMemo(valid, [el]), TypeError);
			}
		});

		it('throws RangeError for non-finite re or im values', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			];
			const valid = [{ re: 1, im: 1 }];
			for (const el of nonFinite) {
				assert.throws(() => vectorAddComplexMemo([el], valid), RangeError);
				assert.throws(() => vectorAddComplexMemo(valid, [el]), RangeError);
			}
		});
	});

	describe('algebraic cross-checks', () => {
		it('satisfies commutativity (a + b = b + a) and matches naive reference', () => {
			const samples = [
				[
					{ re: 13, im: -27 },
					{ re: 0, im: 64 },
					{ re: -128.5, im: 3.25 },
				],
				[
					{ re: -64, im: 19 },
					{ re: 64, im: -64 },
					{ re: 200.75, im: -1.5 },
				],
				[
					{ re: 5, im: 5 },
					{ re: -7, im: 11 },
					{ re: 0.125, im: -0.25 },
				],
			];

			for (const a of samples) {
				for (const b of samples) {
					const ab = vectorAddComplexMemo(a, b);
					const ba = vectorAddComplexMemo(b, a);
					const expected = naiveComplexVectorAdd(a, b);
					assert.deepStrictEqual(ab, ba);
					assert.deepStrictEqual(ab, expected);
				}
			}
		});

		it('satisfies associativity ((a + b) + c = a + (b + c))', () => {
			const a = [
				{ re: 12, im: -7 },
				{ re: -100, im: 250 },
				{ re: 0.5, im: -0.25 },
			];
			const b = [
				{ re: -35, im: 18 },
				{ re: 40, im: -60 },
				{ re: 1.25, im: 0.75 },
			];
			const c = [
				{ re: 23, im: -11 },
				{ re: 60, im: -190 },
				{ re: -0.75, im: 0.5 },
			];

			const left = vectorAddComplexMemo(vectorAddComplexMemo(a, b), c);
			const right = vectorAddComplexMemo(a, vectorAddComplexMemo(b, c));
			assert.deepStrictEqual(left, right);
		});
	});
});
