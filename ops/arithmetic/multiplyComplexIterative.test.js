import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyComplexIterative } from './multiplyComplexIterative.js';

function assertComplexClose(actual, expected, eps = 1e-9) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re ${actual.re} to be within ${eps} of ${expected.re}`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im ${actual.im} to be within ${eps} of ${expected.im}`,
	);
}

describe('multiplyComplexIterative', () => {
	describe('normal cases', () => {
		test('multiplies two general complex numbers', () => {
			assert.deepEqual(
				multiplyComplexIterative({ re: 1, im: 2 }, { re: 3, im: 4 }),
				{ re: -5, im: 10 },
			);
		});

		test('multiplies negative and fractional components', () => {
			const res = multiplyComplexIterative({ re: -2.5, im: 1.5 }, { re: 4, im: -2 });
			// (-2.5)(4) - (1.5)(-2) = -10 + 3 = -7
			// (-2.5)(-2) + (1.5)(4) = 5 + 6 = 11
			assert.deepEqual(res, { re: -7, im: 11 });
		});

		test('multiplies multiple variadic complex numbers iteratively', () => {
			const res = multiplyComplexIterative(
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: 5, im: 6 },
			);
			// (-5 + 10i)(5 + 6i) = (-25 - 60) + (-30 + 50)i = -85 + 20i
			assert.deepEqual(res, { re: -85, im: 20 });
		});

		test('multiplies an array of complex numbers', () => {
			const factors = [
				{ re: 2, im: -1 },
				{ re: 0, im: 3 },
				{ re: -1, im: 2 },
			];
			// (2 - i)(3i) = 3 + 6i; (3 + 6i)(-1 + 2i) = (-3 - 12) + (6 - 6)i = -15 + 0i
			assert.deepEqual(multiplyComplexIterative(factors), { re: -15, im: 0 });
		});

		test('multiplies pure imaginary units (i * i = -1)', () => {
			assert.deepEqual(
				multiplyComplexIterative({ re: 0, im: 1 }, { re: 0, im: 1 }),
				{ re: -1, im: 0 },
			);
		});

		test('multiplies a complex number by its conjugate to yield squared modulus', () => {
			assert.deepEqual(
				multiplyComplexIterative({ re: 3, im: 4 }, { re: 3, im: -4 }),
				{ re: 25, im: 0 },
			);
		});
	});

	describe('edge cases', () => {
		test('empty array returns multiplicative identity { re: 1, im: 0 }', () => {
			assert.deepEqual(multiplyComplexIterative([]), { re: 1, im: 0 });
		});

		test('single complex number returns an equal fresh object without mutating input', () => {
			const input = { re: 7, im: -3 };
			const result = multiplyComplexIterative(input);
			assert.deepEqual(result, { re: 7, im: -3 });
			assert.notEqual(result, input);
		});

		test('multiplying by zero yields { re: 0, im: 0 } without negative zero', () => {
			const result = multiplyComplexIterative({ re: -5, im: 3 }, { re: 0, im: 0 });
			assert.deepEqual(result, { re: 0, im: 0 });
			assert.equal(Object.is(result.re, 0), true);
			assert.equal(Object.is(result.im, 0), true);
		});

		test('multiplying by identity { re: 1, im: 0 } leaves complex number unchanged', () => {
			const z = { re: -4.25, im: 9.75 };
			assert.deepEqual(multiplyComplexIterative(z, { re: 1, im: 0 }), z);
			assert.deepEqual(multiplyComplexIterative({ re: 1, im: 0 }, z), z);
		});

		test('normalizes -0 inputs to +0', () => {
			const result = multiplyComplexIterative({ re: -0, im: -0 });
			assert.equal(Object.is(result.re, 0), true);
			assert.equal(Object.is(result.im, 0), true);
		});

		test('handles long iterative chains accurately (powers of i)', () => {
			const factors = Array.from({ length: 1001 }, () => ({ re: 0, im: 1 }));
			// i^1001 = i^(4*250 + 1) = i
			assert.deepEqual(multiplyComplexIterative(factors), { re: 0, im: 1 });
		});
	});

	describe('invalid inputs', () => {
		test('throws TypeError when called with no arguments', () => {
			assert.throws(() => multiplyComplexIterative(), TypeError);
		});

		test('throws TypeError for null, undefined, and primitive operands', () => {
			for (const bad of [null, undefined, 42, '1+2i', true, Symbol('z')]) {
				assert.throws(() => multiplyComplexIterative(bad, { re: 1, im: 0 }), TypeError);
				assert.throws(() => multiplyComplexIterative({ re: 1, im: 0 }, bad), TypeError);
			}
		});

		test('throws TypeError for missing or non-numeric re/im properties', () => {
			for (const bad of [
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{ re: undefined, im: 0 },
			]) {
				assert.throws(() => multiplyComplexIterative(bad, { re: 1, im: 0 }), TypeError);
			}
		});

		test('throws TypeError for NaN and Infinity components', () => {
			for (const bad of [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => multiplyComplexIterative(bad, { re: 1, im: 0 }), TypeError);
			}
		});

		test('throws TypeError for invalid elements inside an array or nested arrays', () => {
			assert.throws(
				() => multiplyComplexIterative([{ re: 1, im: 1 }, { re: 'bad', im: 0 }]),
				TypeError,
			);
			assert.throws(
				() => multiplyComplexIterative([{ re: 1, im: 0 }], { re: 2, im: 0 }),
				TypeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		test('matches independent polar form multiplication (modulus product & angle sum)', () => {
			const factors = [
				{ re: 1.5, im: -2.25 },
				{ re: -0.75, im: 3.1 },
				{ re: 2.0, im: 1.2 },
				{ re: -1.1, im: -0.9 },
				{ re: 0.4, im: 2.7 },
			];

			const iterativeResult = multiplyComplexIterative(factors);

			let totalMag = 1;
			let totalAngle = 0;
			for (const { re, im } of factors) {
				totalMag *= Math.hypot(re, im);
				totalAngle += Math.atan2(im, re);
			}
			const polarExpected = {
				re: totalMag * Math.cos(totalAngle),
				im: totalMag * Math.sin(totalAngle),
			};

			assertComplexClose(iterativeResult, polarExpected, 1e-9);
		});

		test('matches 2x2 real matrix representation isomorphism [[a, -b], [b, a]]', () => {
			const factors = [
				{ re: 2, im: 3 },
				{ re: -4, im: 5 },
				{ re: 1, im: -2 },
				{ re: -3, im: -1 },
			];

			const toMatrix = ({ re, im }) => [
				[re, -im],
				[im, re],
			];
			const matMul = (A, B) => [
				[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
				[A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
			];

			const matrixProduct = factors
				.map(toMatrix)
				.reduce(matMul, [
					[1, 0],
					[0, 1],
				]);

			const iterativeResult = multiplyComplexIterative(factors);
			assert.deepEqual(iterativeResult, {
				re: matrixProduct[0][0],
				im: matrixProduct[1][0],
			});
		});

		test('satisfies commutativity, associativity, and n-th roots of unity', () => {
			const a = { re: 3, im: -2 };
			const b = { re: -5, im: 4 };
			const c = { re: 2, im: 7 };

			// Commutativity
			assert.deepEqual(multiplyComplexIterative(a, b), multiplyComplexIterative(b, a));

			// Associativity
			assert.deepEqual(
				multiplyComplexIterative(multiplyComplexIterative(a, b), c),
				multiplyComplexIterative(a, multiplyComplexIterative(b, c)),
			);

			// 12th root of unity raised to 12th power equals 1 + 0i
			const n = 12;
			const omega = { re: Math.cos((2 * Math.PI) / n), im: Math.sin((2 * Math.PI) / n) };
			const roots = Array.from({ length: n }, () => omega);
			assertComplexClose(multiplyComplexIterative(roots), { re: 1, im: 0 }, 1e-12);
		});
	});
});
