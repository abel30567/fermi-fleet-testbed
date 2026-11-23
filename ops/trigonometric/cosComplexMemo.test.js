import test from 'node:test';
import assert from 'node:assert/strict';
import { cosComplexMemo } from './cosComplexMemo.js';

const EPS = 1e-12;

/**
 * Independent reference implementation via Euler's formula:
 *   cos(z) = (e^(i*z) + e^(-i*z)) / 2
 * where i*(a + bi) = -b + ai and -i*(a + bi) = b - ai.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function cosViaEuler(z) {
	const eMinusB = Math.exp(-z.im);
	const ePlusB = Math.exp(z.im);
	const cosA = Math.cos(z.re);
	const sinA = Math.sin(z.re);

	// e^(i*z) = e^(-b) * (cos(a) + i*sin(a))
	const pRe = eMinusB * cosA;
	const pIm = eMinusB * sinA;

	// e^(-i*z) = e^(b) * (cos(-a) + i*sin(-a)) = e^(b) * (cos(a) - i*sin(a))
	const nRe = ePlusB * cosA;
	const nIm = -ePlusB * sinA;

	return {
		re: (pRe + nRe) / 2,
		im: (pIm + nIm) / 2,
	};
}

function assertComplexClose(actual, expected, tol = EPS, label = '') {
	const reScale = Math.max(1, Math.abs(expected.re));
	const imScale = Math.max(1, Math.abs(expected.im));
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol * reScale,
		`${label} real mismatch: got ${actual.re}, expected ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol * imScale,
		`${label} imag mismatch: got ${actual.im}, expected ${expected.im}`
	);
}

test('zero input returns exact { re: 1, im: 0 }', () => {
	const res = cosComplexMemo({ re: 0, im: 0 });
	assert.deepStrictEqual(res, { re: 1, im: 0 });

	// Negative zeros should also normalize cleanly to +0.
	const negZero = cosComplexMemo({ re: -0, im: -0 });
	assert.deepStrictEqual(negZero, { re: 1, im: 0 });
	assert.ok(Object.is(negZero.im, 0));
});

test('real axis matches Math.cos(a) with zero imaginary part', () => {
	const angles = [
		0,
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 3,
		Math.PI / 2,
		Math.PI,
		(3 * Math.PI) / 2,
		2 * Math.PI,
		-Math.PI / 3,
		-2.75,
		10.123456,
		1e7 + 0.5,
	];

	for (const a of angles) {
		const res = cosComplexMemo({ re: a, im: 0 });
		assertComplexClose(res, { re: Math.cos(a), im: 0 }, EPS, `a=${a}`);
		assert.strictEqual(res.im, 0);
	}
});

test('imaginary axis satisfies cos(bi) = cosh(b) with zero imaginary part', () => {
	const values = [-10, -5.5, -1, -0.25, 0.25, 1, 3.14, 8, 12.5];

	for (const b of values) {
		const res = cosComplexMemo({ re: 0, im: b });
		assertComplexClose(res, { re: Math.cosh(b), im: 0 }, EPS, `b=${b}`);
		assert.strictEqual(res.im, 0);
	}
});

test('general complex numbers match cos(a)cosh(b) - i sin(a)sinh(b)', () => {
	const samples = [
		{ re: 1, im: 1 },
		{ re: -1.5, im: 2.25 },
		{ re: 0.7, im: -0.9 },
		{ re: -3.2, im: -4.1 },
		{ re: Math.PI / 4, im: Math.LN2 },
		{ re: 100.25, im: 9.5 }, // exceeds hyperbolic table range
		{ re: 1e7 + 1.2, im: -2.3 }, // exceeds trig Cody-Waite range
	];

	for (const z of samples) {
		const expected = {
			re: Math.cos(z.re) * Math.cosh(z.im),
			im: -Math.sin(z.re) * Math.sinh(z.im),
		};
		assertComplexClose(cosComplexMemo(z), expected, EPS, `z=(${z.re},${z.im})`);
	}
});

test('independent cross-check against Euler formula (e^(iz) + e^(-iz)) / 2', () => {
	const samples = [
		{ re: 0.3, im: 0.4 },
		{ re: -2.1, im: 1.7 },
		{ re: 4.5, im: -3.2 },
		{ re: -0.123, im: -6.789 },
		{ re: 12.34, im: 8.5 },
	];

	for (const z of samples) {
		assertComplexClose(cosComplexMemo(z), cosViaEuler(z), EPS, `euler z=(${z.re},${z.im})`);
	}
});

test('even symmetry cos(-z) = cos(z) and periodicity cos(z + 2*pi) = cos(z)', () => {
	const samples = [
		{ re: 0.5, im: 1.2 },
		{ re: -2.3, im: 3.7 },
		{ re: 5.1, im: -0.8 },
	];

	for (const z of samples) {
		const cPos = cosComplexMemo(z);
		const cNeg = cosComplexMemo({ re: -z.re, im: -z.im });
		const cShifted = cosComplexMemo({ re: z.re + 2 * Math.PI, im: z.im });

		assertComplexClose(cPos, cNeg, EPS, `even z=(${z.re},${z.im})`);
		assertComplexClose(cPos, cShifted, EPS, `periodic z=(${z.re},${z.im})`);
	}
});

test('overflow edge case avoids 0 * Infinity -> NaN on imaginary axis', () => {
	const res = cosComplexMemo({ re: 0, im: 1000 });
	assert.strictEqual(res.re, Infinity);
	assert.strictEqual(res.im, 0);
});

test('memoization cache returns fresh objects and preserves immutability', () => {
	const z = { re: 1.234, im: 5.678 };
	const first = cosComplexMemo(z);
	const second = cosComplexMemo(z);

	assert.deepStrictEqual(first, second);
	assert.notStrictEqual(first, second, 'cache hit must return a fresh object');

	// Mutating the returned object must not poison subsequent cache hits.
	first.re = 999999;
	first.im = -999999;

	const third = cosComplexMemo(z);
	assert.deepStrictEqual(third, second);
	assert.notStrictEqual(third, second);
});

test('bounded memoization cache handles > 1024 distinct inputs cleanly', () => {
	for (let i = 0; i < 1200; i++) {
		const z = { re: i * 0.01, im: (i % 17) * 0.1 };
		const res = cosComplexMemo(z);
		assertComplexClose(res, cosViaEuler(z), EPS, `evict i=${i}`);
	}

	// Re-querying an early evicted entry must still compute accurately.
	const early = { re: 0.01, im: 0.1 };
	assertComplexClose(cosComplexMemo(early), cosViaEuler(early), EPS, 'recompute evicted');
});

test('input validation rejects invalid types and non-finite components', () => {
	const invalidTypes = [
		null,
		undefined,
		42,
		'1+2i',
		true,
		[1, 2],
		{},
		{ re: 1 },
		{ im: 2 },
		{ re: '1', im: 0 },
		{ re: 0, im: null },
	];

	for (const bad of invalidTypes) {
		assert.throws(
			() => cosComplexMemo(bad),
			{ name: 'TypeError' },
			`expected TypeError for ${JSON.stringify(bad)}`
		);
	}

	const nonFinite = [
		{ re: NaN, im: 0 },
		{ re: 0, im: NaN },
		{ re: Infinity, im: 0 },
		{ re: -Infinity, im: 1 },
		{ re: 1, im: Infinity },
		{ re: 1, im: -Infinity },
	];

	for (const bad of nonFinite) {
		assert.throws(
			() => cosComplexMemo(bad),
			{ name: 'RangeError' },
			`expected RangeError for (${bad.re}, ${bad.im})`
		);
	}
});
