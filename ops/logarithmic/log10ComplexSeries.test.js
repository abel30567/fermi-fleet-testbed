import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10ComplexSeries } from './log10ComplexSeries.js';

const TOL = 1e-12;
const PERIOD_IM = (2 * Math.PI) / Math.LN10;

function assertApprox(actual, expected, tol = TOL, label = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${label}: expected ${expected}, got ${actual} (diff=${diff}, allowed=${tol * scale})`,
	);
}

function assertComplexApprox(actual, expected, tol = TOL, label = '') {
	assertApprox(actual.re, expected.re, tol, `${label}.re`);
	assertApprox(actual.im, expected.im, tol, `${label}.im`);
}

function pow10Complex(w) {
	const ln10 = Math.LN10;
	const mag = Math.exp(w.re * ln10);
	const angle = w.im * ln10;
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	};
}

function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function refLog10(z) {
	const r = Math.hypot(z.re, z.im);
	const arg = z.im === 0 && z.re < 0 ? Math.PI : Math.atan2(z.im, z.re);
	return {
		re: Math.log(r) / Math.LN10,
		im: arg / Math.LN10,
	};
}

describe('log10ComplexSeries', () => {
	it('matches Math.log10 on positive real numbers', () => {
		const reals = [
			1,
			10,
			100,
			1000,
			1e9,
			0.1,
			0.001,
			2,
			0.5,
			Math.E,
			Math.PI,
			42.125,
			1e-100,
			1e100,
			1e-300,
			1e300,
			Number.MIN_VALUE,
			Number.MAX_VALUE,
		];

		for (const x of reals) {
			const res = log10ComplexSeries({ re: x, im: 0 });
			assertApprox(res.re, Math.log10(x), 1e-14, `re for x=${x}`);
			assert.equal(res.im, 0);
			assert.ok(!Object.is(res.im, -0));
		}

		// Exact zero for log10(1)
		const one = log10ComplexSeries({ re: 1, im: 0 });
		assert.equal(one.re, 0);
		assert.equal(one.im, 0);
		assert.ok(!Object.is(one.re, -0));
	});

	it('computes principal branch on negative real axis (Arg = +pi)', () => {
		const negReals = [-1, -10, -100, -0.01, -3.5];
		const expectedIm = Math.PI / Math.LN10;

		for (const x of negReals) {
			const res = log10ComplexSeries({ re: x, im: 0 });
			assertApprox(res.re, Math.log10(-x), 1e-14, `re for x=${x}`);
			assertApprox(res.im, expectedIm, 1e-14, `im for x=${x}`);
		}

		// Negative zero imaginary part on negative real axis still yields principal branch +pi
		const negZeroIm = log10ComplexSeries({ re: -10, im: -0 });
		assertApprox(negZeroIm.re, 1, 1e-14);
		assertApprox(negZeroIm.im, expectedIm, 1e-14);
	});

	it('computes purely imaginary inputs accurately', () => {
		const halfPiOverLn10 = Math.PI / (2 * Math.LN10);

		const posI = log10ComplexSeries({ re: 0, im: 1 });
		assertApprox(posI.re, 0, 1e-15);
		assertApprox(posI.im, halfPiOverLn10, 1e-14);

		const negI = log10ComplexSeries({ re: 0, im: -1 });
		assertApprox(negI.re, 0, 1e-15);
		assertApprox(negI.im, -halfPiOverLn10, 1e-14);

		const tenI = log10ComplexSeries({ re: 0, im: 10 });
		assertApprox(tenI.re, 1, 1e-14);
		assertApprox(tenI.im, halfPiOverLn10, 1e-14);

		const negHundredI = log10ComplexSeries({ re: 0, im: -100 });
		assertApprox(negHundredI.re, 2, 1e-14);
		assertApprox(negHundredI.im, -halfPiOverLn10, 1e-14);
	});

	it('matches reference implementation across all 8 octants', () => {
		const cases = [
			{ re: 3, im: 1 }, // octant 1: 0 < arg < pi/4
			{ re: 1, im: 1 }, // pi/4
			{ re: 1, im: 3 }, // octant 2: pi/4 < arg < pi/2
			{ re: -1, im: 3 }, // octant 3: pi/2 < arg < 3pi/4
			{ re: -1, im: 1 }, // 3pi/4
			{ re: -3, im: 1 }, // octant 4: 3pi/4 < arg < pi
			{ re: -3, im: -1 }, // octant 5: -pi < arg < -3pi/4
			{ re: -1, im: -1 }, // -3pi/4
			{ re: -1, im: -3 }, // octant 6: -3pi/4 < arg < -pi/2
			{ re: 1, im: -3 }, // octant 7: -pi/2 < arg < -pi/4
			{ re: 1, im: -1 }, // -pi/4
			{ re: 3, im: -1 }, // octant 8: -pi/4 < arg < 0
			{ re: 0.6, im: 0.8 }, // unit circle
			{ re: -0.6, im: -0.8 }, // unit circle Q3
			{ re: 1e-5, im: 1e5 }, // steep ratio
			{ re: 1e5, im: -1e-5 }, // shallow ratio
		];

		for (const z of cases) {
			const actual = log10ComplexSeries(z);
			const expected = refLog10(z);
			assertComplexApprox(actual, expected, 1e-14, `z=${z.re}+${z.im}i`);
		}
	});

	it('satisfies the inverse identity 10^log10(z) ≈ z', () => {
		const samples = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -1 },
			{ re: 3, im: 4 },
			{ re: -5, im: 12 },
			{ re: -7, im: -24 },
			{ re: 8, im: -15 },
			{ re: 0.123, im: 0.456 },
			{ re: -1234.5, im: 678.9 },
			{ re: 1e-10, im: -2e-10 },
			{ re: 1e10, im: 3e10 },
		];

		for (const z of samples) {
			const w = log10ComplexSeries(z);
			const roundTrip = pow10Complex(w);
			assertComplexApprox(roundTrip, z, 1e-12, `10^log10(${z.re}+${z.im}i)`);
		}
	});

	it('satisfies log10(a * b) ≡ log10(a) + log10(b) (mod 2*pi*i / ln(10))', () => {
		const pairs = [
			[
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
			],
			[
				{ re: -2, im: 3 },
				{ re: -4, im: 5 },
			], // crosses branch cut into Q3/Q4
			[
				{ re: -1, im: -1 },
				{ re: -1, im: -2 },
			], // crosses branch cut from below
			[
				{ re: 0.5, im: -0.7 },
				{ re: -0.3, im: 0.9 },
			],
			[
				{ re: 0, im: 10 },
				{ re: 0, im: 100 },
			],
			[
				{ re: -10, im: 0 },
				{ re: -0.1, im: 0 },
			],
		];

		for (const [a, b] of pairs) {
			const prod = mulComplex(a, b);
			const lhs = log10ComplexSeries(prod);
			const la = log10ComplexSeries(a);
			const lb = log10ComplexSeries(b);
			const rhsRe = la.re + lb.re;
			const rhsIm = la.im + lb.im;

			assertApprox(lhs.re, rhsRe, 1e-13, `re for (${a.re}+${a.im}i)*(${b.re}+${b.im}i)`);

			// Difference in imaginary parts must be an integer multiple of 2*pi/ln(10)
			const diffIm = lhs.im - rhsIm;
			const k = Math.round(diffIm / PERIOD_IM);
			assert.ok(
				Math.abs(diffIm - k * PERIOD_IM) <= 1e-13 * Math.max(1, Math.abs(rhsIm)),
				`im congruence failed: lhs.im=${lhs.im}, rhs.im=${rhsIm}, k=${k}`,
			);
		}
	});

	it('satisfies conjugate symmetry and reciprocal identities off the branch cut', () => {
		const samples = [
			{ re: 2, im: 5 },
			{ re: -3, im: 4 },
			{ re: 0.25, im: -0.75 },
		];

		for (const z of samples) {
			const lz = log10ComplexSeries(z);
			const lConj = log10ComplexSeries({ re: z.re, im: -z.im });
			assertComplexApprox(lConj, { re: lz.re, im: -lz.im }, 1e-14, 'conjugate');

			const norm2 = z.re * z.re + z.im * z.im;
			const inv = { re: z.re / norm2, im: -z.im / norm2 };
			const lInv = log10ComplexSeries(inv);
			assertComplexApprox(lInv, { re: -lz.re, im: -lz.im }, 1e-13, 'reciprocal');
		}
	});

	it('handles overflow-prone, underflow-prone, and cancellation-sensitive inputs', () => {
		// Overflow-prone modulus: 3e307^2 + 4e307^2 would overflow IEEE-754
		const huge = log10ComplexSeries({ re: 3e307, im: 4e307 });
		assertApprox(huge.re, 307 + Math.log10(5), 1e-14, 'huge.re');
		assertApprox(huge.im, Math.atan2(4, 3) / Math.LN10, 1e-14, 'huge.im');

		// Underflow-prone modulus: 3e-307^2 + 4e-307^2 would underflow to 0
		const tiny = log10ComplexSeries({ re: -3e-307, im: -4e-307 });
		assertApprox(tiny.re, -307 + Math.log10(5), 1e-14, 'tiny.re');
		assertApprox(tiny.im, Math.atan2(-4, -3) / Math.LN10, 1e-14, 'tiny.im');

		// Cancellation-sensitive: |1 + 1e-10 i| = sqrt(1 + 1e-20), ln|z| ≈ 0.5e-20
		const nearOne = log10ComplexSeries({ re: 1, im: 1e-10 });
		const expectedNearOneRe = 0.5e-20 / Math.LN10;
		assert.ok(
			Math.abs(nearOne.re - expectedNearOneRe) <= 1e-12 * expectedNearOneRe,
			`nearOne.re relative accuracy failed: expected ${expectedNearOneRe}, got ${nearOne.re}`,
		);
		assert.ok(
			Math.abs(nearOne.im - 1e-10 / Math.LN10) <= 1e-14 * (1e-10 / Math.LN10),
			`nearOne.im relative accuracy failed: got ${nearOne.im}`,
		);
	});

	it('throws RangeError for z = 0 + 0i (including signed zeros)', () => {
		assert.throws(() => log10ComplexSeries({ re: 0, im: 0 }), RangeError);
		assert.throws(() => log10ComplexSeries({ re: -0, im: 0 }), RangeError);
		assert.throws(() => log10ComplexSeries({ re: 0, im: -0 }), RangeError);
		assert.throws(() => log10ComplexSeries({ re: -0, im: -0 }), RangeError);
	});

	it('throws RangeError for non-finite components', () => {
		assert.throws(() => log10ComplexSeries({ re: NaN, im: 1 }), RangeError);
		assert.throws(() => log10ComplexSeries({ re: 1, im: NaN }), RangeError);
		assert.throws(() => log10ComplexSeries({ re: Infinity, im: 0 }), RangeError);
		assert.throws(() => log10ComplexSeries({ re: 0, im: -Infinity }), RangeError);
	});

	it('throws TypeError for invalid input types', () => {
		assert.throws(() => log10ComplexSeries(null), TypeError);
		assert.throws(() => log10ComplexSeries(undefined), TypeError);
		assert.throws(() => log10ComplexSeries(10), TypeError);
		assert.throws(() => log10ComplexSeries('10'), TypeError);
		assert.throws(() => log10ComplexSeries({}), TypeError);
		assert.throws(() => log10ComplexSeries({ re: 1 }), TypeError);
		assert.throws(() => log10ComplexSeries({ im: 1 }), TypeError);
		assert.throws(() => log10ComplexSeries({ re: '1', im: 0 }), TypeError);
		assert.throws(() => log10ComplexSeries({ re: 1, im: 0n }), TypeError);
	});
});
