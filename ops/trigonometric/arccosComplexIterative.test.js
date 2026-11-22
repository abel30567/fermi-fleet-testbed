import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arccosComplexIterative } from './arccosComplexIterative.js';

/**
 * Independent complex cosine cos(a + b*i) = cos(a)*cosh(b) - i*sin(a)*sinh(b).
 *
 * @param {{ re: number, im: number }} w
 * @returns {{ re: number, im: number }}
 */
function cosComplex(w) {
	return {
		re: Math.cos(w.re) * Math.cosh(w.im),
		im: -Math.sin(w.re) * Math.sinh(w.im),
	};
}

/**
 * Independent reference implementation via Hull-Fairgrieve-Tang real decomposition:
 * r1 = hypot(x + 1, y), r2 = hypot(x - 1, y),
 * u = acos(clamp((r1 - r2) / 2, -1, 1)), |v| = acosh(max((r1 + r2) / 2, 1)).
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function arccosComplexReference(z) {
	const r1 = Math.hypot(z.re + 1, z.im);
	const r2 = Math.hypot(z.re - 1, z.im);
	const a = Math.max(0.5 * (r1 + r2), 1);
	const b = Math.max(-1, Math.min(1, 0.5 * (r1 - r2)));
	const re = Math.acos(b);
	const absIm = Math.acosh(a);
	const negIm = z.im < 0 || Object.is(z.im, -0);
	const im = negIm ? absIm : -absIm;
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.abs(expected));
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol * scale,
		`${label}expected ${expected}, got ${actual} (diff=${diff}, tol=${tol * scale})`,
	);
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	assertClose(actual.re, expected.re, tol, `${label}[re] `);
	assertClose(actual.im, expected.im, tol, `${label}[im] `);
}

describe('arccosComplexIterative', () => {
	test('computes real inputs in [-1, 1] accurately', () => {
		const cases = [
			{ z: { re: 0, im: 0 }, expected: { re: Math.PI / 2, im: 0 } },
			{ z: { re: 1, im: 0 }, expected: { re: 0, im: 0 } },
			{ z: { re: -1, im: 0 }, expected: { re: Math.PI, im: 0 } },
			{ z: { re: 0.5, im: 0 }, expected: { re: Math.PI / 3, im: 0 } },
			{ z: { re: -0.5, im: 0 }, expected: { re: (2 * Math.PI) / 3, im: 0 } },
			{ z: { re: Math.SQRT1_2, im: 0 }, expected: { re: Math.PI / 4, im: 0 } },
			{ z: { re: -Math.SQRT1_2, im: 0 }, expected: { re: (3 * Math.PI) / 4, im: 0 } },
			{ z: { re: Math.sqrt(3) / 2, im: 0 }, expected: { re: Math.PI / 6, im: 0 } },
		];

		for (const { z, expected } of cases) {
			const res = arccosComplexIterative(z);
			assertComplexClose(res, expected, 1e-14, `z=(${z.re},${z.im}) `);
			assert.ok(Object.is(res.im, 0), `expected +0 imaginary part for z=(${z.re},${z.im})`);
		}

		const atOne = arccosComplexIterative({ re: 1, im: 0 });
		assert.ok(Object.is(atOne.re, 0));
		assert.ok(Object.is(atOne.im, 0));
	});

	test('handles real inputs with |x| > 1 along branch cuts', () => {
		const pos2 = arccosComplexIterative({ re: 2, im: 0 });
		assertComplexClose(pos2, { re: 0, im: -Math.acosh(2) }, 1e-14);
		assert.ok(Object.is(pos2.re, 0));

		const neg2 = arccosComplexIterative({ re: -2, im: 0 });
		assertComplexClose(neg2, { re: Math.PI, im: -Math.acosh(2) }, 1e-14);

		const pos10 = arccosComplexIterative({ re: 10, im: 0 });
		assertComplexClose(pos10, { re: 0, im: -Math.acosh(10) }, 1e-14);

		const neg10 = arccosComplexIterative({ re: -10, im: 0 });
		assertComplexClose(neg10, { re: Math.PI, im: -Math.acosh(10) }, 1e-14);

		// Signed -0 imaginary part follows lower half-plane continuity (C99 / IEEE convention)
		const pos2NegZero = arccosComplexIterative({ re: 2, im: -0 });
		assertComplexClose(pos2NegZero, { re: 0, im: Math.acosh(2) }, 1e-14);

		const neg2NegZero = arccosComplexIterative({ re: -2, im: -0 });
		assertComplexClose(neg2NegZero, { re: Math.PI, im: Math.acosh(2) }, 1e-14);

		// Close to branch point x = 1 + eps without catastrophic cancellation
		const nearOne = arccosComplexIterative({ re: 1 + 1e-12, im: 0 });
		assertComplexClose(nearOne, { re: 0, im: -Math.acosh(1 + 1e-12) }, 1e-12);
	});

	test('handles pure imaginary inputs', () => {
		for (const y of [1e-12, 0.25, 1, 5, 1e6, -1e-12, -0.25, -1, -5, -1e6]) {
			const res = arccosComplexIterative({ re: 0, im: y });
			assertComplexClose(res, { re: Math.PI / 2, im: -Math.asinh(y) }, 1e-13, `iy=${y} `);
		}
	});

	test('handles complex numbers across all four quadrants', () => {
		const samples = [
			{ re: 1, im: 1 },
			{ re: -1, im: 1 },
			{ re: -1, im: -1 },
			{ re: 1, im: -1 },
			{ re: 3, im: 4 },
			{ re: -2.5, im: 1.75 },
			{ re: -0.4, im: -0.8 },
			{ re: 0.7, im: -2.3 },
		];

		for (const z of samples) {
			const res = arccosComplexIterative(z);
			const ref = arccosComplexReference(z);
			assertComplexClose(res, ref, 1e-13, `quadrant z=(${z.re},${z.im}) `);
			assert.ok(res.re >= 0 && res.re <= Math.PI, 'real part must lie in [0, pi]');
			if (z.im > 0) {
				assert.ok(res.im < 0, 'upper half-plane must map to negative imaginary part');
			} else if (z.im < 0) {
				assert.ok(res.im > 0, 'lower half-plane must map to positive imaginary part');
			}
		}
	});

	test('preserves accuracy for tiny perturbations and extreme magnitudes', () => {
		// Tiny imaginary perturbation off (-1, 1): arccos(0.5 + i*eps) ~ pi/3 - i*eps/sin(pi/3)
		const eps = 1e-14;
		const tiny = arccosComplexIterative({ re: 0.5, im: eps });
		assertClose(tiny.re, Math.PI / 3, 1e-14);
		assertClose(tiny.im, -eps / Math.sin(Math.PI / 3), 1e-11);

		// Near branch point z = 1 + i*delta: arccos(1 + i*delta) ~ sqrt(delta) * (1 - i)
		const delta = 1e-12;
		const nearBranch = arccosComplexIterative({ re: 1, im: delta });
		assertComplexClose(cosComplex(nearBranch), { re: 1, im: delta }, 1e-12);

		// Very large magnitudes should not overflow to NaN/Infinity
		const hugeQ1 = arccosComplexIterative({ re: 1e150, im: 1e150 });
		assert.ok(Number.isFinite(hugeQ1.re) && Number.isFinite(hugeQ1.im));
		assertClose(hugeQ1.re, Math.PI / 4, 1e-14);
		assertClose(hugeQ1.im, -(Math.LN2 + 150 * Math.LN10 + 0.5 * Math.LN2), 1e-13);

		const hugeNegReal = arccosComplexIterative({ re: -1e200, im: 0 });
		assertClose(hugeNegReal.re, Math.PI, 1e-14);
		assertClose(hugeNegReal.im, -(Math.LN2 + 200 * Math.LN10), 1e-13);
	});

	test('independent cross-check: cos(arccos(z)) === z across all quadrants and axes', () => {
		const coords = [-10, -2, -1.001, -1, -0.5, -0.01, 0, 0.01, 0.5, 1, 1.001, 2, 10];
		for (const re of coords) {
			for (const im of coords) {
				const z = { re, im };
				const w = arccosComplexIterative(z);
				assert.ok(w.re >= 0 && w.re <= Math.PI, `principal real range failed for (${re},${im})`);
				const reconstructed = cosComplex(w);
				assertComplexClose(reconstructed, z, 1e-11, `cos(arccos(${re},${im})) `);
			}
		}
	});

	test('independent cross-check: conjugate and reflection symmetries', () => {
		const points = [
			{ re: 0.3, im: 0.7 },
			{ re: 2.4, im: 1.1 },
			{ re: 0.99, im: 0.02 },
			{ re: 5.5, im: 8.2 },
		];

		for (const z of points) {
			const w = arccosComplexIterative(z);
			const wConj = arccosComplexIterative({ re: z.re, im: -z.im });
			assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-14, 'conjugate symmetry ');

			const wNeg = arccosComplexIterative({ re: -z.re, im: -z.im });
			assertComplexClose(wNeg, { re: Math.PI - w.re, im: -w.im }, 1e-14, 'reflection symmetry ');
		}
	});

	test('throws TypeError and RangeError on invalid inputs', () => {
		const badTypes = [
			null,
			undefined,
			0,
			1,
			'1+0i',
			true,
			[1, 0],
			{},
			{ re: 1 },
			{ im: 0 },
			{ re: '1', im: 0 },
			{ re: 1, im: null },
			{ re: 1, im: undefined },
		];
		for (const input of badTypes) {
			assert.throws(() => arccosComplexIterative(input), TypeError);
		}

		const badRanges = [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 0 },
			{ re: Number.NEGATIVE_INFINITY, im: 0 },
			{ re: 0, im: Number.POSITIVE_INFINITY },
			{ re: 0, im: Number.NEGATIVE_INFINITY },
		];
		for (const input of badRanges) {
			assert.throws(() => arccosComplexIterative(input), RangeError);
		}
	});
});
