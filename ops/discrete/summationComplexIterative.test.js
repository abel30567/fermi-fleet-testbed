import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationComplexIterative } from './summationComplexIterative.js';

/**
 * Helper to assert two complex numbers are approximately equal.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-10]
 */
function assertComplexClose(actual, expected, eps = 1e-10) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Real part mismatch: expected ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Imaginary part mismatch: expected ${expected.im}, got ${actual.im}`
	);
}

/**
 * Helper for complex multiplication (a * b).
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Helper for complex division (a / b).
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im;
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	};
}

describe('summationComplexIterative', () => {
	describe('normal cases', () => {
		it('sums multiple complex numbers with positive and negative parts', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: 3, im: -4 },
				{ re: -2, im: 5 },
			];
			assert.deepStrictEqual(summationComplexIterative(input), { re: 2, im: 3 });
		});

		it('sums purely real complex numbers', () => {
			const input = [
				{ re: 1.5, im: 0 },
				{ re: 2.5, im: 0 },
				{ re: -4, im: 0 },
			];
			assert.deepStrictEqual(summationComplexIterative(input), { re: 0, im: 0 });
		});

		it('sums purely imaginary complex numbers', () => {
			const input = [
				{ re: 0, im: 3 },
				{ re: 0, im: -7 },
				{ re: 0, im: 10 },
			];
			assert.deepStrictEqual(summationComplexIterative(input), { re: 0, im: 6 });
		});

		it('does not mutate the input array or its elements', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
			];
			const snapshot = structuredClone(input);
			summationComplexIterative(input);
			assert.deepStrictEqual(input, snapshot);
		});
	});

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for an empty array', () => {
			assert.deepStrictEqual(summationComplexIterative([]), { re: 0, im: 0 });
		});

		it('returns an equal copy for a single-element array', () => {
			const single = { re: -3.25, im: 7.5 };
			const result = summationComplexIterative([single]);
			assert.deepStrictEqual(result, single);
			assert.notStrictEqual(result, single);
		});

		it('normalizes -0 to +0 in the result', () => {
			const result = summationComplexIterative([
				{ re: -0, im: -0 },
				{ re: -0, im: -0 },
			]);
			assert.ok(Object.is(result.re, 0));
			assert.ok(Object.is(result.im, 0));
		});

		it('handles exact cancellation to zero', () => {
			const input = [
				{ re: 12345.678, im: -98765.432 },
				{ re: -12345.678, im: 98765.432 },
			];
			assert.deepStrictEqual(summationComplexIterative(input), { re: 0, im: 0 });
		});

		it('handles extra properties on complex objects', () => {
			const input = [
				{ re: 1, im: 2, label: 'a' },
				{ re: 3, im: 4, label: 'b' },
			];
			assert.deepStrictEqual(summationComplexIterative(input), { re: 4, im: 6 });
		});
	});

	describe('input validation', () => {
		it('throws TypeError when input is not an array', () => {
			for (const invalid of [null, undefined, 42, '1+2i', { re: 1, im: 2 }, () => {}]) {
				assert.throws(
					() => summationComplexIterative(invalid),
					TypeError
				);
			}
		});

		it('throws TypeError when an element is not a plain complex object', () => {
			for (const badItem of [null, undefined, 5, '1+i', [1, 2], true]) {
				assert.throws(
					() => summationComplexIterative([{ re: 1, im: 1 }, badItem]),
					TypeError
				);
			}
		});

		it('throws TypeError for sparse arrays with holes', () => {
			const sparse = [{ re: 1, im: 2 }, , { re: 3, im: 4 }]; // eslint-disable-line no-sparse-arrays
			assert.throws(() => summationComplexIterative(sparse), TypeError);
		});

		it('throws TypeError when re or im is missing or non-numeric', () => {
			const badItems = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{ re: 1n, im: 2 },
			];
			for (const badItem of badItems) {
				assert.throws(
					() => summationComplexIterative([badItem]),
					TypeError
				);
			}
		});

		it('throws RangeError when re or im is NaN or infinite', () => {
			const nonFiniteItems = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity },
			];
			for (const badItem of nonFiniteItems) {
				assert.throws(
					() => summationComplexIterative([badItem]),
					RangeError
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches closed-form arithmetic series sum_{k=1}^N k*(a + b*i)', () => {
			const n = 100;
			const a = 3;
			const b = -5;
			const terms = Array.from({ length: n }, (_, idx) => {
				const k = idx + 1;
				return { re: k * a, im: k * b };
			});
			const tri = (n * (n + 1)) / 2;
			assert.deepStrictEqual(summationComplexIterative(terms), {
				re: tri * a,
				im: tri * b,
			});
		});

		it('matches closed-form complex geometric series (1 - z^N) / (1 - z)', () => {
			const z = { re: 0.5, im: 0.25 };
			const n = 12;
			const terms = [];
			let power = { re: 1, im: 0 };
			for (let k = 0; k < n; k++) {
				terms.push(power);
				power = complexMul(power, z);
			}
			// power is now z^n
			const numerator = { re: 1 - power.re, im: -power.im };
			const denominator = { re: 1 - z.re, im: -z.im };
			const closedForm = complexDiv(numerator, denominator);

			assertComplexClose(summationComplexIterative(terms), closedForm, 1e-12);
		});

		it('satisfies roots of unity identity: sum_{k=0}^{N-1} exp(2*pi*i*k/N) = 0', () => {
			for (const n of [2, 3, 5, 8, 17]) {
				const roots = Array.from({ length: n }, (_, k) => {
					const angle = (2 * Math.PI * k) / n;
					return { re: Math.cos(angle), im: Math.sin(angle) };
				});
				assertComplexClose(summationComplexIterative(roots), { re: 0, im: 0 }, 1e-12);
			}
		});

		it('satisfies complex linearity and conjugation identities', () => {
			const terms = [
				{ re: 2, im: -3 },
				{ re: -5, im: 4 },
				{ re: 7, im: 1 },
				{ re: -1, im: -6 },
			];
			const scalar = { re: 3, im: -2 };

			const sum = summationComplexIterative(terms);

			// Linearity: sum(c * z_k) === c * sum(z_k)
			const scaledTerms = terms.map((z) => complexMul(scalar, z));
			assert.deepStrictEqual(
				summationComplexIterative(scaledTerms),
				complexMul(scalar, sum)
			);

			// Conjugation: sum(conj(z_k)) === conj(sum(z_k))
			const conjTerms = terms.map((z) => ({ re: z.re, im: -z.im }));
			assert.deepStrictEqual(
				summationComplexIterative(conjTerms),
				{ re: sum.re, im: -sum.im }
			);
		});
	});
});
