import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nthRootComplexSeries } from './nthRootComplexSeries.js';

/**
 * Independent complex multiplication.
 */
function cmul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Independent complex integer power via binary exponentiation (n >= 0).
 */
function cpow(z, n) {
	let result = { re: 1, im: 0 };
	let base = { re: z.re, im: z.im };
	let exp = n;
	while (exp > 0) {
		if (exp & 1) result = cmul(result, base);
		base = cmul(base, base);
		exp >>>= 1;
	}
	return result;
}

/**
 * Independent closed-form algebraic complex square root (principal branch).
 */
function algebraicSqrt(z) {
	const x = z.re;
	const y = z.im === 0 ? 0 : z.im;
	const r = Math.hypot(x, y);
	const re = Math.sqrt((r + x) / 2);
	const imMag = Math.sqrt(Math.max(0, (r - x) / 2));
	const im = y < 0 ? -imMag : imMag;
	return { re, im };
}

/**
 * Asserts two complex numbers are close within relative + absolute tolerance.
 */
function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12, label = '') {
	const errRe = Math.abs(actual.re - expected.re);
	const errIm = Math.abs(actual.im - expected.im);
	const scale = Math.max(Math.hypot(expected.re, expected.im), Math.hypot(actual.re, actual.im), 1);
	const tol = absTol + relTol * scale;
	assert.ok(
		errRe <= tol && errIm <= tol,
		`${label}Expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}), err=(${errRe}, ${errIm}), tol=${tol}`,
	);
}

describe('nthRootComplexSeries', () => {
	describe('basic and cardinal values', () => {
		it('returns z unchanged for n = 1', () => {
			const cases = [
				{ re: 0, im: 0 },
				{ re: 5, im: 0 },
				{ re: -7, im: 0 },
				{ re: 0, im: 3 },
				{ re: 3.5, im: -4.25 },
				{ re: -1e100, im: 2e-100 },
			];
			for (const z of cases) {
				assert.deepStrictEqual(nthRootComplexSeries(z, 1), z);
			}
		});

		it('computes exact positive real roots', () => {
			assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, 2), { re: 1, im: 0 }, 1e-15, 1e-15);
			assertComplexClose(nthRootComplexSeries({ re: 4, im: 0 }, 2), { re: 2, im: 0 }, 1e-15, 1e-15);
			assertComplexClose(nthRootComplexSeries({ re: 8, im: 0 }, 3), { re: 2, im: 0 }, 1e-15, 1e-15);
			assertComplexClose(nthRootComplexSeries({ re: 27, im: 0 }, 3), { re: 3, im: 0 }, 1e-14, 1e-14);
			assertComplexClose(nthRootComplexSeries({ re: 16, im: 0 }, 4), { re: 2, im: 0 }, 1e-15, 1e-15);
			assertComplexClose(nthRootComplexSeries({ re: 1024, im: 0 }, 10), { re: 2, im: 0 }, 1e-15, 1e-15);
		});

		it('computes principal roots of negative real numbers on the branch cut Arg = +pi', () => {
			// sqrt(-1) = i exactly via quadrant reduction
			assert.deepStrictEqual(nthRootComplexSeries({ re: -1, im: 0 }, 2), { re: 0, im: 1 });
			// cbrt(-8) = 2 * (cos(pi/3) + i sin(pi/3)) = 1 + i*sqrt(3)
			assertComplexClose(
				nthRootComplexSeries({ re: -8, im: 0 }, 3),
				{ re: 1, im: Math.sqrt(3) },
				1e-14,
				1e-14,
			);
			// (-16)^(1/4) = 2 * (cos(pi/4) + i sin(pi/4)) = sqrt(2) + i*sqrt(2)
			assertComplexClose(
				nthRootComplexSeries({ re: -16, im: 0 }, 4),
				{ re: Math.SQRT2, im: Math.SQRT2 },
				1e-14,
				1e-14,
			);
		});

		it('computes principal roots of purely imaginary numbers', () => {
			// sqrt(i) = (1 + i)/sqrt(2)
			assertComplexClose(
				nthRootComplexSeries({ re: 0, im: 1 }, 2),
				{ re: Math.SQRT1_2, im: Math.SQRT1_2 },
				1e-15,
				1e-15,
			);
			// sqrt(-i) = (1 - i)/sqrt(2)
			assertComplexClose(
				nthRootComplexSeries({ re: 0, im: -1 }, 2),
				{ re: Math.SQRT1_2, im: -Math.SQRT1_2 },
				1e-15,
				1e-15,
			);
			// (8i)^(1/3) = 2 * (cos(pi/6) + i sin(pi/6)) = sqrt(3) + i
			assertComplexClose(
				nthRootComplexSeries({ re: 0, im: 8 }, 3),
				{ re: Math.sqrt(3), im: 1 },
				1e-14,
				1e-14,
			);
			// (-8i)^(1/3) = 2 * (cos(-pi/6) + i sin(-pi/6)) = sqrt(3) - i
			assertComplexClose(
				nthRootComplexSeries({ re: 0, im: -8 }, 3),
				{ re: Math.sqrt(3), im: -1 },
				1e-14,
				1e-14,
			);
		});

		it('computes principal roots across all four quadrants', () => {
			// (3 + 4i)^(1/2) = 2 + i
			assertComplexClose(nthRootComplexSeries({ re: 3, im: 4 }, 2), { re: 2, im: 1 }, 1e-14, 1e-14);
			// (3 - 4i)^(1/2) = 2 - i
			assertComplexClose(nthRootComplexSeries({ re: 3, im: -4 }, 2), { re: 2, im: -1 }, 1e-14, 1e-14);
			// (-3 + 4i)^(1/2) = 1 + 2i
			assertComplexClose(nthRootComplexSeries({ re: -3, im: 4 }, 2), { re: 1, im: 2 }, 1e-14, 1e-14);
			// (-3 - 4i)^(1/2) = 1 - 2i
			assertComplexClose(nthRootComplexSeries({ re: -3, im: -4 }, 2), { re: 1, im: -2 }, 1e-14, 1e-14);
		});
	});

	describe('edge cases and numerical stability', () => {
		it('handles zero and negative zero cleanly', () => {
			for (const n of [1, 2, 3, 7, 100]) {
				const r1 = nthRootComplexSeries({ re: 0, im: 0 }, n);
				assert.ok(Object.is(r1.re, 0) && Object.is(r1.im, 0));

				const r2 = nthRootComplexSeries({ re: -0, im: -0 }, n);
				assert.ok(Object.is(r2.re, 0) && Object.is(r2.im, 0));
			}
			// Negative real with -0 imaginary part stays on principal branch Arg = +pi
			const rNeg = nthRootComplexSeries({ re: -1, im: -0 }, 2);
			assert.ok(Object.is(rNeg.re, 0) && rNeg.im === 1);
		});

		it('avoids overflow on huge magnitudes', () => {
			const big = { re: 1e300, im: 1e300 };
			const root2 = nthRootComplexSeries(big, 2);
			assert.ok(Number.isFinite(root2.re) && Number.isFinite(root2.im));
			const expectedMag = Math.pow(Math.SQRT2, 0.5) * 1e150;
			assertComplexClose(
				root2,
				{ re: expectedMag * Math.cos(Math.PI / 8), im: expectedMag * Math.sin(Math.PI / 8) },
				1e-13,
				0,
			);

			const maxRoot = nthRootComplexSeries({ re: Number.MAX_VALUE, im: 0 }, 4);
			assert.ok(Number.isFinite(maxRoot.re) && maxRoot.im === 0);
			assert.ok(Math.abs(maxRoot.re / Math.pow(Number.MAX_VALUE, 0.25) - 1) < 1e-13);
		});

		it('avoids underflow on tiny and subnormal magnitudes', () => {
			const tiny = { re: 1e-300, im: 1e-300 };
			const root2 = nthRootComplexSeries(tiny, 2);
			assert.ok(Number.isFinite(root2.re) && Number.isFinite(root2.im));
			const expectedMag = Math.pow(Math.SQRT2, 0.5) * 1e-150;
			assertComplexClose(
				root2,
				{ re: expectedMag * Math.cos(Math.PI / 8), im: expectedMag * Math.sin(Math.PI / 8) },
				1e-13,
				0,
			);

			// Subnormal input: 2^-1074 ≈ 5e-324 -> sqrt is 2^-537
			const sub = { re: Number.MIN_VALUE, im: 0 };
			const subRoot = nthRootComplexSeries(sub, 2);
			assert.ok(Math.abs(subRoot.re / (2 ** -537) - 1) < 1e-14);
			assert.equal(subRoot.im, 0);
		});

		it('handles very large n up to Number.MAX_SAFE_INTEGER', () => {
			const r1 = nthRootComplexSeries({ re: -5, im: 12 }, 1_000_000);
			assertComplexClose(r1, { re: 1, im: 0 }, 1e-5, 1e-5);

			const rMax = nthRootComplexSeries({ re: 3, im: 4 }, Number.MAX_SAFE_INTEGER);
			assertComplexClose(rMax, { re: 1, im: 0 }, 1e-14, 1e-14);
		});
	});

	describe('input validation', () => {
		it('throws TypeError on invalid z object or non-numeric components', () => {
			for (const badZ of [null, undefined, 42, '1+i', true, {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 0, im: 1n }]) {
				assert.throws(() => nthRootComplexSeries(badZ, 2), TypeError);
			}
		});

		it('throws RangeError on non-finite z.re or z.im', () => {
			for (const badZ of [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
				{ re: Infinity, im: Infinity },
			]) {
				assert.throws(() => nthRootComplexSeries(badZ, 2), RangeError);
			}
		});

		it('throws TypeError on non-number n', () => {
			for (const badN of ['2', 2n, null, undefined, {}, true, [2]]) {
				assert.throws(() => nthRootComplexSeries({ re: 1, im: 0 }, badN), TypeError);
			}
		});

		it('throws RangeError on non-positive, non-integer, or unsafe integer n', () => {
			for (const badN of [0, -1, -5, 0.5, 1.5, -2.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => nthRootComplexSeries({ re: 1, im: 0 }, badN), RangeError);
			}
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		const sampleComplex = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 1 },
			{ re: 0, im: -1 },
			{ re: 3, im: 4 },
			{ re: -5, im: 12 },
			{ re: -7, im: -24 },
			{ re: 8, im: -15 },
			{ re: 0.01, im: -0.02 },
			{ re: 1234.5, im: 6789.25 },
			{ re: -1e-6, im: 3.14159 },
		];

		it('cross-check: root^n ≈ z across all quadrants and n = 1..15', () => {
			for (const z of sampleComplex) {
				for (let n = 1; n <= 15; n++) {
					const root = nthRootComplexSeries(z, n);
					// Principal branch invariant: Arg(root) in (-pi/n, pi/n]
					const rootArg = Math.atan2(root.im, root.re);
					assert.ok(
						rootArg > -Math.PI / n - 1e-14 && rootArg <= Math.PI / n + 1e-14,
						`Arg out of principal sector for z=(${z.re},${z.im}), n=${n}: ${rootArg}`,
					);
					const recovered = cpow(root, n);
					assertComplexClose(
						recovered,
						z,
						1e-11,
						1e-11,
						`root^${n} mismatch for z=(${z.re}, ${z.im}): `,
					);
				}
			}
		});

		it('cross-check: matches closed-form algebraic sqrt for n = 2', () => {
			for (const z of sampleComplex) {
				const actual = nthRootComplexSeries(z, 2);
				const expected = algebraicSqrt(z);
				assertComplexClose(actual, expected, 1e-14, 1e-14, `sqrt mismatch for (${z.re},${z.im}): `);
			}
		});

		it('cross-check: matches Math.cbrt for n = 3 on positive reals and polar formula on complex inputs', () => {
			for (const x of [0.001, 0.125, 1, 2, 7, 27, 100, 1e9, 1e-12]) {
				const actual = nthRootComplexSeries({ re: x, im: 0 }, 3);
				assertComplexClose(actual, { re: Math.cbrt(x), im: 0 }, 1e-14, 1e-15);
			}
			for (const z of sampleComplex) {
				const r = Math.cbrt(Math.hypot(z.re, z.im));
				const theta = Math.atan2(z.im === 0 ? 0 : z.im, z.re) / 3;
				const expected = { re: r * Math.cos(theta), im: r * Math.sin(theta) };
				assertComplexClose(nthRootComplexSeries(z, 3), expected, 1e-14, 1e-14);
			}
		});

		it('cross-check: roots of unity and Vieta sum/product identities', () => {
			for (let n = 2; n <= 12; n++) {
				// Principal n-th root of 1 is 1
				assertComplexClose(nthRootComplexSeries({ re: 1, im: 0 }, n), { re: 1, im: 0 }, 1e-15, 1e-15);

				// Principal n-th root of -1 is primitive (2n)-th root of unity e^(i*pi/n)
				const w = nthRootComplexSeries({ re: -1, im: 0 }, n);
				assertComplexClose(w, { re: Math.cos(Math.PI / n), im: Math.sin(Math.PI / n) }, 1e-14, 1e-14);
				assertComplexClose(cpow(w, n), { re: -1, im: 0 }, 1e-12, 1e-12);
				assertComplexClose(cpow(w, 2 * n), { re: 1, im: 0 }, 1e-12, 1e-12);

				// Generate all n roots of z = 3 - 4i from principal root via n-th roots of unity
				const z = { re: 3, im: -4 };
				const principal = nthRootComplexSeries(z, n);
				let sumRe = 0;
				let sumIm = 0;
				let prod = { re: 1, im: 0 };
				for (let k = 0; k < n; k++) {
					const angle = (2 * Math.PI * k) / n;
					const rk = cmul(principal, { re: Math.cos(angle), im: Math.sin(angle) });
					sumRe += rk.re;
					sumIm += rk.im;
					prod = cmul(prod, rk);
					assertComplexClose(cpow(rk, n), z, 1e-11, 1e-11);
				}
				// Vieta's formulas for w^n - z = 0: sum of roots = 0, product of roots = (-1)^(n-1) * z
				assertComplexClose({ re: sumRe, im: sumIm }, { re: 0, im: 0 }, 1e-12, 1e-12);
				const sign = (n - 1) % 2 === 0 ? 1 : -1;
				assertComplexClose(prod, { re: sign * z.re, im: sign * z.im }, 1e-11, 1e-11);
			}
		});

		it('cross-check: nested principal root identity (z^(1/a))^(1/b) = z^(1/(a*b))', () => {
			for (const z of sampleComplex) {
				for (const [a, b] of [[2, 3], [3, 4], [2, 5], [4, 3]]) {
					const nested = nthRootComplexSeries(nthRootComplexSeries(z, a), b);
					const direct = nthRootComplexSeries(z, a * b);
					assertComplexClose(nested, direct, 1e-13, 1e-13);
				}
			}
		});

		it('cross-check: conjugate symmetry off the negative real branch cut', () => {
			const offCut = sampleComplex.filter((z) => !(z.im === 0 && z.re < 0));
			for (const z of offCut) {
				for (const n of [2, 3, 5, 8]) {
					const rConj = nthRootComplexSeries({ re: z.re, im: -z.im }, n);
					const r = nthRootComplexSeries(z, n);
					assertComplexClose(rConj, { re: r.re, im: -r.im }, 1e-14, 1e-14);
				}
			}
		});
	});
});
