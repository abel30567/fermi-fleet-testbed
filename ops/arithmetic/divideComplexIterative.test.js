import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideComplexIterative } from './divideComplexIterative.js';

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`expected re ${actual.re} to be within ${eps} of ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`expected im ${actual.im} to be within ${eps} of ${expected.im}`
	);
}

function multiplyComplex(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	};
}

function conjugateComplex(z) {
	return { re: z.re, im: -z.im };
}

function normalizeAngle(theta) {
	let angle = theta;
	while (angle <= -Math.PI) angle += 2 * Math.PI;
	while (angle > Math.PI) angle -= 2 * Math.PI;
	return angle;
}

describe('divideComplexIterative', () => {
	describe('normal cases', () => {
		it('divides purely real complex numbers', () => {
			assert.deepStrictEqual(
				divideComplexIterative({ re: 6, im: 0 }, { re: 3, im: 0 }),
				{ re: 2, im: 0 }
			);
			assert.deepStrictEqual(
				divideComplexIterative({ re: -9, im: 0 }, { re: 2, im: 0 }),
				{ re: -4.5, im: 0 }
			);
		});

		it('divides purely imaginary complex numbers', () => {
			assert.deepStrictEqual(
				divideComplexIterative({ re: 0, im: 4 }, { re: 0, im: 2 }),
				{ re: 2, im: 0 }
			);
			assert.deepStrictEqual(
				divideComplexIterative({ re: 1, im: 0 }, { re: 0, im: 1 }),
				{ re: 0, im: -1 }
			);
		});

		it('divides general complex numbers across quadrants', () => {
			assertComplexClose(
				divideComplexIterative({ re: 3, im: 4 }, { re: 1, im: -2 }),
				{ re: -1, im: 2 }
			);
			assertComplexClose(
				divideComplexIterative({ re: 1, im: 2 }, { re: 3, im: 4 }),
				{ re: 0.44, im: 0.08 }
			);
			assertComplexClose(
				divideComplexIterative({ re: -5, im: -10 }, { re: -1, im: 2 }),
				{ re: -3, im: 4 }
			);
		});

		it('supports iterative left-associative division across multiple divisors', () => {
			const res = divideComplexIterative(
				{ re: 12, im: -16 },
				{ re: 2, im: 0 },
				{ re: 1, im: -2 }
			);
			// (12 - 16i) / 2 = 6 - 8i; (6 - 8i) / (1 - 2i) = (6 + 16 + (-8 + 12)i) / 5 = 4.4 + 0.8i
			assertComplexClose(res, { re: 4.4, im: 0.8 });
		});
	});

	describe('edge cases', () => {
		it('returns normalized +0 for zero numerator', () => {
			const res = divideComplexIterative({ re: 0, im: 0 }, { re: -3, im: 4 });
			assert.deepStrictEqual(res, { re: 0, im: 0 });
			assert.strictEqual(Object.is(res.re, -0), false);
			assert.strictEqual(Object.is(res.im, -0), false);
		});

		it('handles identity and self division', () => {
			const z = { re: -7.25, im: 3.5 };
			assert.deepStrictEqual(divideComplexIterative(z, { re: 1, im: 0 }), z);
			assert.deepStrictEqual(divideComplexIterative(z, { re: -1, im: 0 }), {
				re: 7.25,
				im: -3.5,
			});
			assertComplexClose(divideComplexIterative(z, z), { re: 1, im: 0 });
		});

		it('avoids intermediate overflow for very large magnitudes', () => {
			assertComplexClose(
				divideComplexIterative({ re: 1e200, im: 1e200 }, { re: 1e200, im: 1e200 }),
				{ re: 1, im: 0 }
			);
			assertComplexClose(
				divideComplexIterative({ re: 3e200, im: 4e200 }, { re: 1e200, im: -2e200 }),
				{ re: -1, im: 2 }
			);
		});

		it('avoids intermediate underflow for very small magnitudes', () => {
			assertComplexClose(
				divideComplexIterative({ re: 1e-200, im: 2e-200 }, { re: 1e-200, im: 0 }),
				{ re: 1, im: 2 }
			);
			assertComplexClose(
				divideComplexIterative({ re: 3e-200, im: 4e-200 }, { re: 1e-200, im: -2e-200 }),
				{ re: -1, im: 2 }
			);
		});

		it('does not mutate input objects', () => {
			const a = { re: 3, im: 4 };
			const b = { re: 1, im: -2 };
			const result = divideComplexIterative(a, b);
			assert.deepStrictEqual(a, { re: 3, im: 4 });
			assert.deepStrictEqual(b, { re: 1, im: -2 });
			assert.notStrictEqual(result, a);
			assert.notStrictEqual(result, b);
		});
	});

	describe('invalid inputs', () => {
		it('throws RangeError on division by zero', () => {
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 2 }, { re: 0, im: 0 }),
				RangeError
			);
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 2 }, { re: -0, im: -0 }),
				RangeError
			);
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 2 }, { re: 1, im: 0 }, { re: 0, im: 0 }),
				RangeError
			);
		});

		it('throws TypeError for missing or non-object operands', () => {
			assert.throws(() => divideComplexIterative(), TypeError);
			assert.throws(() => divideComplexIterative({ re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexIterative(null, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexIterative({ re: 1, im: 0 }, undefined), TypeError);
			assert.throws(() => divideComplexIterative(42, { re: 1, im: 0 }), TypeError);
			assert.throws(() => divideComplexIterative([1, 2], { re: 1, im: 0 }), TypeError);
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 0 }, { re: 1, im: 0 }, 'bad'),
				TypeError
			);
		});

		it('throws TypeError for non-finite or non-numeric components', () => {
			assert.throws(() => divideComplexIterative({ re: NaN, im: 0 }, { re: 1, im: 0 }), TypeError);
			assert.throws(
				() => divideComplexIterative({ re: 1, im: Infinity }, { re: 1, im: 0 }),
				TypeError
			);
			assert.throws(
				() => divideComplexIterative({ re: 1, im: 0 }, { re: -Infinity, im: 1 }),
				TypeError
			);
			assert.throws(
				() => divideComplexIterative({ re: '1', im: 0 }, { re: 1, im: 0 }),
				TypeError
			);
			assert.throws(() => divideComplexIterative({ re: 1 }, { re: 1, im: 0 }), TypeError);
		});
	});

	describe('independent cross-checks', () => {
		const pairs = [
			[{ re: 5, im: -3 }, { re: -2, im: 7 }],
			[{ re: -0.75, im: 1.25 }, { re: 0.5, im: -0.25 }],
			[{ re: 13, im: 0.5 }, { re: 0.1, im: -19 }],
			[{ re: -100, im: 250 }, { re: 17, im: 17 }],
			[{ re: 2.718281828, im: -3.141592653 }, { re: -1.414213562, im: 1.732050808 }],
		];

		it('satisfies multiplicative inverse identity (a / b) * b == a', () => {
			for (const [a, b] of pairs) {
				const q = divideComplexIterative(a, b);
				const reconstructed = multiplyComplex(q, b);
				assertComplexClose(reconstructed, a, 1e-11);
			}
		});

		it('matches polar form magnitude and argument', () => {
			for (const [a, b] of pairs) {
				const q = divideComplexIterative(a, b);
				const expectedMag = Math.hypot(a.re, a.im) / Math.hypot(b.re, b.im);
				const actualMag = Math.hypot(q.re, q.im);
				assert.ok(
					Math.abs(actualMag - expectedMag) <= 1e-11 * Math.max(1, expectedMag),
					`magnitude mismatch: ${actualMag} vs ${expectedMag}`
				);

				const expectedArg = normalizeAngle(Math.atan2(a.im, a.re) - Math.atan2(b.im, b.re));
				const actualArg = normalizeAngle(Math.atan2(q.im, q.re));
				const diff = Math.abs(normalizeAngle(actualArg - expectedArg));
				assert.ok(diff <= 1e-11, `argument mismatch: ${actualArg} vs ${expectedArg}`);
			}
		});

		it('satisfies conjugate and chained product identities', () => {
			const a = { re: 7, im: -11 };
			const b = { re: 2, im: 3 };
			const c = { re: -4, im: 5 };

			// conj(a / b) === conj(a) / conj(b)
			assertComplexClose(
				conjugateComplex(divideComplexIterative(a, b)),
				divideComplexIterative(conjugateComplex(a), conjugateComplex(b)),
				1e-12
			);

			// (a / b) / c === a / (b * c)
			assertComplexClose(
				divideComplexIterative(a, b, c),
				divideComplexIterative(a, multiplyComplex(b, c)),
				1e-12
			);
		});
	});
});
