import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arctanComplexIterative } from './arctanComplexIterative.js';

/**
 * Independent complex tangent reference:
 *   tan(a + bi) = (sin(2a) + i * sinh(2b)) / (cos(2a) + cosh(2b))
 * Uses a scaled hyperbolic form when |2b| is large to prevent overflow.
 */
function complexTanRef({ re: a, im: b }) {
	const twoA = 2 * a;
	const twoB = 2 * b;
	const absTwoB = Math.abs(twoB);
	if (absTwoB > 40) {
		const e = Math.exp(-absTwoB);
		const e2 = e * e;
		const denom = 1 + 2 * e * Math.cos(twoA) + e2;
		return {
			re: (2 * e * Math.sin(twoA)) / denom,
			im: (Math.sign(twoB) * (1 - e2)) / denom,
		};
	}
	const denom = Math.cos(twoA) + Math.cosh(twoB);
	return {
		re: Math.sin(twoA) / denom,
		im: Math.sinh(twoB) / denom,
	};
}

/**
 * Independent naive Maclaurin series for arctan(z) inside |z| < 1:
 *   arctan(z) = sum_{n=0}^{N} (-1)^n * z^(2n+1) / (2n+1)
 */
function complexArctanSeriesRef(z, terms = 40) {
	const z2Re = z.re * z.re - z.im * z.im;
	const z2Im = 2 * z.re * z.im;
	let pRe = z.re;
	let pIm = z.im;
	let sumRe = z.re;
	let sumIm = z.im;
	for (let n = 1; n < terms; n++) {
		const nextRe = -(pRe * z2Re - pIm * z2Im);
		const nextIm = -(pRe * z2Im + pIm * z2Re);
		pRe = nextRe;
		pIm = nextIm;
		const denom = 2 * n + 1;
		sumRe += pRe / denom;
		sumIm += pIm / denom;
	}
	return { re: sumRe, im: sumIm };
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const reScale = Math.max(1, Math.abs(expected.re));
	const imScale = Math.max(1, Math.abs(expected.im));
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * reScale,
		`${label} re mismatch: got ${actual.re}, expected ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * imScale,
		`${label} im mismatch: got ${actual.im}, expected ${expected.im}`
	);
}

describe('arctanComplexIterative', () => {
	test('handles origin and real inputs matching Math.atan', () => {
		assert.deepStrictEqual(arctanComplexIterative({ re: 0, im: 0 }), { re: 0, im: 0 });

		const reals = [-100, -10, -Math.sqrt(3), -1, -1 / Math.sqrt(3), -0.25, 0.25, 1 / Math.sqrt(3), 1, Math.sqrt(3), 10, 100];
		for (const x of reals) {
			const res = arctanComplexIterative({ re: x, im: 0 });
			assertComplexClose(res, { re: Math.atan(x), im: 0 }, 1e-14, `real x=${x}`);
			assert.strictEqual(res.im, 0);
		}
	});

	test('handles known complex values in all four quadrants', () => {
		// Reference values verified via (i/2)*ln((i+z)/(i-z))
		assertComplexClose(
			arctanComplexIterative({ re: 1, im: 2 }),
			{ re: 1.3389725222944935, im: 0.40235947810852507 },
			1e-14,
			'Q1: 1+2i'
		);
		assertComplexClose(
			arctanComplexIterative({ re: -1, im: 2 }),
			{ re: -1.3389725222944935, im: 0.40235947810852507 },
			1e-14,
			'Q2: -1+2i'
		);
		assertComplexClose(
			arctanComplexIterative({ re: -1, im: -2 }),
			{ re: -1.3389725222944935, im: -0.40235947810852507 },
			1e-14,
			'Q3: -1-2i'
		);
		assertComplexClose(
			arctanComplexIterative({ re: 1, im: -2 }),
			{ re: 1.3389725222944935, im: -0.40235947810852507 },
			1e-14,
			'Q4: 1-2i'
		);
	});

	test('handles pure imaginary inputs with |y| < 1 (equals i * atanh(y))', () => {
		const values = [-0.999, -0.75, -0.5, -0.1, -1e-10, 1e-10, 0.1, 0.5, 0.75, 0.999];
		for (const y of values) {
			const res = arctanComplexIterative({ re: 0, im: y });
			const expectedIm = 0.5 * Math.log((1 + y) / (1 - y));
			assert.strictEqual(res.re, 0, `pure imag |y|<1 should have re=0 for y=${y}`);
			assertComplexClose(res, { re: 0, im: expectedIm }, 1e-13, `pure imag y=${y}`);
		}
	});

	test('handles pure imaginary inputs on branch cuts |y| > 1 with signed-zero continuity', () => {
		const values = [1.001, 2, 10, -1.001, -2, -10];
		for (const y of values) {
			const expectedIm = 0.5 * Math.log(Math.abs((y + 1) / (y - 1)));

			// +0 approaches from right half-plane => Re = +π/2
			const fromRight = arctanComplexIterative({ re: 0, im: y });
			assertComplexClose(fromRight, { re: Math.PI / 2, im: expectedIm }, 1e-13, `cut +0+${y}i`);

			// -0 approaches from left half-plane => Re = -π/2
			const fromLeft = arctanComplexIterative({ re: -0, im: y });
			assertComplexClose(fromLeft, { re: -Math.PI / 2, im: expectedIm }, 1e-13, `cut -0+${y}i`);

			// Verify continuity from slightly off the branch cut
			const rightLimit = arctanComplexIterative({ re: 1e-11, im: y });
			const leftLimit = arctanComplexIterative({ re: -1e-11, im: y });
			assertComplexClose(rightLimit, fromRight, 1e-8, `right limit y=${y}`);
			assertComplexClose(leftLimit, fromLeft, 1e-8, `left limit y=${y}`);
		}
	});

	test('handles extreme magnitudes, unit circle, and near-singularity points without overflow or cancellation', () => {
		// Tiny z: arctan(z) ≈ z
		const tiny = { re: 1e-120, im: -2e-120 };
		assertComplexClose(arctanComplexIterative(tiny), tiny, 1e-14, 'tiny z');

		// Very small z with different scales
		const small = { re: 1e-15, im: 3e-15 };
		assertComplexClose(arctanComplexIterative(small), small, 1e-13, 'small z');

		// Huge z: arctan(z) ≈ sign(re)*π/2 - 1/z (no overflow in x^2 + y^2)
		const huge = { re: 1e200, im: 1e200 };
		const hugeRes = arctanComplexIterative(huge);
		assert.ok(Number.isFinite(hugeRes.re) && Number.isFinite(hugeRes.im));
		assertComplexClose(hugeRes, { re: Math.PI / 2, im: 0.5e-200 }, 1e-14, 'huge z');

		// Unit circle points (x^2 + y^2 = 1): Re(arctan(z)) = ±π/4
		const unitPoints = [
			{ re: 0.6, im: 0.8 },
			{ re: -0.6, im: 0.8 },
			{ re: 0.6, im: -0.8 },
			{ re: -0.6, im: -0.8 },
		];
		for (const z of unitPoints) {
			const res = arctanComplexIterative(z);
			assert.ok(
				Math.abs(res.re - Math.sign(z.re) * (Math.PI / 4)) < 1e-14,
				`unit circle re mismatch for (${z.re}, ${z.im})`
			);
		}

		// Very close to singularities ±i
		const nearPolePos = arctanComplexIterative({ re: 1e-10, im: 1 });
		assert.ok(Number.isFinite(nearPolePos.re) && Number.isFinite(nearPolePos.im));
		assertComplexClose(
			nearPolePos,
			{ re: Math.PI / 4, im: 0.5 * Math.log(2e10) },
			1e-9,
			'near +i'
		);

		const nearPoleNeg = arctanComplexIterative({ re: -1e-10, im: -1 });
		assertComplexClose(
			nearPoleNeg,
			{ re: -Math.PI / 4, im: -0.5 * Math.log(2e10) },
			1e-9,
			'near -i'
		);
	});

	test('throws RangeError at singularities ±i', () => {
		assert.throws(() => arctanComplexIterative({ re: 0, im: 1 }), RangeError);
		assert.throws(() => arctanComplexIterative({ re: 0, im: -1 }), RangeError);
		assert.throws(() => arctanComplexIterative({ re: -0, im: 1 }), RangeError);
		assert.throws(() => arctanComplexIterative({ re: -0, im: -1 }), RangeError);
	});

	test('validates invalid input types and non-finite numbers', () => {
		const typeInvalid = [
			null,
			undefined,
			0,
			1,
			'1+2i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 0, im: null },
		];
		for (const bad of typeInvalid) {
			assert.throws(() => arctanComplexIterative(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`);
		}

		const rangeInvalid = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 0 },
			{ re: -Infinity, im: 1 },
			{ re: 1, im: Infinity },
			{ re: 1, im: -Infinity },
		];
		for (const bad of rangeInvalid) {
			assert.throws(() => arctanComplexIterative(bad), RangeError, `expected RangeError for ${JSON.stringify(bad)}`);
		}
	});

	test('cross-check: tan(arctan(z)) === z across all quadrants, axes, and scales', () => {
		const testPoints = [
			// All 4 quadrants (various magnitudes)
			{ re: 0.2, im: 0.3 },
			{ re: -0.2, im: 0.3 },
			{ re: -0.2, im: -0.3 },
			{ re: 0.2, im: -0.3 },
			{ re: 1.5, im: 0.7 },
			{ re: -1.5, im: 0.7 },
			{ re: -1.5, im: -0.7 },
			{ re: 1.5, im: -0.7 },
			{ re: 3.7, im: 4.2 },
			{ re: -3.7, im: 4.2 },
			{ re: -3.7, im: -4.2 },
			{ re: 3.7, im: -4.2 },
			{ re: 0.05, im: 1.05 },
			{ re: -0.05, im: 1.05 },
			{ re: 0.05, im: -1.05 },
			{ re: -0.05, im: -1.05 },
			{ re: 25, im: -13 },
			{ re: -0.001, im: 0.99 },
			// Axes including branch cuts
			{ re: 0, im: 0 },
			{ re: 2.5, im: 0 },
			{ re: -2.5, im: 0 },
			{ re: 0, im: 0.6 },
			{ re: 0, im: -0.6 },
			{ re: 0, im: 2.5 },
			{ re: 0, im: -2.5 },
			{ re: -0, im: 2.5 },
			{ re: -0, im: -2.5 },
		];

		for (const z of testPoints) {
			const w = arctanComplexIterative(z);
			const roundTrip = complexTanRef(w);
			assertComplexClose(
				roundTrip,
				z,
				1e-12,
				`tan(arctan(${z.re} + ${z.im}i))`
			);
		}
	});

	test('cross-check: Maclaurin power series inside unit disk and algebraic identities', () => {
		// 1. Compare against independent Maclaurin series for |z| < 0.5
		const diskPoints = [
			{ re: 0.1, im: 0.2 },
			{ re: -0.3, im: 0.2 },
			{ re: -0.15, im: -0.35 },
			{ re: 0.25, im: -0.25 },
		];
		for (const z of diskPoints) {
			assertComplexClose(
				arctanComplexIterative(z),
				complexArctanSeriesRef(z),
				1e-14,
				`series check (${z.re}, ${z.im})`
			);
		}

		// 2. Odd symmetry arctan(-z) === -arctan(z) and conjugate symmetry arctan(conj(z)) === conj(arctan(z))
		const offCutPoints = [
			{ re: 0.7, im: 1.3 },
			{ re: -2.4, im: 0.8 },
			{ re: 4.1, im: -3.2 },
			{ re: -0.3, im: -5.5 },
		];
		for (const z of offCutPoints) {
			const fz = arctanComplexIterative(z);
			const fNeg = arctanComplexIterative({ re: -z.re, im: -z.im });
			const fConj = arctanComplexIterative({ re: z.re, im: -z.im });

			assertComplexClose(fNeg, { re: -fz.re, im: -fz.im }, 1e-14, `odd symmetry (${z.re}, ${z.im})`);
			assertComplexClose(fConj, { re: fz.re, im: -fz.im }, 1e-14, `conjugate symmetry (${z.re}, ${z.im})`);

			// 3. Reciprocal identity: arctan(z) + arctan(1/z) = sign(Re(z)) * π/2
			const denom = z.re * z.re + z.im * z.im;
			const invZ = { re: z.re / denom, im: -z.im / denom };
			const fInv = arctanComplexIterative(invZ);
			assertComplexClose(
				{ re: fz.re + fInv.re, im: fz.im + fInv.im },
				{ re: Math.sign(z.re) * (Math.PI / 2), im: 0 },
				1e-13,
				`reciprocal identity (${z.re}, ${z.im})`
			);
		}
	});
});
