import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tanComplexIterative } from './tanComplexIterative.js';

/**
 * Independent reference implementation via complex division sin(z) / cos(z)
 * using built-in Math trigonometric and hyperbolic functions (valid for moderate |im|).
 */
function referenceTanViaSinOverCos(z) {
	const { re: x, im: y } = z;
	const sinZ = {
		re: Math.sin(x) * Math.cosh(y),
		im: Math.cos(x) * Math.sinh(y),
	};
	const cosZ = {
		re: Math.cos(x) * Math.cosh(y),
		im: -Math.sin(x) * Math.sinh(y),
	};
	const denom = cosZ.re * cosZ.re + cosZ.im * cosZ.im;
	return {
		re: (sinZ.re * cosZ.re + sinZ.im * cosZ.im) / denom,
		im: (sinZ.im * cosZ.re - sinZ.re * cosZ.im) / denom,
	};
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function complexDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im;
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	};
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : '';
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * Math.max(1, Math.abs(expected.re)),
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * Math.max(1, Math.abs(expected.im)),
		`${prefix}imag part mismatch: got ${actual.im}, expected ${expected.im}`
	);
}

describe('tanComplexIterative', () => {
	test('handles origin and real-axis values accurately', () => {
		const origin = tanComplexIterative({ re: 0, im: 0 });
		assert.deepStrictEqual(origin, { re: 0, im: 0 });

		const realCases = [
			0.25,
			-0.25,
			Math.PI / 6,
			Math.PI / 4,
			-Math.PI / 4,
			Math.PI / 3,
			Math.PI,
			-Math.PI,
			1.2,
			-2.7,
			10.5,
			-25.3,
		];

		for (const x of realCases) {
			const res = tanComplexIterative({ re: x, im: 0 });
			assert.strictEqual(res.im, 0);
			assert.ok(
				Math.abs(res.re - Math.tan(x)) <= 1e-13 * Math.max(1, Math.abs(Math.tan(x))),
				`tan(${x}): got ${res.re}, expected ${Math.tan(x)}`
			);
		}
	});

	test('handles pure imaginary inputs: tan(i*y) = i*tanh(y)', () => {
		const imagCases = [-100, -10, -2.5, -1, -0.5, -1e-8, -1e-15, 1e-15, 1e-8, 0.5, 1, 2.5, 10, 100];
		for (const y of imagCases) {
			const res = tanComplexIterative({ re: 0, im: y });
			assert.strictEqual(res.re, 0, `tan(${y}i) real part should be 0`);
			const expected = Math.tanh(y);
			assert.ok(
				Math.abs(res.im - expected) <= 1e-14 * Math.max(1, Math.abs(expected)),
				`tan(${y}i): got ${res.im}i, expected ${expected}i`
			);
		}
	});

	test('handles large imaginary parts without overflow: tan(x + i*y) -> +/- i', () => {
		const largePositive = [50, 200, 350, 375, 376, 500, 1000, 1e6, 1e100];
		for (const y of largePositive) {
			const resPos = tanComplexIterative({ re: 1.23, im: y });
			assert.ok(Number.isFinite(resPos.re) && Number.isFinite(resPos.im));
			assert.ok(Math.abs(resPos.re) < 1e-40, `re should be tiny for y=${y}, got ${resPos.re}`);
			assert.strictEqual(resPos.im, 1, `im should be 1 for y=${y}, got ${resPos.im}`);

			const resNeg = tanComplexIterative({ re: 1.23, im: -y });
			assert.ok(Number.isFinite(resNeg.re) && Number.isFinite(resNeg.im));
			assert.ok(Math.abs(resNeg.re) < 1e-40, `re should be tiny for y=-${y}, got ${resNeg.re}`);
			assert.strictEqual(resNeg.im, -1, `im should be -1 for y=-${y}, got ${resNeg.im}`);
		}

		// Verify asymptotic real part 2*sin(2x)*exp(-2y) at y = 100 is still accurately resolved
		const x = 0.6;
		const y = 100;
		const res = tanComplexIterative({ re: x, im: y });
		const expectedRe = 2 * Math.sin(2 * x) * Math.exp(-2 * y);
		assert.ok(
			Math.abs(res.re - expectedRe) <= 1e-12 * Math.abs(expectedRe),
			`asymptotic real part at y=100: got ${res.re}, expected ${expectedRe}`
		);
	});

	test('preserves odd symmetry tan(-z) = -tan(z) and conjugate symmetry', () => {
		const samples = [
			{ re: 0.3, im: 0.4 },
			{ re: 1.1, im: -2.3 },
			{ re: -2.5, im: 0.8 },
			{ re: 0, im: 3.7 },
			{ re: 0.9, im: 0 },
			{ re: 1.5, im: 1000 },
		];

		for (const z of samples) {
			const tz = tanComplexIterative(z);
			const tNegZ = tanComplexIterative({ re: -z.re, im: -z.im });
			const tConjZ = tanComplexIterative({ re: z.re, im: -z.im });

			assertComplexClose(tNegZ, { re: -tz.re, im: -tz.im }, 1e-14, `odd(${z.re},${z.im})`);
			assertComplexClose(tConjZ, { re: tz.re, im: -tz.im }, 1e-14, `conj(${z.re},${z.im})`);
		}
	});

	test('satisfies pi-periodicity and continuity across internal regime boundaries', () => {
		const z = { re: 0.7, im: 1.3 };
		const base = tanComplexIterative(z);
		for (const k of [-3, -1, 1, 2, 5]) {
			const shifted = tanComplexIterative({ re: z.re + k * Math.PI, im: z.im });
			assertComplexClose(shifted, base, 1e-13, `period k=${k}`);
		}

		// Continuity around |im| = 1 boundary (small-y Taylor vs exp(-2|y|) branch)
		const below = tanComplexIterative({ re: 0.8, im: 1 - 1e-9 });
		const atOne = tanComplexIterative({ re: 0.8, im: 1 });
		const above = tanComplexIterative({ re: 0.8, im: 1 + 1e-9 });
		assertComplexClose(below, atOne, 1e-8, 'continuity below im=1');
		assertComplexClose(above, atOne, 1e-8, 'continuity above im=1');
		assertComplexClose(atOne, referenceTanViaSinOverCos({ re: 0.8, im: 1 }), 1e-14, 'exact at im=1');
	});

	test('handles valid points very close to poles accurately', () => {
		// Near pi/2 on the real axis (not on the pole)
		const nearReal = tanComplexIterative({ re: Math.PI / 2 + 1e-6, im: 0 });
		assert.ok(Math.abs(nearReal.re - Math.tan(Math.PI / 2 + 1e-6)) / Math.abs(nearReal.re) < 1e-9);
		assert.strictEqual(nearReal.im, 0);

		// At re = pi/2 with non-zero imaginary part: tan(pi/2 + i*y) = i*coth(y)
		const nearImag = tanComplexIterative({ re: Math.PI / 2, im: 1e-6 });
		const expectedIm = 1 / Math.tanh(1e-6);
		assert.ok(Math.abs(nearImag.im - expectedIm) / expectedIm < 1e-12);
	});

	test('cross-checks against independent sin(z) / cos(z) over a complex grid', () => {
		const reValues = [-3.5, -1.2, -0.4, 0, 0.4, 1.1, Math.PI / 2, 2.3, 4.7];
		const imValues = [-5, -1.5, -1, -0.3, -1e-4, 1e-4, 0.3, 1, 1.5, 5];

		for (const re of reValues) {
			for (const im of imValues) {
				const z = { re, im };
				const actual = tanComplexIterative(z);
				const expected = referenceTanViaSinOverCos(z);
				assertComplexClose(actual, expected, 1e-13, `sin/cos(${re}, ${im})`);
			}
		}
	});

	test('cross-checks tangent angle-addition identity tan(z1 + z2)', () => {
		const pairs = [
			[{ re: 0.3, im: 0.5 }, { re: 0.7, im: -0.2 }],
			[{ re: 1.2, im: 1.8 }, { re: -0.6, im: 0.9 }],
			[{ re: -0.9, im: -0.4 }, { re: 2.1, im: 1.1 }],
		];

		for (const [z1, z2] of pairs) {
			const t1 = tanComplexIterative(z1);
			const t2 = tanComplexIterative(z2);
			const lhs = tanComplexIterative({ re: z1.re + z2.re, im: z1.im + z2.im });
			const prod = complexMul(t1, t2);
			const rhs = complexDiv(
				{ re: t1.re + t2.re, im: t1.im + t2.im },
				{ re: 1 - prod.re, im: -prod.im }
			);
			assertComplexClose(lhs, rhs, 1e-13, 'angle-addition');
		}
	});

	test('throws RangeError at poles re = pi/2 + k*pi, im = 0', () => {
		const poles = [
			Math.PI / 2,
			-Math.PI / 2,
			(3 * Math.PI) / 2,
			(-3 * Math.PI) / 2,
			Math.PI / 2 + 5 * Math.PI,
			Math.PI / 2 - 10 * Math.PI,
		];
		for (const re of poles) {
			assert.throws(
				() => tanComplexIterative({ re, im: 0 }),
				RangeError,
				`Expected RangeError at pole re=${re}, im=0`
			);
		}
	});

	test('validates invalid input types and non-finite components', () => {
		const typeErrors = [
			null,
			undefined,
			42,
			'1+i',
			true,
			[1, 2],
			{},
			{ re: 1 },
			{ im: 1 },
			{ re: '1', im: 0 },
			{ re: 0, im: '1' },
			{ re: null, im: 0 },
			{ re: 0, im: undefined },
		];

		for (const bad of typeErrors) {
			assert.throws(() => tanComplexIterative(bad), TypeError);
		}

		const rangeErrors = [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 0 },
			{ re: Number.NEGATIVE_INFINITY, im: 1 },
			{ re: 0, im: Number.POSITIVE_INFINITY },
			{ re: 1, im: Number.NEGATIVE_INFINITY },
		];

		for (const bad of rangeErrors) {
			assert.throws(() => tanComplexIterative(bad), RangeError);
		}
	});
});
