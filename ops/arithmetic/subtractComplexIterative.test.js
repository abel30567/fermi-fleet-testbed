import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { subtractComplexIterative } from './subtractComplexIterative.js';

function addComplexRef(x, y) {
	return { re: x.re + y.re, im: x.im + y.im };
}

function negateComplexRef(z) {
	return { re: z.re === 0 ? 0 : -z.re, im: z.im === 0 ? 0 : -z.im };
}

function approxEqualComplex(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real mismatch: expected ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag mismatch: expected ${expected.im}, got ${actual.im}`
	);
}

describe('subtractComplexIterative', () => {
	describe('normal cases', () => {
		test('subtracts two positive complex numbers', () => {
			assert.deepStrictEqual(
				subtractComplexIterative({ re: 5, im: 7 }, { re: 2, im: 3 }),
				{ re: 3, im: 4 }
			);
		});

		test('subtracts complex numbers with negative and mixed signs', () => {
			assert.deepStrictEqual(
				subtractComplexIterative({ re: -3, im: 4 }, { re: 5, im: -6 }),
				{ re: -8, im: 10 }
			);
			assert.deepStrictEqual(
				subtractComplexIterative({ re: -10, im: -20 }, { re: -4, im: -25 }),
				{ re: -6, im: 5 }
			);
		});

		test('subtracts floating-point complex numbers', () => {
			assert.deepStrictEqual(
				subtractComplexIterative({ re: 1.5, im: 2.25 }, { re: 0.5, im: 1.75 }),
				{ re: 1, im: 0.5 }
			);
			approxEqualComplex(
				subtractComplexIterative({ re: 0.3, im: 0.7 }, { re: 0.1, im: 0.2 }),
				{ re: 0.2, im: 0.5 }
			);
		});

		test('subtracts purely real and purely imaginary numbers', () => {
			assert.deepStrictEqual(
				subtractComplexIterative({ re: 9, im: 0 }, { re: 4, im: 0 }),
				{ re: 5, im: 0 }
			);
			assert.deepStrictEqual(
				subtractComplexIterative({ re: 0, im: 9 }, { re: 0, im: 12 }),
				{ re: 0, im: -3 }
			);
		});

		test('iteratively subtracts multiple complex numbers left-to-right', () => {
			assert.deepStrictEqual(
				subtractComplexIterative(
					{ re: 20, im: 15 },
					{ re: 3, im: 2 },
					{ re: 5, im: -4 },
					{ re: 2, im: 7 }
				),
				{ re: 10, im: 10 }
			);
		});

		test('does not mutate input objects', () => {
			const a = { re: 8, im: -3 };
			const b = { re: 2, im: 5 };
			const result = subtractComplexIterative(a, b);
			assert.deepStrictEqual(result, { re: 6, im: -8 });
			assert.deepStrictEqual(a, { re: 8, im: -3 });
			assert.deepStrictEqual(b, { re: 2, im: 5 });
			assert.notStrictEqual(result, a);
			assert.notStrictEqual(result, b);
		});
	});

	describe('edge cases', () => {
		test('handles additive identity (zero)', () => {
			const z = { re: 4.5, im: -7.25 };
			const zero = { re: 0, im: 0 };
			assert.deepStrictEqual(subtractComplexIterative(z, zero), { re: 4.5, im: -7.25 });
			assert.deepStrictEqual(subtractComplexIterative(zero, z), { re: -4.5, im: 7.25 });
			assert.deepStrictEqual(subtractComplexIterative(zero, zero), { re: 0, im: 0 });
		});

		test('self-subtraction yields zero', () => {
			const z = { re: -123.456, im: 789.012 };
			assert.deepStrictEqual(subtractComplexIterative(z, z), { re: 0, im: 0 });
		});

		test('normalizes negative zero components to +0', () => {
			const res = subtractComplexIterative({ re: -0, im: -0 }, { re: 0, im: 0 });
			assert.deepStrictEqual(res, { re: 0, im: 0 });
			assert.ok(Object.is(res.re, 0));
			assert.ok(Object.is(res.im, 0));
		});

		test('handles large finite values that cancel without overflowing', () => {
			assert.deepStrictEqual(
				subtractComplexIterative(
					{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE },
					{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE }
				),
				{ re: 0, im: 0 }
			);
		});

		test('accepts objects with extra properties and returns plain { re, im }', () => {
			const result = subtractComplexIterative(
				{ re: 3, im: 4, tag: 'a' },
				{ re: 1, im: 2, extra: true }
			);
			assert.deepStrictEqual(result, { re: 2, im: 2 });
			assert.deepStrictEqual(Object.keys(result).sort(), ['im', 're']);
		});
	});

	describe('invalid input validation', () => {
		test('throws TypeError when required arguments are missing', () => {
			assert.throws(() => subtractComplexIterative(), TypeError);
			assert.throws(() => subtractComplexIterative({ re: 1, im: 2 }), TypeError);
		});

		test('throws TypeError for non-object or array arguments', () => {
			const valid = { re: 1, im: 2 };
			for (const bad of [null, undefined, 42, '1+2i', true, [1, 2], () => {}]) {
				assert.throws(() => subtractComplexIterative(bad, valid), TypeError);
				assert.throws(() => subtractComplexIterative(valid, bad), TypeError);
			}
		});

		test('throws TypeError when re or im is missing or not a number', () => {
			const valid = { re: 1, im: 2 };
			const malformed = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: null, im: 2 },
				{ re: 1, im: undefined },
				{ re: 1n, im: 2 }
			];
			for (const bad of malformed) {
				assert.throws(() => subtractComplexIterative(bad, valid), TypeError);
				assert.throws(() => subtractComplexIterative(valid, bad), TypeError);
			}
		});

		test('throws RangeError for NaN or infinite components', () => {
			const valid = { re: 1, im: 2 };
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity }
			];
			for (const bad of nonFinite) {
				assert.throws(() => subtractComplexIterative(bad, valid), RangeError);
				assert.throws(() => subtractComplexIterative(valid, bad), RangeError);
			}
		});

		test('validates variadic arguments beyond the second parameter', () => {
			const valid = { re: 1, im: 2 };
			assert.throws(() => subtractComplexIterative(valid, valid, null), TypeError);
			assert.throws(() => subtractComplexIterative(valid, valid, { re: 1, im: 'x' }), TypeError);
			assert.throws(() => subtractComplexIterative(valid, valid, { re: Infinity, im: 0 }), RangeError);
		});

		test('throws RangeError when subtraction overflows to non-finite values', () => {
			assert.throws(
				() =>
					subtractComplexIterative(
						{ re: Number.MAX_VALUE, im: 0 },
						{ re: -Number.MAX_VALUE, im: 0 }
					),
				RangeError
			);
			assert.throws(
				() =>
					subtractComplexIterative(
						{ re: 0, im: -Number.MAX_VALUE },
						{ re: 0, im: Number.MAX_VALUE }
					),
				RangeError
			);
		});
	});

	describe('independent mathematical cross-checks', () => {
		const samples = [
			{ re: 0, im: 0 },
			{ re: 3, im: 4 },
			{ re: -7, im: 2 },
			{ re: 5.25, im: -11.5 },
			{ re: -0.75, im: -0.125 },
			{ re: 100, im: -250 }
		];

		test('inverse of complex addition: (a - b) + b == a', () => {
			for (const a of samples) {
				for (const b of samples) {
					const diff = subtractComplexIterative(a, b);
					const recovered = addComplexRef(diff, b);
					approxEqualComplex(recovered, a);
				}
			}
		});

		test('anti-commutativity: a - b == -(b - a)', () => {
			for (const a of samples) {
				for (const b of samples) {
					const ab = subtractComplexIterative(a, b);
					const ba = subtractComplexIterative(b, a);
					assert.deepStrictEqual(ab, negateComplexRef(ba));
				}
			}
		});

		test('equivalence to adding additive inverse: a - b == a + (-b)', () => {
			for (const a of samples) {
				for (const b of samples) {
					const diff = subtractComplexIterative(a, b);
					const viaNegation = addComplexRef(a, negateComplexRef(b));
					approxEqualComplex(diff, viaNegation);
				}
			}
		});

		test('variadic subtraction matches subtracting the sum of all subtrahends', () => {
			const a = { re: 50.5, im: -30.25 };
			const terms = [
				{ re: 4.25, im: -7.5 },
				{ re: -12, im: 3.75 },
				{ re: 8.5, im: 11.25 },
				{ re: -2.25, im: -9 }
			];
			const iterativeResult = subtractComplexIterative(a, ...terms);
			const sumOfTerms = terms.reduce(addComplexRef, { re: 0, im: 0 });
			const directResult = subtractComplexIterative(a, sumOfTerms);
			approxEqualComplex(iterativeResult, directResult);
		});

		test('satisfies complex metric triangle inequality: |a - c| <= |a - b| + |b - c|', () => {
			const norm = (z) => Math.hypot(z.re, z.im);
			for (const a of samples) {
				for (const b of samples) {
					for (const c of samples) {
						const ac = norm(subtractComplexIterative(a, c));
						const ab = norm(subtractComplexIterative(a, b));
						const bc = norm(subtractComplexIterative(b, c));
						assert.ok(ac <= ab + bc + 1e-12);
					}
				}
			}
		});
	});
});
