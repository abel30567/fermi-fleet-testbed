import test from 'node:test';
import assert from 'node:assert/strict';
import { log10ComplexMemo } from './log10ComplexMemo.js';

const LN10 = Math.LN10;
const PI_OVER_LN10 = Math.PI / LN10;
const HALF_PI_OVER_LN10 = Math.PI / (2 * LN10);

/**
 * Asserts that two complex numbers are equal within a given tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-12]
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)})`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)})`,
	);
}

/**
 * Independent helper computing 10^w for complex w = u + i*v.
 * 10^(u + i*v) = 10^u * (cos(v * ln(10)) + i * sin(v * ln(10))).
 */
function pow10Complex(w) {
	const r = 10 ** w.re;
	const theta = w.im * LN10;
	return {
		re: r * Math.cos(theta),
		im: r * Math.sin(theta),
	};
}

/**
 * Independent Taylor-series implementation of log10(1 + delta) for |delta| < 1,
 * using only basic complex addition and multiplication (no Math.log/hypot/atan2).
 */
function log10OnePlusTaylor(delta, terms = 80) {
	// Compute ln(10) independently via 2 * atanh(9/11) = 2 * sum_{k>=0} (9/11)^(2k+1) / (2k+1)
	const x = 9 / 11;
	const x2 = x * x;
	let xPow = x;
	let ln10Series = 0;
	for (let k = 0; k < 60; k += 1) {
		ln10Series += xPow / (2 * k + 1);
		xPow *= x2;
	}
	ln10Series *= 2;

	let sumRe = 0;
	let sumIm = 0;
	let powRe = delta.re;
	let powIm = delta.im;

	for (let n = 1; n <= terms; n += 1) {
		const sign = n % 2 === 1 ? 1 : -1;
		sumRe += (sign * powRe) / n;
		sumIm += (sign * powIm) / n;

		const nextRe = powRe * delta.re - powIm * delta.im;
		const nextIm = powRe * delta.im + powIm * delta.re;
		powRe = nextRe;
		powIm = nextIm;
	}

	return {
		re: sumRe / ln10Series,
		im: sumIm / ln10Series,
	};
}

test('precomputed table values: powers of 10 along real and imaginary axes', () => {
	assert.deepStrictEqual(log10ComplexMemo({ re: 1, im: 0 }), { re: 0, im: 0 });
	assert.deepStrictEqual(log10ComplexMemo({ re: 10, im: 0 }), { re: 1, im: 0 });
	assert.deepStrictEqual(log10ComplexMemo({ re: 1000, im: 0 }), { re: 3, im: 0 });
	assert.deepStrictEqual(log10ComplexMemo({ re: 0.01, im: 0 }), { re: -2, im: 0 });
	assert.deepStrictEqual(log10ComplexMemo({ re: 1e-6, im: 0 }), { re: -6, im: 0 });
	assert.deepStrictEqual(log10ComplexMemo({ re: 1e6, im: 0 }), { re: 6, im: 0 });

	assertComplexClose(log10ComplexMemo({ re: -1, im: 0 }), { re: 0, im: PI_OVER_LN10 }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: -100, im: 0 }), { re: 2, im: PI_OVER_LN10 }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: 0, im: 1 }), { re: 0, im: HALF_PI_OVER_LN10 }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: 0, im: -1 }), { re: 0, im: -HALF_PI_OVER_LN10 }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: 0, im: 10 }), { re: 1, im: HALF_PI_OVER_LN10 }, 1e-15);
	assertComplexClose(
		log10ComplexMemo({ re: 0, im: -0.1 }),
		{ re: -1, im: -HALF_PI_OVER_LN10 },
		1e-15,
	);
});

test('precomputed diagonal unit corners (±1 ± i)', () => {
	const halfLog10_2 = 0.5 * Math.log10(2);
	const qPi = Math.PI / (4 * LN10);
	const tqPi = (3 * Math.PI) / (4 * LN10);

	assertComplexClose(log10ComplexMemo({ re: 1, im: 1 }), { re: halfLog10_2, im: qPi }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: 1, im: -1 }), { re: halfLog10_2, im: -qPi }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: -1, im: 1 }), { re: halfLog10_2, im: tqPi }, 1e-15);
	assertComplexClose(log10ComplexMemo({ re: -1, im: -1 }), { re: halfLog10_2, im: -tqPi }, 1e-15);
});

test('general complex numbers across all four quadrants', () => {
	const cases = [
		{ re: 3, im: 4 },
		{ re: -3, im: 4 },
		{ re: -3, im: -4 },
		{ re: 3, im: -4 },
		{ re: 0.25, im: 0.75 },
		{ re: -12.5, im: 0.125 },
	];

	for (const z of cases) {
		const expected = {
			re: Math.log10(Math.hypot(z.re, z.im)),
			im: Math.atan2(z.im, z.re) / LN10,
		};
		assertComplexClose(log10ComplexMemo(z), expected, 1e-14);
	}
});

test('edge cases: branch cut signed zeros and extreme magnitudes without overflow/underflow', () => {
	// Signed zero continuity on the negative real axis
	const aboveCut = log10ComplexMemo({ re: -1, im: 0 });
	const belowCut = log10ComplexMemo({ re: -1, im: -0 });
	assertComplexClose(aboveCut, { re: 0, im: PI_OVER_LN10 }, 1e-15);
	assertComplexClose(belowCut, { re: 0, im: -PI_OVER_LN10 }, 1e-15);

	// Non-table negative real with signed zeros (tests cache key separation of +0 vs -0)
	const aboveCutDyn = log10ComplexMemo({ re: -2.5, im: 0 });
	const belowCutDyn = log10ComplexMemo({ re: -2.5, im: -0 });
	assertComplexClose(aboveCutDyn, { re: Math.log10(2.5), im: PI_OVER_LN10 }, 1e-14);
	assertComplexClose(belowCutDyn, { re: Math.log10(2.5), im: -PI_OVER_LN10 }, 1e-14);

	// Extreme large magnitude where Math.hypot(1e308, 1e308) would overflow to Infinity
	const huge = log10ComplexMemo({ re: 1e308, im: 1e308 });
	assert.ok(Number.isFinite(huge.re) && Number.isFinite(huge.im));
	assertComplexClose(
		huge,
		{ re: 308 + 0.5 * Math.log10(2), im: Math.PI / (4 * LN10) },
		1e-12,
	);

	// Extreme subnormal small magnitude where re*re + im*im underflows to 0
	const tiny = log10ComplexMemo({ re: 1e-315, im: 1e-315 });
	assert.ok(Number.isFinite(tiny.re) && Number.isFinite(tiny.im));
	assertComplexClose(
		tiny,
		{ re: Math.log10(1e-315) + 0.5 * Math.log10(2), im: Math.PI / (4 * LN10) },
		1e-11,
	);

	// Very small imaginary component relative to real component
	const nearReal = log10ComplexMemo({ re: 1, im: 1e-10 });
	assertComplexClose(
		nearReal,
		{ re: (0.5 * Math.log1p(1e-20)) / LN10, im: 1e-10 / LN10 },
		1e-15,
	);
});

test('memoization consistency, mutation isolation, and bounded cache eviction', () => {
	// Mutating returned object from precomputed table must not corrupt subsequent calls
	const p1 = log10ComplexMemo({ re: 10, im: 0 });
	p1.re = 999;
	p1.im = -999;
	const p2 = log10ComplexMemo({ re: 10, im: 0 });
	assert.deepStrictEqual(p2, { re: 1, im: 0 });
	assert.notStrictEqual(p1, p2);

	// Mutating returned object from dynamic memo cache must not corrupt subsequent calls
	const z = { re: 7.25, im: -3.5 };
	const r1 = log10ComplexMemo(z);
	const expectedRe = r1.re;
	const expectedIm = r1.im;
	r1.re = NaN;
	r1.im = Infinity;

	const r2 = log10ComplexMemo(z);
	assert.strictEqual(r2.re, expectedRe);
	assert.strictEqual(r2.im, expectedIm);
	assert.notStrictEqual(r1, r2);

	// Exercise more than MAX_CACHE_SIZE (1024) distinct inputs to verify eviction works cleanly
	for (let i = 1; i <= 1200; i += 1) {
		const res = log10ComplexMemo({ re: i, im: i * 0.5 });
		assert.ok(Number.isFinite(res.re) && Number.isFinite(res.im));
	}

	// Re-evaluating an earlier evicted entry still returns exact same result
	const afterEviction = log10ComplexMemo(z);
	assert.strictEqual(afterEviction.re, expectedRe);
	assert.strictEqual(afterEviction.im, expectedIm);
});

test('independent cross-check 1: inverse identity 10^(log10(z)) === z', () => {
	const samples = [
		{ re: 2, im: 3 },
		{ re: -5, im: 12 },
		{ re: -8, im: -15 },
		{ re: 0.7, im: -2.4 },
		{ re: 123.456, im: 789.012 },
		{ re: -0.005, im: 0.008 },
		{ re: -7, im: 0 },
		{ re: 0, im: -42 },
	];

	for (const z of samples) {
		const w = log10ComplexMemo(z);
		const reconstructed = pow10Complex(w);
		const scale = Math.hypot(z.re, z.im);
		assertComplexClose(reconstructed, z, 1e-12 * Math.max(1, scale));
	}
});

test('independent cross-check 2: pure Taylor series near z = 1 (no Math.log/hypot/atan2)', () => {
	const deltas = [
		{ re: 0.1, im: 0.2 },
		{ re: -0.15, im: 0.25 },
		{ re: -0.2, im: -0.1 },
		{ re: 0.3, im: -0.15 },
		{ re: 0.0, im: 0.35 },
	];

	for (const d of deltas) {
		const z = { re: 1 + d.re, im: d.im };
		const actual = log10ComplexMemo(z);
		const series = log10OnePlusTaylor(d);
		assertComplexClose(actual, series, 1e-13);
	}
});

test('independent cross-check 3: algebraic identities (product, conjugate, reciprocal)', () => {
	const period = (2 * Math.PI) / LN10;
	const z1 = { re: 2.5, im: 1.5 };
	const z2 = { re: -1.2, im: 3.4 };
	const prod = {
		re: z1.re * z2.re - z1.im * z2.im,
		im: z1.re * z2.im + z1.im * z2.re,
	};

	const l1 = log10ComplexMemo(z1);
	const l2 = log10ComplexMemo(z2);
	const lProd = log10ComplexMemo(prod);

	assert.ok(Math.abs(lProd.re - (l1.re + l2.re)) < 1e-13);
	const imDiff = lProd.im - (l1.im + l2.im);
	const wrappedDiff = imDiff - Math.round(imDiff / period) * period;
	assert.ok(Math.abs(wrappedDiff) < 1e-13);

	// Conjugate symmetry: log10(conj(z)) === conj(log10(z)) away from negative real axis
	const lConj = log10ComplexMemo({ re: z1.re, im: -z1.im });
	assertComplexClose(lConj, { re: l1.re, im: -l1.im }, 1e-14);

	// Reciprocal identity: log10(1 / z) === -log10(z) away from negative real axis
	const normSq = z2.re * z2.re + z2.im * z2.im;
	const invZ2 = { re: z2.re / normSq, im: -z2.im / normSq };
	const lInv = log10ComplexMemo(invZ2);
	assertComplexClose(lInv, { re: -l2.re, im: -l2.im }, 1e-13);
});

test('input validation rejects invalid types, non-finite values, and zero', () => {
	const typeErrorInputs = [
		undefined,
		null,
		42,
		'1+2i',
		true,
		[1, 2],
		{},
		{ re: 1 },
		{ im: 1 },
		{ re: '1', im: 0 },
		{ re: 1, im: null },
		{ re: 1, im: undefined },
		{ re: 1n, im: 0 },
	];

	for (const bad of typeErrorInputs) {
		assert.throws(() => log10ComplexMemo(bad), TypeError);
	}

	const rangeErrorInputs = [
		{ re: 0, im: 0 },
		{ re: -0, im: 0 },
		{ re: 0, im: -0 },
		{ re: -0, im: -0 },
		{ re: Number.NaN, im: 1 },
		{ re: 1, im: Number.NaN },
		{ re: Number.POSITIVE_INFINITY, im: 0 },
		{ re: 0, im: Number.NEGATIVE_INFINITY },
		{ re: Number.POSITIVE_INFINITY, im: Number.POSITIVE_INFINITY },
	];

	for (const bad of rangeErrorInputs) {
		assert.throws(() => log10ComplexMemo(bad), RangeError);
	}
});
