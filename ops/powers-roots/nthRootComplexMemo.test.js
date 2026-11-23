import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nthRootComplexMemo } from './nthRootComplexMemo.js';

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.equal(typeof actual, 'object', `${msg}: result must be an object`);
	assert.ok(Number.isFinite(actual.re), `${msg}: re must be finite`);
	assert.ok(Number.isFinite(actual.im), `${msg}: im must be finite`);
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg}: expected re=${expected.re}, got ${actual.re} (diff=${Math.abs(actual.re - expected.re)})`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg}: expected im=${expected.im}, got ${actual.im} (diff=${Math.abs(actual.im - expected.im)})`
	);
}

/** Independent Cartesian complex multiplication. */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/** Independent Cartesian binary exponentiation z^n for non-negative integer n. */
function complexPowInt(z, n) {
	let result = { re: 1, im: 0 };
	let base = { re: z.re, im: z.im };
	let exp = n;
	while (exp > 0) {
		if (exp % 2 === 1) {
			result = complexMul(result, base);
		}
		base = complexMul(base, base);
		exp = Math.floor(exp / 2);
	}
	return result;
}

/** Independent direct polar nth root formula. */
function referencePolarNthRoot(z, n, k = 0) {
	if (z.re === 0 && z.im === 0) {
		return { re: 0, im: 0 };
	}
	const r = Math.hypot(z.re, z.im);
	const theta = Math.atan2(z.im === 0 ? 0 : z.im, z.re === 0 ? 0 : z.re);
	const mag = Math.pow(r, 1 / n);
	const angle = (theta + 2 * Math.PI * k) / n;
	return { re: mag * Math.cos(angle), im: mag * Math.sin(angle) };
}

describe('nthRootComplexMemo', () => {
	it('handles n = 1 as the identity function', () => {
		const z = { re: -3.5, im: 7.25 };
		const res = nthRootComplexMemo(z, 1);
		assert.deepEqual(res, { re: -3.5, im: 7.25 });
		assert.notEqual(res, z);
	});

	it('computes principal and non-principal roots of positive real numbers', () => {
		assert.deepEqual(nthRootComplexMemo({ re: 16, im: 0 }, 4, 0), { re: 2, im: 0 });
		assert.deepEqual(nthRootComplexMemo({ re: 16, im: 0 }, 4, 1), { re: 0, im: 2 });
		assert.deepEqual(nthRootComplexMemo({ re: 16, im: 0 }, 4, 2), { re: -2, im: 0 });
		assert.deepEqual(nthRootComplexMemo({ re: 16, im: 0 }, 4, 3), { re: 0, im: -2 });
		assert.deepEqual(nthRootComplexMemo({ re: 27, im: 0 }, 3), { re: 3, im: 0 });
		assert.deepEqual(nthRootComplexMemo({ re: 9, im: 0 }, 2, 1), { re: -3, im: 0 });
	});

	it('computes principal and non-principal roots of negative real numbers', () => {
		assert.deepEqual(nthRootComplexMemo({ re: -1, im: 0 }, 2, 0), { re: 0, im: 1 });
		assert.deepEqual(nthRootComplexMemo({ re: -1, im: 0 }, 2, 1), { re: 0, im: -1 });
		assert.deepEqual(nthRootComplexMemo({ re: -4, im: 0 }, 2, 0), { re: 0, im: 2 });

		// Cube roots of -8: principal is 1 + i*sqrt(3), k=1 is -2, k=2 is 1 - i*sqrt(3)
		assertComplexClose(nthRootComplexMemo({ re: -8, im: 0 }, 3, 0), { re: 1, im: Math.sqrt(3) });
		assertComplexClose(nthRootComplexMemo({ re: -8, im: 0 }, 3, 1), { re: -2, im: 0 });
		assertComplexClose(nthRootComplexMemo({ re: -8, im: 0 }, 3, 2), { re: 1, im: -Math.sqrt(3) });
	});

	it('computes roots of pure imaginary and general complex numbers across all quadrants', () => {
		const invSqrt2 = Math.SQRT1_2;
		assertComplexClose(nthRootComplexMemo({ re: 0, im: 1 }, 2, 0), { re: invSqrt2, im: invSqrt2 });
		assertComplexClose(nthRootComplexMemo({ re: 0, im: 1 }, 2, 1), { re: -invSqrt2, im: -invSqrt2 });
		assertComplexClose(nthRootComplexMemo({ re: 0, im: -1 }, 2, 0), { re: invSqrt2, im: -invSqrt2 });
		assertComplexClose(nthRootComplexMemo({ re: 3, im: 4 }, 2, 0), { re: 2, im: 1 });
		assertComplexClose(nthRootComplexMemo({ re: 3, im: 4 }, 2, 1), { re: -2, im: -1 });
		assertComplexClose(nthRootComplexMemo({ re: -7, im: 24 }, 2, 0), { re: 3, im: 4 });
		assertComplexClose(nthRootComplexMemo({ re: -3, im: -4 }, 2, 0), { re: 1, im: -2 });
		assertComplexClose(nthRootComplexMemo({ re: 5, im: -12 }, 2, 0), { re: 3, im: -2 });
	});

	it('handles zero and signed-zero edge cases without producing -0', () => {
		for (const n of [1, 2, 3, 7, 40]) {
			for (const k of [0, n - 1]) {
				const res = nthRootComplexMemo({ re: -0, im: -0 }, n, k);
				assert.ok(Object.is(res.re, 0), `expected +0 re for n=${n}, k=${k}`);
				assert.ok(Object.is(res.im, 0), `expected +0 im for n=${n}, k=${k}`);
			}
		}

		// Negative real with -0 imaginary part must match +0 imaginary part on principal branch
		const negZeroIm = nthRootComplexMemo({ re: -1, im: -0 }, 2, 0);
		assert.ok(Object.is(negZeroIm.re, 0));
		assert.equal(negZeroIm.im, 1);
	});

	it('avoids overflow and underflow for extreme magnitudes', () => {
		// Math.hypot(1e308, 1e308) overflows to Infinity, but scaled calculation stays finite
		const huge = nthRootComplexMemo({ re: 1e308, im: 1e308 }, 2, 0);
		const expectedHugeMag = 1e154 * Math.pow(2, 0.25);
		assertComplexClose(
			huge,
			{
				re: expectedHugeMag * Math.cos(Math.PI / 8),
				im: expectedHugeMag * Math.sin(Math.PI / 8),
			},
			1e140,
			'huge magnitude'
		);

		const tiny = nthRootComplexMemo({ re: 1e-300, im: 1e-300 }, 2, 0);
		const expectedTinyMag = 1e-150 * Math.pow(2, 0.25);
		assertComplexClose(
			tiny,
			{
				re: expectedTinyMag * Math.cos(Math.PI / 8),
				im: expectedTinyMag * Math.sin(Math.PI / 8),
			},
			1e-162,
			'tiny magnitude'
		);
	});

	it('supports degrees beyond the precomputed table (dynamic cache and large-n fallback)', () => {
		// n = 36 uses dynamic roots-of-unity cache (> 32, <= 4096)
		const r36 = nthRootComplexMemo({ re: 1, im: 0 }, 36, 9);
		assert.deepEqual(r36, { re: 0, im: 1 });

		const r100 = nthRootComplexMemo({ re: 2, im: -3 }, 100, 37);
		assertComplexClose(r100, referencePolarNthRoot({ re: 2, im: -3 }, 100, 37), 1e-12);

		// n = 10000 exceeds DYNAMIC_UNITY_MAX_N (4096) and computes on demand
		const r10000 = nthRootComplexMemo({ re: 1, im: 0 }, 10000, 2500);
		assert.deepEqual(r10000, { re: 0, im: 1 });

		const rHugeN = nthRootComplexMemo({ re: 3, im: 4 }, 1000000, 123456);
		assertComplexClose(rHugeN, referencePolarNthRoot({ re: 3, im: 4 }, 1000000, 123456), 1e-12);
	});

	it('memoizes safely without leaking mutable cache references and handles cache eviction', () => {
		const first = nthRootComplexMemo({ re: 3, im: 4 }, 2, 0);
		first.re = 999;
		first.im = -999;

		const second = nthRootComplexMemo({ re: 3, im: 4 }, 2, 0);
		assertComplexClose(second, { re: 2, im: 1 });

		const branchFirst = nthRootComplexMemo({ re: 3, im: 4 }, 2, 1);
		branchFirst.re = 12345;
		const branchSecond = nthRootComplexMemo({ re: 3, im: 4 }, 2, 1);
		assertComplexClose(branchSecond, { re: -2, im: -1 });

		// Trigger LRU cache eviction (> 4096 entries) and verify accuracy afterwards
		for (let i = 1; i <= 4200; i += 1) {
			const root = nthRootComplexMemo({ re: i * i, im: 0 }, 2, 0);
			assert.equal(root.re, i);
			assert.equal(root.im, 0);
		}
		assertComplexClose(nthRootComplexMemo({ re: 3, im: 4 }, 2, 0), { re: 2, im: 1 });
	});

	it('validates invalid inputs with appropriate TypeError and RangeError', () => {
		// Invalid z container
		for (const badZ of [null, undefined, 42, '1+2i', true, [1, 2]]) {
			assert.throws(() => nthRootComplexMemo(badZ, 2), TypeError);
		}

		// Non-numeric z.re / z.im
		for (const badZ of [{}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 1, im: null }]) {
			assert.throws(() => nthRootComplexMemo(badZ, 2), TypeError);
		}

		// Non-finite z.re / z.im
		for (const badZ of [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 0 },
			{ re: 0, im: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => nthRootComplexMemo(badZ, 2), RangeError);
		}

		// Invalid n type
		for (const badN of [undefined, null, '2', {}, []]) {
			assert.throws(() => nthRootComplexMemo({ re: 1, im: 0 }, badN), TypeError);
		}

		// Invalid n range / non-integer
		for (const badN of [0, -1, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => nthRootComplexMemo({ re: 1, im: 0 }, badN), RangeError);
		}

		// Invalid k type
		for (const badK of [null, '0', {}, []]) {
			assert.throws(() => nthRootComplexMemo({ re: 1, im: 0 }, 3, badK), TypeError);
		}

		// Invalid k range / non-integer
		for (const badK of [-1, 3, 4, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			assert.throws(() => nthRootComplexMemo({ re: 1, im: 0 }, 3, badK), RangeError);
		}
	});

	it('cross-check: raising every branch root to the n-th power recovers z', () => {
		const samples = [
			{ re: 1, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 8 },
			{ re: 0, im: -8 },
			{ re: 3, im: 4 },
			{ re: -5, im: 12 },
			{ re: -2.5, im: -1.75 },
			{ re: 1.25, im: -0.5 },
		];
		const degrees = [1, 2, 3, 4, 5, 7, 13, 35];

		for (const z of samples) {
			const scale = Math.max(1, Math.hypot(z.re, z.im));
			for (const n of degrees) {
				const tol = scale * n * 1e-12;
				for (let k = 0; k < n; k += 1) {
					const root = nthRootComplexMemo(z, n, k);
					const recovered = complexPowInt(root, n);
					assertComplexClose(recovered, z, tol, `z=(${z.re},${z.im}), n=${n}, k=${k}`);
				}
			}
		}
	});

	it("cross-check: Vieta's formulas (sum = 0, product = (-1)^(n-1) * z) and polar reference", () => {
		const samples = [
			{ re: 2, im: 3 },
			{ re: -4, im: 1.5 },
			{ re: -1.2, im: -3.4 },
			{ re: 0.75, im: -2.25 },
		];
		const degrees = [2, 3, 4, 6, 9, 17, 34];

		for (const z of samples) {
			const scale = Math.max(1, Math.hypot(z.re, z.im));
			for (const n of degrees) {
				let sum = { re: 0, im: 0 };
				let prod = { re: 1, im: 0 };

				for (let k = 0; k < n; k += 1) {
					const root = nthRootComplexMemo(z, n, k);
					const ref = referencePolarNthRoot(z, n, k);
					assertComplexClose(root, ref, 1e-12, `polar ref z=(${z.re},${z.im}), n=${n}, k=${k}`);

					sum = { re: sum.re + root.re, im: sum.im + root.im };
					prod = complexMul(prod, root);
				}

				// Sum of all n-th roots is 0 for n >= 2
				assertComplexClose(sum, { re: 0, im: 0 }, scale * n * 1e-12, `Vieta sum n=${n}`);

				// Product of all n-th roots is (-1)^(n-1) * z
				const sign = (n - 1) % 2 === 0 ? 1 : -1;
				assertComplexClose(
					prod,
					{ re: sign * z.re, im: sign * z.im },
					scale * n * 1e-11,
					`Vieta product n=${n}`
				);
			}
		}
	});
});
