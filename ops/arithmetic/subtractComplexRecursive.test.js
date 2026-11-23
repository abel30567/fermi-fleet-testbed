import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractComplexRecursive } from './subtractComplexRecursive.js';

describe('subtractComplexRecursive', () => {
	describe('normal cases', () => {
		it('subtracts two positive complex numbers', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: 5, im: 7 }, { re: 2, im: 3 }),
				{ re: 3, im: 4 },
			);
		});

		it('subtracts complex numbers with negative components', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: -3, im: -4 }, { re: -5, im: 2 }),
				{ re: 2, im: -6 },
			);
		});

		it('subtracts floating-point complex numbers', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: 1.5, im: 2.25 }, { re: 0.5, im: -0.75 }),
				{ re: 1, im: 3 },
			);
		});

		it('handles purely real and purely imaginary operands', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: 8, im: 0 }, { re: 0, im: 5 }),
				{ re: 8, im: -5 },
			);
		});

		it('supports variadic divide-and-conquer subtraction of multiple subtrahends', () => {
			const result = subtractComplexRecursive(
				{ re: 20, im: 15 },
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: 5, im: -1 },
				{ re: 2, im: 3 },
			);
			assert.deepStrictEqual(result, { re: 9, im: 7 });
		});

		it('does not mutate inputs and returns a plain { re, im } object', () => {
			const a = Object.freeze({ re: 4, im: 9, extra: 'ignored' });
			const b = Object.freeze({ re: 1, im: 2, tag: 42 });
			const result = subtractComplexRecursive(a, b);
			assert.deepStrictEqual(result, { re: 3, im: 7 });
			assert.deepStrictEqual(Object.keys(result), ['re', 'im']);
		});
	});

	describe('edge cases', () => {
		it('treats { re: 0, im: 0 } as right identity', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: -7.5, im: 3.25 }, { re: 0, im: 0 }),
				{ re: -7.5, im: 3.25 },
			);
		});

		it('returns zero when subtracting a complex number from itself', () => {
			const z = { re: 123.456, im: -789.012 };
			assert.deepStrictEqual(subtractComplexRecursive(z, z), { re: 0, im: 0 });
		});

		it('negates the subtrahend when subtracting from zero', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: 0, im: 0 }, { re: 6, im: -9 }),
				{ re: -6, im: 9 },
			);
		});

		it('normalizes -0 to +0 in output components', () => {
			const result = subtractComplexRecursive(
				{ re: -0, im: -0 },
				{ re: 0, im: 0 },
			);
			assert.strictEqual(Object.is(result.re, 0), true);
			assert.strictEqual(Object.is(result.im, 0), true);
		});

		it('handles very large and very small finite magnitudes', () => {
			assert.deepStrictEqual(
				subtractComplexRecursive({ re: 1e15, im: 1e-12 }, { re: 1e15, im: 0 }),
				{ re: 0, im: 1e-12 },
			);
			assert.deepStrictEqual(
				subtractComplexRecursive(
					{ re: Number.MIN_VALUE, im: 0 },
					{ re: Number.MIN_VALUE, im: 0 },
				),
				{ re: 0, im: 0 },
			);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when required arguments are missing', () => {
			assert.throws(() => subtractComplexRecursive(), TypeError);
			assert.throws(() => subtractComplexRecursive({ re: 1, im: 2 }), TypeError);
		});

		it('throws TypeError for null, primitives, or arrays', () => {
			const badValues = [null, undefined, 42, '1+2i', true, [1, 2]];
			for (const bad of badValues) {
				assert.throws(() => subtractComplexRecursive(bad, { re: 0, im: 0 }), TypeError);
				assert.throws(() => subtractComplexRecursive({ re: 0, im: 0 }, bad), TypeError);
			}
		});

		it('throws TypeError when re or im is missing or non-numeric', () => {
			const badComplex = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{ re: true, im: 0 },
				{ re: 0, im: undefined },
			];
			for (const bad of badComplex) {
				assert.throws(() => subtractComplexRecursive(bad, { re: 1, im: 1 }), TypeError);
				assert.throws(() => subtractComplexRecursive({ re: 1, im: 1 }, bad), TypeError);
			}
		});

		it('throws RangeError for NaN or infinite components', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			];
			for (const bad of nonFinite) {
				assert.throws(() => subtractComplexRecursive(bad, { re: 0, im: 0 }), RangeError);
				assert.throws(() => subtractComplexRecursive({ re: 0, im: 0 }, bad), RangeError);
			}
		});

		it('validates variadic rest arguments', () => {
			assert.throws(
				() => subtractComplexRecursive({ re: 1, im: 1 }, { re: 1, im: 1 }, { re: NaN, im: 0 }),
				RangeError,
			);
			assert.throws(
				() => subtractComplexRecursive({ re: 1, im: 1 }, { re: 1, im: 1 }, null),
				TypeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches direct reference subtraction and algebraic identities across deterministic samples', () => {
			// Deterministic LCG for reproducible integer-grid complex numbers (exact in IEEE-754)
			let state = 0x5eed1234;
			const nextInt = () => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				return (state % 2001) - 1000;
			};

			const directSubtract = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
			const normSq = (z) => z.re * z.re + z.im * z.im;
			const dot = (x, y) => x.re * y.re + x.im * y.im;

			for (let i = 0; i < 100; i += 1) {
				const a = { re: nextInt(), im: nextInt() };
				const b = { re: nextInt(), im: nextInt() };

				const diff = subtractComplexRecursive(a, b);
				const expected = directSubtract(a, b);
				assert.deepStrictEqual(diff, expected);

				// Anticommutativity: a - b = -(b - a)
				const reverse = subtractComplexRecursive(b, a);
				assert.strictEqual(diff.re, reverse.re === 0 ? 0 : -reverse.re);
				assert.strictEqual(diff.im, reverse.im === 0 ? 0 : -reverse.im);

				// Inverse of addition: (a - b) + b = a
				assert.strictEqual(diff.re + b.re, a.re);
				assert.strictEqual(diff.im + b.im, a.im);

				// Law of cosines in C: |a - b|^2 = |a|^2 + |b|^2 - 2 Re(a * conj(b))
				assert.strictEqual(normSq(diff), normSq(a) + normSq(b) - 2 * dot(a, b));
			}
		});

		it('matches sequential fold subtraction for multi-argument calls', () => {
			const operands = [
				{ re: 100, im: -50 },
				{ re: 12, im: 7 },
				{ re: -8, im: 19 },
				{ re: 33, im: -4 },
				{ re: 5, im: 11 },
				{ re: -21, im: -6 },
				{ re: 9, im: 2 },
			];

			const recursiveResult = subtractComplexRecursive(...operands);
			const foldResult = operands.slice(1).reduce(
				(acc, cur) => ({ re: acc.re - cur.re, im: acc.im - cur.im }),
				operands[0],
			);
			assert.deepStrictEqual(recursiveResult, foldResult);
		});
	});
});
