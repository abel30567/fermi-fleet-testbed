import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { log10ComplexIterative } from './log10ComplexIterative.js';

/**
 * Helper to assert two complex numbers are equal within an absolute/relative tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [tol=1e-12]
 */
function assertComplexClose(actual, expected, tol = 1e-12) {
	const reTol = tol * Math.max(1, Math.abs(expected.re));
	const imTol = tol * Math.max(1, Math.abs(expected.im));
	assert.ok(
		Math.abs(actual.re - expected.re) <= reTol,
		`real part mismatch: expected ${expected.re}, got ${actual.re} (diff ${Math.abs(actual.re - expected.re)})`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= imTol,
		`imag part mismatch: expected ${expected.im}, got ${actual.im} (diff ${Math.abs(actual.im - expected.im)})`
	);
}

/**
 * Independent reference computation of 10^w for complex w = u + i*v:
 * 10^w = exp(w * ln(10)) = 10^u * (cos(v * ln(10)) + i * sin(v * ln(10))).
 *
 * @param {{ re: number, im: number }} w
 * @returns {{ re: number, im: number }}
 */
function pow10Complex(w) {
	const mag = Math.pow(10, w.re);
	const angle = w.im * Math.LN10;
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	};
}

/**
 * Independent reference computation of principal log10(z) using built-in Math functions.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function referenceLog10Complex(z) {
	const mag = Math.hypot(z.re, z.im);
	const arg = z.im === 0 ? (z.re > 0 ? 0 : Math.PI) : Math.atan2(z.im, z.re);
	return {
		re: Math.log10(mag),
		im: arg / Math.LN10,
	};
}

describe('log10ComplexIterative', () => {
	test('exact and positive real powers of 10', () => {
		const exponents = [-300, -100, -12, -3, -1, 0, 1, 2, 6, 100, 300];
		for (const k of exponents) {
			const z = { re: Math.pow(10, k), im: 0 };
			const result = log10ComplexIterative(z);
			assertComplexClose(result, { re: k, im: 0 }, 1e-13);
			assert.equal(Object.is(result.im, -0), false);
		}
		assert.deepEqual(log10ComplexIterative({ re: 1, im: 0 }), { re: 0, im: 0 });
		assert.deepEqual(log10ComplexIterative({ re: 1, im: -0 }), { re: 0, im: 0 });
	});

	test('negative real numbers lie on principal branch arg = +pi', () => {
		const cases = [
			{ z: { re: -1, im: 0 }, expected: { re: 0, im: Math.PI / Math.LN10 } },
			{ z: { re: -1, im: -0 }, expected: { re: 0, im: Math.PI / Math.LN10 } },
			{ z: { re: -10, im: 0 }, expected: { re: 1, im: Math.PI / Math.LN10 } },
			{ z: { re: -1000, im: 0 }, expected: { re: 3, im: Math.PI / Math.LN10 } },
			{ z: { re: -0.01, im: 0 }, expected: { re: -2, im: Math.PI / Math.LN10 } },
		];
		for (const { z, expected } of cases) {
			assertComplexClose(log10ComplexIterative(z), expected, 1e-13);
		}
	});

	test('pure imaginary numbers', () => {
		const halfPiOverLn10 = Math.PI / (2 * Math.LN10);
		assertComplexClose(log10ComplexIterative({ re: 0, im: 1 }), { re: 0, im: halfPiOverLn10 }, 1e-13);
		assertComplexClose(log10ComplexIterative({ re: 0, im: -1 }), { re: 0, im: -halfPiOverLn10 }, 1e-13);
		assertComplexClose(log10ComplexIterative({ re: 0, im: 100 }), { re: 2, im: halfPiOverLn10 }, 1e-13);
		assertComplexClose(log10ComplexIterative({ re: 0, im: -0.1 }), { re: -1, im: -halfPiOverLn10 }, 1e-13);
	});

	test('normal cases across all four quadrants', () => {
		const samples = [
			{ re: 3, im: 4 },
			{ re: -3, im: 4 },
			{ re: -3, im: -4 },
			{ re: 3, im: -4 },
			{ re: 1, im: 1 },
			{ re: -1, im: 1 },
			{ re: -1, im: -1 },
			{ re: 1, im: -1 },
			{ re: 0.25, im: 7.5 },
			{ re: -12.34, im: 0.05 },
			{ re: -0.001, im: -999.9 },
			{ re: 42, im: -0.0001 },
		];

		for (const z of samples) {
			const result = log10ComplexIterative(z);
			const expected = referenceLog10Complex(z);
			assertComplexClose(result, expected, 1e-13);
		}
	});

	test('extreme magnitudes without overflow or underflow', () => {
		const extremeCases = [
			{ re: 3e250, im: 4e250 },
			{ re: -3e-250, im: 4e-250 },
			{ re: 1e307, im: -1e307 },
			{ re: -1e-305, im: -1e-305 },
			{ re: Number.MAX_VALUE, im: 0 },
			{ re: 0, im: -Number.MIN_VALUE },
		];

		for (const z of extremeCases) {
			const result = log10ComplexIterative(z);
			assert.ok(Number.isFinite(result.re), `expected finite re for (${z.re}, ${z.im})`);
			assert.ok(Number.isFinite(result.im), `expected finite im for (${z.re}, ${z.im})`);
			const expected = referenceLog10Complex(z);
			assertComplexClose(result, expected, 1e-12);
		}
	});

	test('unit circle points have zero real part', () => {
		const angles = [-Math.PI + 1e-6, -2.5, -Math.PI / 2, -0.5, 0, 0.7, Math.PI / 2, 2.2, Math.PI];
		for (const theta of angles) {
			const z = { re: Math.cos(theta), im: Math.sin(theta) };
			const result = log10ComplexIterative(z);
			assertComplexClose(result, { re: 0, im: theta / Math.LN10 }, 1e-13);
		}
	});

	test('independent cross-check: inverse 10^w === z and Math.log10/atan2 reference', () => {
		const grid = [-100, -5.5, -1, -0.2, 0, 0.2, 1, 5.5, 100];
		for (const re of grid) {
			for (const im of grid) {
				if (re === 0 && im === 0) continue;
				const z = { re, im };
				const w = log10ComplexIterative(z);

				// Cross-check 1: 10^w === z
				const reconstructed = pow10Complex(w);
				assertComplexClose(reconstructed, z, 1e-11);

				// Cross-check 2: Math.log10(|z|) + i * Math.atan2(im, re) / Math.LN10
				const ref = referenceLog10Complex(z);
				assertComplexClose(w, ref, 1e-13);
			}
		}
	});

	test('independent cross-check: algebraic identities (conjugate, reciprocal, product)', () => {
		const z1 = { re: 2, im: 3 };
		const z2 = { re: 4, im: -1 };

		// Conjugate symmetry: log10(conj(z)) = conj(log10(z)) away from negative real axis
		const logZ1 = log10ComplexIterative(z1);
		const logConjZ1 = log10ComplexIterative({ re: z1.re, im: -z1.im });
		assertComplexClose(logConjZ1, { re: logZ1.re, im: -logZ1.im }, 1e-13);

		// Reciprocal identity: log10(1/z) = -log10(z) away from negative real axis
		const magSq = z1.re * z1.re + z1.im * z1.im;
		const invZ1 = { re: z1.re / magSq, im: -z1.im / magSq };
		const logInvZ1 = log10ComplexIterative(invZ1);
		assertComplexClose(logInvZ1, { re: -logZ1.re, im: -logZ1.im }, 1e-13);

		// Product identity: log10(z1 * z2) = log10(z1) + log10(z2) when arg(z1) + arg(z2) in (-pi, pi]
		const prod = {
			re: z1.re * z2.re - z1.im * z2.im,
			im: z1.re * z2.im + z1.im * z2.re,
		};
		const logZ2 = log10ComplexIterative(z2);
		const logProd = log10ComplexIterative(prod);
		assertComplexClose(logProd, { re: logZ1.re + logZ2.re, im: logZ1.im + logZ2.im }, 1e-13);
	});

	test('throws RangeError at zero', () => {
		assert.throws(() => log10ComplexIterative({ re: 0, im: 0 }), RangeError);
		assert.throws(() => log10ComplexIterative({ re: -0, im: 0 }), RangeError);
		assert.throws(() => log10ComplexIterative({ re: 0, im: -0 }), RangeError);
		assert.throws(() => log10ComplexIterative({ re: -0, im: -0 }), RangeError);
	});

	test('throws TypeError and RangeError on invalid inputs', () => {
		const invalidTypes = [
			null,
			undefined,
			42,
			'1+2i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 1, im: null },
			{ re: 1n, im: 0 },
		];
		for (const bad of invalidTypes) {
			assert.throws(() => log10ComplexIterative(bad), TypeError);
		}

		const nonFinite = [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 1 },
			{ re: 1, im: Number.NEGATIVE_INFINITY },
			{ re: Number.NEGATIVE_INFINITY, im: Number.POSITIVE_INFINITY },
		];
		for (const bad of nonFinite) {
			assert.throws(() => log10ComplexIterative(bad), RangeError);
		}
	});
});
