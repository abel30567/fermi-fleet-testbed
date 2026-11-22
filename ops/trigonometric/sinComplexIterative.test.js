import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sinComplexIterative } from './sinComplexIterative.js';

/**
 * Asserts two numbers are within a combined absolute + relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-14]
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-14) {
	assert.equal(typeof actual, 'number');
	assert.ok(Number.isFinite(actual), `Expected finite number, got ${actual}`);
	const diff = Math.abs(actual - expected);
	const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${tol})`,
	);
}

/**
 * Asserts two complex numbers are close in both real and imaginary components.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-14]
 */
function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-14) {
	assertClose(actual.re, expected.re, relTol, absTol);
	assertClose(actual.im, expected.im, relTol, absTol);
}

/**
 * Independent reference implementation via Euler's complex exponential formula:
 *   sin(z) = (e^(i*z) - e^(-i*z)) / (2i)
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function sinComplexViaExponential(z) {
	const expComplex = (w) => {
		const r = Math.exp(w.re);
		return { re: r * Math.cos(w.im), im: r * Math.sin(w.im) };
	};
	// i * z = -z.im + i * z.re
	const ePos = expComplex({ re: -z.im, im: z.re });
	// -i * z = z.im - i * z.re
	const eNeg = expComplex({ re: z.im, im: -z.re });
	// (ePos - eNeg) / (2i) = (im(diff) / 2) + i * (-re(diff) / 2)
	const diffRe = ePos.re - eNeg.re;
	const diffIm = ePos.im - eNeg.im;
	return { re: diffIm / 2, im: -diffRe / 2 };
}

/**
 * Independent complex cosine via Euler's formula:
 *   cos(z) = (e^(i*z) + e^(-i*z)) / 2
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function cosComplexViaExponential(z) {
	const expComplex = (w) => {
		const r = Math.exp(w.re);
		return { re: r * Math.cos(w.im), im: r * Math.sin(w.im) };
	};
	const ePos = expComplex({ re: -z.im, im: z.re });
	const eNeg = expComplex({ re: z.im, im: -z.re });
	return { re: (ePos.re + eNeg.re) / 2, im: (ePos.im + eNeg.im) / 2 };
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

describe('sinComplexIterative', () => {
	describe('normal cases', () => {
		test('evaluates general complex numbers across all quadrants', () => {
			const cases = [
				{ re: 1, im: 1 },
				{ re: 1, im: -2 },
				{ re: -2, im: 3 },
				{ re: -0.5, im: -0.75 },
				{ re: 0.3, im: 4.2 },
				{ re: 2.5, im: -5.1 },
				{ re: Math.PI / 6, im: 0.5 },
				{ re: Math.PI / 4, im: 2 },
			];

			for (const z of cases) {
				const actual = sinComplexIterative(z);
				const expected = {
					re: Math.sin(z.re) * Math.cosh(z.im),
					im: Math.cos(z.re) * Math.sinh(z.im),
				};
				assertComplexClose(actual, expected, 1e-14, 1e-14);
			}
		});

		test('matches real sine on the real axis (im = 0)', () => {
			const angles = [
				0,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				Math.PI / 2,
				Math.PI,
				(3 * Math.PI) / 2,
				2 * Math.PI,
				-Math.PI / 4,
				-Math.PI / 2,
				-Math.PI,
			];

			for (const x of angles) {
				const actual = sinComplexIterative({ re: x, im: 0 });
				assertClose(actual.re, Math.sin(x), 1e-14, 1e-15);
				assert.equal(actual.im, 0);
			}
		});
	});

	describe('edge cases', () => {
		test('handles zero and negative zero cleanly', () => {
			assert.deepEqual(sinComplexIterative({ re: 0, im: 0 }), { re: 0, im: 0 });
			assert.deepEqual(sinComplexIterative({ re: -0, im: -0 }), { re: 0, im: 0 });
			assert.deepEqual(sinComplexIterative({ re: -0, im: 0 }), { re: 0, im: 0 });
		});

		test('handles pi/2 accurately', () => {
			const atPiHalfReal = sinComplexIterative({ re: Math.PI / 2, im: 0 });
			assertClose(atPiHalfReal.re, 1, 1e-15, 1e-15);
			assert.equal(atPiHalfReal.im, 0);

			const atPiHalfComplex = sinComplexIterative({ re: Math.PI / 2, im: 1.5 });
			assertClose(atPiHalfComplex.re, Math.cosh(1.5), 1e-14, 1e-14);
			assertClose(atPiHalfComplex.im, Math.cos(Math.PI / 2) * Math.sinh(1.5), 1e-14, 1e-14);
		});

		test('handles pure imaginary inputs (sin(iy) = i * sinh(y))', () => {
			for (const y of [-10, -2, -1, -0.5, -1e-8, 1e-8, 0.5, 1, 2, 10, 50]) {
				const actual = sinComplexIterative({ re: 0, im: y });
				assert.equal(actual.re, 0);
				assertClose(actual.im, Math.sinh(y), 1e-14, 1e-15);
			}
		});

		test('handles negative real and imaginary parts and obeys odd/conjugate symmetries', () => {
			const samples = [
				{ re: 0.7, im: 1.3 },
				{ re: -2.1, im: 0.4 },
				{ re: 3.4, im: -2.8 },
				{ re: -5.2, im: -1.9 },
			];

			for (const z of samples) {
				const sinZ = sinComplexIterative(z);
				const sinNegZ = sinComplexIterative({ re: -z.re, im: -z.im });
				const sinConjZ = sinComplexIterative({ re: z.re, im: -z.im });

				// Odd symmetry: sin(-z) = -sin(z)
				assertComplexClose(sinNegZ, { re: -sinZ.re, im: -sinZ.im }, 1e-14, 1e-15);

				// Conjugate symmetry: sin(conj(z)) = conj(sin(z))
				assertComplexClose(sinConjZ, { re: sinZ.re, im: -sinZ.im }, 1e-14, 1e-15);
			}
		});

		test('handles large real parts accurately via multi-part range reduction', () => {
			const largeReals = [1e3, -1e3, 1e6, -1234567.89, 1e8, 1e9, 1e12, -1e12];

			for (const a of largeReals) {
				const z = { re: a, im: 1.25 };
				const actual = sinComplexIterative(z);
				const expected = {
					re: Math.sin(a) * Math.cosh(z.im),
					im: Math.cos(a) * Math.sinh(z.im),
				};
				assertComplexClose(actual, expected, 1e-12, 1e-12);
			}
		});

		test('handles very small inputs without precision loss (sin(z) ≈ z)', () => {
			const z = { re: 1e-12, im: -2e-12 };
			const actual = sinComplexIterative(z);
			assertComplexClose(actual, z, 1e-14, 1e-26);
		});

		test('is continuous across the |im| = 1 branch boundary', () => {
			for (const b of [-1.000001, -1, -0.999999, 0.999999, 1, 1.000001]) {
				const z = { re: 0.8, im: b };
				const actual = sinComplexIterative(z);
				const expected = {
					re: Math.sin(z.re) * Math.cosh(b),
					im: Math.cos(z.re) * Math.sinh(b),
				};
				assertComplexClose(actual, expected, 1e-14, 1e-14);
			}
		});

		test('handles large imaginary parts near and past float64 overflow without NaN', () => {
			// Near overflow limit: cosh(710) is still finite (~1.116997e308)
			const nearLimit = sinComplexIterative({ re: 0.5, im: 710 });
			assert.ok(Number.isFinite(nearLimit.re));
			assert.ok(Number.isFinite(nearLimit.im));
			assertClose(nearLimit.re, Math.sin(0.5) * Math.cosh(710), 1e-12, 1e-12);
			assertClose(nearLimit.im, Math.cos(0.5) * Math.sinh(710), 1e-12, 1e-12);

			// Pure imaginary overflow should not produce NaN for the zero real part
			const pureImagOverflow = sinComplexIterative({ re: 0, im: 800 });
			assert.equal(pureImagOverflow.re, 0);
			assert.equal(pureImagOverflow.im, Infinity);

			const pureImagNegOverflow = sinComplexIterative({ re: 0, im: -800 });
			assert.equal(pureImagNegOverflow.re, 0);
			assert.equal(pureImagNegOverflow.im, -Infinity);
		});
	});

	describe('input validation', () => {
		test('throws TypeError for non-object or array inputs', () => {
			for (const invalid of [null, undefined, 0, 1, '1+i', true, [1, 2], () => {}]) {
				assert.throws(() => sinComplexIterative(invalid), TypeError);
			}
		});

		test('throws TypeError when re or im is missing or not a number', () => {
			const invalidObjects = [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 0, im: '2' },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
				{ re: 1n, im: 0 },
				{ re: true, im: false },
			];

			for (const obj of invalidObjects) {
				assert.throws(() => sinComplexIterative(obj), TypeError);
			}
		});

		test('throws RangeError when re or im is NaN or infinite', () => {
			const nonFinite = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: NaN, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: -Infinity, im: 1 },
				{ re: 0, im: Infinity },
				{ re: 1, im: -Infinity },
			];

			for (const obj of nonFinite) {
				assert.throws(() => sinComplexIterative(obj), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		test('matches Euler complex exponential formula (e^(iz) - e^(-iz)) / (2i)', () => {
			const gridRe = [-4.5, -1.2, 0, 0.75, 2.3, 10.1];
			const gridIm = [-3.5, -0.8, 0, 0.6, 1.5, 4.2];

			for (const re of gridRe) {
				for (const im of gridIm) {
					const z = { re, im };
					const actual = sinComplexIterative(z);
					const viaExp = sinComplexViaExponential(z);
					assertComplexClose(actual, viaExp, 1e-13, 1e-13);
				}
			}
		});

		test('satisfies Pythagorean identity sin^2(z) + cos^2(z) = 1', () => {
			const points = [
				{ re: 0, im: 0 },
				{ re: 0.5, im: 0.5 },
				{ re: -1.3, im: 2.1 },
				{ re: 2.7, im: -1.8 },
				{ re: Math.PI / 3, im: 3.0 },
				{ re: -4.2, im: -0.9 },
				{ re: 100.5, im: 1.4 },
			];

			for (const z of points) {
				const s = sinComplexIterative(z);

				// Cross-check 1: cos(z) via phase shift sin(pi/2 - z)
				const cShift = sinComplexIterative({ re: Math.PI / 2 - z.re, im: -z.im });
				const sumShift = complexAdd(complexMul(s, s), complexMul(cShift, cShift));
				assertComplexClose(sumShift, { re: 1, im: 0 }, 1e-11, 1e-11);

				// Cross-check 2: cos(z) via independent Euler exponential formula
				const cExp = cosComplexViaExponential(z);
				const sumExp = complexAdd(complexMul(s, s), complexMul(cExp, cExp));
				assertComplexClose(sumExp, { re: 1, im: 0 }, 1e-11, 1e-11);
			}
		});

		test('satisfies periodicity sin(z + 2*pi) = sin(z) and angle addition identity', () => {
			const z1 = { re: 0.7, im: 1.1 };
			const z2 = { re: -1.4, im: 0.6 };

			// Periodicity
			const sinZ1 = sinComplexIterative(z1);
			const sinZ1Plus2Pi = sinComplexIterative({ re: z1.re + 2 * Math.PI, im: z1.im });
			assertComplexClose(sinZ1Plus2Pi, sinZ1, 1e-13, 1e-13);

			// Angle addition: sin(z1 + z2) = sin(z1)cos(z2) + cos(z1)sin(z2)
			const cosZ1 = sinComplexIterative({ re: Math.PI / 2 - z1.re, im: -z1.im });
			const sinZ2 = sinComplexIterative(z2);
			const cosZ2 = sinComplexIterative({ re: Math.PI / 2 - z2.re, im: -z2.im });

			const lhs = sinComplexIterative(complexAdd(z1, z2));
			const rhs = complexAdd(complexMul(sinZ1, cosZ2), complexMul(cosZ1, sinZ2));
			assertComplexClose(lhs, rhs, 1e-12, 1e-12);
		});
	});
});
