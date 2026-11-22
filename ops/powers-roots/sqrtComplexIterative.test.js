import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtComplexIterative } from './sqrtComplexIterative.js';

function assertComplexClose(actual, expected, tol = 1e-12) {
	const scale = Math.max(1, Math.hypot(expected.re, expected.im));
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * scale,
		`real part mismatch: got ${actual.re}, expected ${expected.re} (tol=${tol * scale})`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * scale,
		`imag part mismatch: got ${actual.im}, expected ${expected.im} (tol=${tol * scale})`,
	);
}

function assertPrincipalBranch(w) {
	assert.ok(
		w.re > 0 || (w.re === 0 && w.im >= 0),
		`violates principal branch: { re: ${w.re}, im: ${w.im} }`,
	);
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function polarSqrt(z) {
	const r = Math.hypot(z.re, z.im);
	const theta = Math.atan2(z.im, z.re);
	const rootR = Math.sqrt(r);
	return {
		re: rootR * Math.cos(theta / 2),
		im: rootR * Math.sin(theta / 2),
	};
}

describe('sqrtComplexIterative', () => {
	describe('normal cases', () => {
		test('positive real numbers', () => {
			assertComplexClose(sqrtComplexIterative({ re: 1, im: 0 }), { re: 1, im: 0 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 4, im: 0 }), { re: 2, im: 0 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 9, im: 0 }), { re: 3, im: 0 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 0.25, im: 0 }), { re: 0.5, im: 0 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 2, im: 0 }), { re: Math.SQRT2, im: 0 }, 1e-15);
		});

		test('known Gaussian integer squares across all four quadrants', () => {
			// Q1: (2 + i)^2 = 3 + 4i
			assertComplexClose(sqrtComplexIterative({ re: 3, im: 4 }), { re: 2, im: 1 }, 1e-14);
			// Q4: (2 - i)^2 = 3 - 4i
			assertComplexClose(sqrtComplexIterative({ re: 3, im: -4 }), { re: 2, im: -1 }, 1e-14);
			// Q2: (1 + 2i)^2 = -3 + 4i
			assertComplexClose(sqrtComplexIterative({ re: -3, im: 4 }), { re: 1, im: 2 }, 1e-14);
			// Q3: (1 - 2i)^2 = -3 - 4i
			assertComplexClose(sqrtComplexIterative({ re: -3, im: -4 }), { re: 1, im: -2 }, 1e-14);
			// Larger exact squares
			assertComplexClose(sqrtComplexIterative({ re: -7, im: 24 }), { re: 3, im: 4 }, 1e-14);
			assertComplexClose(sqrtComplexIterative({ re: -5, im: -12 }), { re: 2, im: -3 }, 1e-14);
			assertComplexClose(sqrtComplexIterative({ re: -119, im: 120 }), { re: 5, im: 12 }, 1e-14);
		});

		test('supports custom tolerance and maxIterations options', () => {
			const result = sqrtComplexIterative({ re: 3, im: 4 }, { tolerance: 1e-12, maxIterations: 50 });
			assertComplexClose(result, { re: 2, im: 1 }, 1e-12);

			// Very tight tolerance terminates cleanly at maxIterations without throwing
			const tight = sqrtComplexIterative({ re: 2, im: 3 }, { tolerance: 1e-30, maxIterations: 20 });
			assertPrincipalBranch(tight);
			assertComplexClose(complexMul(tight, tight), { re: 2, im: 3 }, 1e-14);
		});
	});

	describe('edge cases', () => {
		test('zero and signed zeros return { re: 0, im: 0 } without -0', () => {
			for (const z of [
				{ re: 0, im: 0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
				{ re: -0, im: -0 },
			]) {
				const w = sqrtComplexIterative(z);
				assert.ok(Object.is(w.re, 0), `expected +0 for re, got ${w.re}`);
				assert.ok(Object.is(w.im, 0), `expected +0 for im, got ${w.im}`);
			}
		});

		test('negative real numbers lie on positive imaginary axis (principal branch)', () => {
			const cases = [
				{ z: { re: -1, im: 0 }, expected: { re: 0, im: 1 } },
				{ z: { re: -4, im: 0 }, expected: { re: 0, im: 2 } },
				{ z: { re: -4, im: -0 }, expected: { re: 0, im: 2 } },
				{ z: { re: -9, im: 0 }, expected: { re: 0, im: 3 } },
				{ z: { re: -2, im: 0 }, expected: { re: 0, im: Math.SQRT2 } },
			];
			for (const { z, expected } of cases) {
				const w = sqrtComplexIterative(z);
				assert.ok(Object.is(w.re, 0), `expected exact 0 real part for ${JSON.stringify(z)}, got ${w.re}`);
				assert.ok(Math.abs(w.im - expected.im) <= 1e-15 * expected.im);
				assertPrincipalBranch(w);
			}
		});

		test('pure imaginary numbers', () => {
			const halfSqrt2 = Math.SQRT1_2;
			assertComplexClose(sqrtComplexIterative({ re: 0, im: 1 }), { re: halfSqrt2, im: halfSqrt2 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 0, im: -1 }), { re: halfSqrt2, im: -halfSqrt2 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 0, im: 2 }), { re: 1, im: 1 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 0, im: -2 }), { re: 1, im: -1 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 0, im: 8 }), { re: 2, im: 2 }, 1e-15);
			assertComplexClose(sqrtComplexIterative({ re: 0, im: -8 }), { re: 2, im: -2 }, 1e-15);
		});

		test('values very close to the negative real branch cut retain full relative accuracy', () => {
			const above = sqrtComplexIterative({ re: -3, im: 1e-20 });
			assertPrincipalBranch(above);
			assert.ok(Math.abs(above.im - Math.sqrt(3)) <= 1e-15);
			assert.ok(Math.abs(above.re - 1e-20 / (2 * Math.sqrt(3))) <= 1e-34);

			const below = sqrtComplexIterative({ re: -3, im: -1e-20 });
			assertPrincipalBranch(below);
			assert.ok(Math.abs(below.im + Math.sqrt(3)) <= 1e-15);
			assert.ok(Math.abs(below.re - 1e-20 / (2 * Math.sqrt(3))) <= 1e-34);
		});

		test('very large, very small, and subnormal magnitudes avoid overflow and underflow', () => {
			const huge = sqrtComplexIterative({ re: 3e300, im: 4e300 });
			assertPrincipalBranch(huge);
			assertComplexClose(huge, { re: 2e150, im: 1e150 }, 1e-14);

			const maxScale = sqrtComplexIterative({ re: 1e308, im: 1e308 });
			assertPrincipalBranch(maxScale);
			assert.ok(Number.isFinite(maxScale.re) && Number.isFinite(maxScale.im));
			const expectedMax = Math.sqrt(1e308);
			assertComplexClose(
				maxScale,
				{
					re: expectedMax * Math.sqrt((Math.SQRT2 + 1) / 2),
					im: expectedMax * Math.sqrt((Math.SQRT2 - 1) / 2),
				},
				1e-14,
			);

			const tiny = sqrtComplexIterative({ re: 3e-300, im: 4e-300 });
			assertPrincipalBranch(tiny);
			assertComplexClose(tiny, { re: 2e-150, im: 1e-150 }, 1e-14);

			const subnormal = sqrtComplexIterative({ re: Number.MIN_VALUE, im: 0 });
			assert.equal(subnormal.im, 0);
			assert.ok(Math.abs(subnormal.re - Math.sqrt(Number.MIN_VALUE)) <= 1e-15 * Math.sqrt(Number.MIN_VALUE));

			// Extreme dynamic range between re and im
			const widePos = sqrtComplexIterative({ re: 1e300, im: 1e-100 });
			assertPrincipalBranch(widePos);
			assert.ok(Math.abs(widePos.re - 1e150) <= 1e135);
			assert.ok(Math.abs(widePos.im - 5e-251) <= 1e-264);

			const wideNeg = sqrtComplexIterative({ re: -1e300, im: -1e-100 });
			assertPrincipalBranch(wideNeg);
			assert.ok(Math.abs(wideNeg.re - 5e-251) <= 1e-264);
			assert.ok(Math.abs(wideNeg.im + 1e150) <= 1e135);

			// Real component genuinely underflows to 0: still obeys principal branch
			const underflowCut = sqrtComplexIterative({ re: -1e300, im: -1e-300 });
			assertPrincipalBranch(underflowCut);
			assert.equal(underflowCut.re, 0);
			assert.ok(Math.abs(underflowCut.im - 1e150) <= 1e135);
		});
	});

	describe('input validation', () => {
		test('rejects invalid z types with TypeError', () => {
			for (const bad of [null, undefined, 4, '4', true, [1, 2], () => {}]) {
				assert.throws(() => sqrtComplexIterative(bad), TypeError);
			}
			for (const bad of [{}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 1, im: null }, { re: 1n, im: 0 }]) {
				assert.throws(() => sqrtComplexIterative(bad), TypeError);
			}
		});

		test('rejects non-finite z components with RangeError', () => {
			for (const bad of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: -Infinity, im: 0 },
				{ re: 0, im: Infinity },
				{ re: 0, im: -Infinity },
			]) {
				assert.throws(() => sqrtComplexIterative(bad), RangeError);
			}
		});

		test('rejects invalid options', () => {
			for (const badOpts of [null, 1, 'opts', []]) {
				assert.throws(() => sqrtComplexIterative({ re: 1, im: 0 }, badOpts), TypeError);
			}
			for (const badTol of ['1e-10', null, true]) {
				assert.throws(() => sqrtComplexIterative({ re: 1, im: 0 }, { tolerance: badTol }), TypeError);
			}
			for (const badTol of [0, -1e-10, NaN, Infinity, -Infinity]) {
				assert.throws(() => sqrtComplexIterative({ re: 1, im: 0 }, { tolerance: badTol }), RangeError);
			}
			for (const badIter of ['10', null, false]) {
				assert.throws(() => sqrtComplexIterative({ re: 1, im: 0 }, { maxIterations: badIter }), TypeError);
			}
			for (const badIter of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => sqrtComplexIterative({ re: 1, im: 0 }, { maxIterations: badIter }), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		test('satisfies w * w === z and agrees with closed-form polar formula sqrt(r)*e^(i*theta/2)', () => {
			const samples = [
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
				{ re: -1, im: -1 },
				{ re: 1, im: -1 },
				{ re: 7.25, im: -3.5 },
				{ re: -12.8, im: 0.05 },
				{ re: -0.001, im: -99.4 },
				{ re: 0.0003, im: 0.0004 },
				{ re: 1e8, im: -3e8 },
				{ re: -1e-8, im: 5e-9 },
				{ re: 0, im: 17.3 },
				{ re: 0, im: -17.3 },
				{ re: -42.5, im: 0 },
				{ re: 42.5, im: 0 },
				{ re: Math.PI, im: -Math.E },
			];

			for (const z of samples) {
				const w = sqrtComplexIterative(z);
				assertPrincipalBranch(w);

				// Inverse check: w * w === z
				const squared = complexMul(w, w);
				assertComplexClose(squared, z, 1e-13);

				// Independent closed-form polar formula check
				const expectedPolar = polarSqrt(z);
				assertComplexClose(w, expectedPolar, 1e-14);
			}
		});

		test('satisfies multiplicative identity sqrt(z1 * z2) = sqrt(z1) * sqrt(z2) in first quadrant', () => {
			const pairs = [
				[{ re: 1, im: 2 }, { re: 3, im: 1 }],
				[{ re: 0.5, im: 0.25 }, { re: 4, im: 7 }],
				[{ re: 10, im: 3 }, { re: 2, im: 5 }],
			];

			for (const [z1, z2] of pairs) {
				const lhs = sqrtComplexIterative(complexMul(z1, z2));
				const rhs = complexMul(sqrtComplexIterative(z1), sqrtComplexIterative(z2));
				assertComplexClose(lhs, rhs, 1e-14);
			}
		});
	});
});
