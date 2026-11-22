import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractComplexSeries } from './subtractComplexSeries.js';

function addComplex(a, b) {
	return {
		re: a.re + b.re === 0 ? 0 : a.re + b.re,
		im: a.im + b.im === 0 ? 0 : a.im + b.im,
	};
}

function negateComplex(z) {
	return {
		re: -z.re === 0 ? 0 : -z.re,
		im: -z.im === 0 ? 0 : -z.im,
	};
}

function conjugate(z) {
	return {
		re: z.re === 0 ? 0 : z.re,
		im: -z.im === 0 ? 0 : -z.im,
	};
}

function directSubtract(a, b) {
	const re = a.re - b.re;
	const im = a.im - b.im;
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}

function assertComplexClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real mismatch: expected ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag mismatch: expected ${expected.im}, got ${actual.im}`
	);
}

describe('subtractComplexSeries', () => {
	describe('normal cases', () => {
		it('subtracts complex numbers with positive components', () => {
			assert.deepStrictEqual(
				subtractComplexSeries({ re: 5, im: 7 }, { re: 2, im: 3 }),
				{ re: 3, im: 4 }
			);
		});

		it('subtracts complex numbers across all four quadrants', () => {
			assert.deepStrictEqual(
				subtractComplexSeries({ re: -4, im: 6 }, { re: 3, im: -2 }),
				{ re: -7, im: 8 }
			);
			assert.deepStrictEqual(
				subtractComplexSeries({ re: -10, im: -5 }, { re: -4, im: -9 }),
				{ re: -6, im: 4 }
			);
			assert.deepStrictEqual(
				subtractComplexSeries({ re: 1, im: -3 }, { re: -2, im: 5 }),
				{ re: 3, im: -8 }
			);
		});

		it('handles purely real and purely imaginary operands', () => {
			assert.deepStrictEqual(
				subtractComplexSeries({ re: 9, im: 0 }, { re: 4, im: 0 }),
				{ re: 5, im: 0 }
			);
			assert.deepStrictEqual(
				subtractComplexSeries({ re: 0, im: 9 }, { re: 0, im: 4 }),
				{ re: 0, im: 5 }
			);
			assert.deepStrictEqual(
				subtractComplexSeries({ re: 7, im: 0 }, { re: 0, im: 3 }),
				{ re: 7, im: -3 }
			);
		});

		it('handles fractional and floating-point components', () => {
			assert.deepStrictEqual(
				subtractComplexSeries({ re: 1.5, im: 2.25 }, { re: 0.5, im: 0.75 }),
				{ re: 1, im: 1.5 }
			);
			const res = subtractComplexSeries(
				{ re: Math.PI, im: Math.E },
				{ re: Math.SQRT2, im: Math.LN2 }
			);
			assertComplexClose(res, {
				re: Math.PI - Math.SQRT2,
				im: Math.E - Math.LN2,
			}, 0);
		});

		it('does not mutate input objects', () => {
			const a = Object.freeze({ re: 3, im: 4 });
			const b = Object.freeze({ re: 1, im: 2 });
			const out = subtractComplexSeries(a, b);
			assert.deepStrictEqual(out, { re: 2, im: 2 });
			assert.deepStrictEqual(a, { re: 3, im: 4 });
			assert.deepStrictEqual(b, { re: 1, im: 2 });
		});
	});

	describe('edge cases', () => {
		it('handles zero identities', () => {
			const zero = { re: 0, im: 0 };
			const z = { re: 6.5, im: -3.25 };

			assert.deepStrictEqual(subtractComplexSeries(zero, zero), zero);
			assert.deepStrictEqual(subtractComplexSeries(z, zero), z);
			assert.deepStrictEqual(subtractComplexSeries(zero, z), { re: -6.5, im: 3.25 });
			assert.deepStrictEqual(subtractComplexSeries(z, z), zero);
		});

		it('normalizes negative zero (-0) to positive zero (+0)', () => {
			const cases = [
				[{ re: -0, im: -0 }, { re: 0, im: 0 }],
				[{ re: 0, im: 0 }, { re: -0, im: -0 }],
				[{ re: -0, im: -0 }, { re: -0, im: -0 }],
				[{ re: -5, im: 3 }, { re: -5, im: 3 }],
			];

			for (const [a, b] of cases) {
				const res = subtractComplexSeries(a, b);
				assert.ok(Object.is(res.re, 0), `expected +0 for re, got ${res.re}`);
				assert.ok(Object.is(res.im, 0), `expected +0 for im, got ${res.im}`);
			}
		});

		it('handles extreme finite boundaries and subnormals', () => {
			assert.deepStrictEqual(
				subtractComplexSeries(
					{ re: Number.MAX_SAFE_INTEGER, im: Number.MIN_SAFE_INTEGER },
					{ re: 1, im: -1 }
				),
				{ re: Number.MAX_SAFE_INTEGER - 1, im: Number.MIN_SAFE_INTEGER + 1 }
			);

			assert.deepStrictEqual(
				subtractComplexSeries(
					{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE },
					{ re: Number.MAX_VALUE, im: -Number.MAX_VALUE }
				),
				{ re: 0, im: 0 }
			);

			assert.deepStrictEqual(
				subtractComplexSeries(
					{ re: Number.MIN_VALUE, im: 0 },
					{ re: 0, im: Number.MIN_VALUE }
				),
				{ re: Number.MIN_VALUE, im: -Number.MIN_VALUE }
			);
		});

		it('accepts objects with null prototype', () => {
			const a = Object.assign(Object.create(null), { re: 8, im: -2 });
			const b = Object.assign(Object.create(null), { re: 3, im: 5 });
			assert.deepStrictEqual(subtractComplexSeries(a, b), { re: 5, im: -7 });
		});

		it('throws RangeError when subtraction overflows finite IEEE-754 range', () => {
			assert.throws(
				() => subtractComplexSeries({ re: Number.MAX_VALUE, im: 0 }, { re: -Number.MAX_VALUE, im: 0 }),
				RangeError
			);
			assert.throws(
				() => subtractComplexSeries({ re: 0, im: -Number.MAX_VALUE }, { re: 0, im: Number.MAX_VALUE }),
				RangeError
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or array inputs', () => {
			const invalidValues = [null, undefined, 0, 42, '1+2i', true, 1n, Symbol('z'), [1, 2], () => {}];
			for (const bad of invalidValues) {
				assert.throws(() => subtractComplexSeries(bad, { re: 0, im: 0 }), TypeError);
				assert.throws(() => subtractComplexSeries({ re: 0, im: 0 }, bad), TypeError);
			}
		});

		it('throws TypeError when re or im is missing or not a number', () => {
			const badObjects = [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: '2' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
				{ re: 1n, im: 0 },
			];
			for (const bad of badObjects) {
				assert.throws(() => subtractComplexSeries(bad, { re: 0, im: 0 }), TypeError);
				assert.throws(() => subtractComplexSeries({ re: 0, im: 0 }, bad), TypeError);
			}
		});

		it('throws RangeError for non-finite re or im values', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
				{ re: -Infinity, im: Infinity },
			];
			for (const bad of nonFinite) {
				assert.throws(() => subtractComplexSeries(bad, { re: 1, im: 1 }), RangeError);
				assert.throws(() => subtractComplexSeries({ re: 1, im: 1 }, bad), RangeError);
			}
		});
	});

	describe('algebraic identities and independent cross-checks', () => {
		// Deterministic sample set of exact dyadic and integer complex numbers
		const exactSamples = [
			{ re: 0, im: 0 },
			{ re: 1, im: 0 },
			{ re: 0, im: 1 },
			{ re: -1, im: -1 },
			{ re: 3.5, im: -2.25 },
			{ re: -12.75, im: 8.5 },
			{ re: 1024, im: -512 },
			{ re: 0.125, im: -0.0625 },
		];

		it('matches direct componentwise subtraction on all sample pairs', () => {
			for (const a of exactSamples) {
				for (const b of exactSamples) {
					assert.deepStrictEqual(subtractComplexSeries(a, b), directSubtract(a, b));
				}
			}
		});

		it('satisfies anti-commutativity: sub(a, b) === -sub(b, a)', () => {
			for (const a of exactSamples) {
				for (const b of exactSamples) {
					const ab = subtractComplexSeries(a, b);
					const ba = subtractComplexSeries(b, a);
					assert.deepStrictEqual(ab, negateComplex(ba));
				}
			}
		});

		it('is the exact inverse of addition: add(sub(a, b), b) === a', () => {
			for (const a of exactSamples) {
				for (const b of exactSamples) {
					const diff = subtractComplexSeries(a, b);
					assert.deepStrictEqual(addComplex(diff, b), a);
				}
			}
		});

		it('commutes with complex conjugation: conj(sub(a, b)) === sub(conj(a), conj(b))', () => {
			for (const a of exactSamples) {
				for (const b of exactSamples) {
					assert.deepStrictEqual(
						conjugate(subtractComplexSeries(a, b)),
						subtractComplexSeries(conjugate(a), conjugate(b))
					);
				}
			}
		});

		it('agrees with polar-form decomposition and satisfies triangle inequalities', () => {
			const polarPairs = [
				[2, Math.PI / 6, 3, Math.PI / 3],
				[5, (3 * Math.PI) / 4, 2.5, -Math.PI / 5],
				[1.7, 2.1, 4.3, -1.2],
				[10, Math.PI, 10, 0],
			];

			for (const [r1, t1, r2, t2] of polarPairs) {
				const a = { re: r1 * Math.cos(t1), im: r1 * Math.sin(t1) };
				const b = { re: r2 * Math.cos(t2), im: r2 * Math.sin(t2) };
				const diff = subtractComplexSeries(a, b);

				// Law of cosines for |a - b|^2 = r1^2 + r2^2 - 2*r1*r2*cos(t1 - t2)
				const expectedModSq = r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(t1 - t2);
				const actualModSq = diff.re * diff.re + diff.im * diff.im;
				assert.ok(
					Math.abs(actualModSq - expectedModSq) <= 1e-11,
					`modulus^2 mismatch: expected ${expectedModSq}, got ${actualModSq}`
				);

				// Triangle inequalities: ||a| - |b|| <= |a - b| <= |a| + |b|
				const actualMod = Math.hypot(diff.re, diff.im);
				assert.ok(actualMod <= r1 + r2 + 1e-12);
				assert.ok(actualMod + 1e-12 >= Math.abs(r1 - r2));

				// Inverse of addition within floating-point precision
				assertComplexClose(addComplex(diff, b), a, 1e-12);
			}
		});
	});
});
