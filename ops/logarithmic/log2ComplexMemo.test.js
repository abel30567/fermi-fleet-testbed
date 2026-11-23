import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log2ComplexMemo } from './log2ComplexMemo.js';

const PI_OVER_LN2 = Math.PI / Math.LN2;
const PERIOD_IM = (2 * Math.PI) / Math.LN2;

/**
 * Assert two complex numbers are approximately equal within `eps`.
 */
function assertComplexClose(actual, expected, eps = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : '';
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${prefix}re mismatch: got ${actual.re}, expected ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${prefix}im mismatch: got ${actual.im}, expected ${expected.im}`
	);
}

/**
 * Independent complex power 2^w = 2^a * (cos(b*ln2) + i*sin(b*ln2)).
 */
function pow2Complex(w) {
	const mag = 2 ** w.re;
	const theta = w.im * Math.LN2;
	return {
		re: mag * Math.cos(theta),
		im: mag * Math.sin(theta),
	};
}

/**
 * Complex multiplication z1 * z2.
 */
function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

describe('log2ComplexMemo', () => {
	describe('precomputed exact table values', () => {
		it('computes exact values for unit cardinal points 1, -1, i, -i', () => {
			assert.deepEqual(log2ComplexMemo({ re: 1, im: 0 }), { re: 0, im: 0 });
			assert.deepEqual(log2ComplexMemo({ re: -1, im: 0 }), {
				re: 0,
				im: PI_OVER_LN2,
			});
			assert.deepEqual(log2ComplexMemo({ re: 0, im: 1 }), {
				re: 0,
				im: PI_OVER_LN2 / 2,
			});
			assert.deepEqual(log2ComplexMemo({ re: 0, im: -1 }), {
				re: 0,
				im: -PI_OVER_LN2 / 2,
			});
		});

		it('computes exact values for positive and negative powers of 2 on all axes', () => {
			for (const k of [-16, -5, -1, 1, 3, 10, 16]) {
				const p = 2 ** k;
				assert.deepEqual(log2ComplexMemo({ re: p, im: 0 }), { re: k, im: 0 });
				assert.deepEqual(log2ComplexMemo({ re: -p, im: 0 }), {
					re: k,
					im: PI_OVER_LN2,
				});
				assert.deepEqual(log2ComplexMemo({ re: 0, im: p }), {
					re: k,
					im: PI_OVER_LN2 / 2,
				});
				assert.deepEqual(log2ComplexMemo({ re: 0, im: -p }), {
					re: k,
					im: -PI_OVER_LN2 / 2,
				});
			}
		});

		it('computes exact values for diagonal powers of 2', () => {
			assert.deepEqual(log2ComplexMemo({ re: 1, im: 1 }), {
				re: 0.5,
				im: PI_OVER_LN2 / 4,
			});
			assert.deepEqual(log2ComplexMemo({ re: 1, im: -1 }), {
				re: 0.5,
				im: -PI_OVER_LN2 / 4,
			});
			assert.deepEqual(log2ComplexMemo({ re: -1, im: 1 }), {
				re: 0.5,
				im: ((3 * Math.PI) / 4) / Math.LN2,
			});
			assert.deepEqual(log2ComplexMemo({ re: -1, im: -1 }), {
				re: 0.5,
				im: -(((3 * Math.PI) / 4) / Math.LN2),
			});
			assert.deepEqual(log2ComplexMemo({ re: 4, im: 4 }), {
				re: 2.5,
				im: PI_OVER_LN2 / 4,
			});
			assert.deepEqual(log2ComplexMemo({ re: 0.25, im: -0.25 }), {
				re: -1.5,
				im: -PI_OVER_LN2 / 4,
			});
		});
	});

	describe('general complex inputs across all quadrants', () => {
		it('matches closed-form values in all four quadrants', () => {
			const cases = [
				{
					z: { re: 3, im: 4 },
					expected: { re: Math.log2(5), im: Math.atan2(4, 3) / Math.LN2 },
				},
				{
					z: { re: -3, im: 4 },
					expected: { re: Math.log2(5), im: Math.atan2(4, -3) / Math.LN2 },
				},
				{
					z: { re: -3, im: -4 },
					expected: { re: Math.log2(5), im: Math.atan2(-4, -3) / Math.LN2 },
				},
				{
					z: { re: 3, im: -4 },
					expected: { re: Math.log2(5), im: Math.atan2(-4, 3) / Math.LN2 },
				},
				{
					z: { re: 1, im: Math.sqrt(3) },
					expected: { re: 1, im: PI_OVER_LN2 / 3 },
				},
				{
					z: { re: -Math.sqrt(3), im: 1 },
					expected: { re: 1, im: (5 * PI_OVER_LN2) / 6 },
				},
			];

			for (const { z, expected } of cases) {
				assertComplexClose(log2ComplexMemo(z), expected, 1e-13);
			}
		});

		it('handles non-table powers of 2 and purely real/imaginary values', () => {
			assertComplexClose(log2ComplexMemo({ re: 2 ** 30, im: 0 }), {
				re: 30,
				im: 0,
			});
			assertComplexClose(log2ComplexMemo({ re: 0, im: 2 ** -30 }), {
				re: -30,
				im: PI_OVER_LN2 / 2,
			});
			assertComplexClose(log2ComplexMemo({ re: 10, im: 0 }), {
				re: Math.log2(10),
				im: 0,
			});
		});
	});

	describe('branch cut, signed zero, and extreme magnitudes', () => {
		it('enforces principal branch (-pi, pi] on negative real axis with +0 and -0', () => {
			const posZero = log2ComplexMemo({ re: -5, im: 0 });
			const negZero = log2ComplexMemo({ re: -5, im: -0 });
			const expected = { re: Math.log2(5), im: PI_OVER_LN2 };
			assertComplexClose(posZero, expected, 1e-14);
			assertComplexClose(negZero, expected, 1e-14);

			// Ensure signed zero never leaks as -0 in outputs
			const oneNegZero = log2ComplexMemo({ re: 1, im: -0 });
			assert.ok(Object.is(oneNegZero.re, 0));
			assert.ok(Object.is(oneNegZero.im, 0));

			const negOneNegZero = log2ComplexMemo({ re: -1, im: -0 });
			assert.ok(Object.is(negOneNegZero.re, 0));
			assert.equal(negOneNegZero.im, PI_OVER_LN2);
		});

		it('avoids overflow and underflow for extreme finite magnitudes', () => {
			const huge = log2ComplexMemo({ re: 1e308, im: 1e308 });
			assert.ok(Number.isFinite(huge.re));
			assert.ok(Number.isFinite(huge.im));
			assertComplexClose(
				huge,
				{ re: Math.log2(1e308) + 0.5, im: PI_OVER_LN2 / 4 },
				1e-12
			);

			const tiny = log2ComplexMemo({ re: 1e-308, im: -1e-308 });
			assert.ok(Number.isFinite(tiny.re));
			assert.ok(Number.isFinite(tiny.im));
			assertComplexClose(
				tiny,
				{ re: Math.log2(1e-308) + 0.5, im: -PI_OVER_LN2 / 4 },
				1e-12
			);

			const maxVal = log2ComplexMemo({ re: Number.MAX_VALUE, im: 0 });
			assert.ok(Number.isFinite(maxVal.re));
			assert.equal(maxVal.im, 0);

			const minVal = log2ComplexMemo({ re: 0, im: Number.MIN_VALUE });
			assert.equal(minVal.re, -1074);
			assert.equal(minVal.im, PI_OVER_LN2 / 2);
		});
	});

	describe('memoization and cache immutability', () => {
		it('returns fresh objects so caller mutations cannot corrupt precomputed entries', () => {
			const first = log2ComplexMemo({ re: 1, im: 0 });
			first.re = 999;
			first.im = -999;

			const second = log2ComplexMemo({ re: 1, im: 0 });
			assert.notEqual(first, second);
			assert.deepEqual(second, { re: 0, im: 0 });
		});

		it('returns fresh objects so caller mutations cannot corrupt memoized cache entries', () => {
			const z = { re: 7.25, im: -2.5 };
			const first = log2ComplexMemo(z);
			const expected = { re: first.re, im: first.im };
			first.re = -12345;
			first.im = 54321;

			const second = log2ComplexMemo(z);
			assert.notEqual(first, second);
			assert.deepEqual(second, expected);
		});

		it('handles bounded cache eviction gracefully beyond cache capacity', () => {
			const probes = [];
			for (let i = 1; i <= 1200; i++) {
				const z = { re: i * 0.37, im: i * 0.19 };
				const res = log2ComplexMemo(z);
				if (i === 1 || i === 600 || i === 1200) {
					probes.push({ z, expected: res });
				}
			}

			for (const { z, expected } of probes) {
				assert.deepEqual(log2ComplexMemo(z), expected);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed inputs', () => {
			const badInputs = [
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
			];

			for (const bad of badInputs) {
				assert.throws(() => log2ComplexMemo(bad), TypeError);
			}
		});

		it('throws RangeError for non-finite components or zero', () => {
			const badRanges = [
				{ re: 0, im: 0 },
				{ re: -0, im: 0 },
				{ re: 0, im: -0 },
				{ re: -0, im: -0 },
				{ re: Number.NaN, im: 1 },
				{ re: 1, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			];

			for (const bad of badRanges) {
				assert.throws(() => log2ComplexMemo(bad), RangeError);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies inverse identity 2^(log2(z)) === z across diverse complex inputs', () => {
			const samples = [
				{ re: 1, im: 0 },
				{ re: -1, im: 0 },
				{ re: 0, im: 1 },
				{ re: 0, im: -1 },
				{ re: 2.5, im: 3.7 },
				{ re: -4.2, im: 1.9 },
				{ re: -0.75, im: -6.1 },
				{ re: 8.3, im: -0.25 },
				{ re: 1e-6, im: 2e-6 },
				{ re: -1e5, im: 3e4 },
			];

			for (const z of samples) {
				const w = log2ComplexMemo(z);
				const reconstructed = pow2Complex(w);
				const scale = Math.max(1, Math.hypot(z.re, z.im));
				assertComplexClose(
					reconstructed,
					z,
					1e-11 * scale,
					`2^log2(${z.re}+${z.im}i)`
				);
			}
		});

		it('satisfies multiplicative identity log2(z1*z2) === log2(z1)+log2(z2) mod (2*pi*i / ln 2)', () => {
			const pairs = [
				[
					{ re: 2, im: 3 },
					{ re: 4, im: -5 },
				],
				[
					{ re: -1.5, im: 2.5 },
					{ re: -3.2, im: -0.8 },
				],
				[
					{ re: 0.25, im: -0.75 },
					{ re: -0.5, im: 1.25 },
				],
				[
					{ re: -2, im: 0 },
					{ re: -3, im: 0 },
				],
				[
					{ re: 0, im: 7 },
					{ re: 0, im: 11 },
				],
			];

			for (const [z1, z2] of pairs) {
				const lhs = log2ComplexMemo(mulComplex(z1, z2));
				const l1 = log2ComplexMemo(z1);
				const l2 = log2ComplexMemo(z2);
				const sumRe = l1.re + l2.re;
				const sumIm = l1.im + l2.im;

				assert.ok(
					Math.abs(lhs.re - sumRe) <= 1e-12,
					`Real part mismatch: ${lhs.re} vs ${sumRe}`
				);

				// Check imaginary difference is an integer multiple of 2*pi/ln(2)
				const diffIm = lhs.im - sumIm;
				const k = Math.round(diffIm / PERIOD_IM);
				assert.ok(
					Math.abs(diffIm - k * PERIOD_IM) <= 1e-12,
					`Imaginary part mismatch mod 2*pi/ln2: diff=${diffIm}, k=${k}`
				);
			}
		});

		it('satisfies conjugate symmetry log2(conj(z)) === conj(log2(z)) off the negative real axis', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -2.1, im: 5.4 },
				{ re: 0, im: 9.5 },
				{ re: 0.125, im: 0.375 },
			];

			for (const z of samples) {
				const w = log2ComplexMemo(z);
				const wConj = log2ComplexMemo({ re: z.re, im: -z.im });
				assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-13);
			}
		});
	});
});
