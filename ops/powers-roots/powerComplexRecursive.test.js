import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { powerComplexRecursive } from './powerComplexRecursive.js';

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	assert.equal(typeof actual, 'object', `${label} result should be an object`);
	assert.equal(typeof actual.re, 'number', `${label} re should be a number`);
	assert.equal(typeof actual.im, 'number', `${label} im should be a number`);
	const scale = Math.max(1, Math.hypot(expected.re, expected.im));
	const errRe = Math.abs(actual.re - expected.re);
	const errIm = Math.abs(actual.im - expected.im);
	assert.ok(
		errRe <= tol * scale,
		`${label} real part mismatch: got ${actual.re}, expected ${expected.re} (err=${errRe}, limit=${tol * scale})`
	);
	assert.ok(
		errIm <= tol * scale,
		`${label} imag part mismatch: got ${actual.im}, expected ${expected.im} (err=${errIm}, limit=${tol * scale})`
	);
}

function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Independent direct polar reference formula:
 * z^w = exp(u*ln(r) - v*theta) * [cos(u*theta + v*ln(r)) + i*sin(u*theta + v*ln(r))]
 */
function referencePolarPower(z, w) {
	const r = Math.hypot(z.re, z.im);
	const theta = Math.atan2(z.im, z.re);
	const lnR = Math.log(r);
	const mag = Math.exp(w.re * lnR - w.im * theta);
	const angle = w.re * theta + w.im * lnR;
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	};
}

/**
 * Independent iterative repeated multiplication for non-negative integer exponents.
 */
function referenceIterativeIntPower(z, n) {
	let acc = { re: 1, im: 0 };
	for (let i = 0; i < n; i++) {
		acc = mulComplex(acc, z);
	}
	return acc;
}

describe('powerComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes exact positive integer powers via recursive squaring', () => {
			assert.deepEqual(powerComplexRecursive({ re: 1, im: 1 }, { re: 4, im: 0 }), { re: -4, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: 3, im: 4 }, { re: 2, im: 0 }), { re: -7, im: 24 });
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 1 }, { re: 2, im: 0 }), { re: -1, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 1 }, { re: 3, im: 0 }), { re: 0, im: -1 });
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 1 }, { re: 4, im: 0 }), { re: 1, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: 2, im: -3 }, { re: 5, im: 0 }), { re: 122, im: 597 });
		});

		it('computes negative integer powers accurately', () => {
			assertComplexClose(
				powerComplexRecursive({ re: 3, im: 4 }, { re: -1, im: 0 }),
				{ re: 0.12, im: -0.16 },
				1e-15
			);
			assertComplexClose(
				powerComplexRecursive({ re: 1, im: 1 }, { re: -4, im: 0 }),
				{ re: -0.25, im: 0 },
				1e-15
			);
			assertComplexClose(
				powerComplexRecursive({ re: 0, im: 2 }, { re: -3, im: 0 }),
				{ re: 0, im: 0.125 },
				1e-15
			);
		});

		it('handles very large safe integer exponents in O(log n) recursion depth', () => {
			const bigExp = 2 ** 50 + 3; // congruent to 3 mod 4
			assert.deepEqual(
				powerComplexRecursive({ re: 0, im: 1 }, { re: bigExp, im: 0 }),
				{ re: 0, im: -1 }
			);
			assert.deepEqual(
				powerComplexRecursive({ re: -1, im: 0 }, { re: 2 ** 52 + 1, im: 0 }),
				{ re: -1, im: 0 }
			);
		});

		it('computes principal fractional roots for positive, negative, and complex bases', () => {
			assertComplexClose(
				powerComplexRecursive({ re: 4, im: 0 }, { re: 0.5, im: 0 }),
				{ re: 2, im: 0 },
				1e-15
			);
			assertComplexClose(
				powerComplexRecursive({ re: -1, im: 0 }, { re: 0.5, im: 0 }),
				{ re: 0, im: 1 },
				1e-15
			);
			assertComplexClose(
				powerComplexRecursive({ re: -8, im: 0 }, { re: 1 / 3, im: 0 }),
				{ re: 1, im: Math.sqrt(3) },
				1e-14
			);
			assertComplexClose(
				powerComplexRecursive({ re: 3, im: 4 }, { re: 0.5, im: 0 }),
				{ re: 2, im: 1 },
				1e-14
			);
		});

		it('computes purely imaginary and general complex exponents', () => {
			// Euler's identity: e^(i * pi) = -1
			assertComplexClose(
				powerComplexRecursive({ re: Math.E, im: 0 }, { re: 0, im: Math.PI }),
				{ re: -1, im: 0 },
				1e-14
			);
			// i^i = e^(-pi/2)
			const iToI = powerComplexRecursive({ re: 0, im: 1 }, { re: 0, im: 1 });
			assertComplexClose(iToI, { re: Math.exp(-Math.PI / 2), im: 0 }, 1e-15);
			assert.equal(iToI.im, 0);

			// 2^i = cos(ln 2) + i sin(ln 2)
			assertComplexClose(
				powerComplexRecursive({ re: 2, im: 0 }, { re: 0, im: 1 }),
				{ re: Math.cos(Math.LN2), im: Math.sin(Math.LN2) },
				1e-15
			);

			// General complex base and complex exponent
			const z = { re: 2, im: 3 };
			const w = { re: 1.5, im: -2.5 };
			assertComplexClose(powerComplexRecursive(z, w), referencePolarPower(z, w), 1e-13);
		});
	});

	describe('edge cases and numerical stability', () => {
		it('handles zero, identity, and unit bases', () => {
			// z^0 = 1 including 0^0 = 1
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 0 }, { re: 0, im: 0 }), { re: 1, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: -5, im: 7 }, { re: 0, im: 0 }), { re: 1, im: 0 });

			// z^1 = z
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 0 }, { re: 1, im: 0 }), { re: 0, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: -3, im: 4 }, { re: 1, im: 0 }), { re: -3, im: 4 });

			// 1^w = 1 for any complex w
			assert.deepEqual(powerComplexRecursive({ re: 1, im: 0 }, { re: 5, im: -12 }), { re: 1, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: 1, im: 0 }, { re: -100.5, im: 999 }), { re: 1, im: 0 });

			// 0^w = 0 for Re(w) > 0
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 0 }, { re: 3, im: 0 }), { re: 0, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 0 }, { re: 0.5, im: 0 }), { re: 0, im: 0 });
			assert.deepEqual(powerComplexRecursive({ re: 0, im: 0 }, { re: 2, im: -5 }), { re: 0, im: 0 });
		});

		it('normalizes -0 to +0 in outputs and consistently on the negative real branch cut', () => {
			const negZeroBranch = powerComplexRecursive({ re: -1, im: -0 }, { re: 0.5, im: 0 });
			assertComplexClose(negZeroBranch, { re: 0, im: 1 }, 1e-15);

			const idZero = powerComplexRecursive({ re: -0, im: -0 }, { re: 1, im: -0 });
			assert.ok(Object.is(idZero.re, 0));
			assert.ok(Object.is(idZero.im, 0));

			const sq = powerComplexRecursive({ re: 0, im: -2 }, { re: 2, im: 0 });
			assert.equal(sq.re, -4);
			assert.ok(Object.is(sq.im, 0));
		});

		it('avoids overflow/underflow for extreme magnitudes and subnormals', () => {
			// Overflow-safe reciprocal at 1e308 + 1e308i
			const hugeInv = powerComplexRecursive({ re: 1e308, im: 1e308 }, { re: -1, im: 0 });
			assertComplexClose(hugeInv, { re: 5e-309, im: -5e-309 }, 1e-12);

			// Overflow-safe log magnitude at 1e308 + 1e308i with fractional exponent 0.5
			const hugeSqrt = powerComplexRecursive({ re: 1e308, im: 1e308 }, { re: 0.5, im: 0 });
			const expectedMag = Math.sqrt(Math.SQRT2) * 1e154;
			assertComplexClose(
				hugeSqrt,
				{ re: expectedMag * Math.cos(Math.PI / 8), im: expectedMag * Math.sin(Math.PI / 8) },
				1e-13
			);

			// Subnormal result without premature intermediate overflow
			const subnormal = powerComplexRecursive({ re: 2, im: 0 }, { re: -1024, im: 0 });
			assertComplexClose(subnormal, { re: 2 ** -1024, im: 0 }, 1e-14);

			// Clean underflow to 0 + 0i
			assert.deepEqual(
				powerComplexRecursive({ re: Math.E, im: 0 }, { re: -800, im: 3 }),
				{ re: 0, im: 0 }
			);
			assert.deepEqual(
				powerComplexRecursive({ re: 2, im: 0 }, { re: -1200, im: 0 }),
				{ re: 0, im: 0 }
			);
		});

		it('preserves high precision near the unit circle', () => {
			const theta = 1e-6;
			const z = { re: Math.cos(theta), im: Math.sin(theta) };
			const w = { re: 1000.5, im: 0 };
			const res = powerComplexRecursive(z, w);
			assertComplexClose(
				res,
				{ re: Math.cos(1000.5 * theta), im: Math.sin(1000.5 * theta) },
				1e-13
			);
		});
	});

	describe('domain, overflow, and input validation errors', () => {
		it('throws RangeError for undefined 0^w cases (Re(w) <= 0 and w != 0)', () => {
			assert.throws(() => powerComplexRecursive({ re: 0, im: 0 }, { re: -1, im: 0 }), RangeError);
			assert.throws(() => powerComplexRecursive({ re: 0, im: 0 }, { re: -0.5, im: 2 }), RangeError);
			assert.throws(() => powerComplexRecursive({ re: 0, im: 0 }, { re: 0, im: 1 }), RangeError);
			assert.throws(() => powerComplexRecursive({ re: 0, im: 0 }, { re: 0, im: -3.5 }), RangeError);
		});

		it('throws RangeError on floating-point overflow', () => {
			assert.throws(() => powerComplexRecursive({ re: 1e200, im: 0 }, { re: 2, im: 0 }), RangeError);
			assert.throws(() => powerComplexRecursive({ re: 10, im: 0 }, { re: 400, im: 0 }), RangeError);
			assert.throws(() => powerComplexRecursive({ re: Math.E, im: 0 }, { re: 800, im: 1 }), RangeError);
			assert.throws(() => powerComplexRecursive({ re: 1e-320, im: 0 }, { re: -1, im: 0 }), RangeError);
		});

		it('throws TypeError for invalid argument shapes or non-numeric components', () => {
			const valid = { re: 1, im: 2 };
			for (const bad of [null, undefined, 42, '1+2i', true, [1, 2], {}, { re: 1 }, { im: 2 }, { re: '1', im: 0 }, { re: 1, im: null }]) {
				assert.throws(() => powerComplexRecursive(bad, valid), TypeError);
				assert.throws(() => powerComplexRecursive(valid, bad), TypeError);
			}
		});

		it('throws RangeError for non-finite components (NaN, Infinity, -Infinity)', () => {
			const valid = { re: 1, im: 2 };
			for (const badVal of [NaN, Infinity, -Infinity]) {
				assert.throws(() => powerComplexRecursive({ re: badVal, im: 0 }, valid), RangeError);
				assert.throws(() => powerComplexRecursive({ re: 0, im: badVal }, valid), RangeError);
				assert.throws(() => powerComplexRecursive(valid, { re: badVal, im: 0 }), RangeError);
				assert.throws(() => powerComplexRecursive(valid, { re: 0, im: badVal }), RangeError);
			}
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent direct polar reference across a grid of complex bases and exponents', () => {
			const bases = [
				{ re: 2, im: 3 },
				{ re: -2, im: 3 },
				{ re: -2, im: -3 },
				{ re: 2, im: -3 },
				{ re: -4.5, im: 0 },
				{ re: 0, im: -2.5 },
				{ re: 0.25, im: 0.75 },
			];
			const exponents = [
				{ re: 0.5, im: 0 },
				{ re: -1.25, im: 0 },
				{ re: 0, im: 2.3 },
				{ re: 1.7, im: -0.9 },
				{ re: -2.1, im: 1.4 },
				{ re: 5.5, im: 3.2 },
			];

			for (const z of bases) {
				for (const w of exponents) {
					const actual = powerComplexRecursive(z, w);
					const expected = referencePolarPower(z, w);
					assertComplexClose(
						actual,
						expected,
						1e-12,
						`(${z.re}+${z.im}i)^(${w.re}+${w.im}i)`
					);
				}
			}
		});

		it('matches independent iterative multiplication for integer exponents', () => {
			const bases = [
				{ re: 1.2, im: -0.7 },
				{ re: -0.5, im: 1.1 },
				{ re: 0.8, im: 0.6 },
			];
			for (const z of bases) {
				for (const n of [0, 1, 2, 3, 7, 12, 19]) {
					assertComplexClose(
						powerComplexRecursive(z, { re: n, im: 0 }),
						referenceIterativeIntPower(z, n),
						1e-13,
						`iter (${z.re}+${z.im}i)^${n}`
					);
				}
			}
		});

		it('satisfies exponent addition z^(w1 + w2) = z^w1 * z^w2 and inverse z^w * z^(-w) = 1', () => {
			const cases = [
				{ z: { re: 2, im: 1 }, w1: { re: 1.3, im: -0.7 }, w2: { re: -0.8, im: 1.9 } },
				{ z: { re: -1.5, im: 2.5 }, w1: { re: 2, im: 0.5 }, w2: { re: 0.5, im: -1.2 } },
				{ z: { re: -3, im: -4 }, w1: { re: -1.1, im: 0.4 }, w2: { re: 2.6, im: -0.9 } },
			];

			for (const { z, w1, w2 } of cases) {
				const wSum = { re: w1.re + w2.re, im: w1.im + w2.im };
				const lhs = powerComplexRecursive(z, wSum);
				const rhs = mulComplex(powerComplexRecursive(z, w1), powerComplexRecursive(z, w2));
				assertComplexClose(lhs, rhs, 1e-12, 'z^(w1+w2) = z^w1 * z^w2');

				const invProd = mulComplex(
					powerComplexRecursive(z, w1),
					powerComplexRecursive(z, { re: -w1.re, im: -w1.im })
				);
				assertComplexClose(invProd, { re: 1, im: 0 }, 1e-12, 'z^w * z^(-w) = 1');
			}
		});

		it('satisfies conjugate symmetry conj(z^w) = conj(z)^conj(w) off the negative real branch cut', () => {
			const z = { re: -1.2, im: 2.4 };
			const w = { re: 0.75, im: -1.6 };
			const lhs = powerComplexRecursive(z, w);
			const lhsConj = { re: lhs.re, im: -lhs.im };
			const rhs = powerComplexRecursive({ re: z.re, im: -z.im }, { re: w.re, im: -w.im });
			assertComplexClose(lhsConj, rhs, 1e-13, 'conjugate symmetry');
		});
	});
});
