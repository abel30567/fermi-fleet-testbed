import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nthRootComplexRecursive } from './nthRootComplexRecursive.js';

/**
 * Independent iterative complex power reference (`w^n`).
 */
function complexPowIterative(w, n) {
	let re = 1;
	let im = 0;
	for (let i = 0; i < n; i++) {
		const nextRe = re * w.re - im * w.im;
		const nextIm = re * w.im + im * w.re;
		re = nextRe;
		im = nextIm;
	}
	return { re, im };
}

/**
 * Independent direct polar reference for the k-th complex n-th root.
 */
function nthRootPolarReference(z, n, k = 0) {
	const re = z.re === 0 ? 0 : z.re;
	const im = z.im === 0 ? 0 : z.im;
	if (re === 0 && im === 0) {
		return { re: 0, im: 0 };
	}
	const r = Math.hypot(re, im);
	const theta = Math.atan2(im, re);
	const kMod = ((k % n) + n) % n;
	const mag = Math.exp(Math.log(r) / n);
	const angle = (theta + 2 * Math.PI * kMod) / n;
	return {
		re: mag * Math.cos(angle),
		im: mag * Math.sin(angle),
	};
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.hypot(expected.re, expected.im));
	const errRe = Math.abs(actual.re - expected.re);
	const errIm = Math.abs(actual.im - expected.im);
	assert.ok(
		errRe <= tol * scale && errIm <= tol * scale,
		`${label}expected (${expected.re}, ${expected.im}), got (${actual.re}, ${actual.im}) (errRe=${errRe}, errIm=${errIm}, tol=${tol * scale})`,
	);
	assert.ok(!Object.is(actual.re, -0), `${label}re should not be -0`);
	assert.ok(!Object.is(actual.im, -0), `${label}im should not be -0`);
}

describe('nthRootComplexRecursive', () => {
	describe('normal cases across quadrants and degrees', () => {
		it('computes principal square roots of general complex numbers', () => {
			// (2 + i)^2 = 3 + 4i
			assertComplexClose(nthRootComplexRecursive({ re: 3, im: 4 }, 2), { re: 2, im: 1 });
			// (2 - i)^2 = 3 - 4i
			assertComplexClose(nthRootComplexRecursive({ re: 3, im: -4 }, 2), { re: 2, im: -1 });
			// (1 + 2i)^2 = -3 + 4i
			assertComplexClose(nthRootComplexRecursive({ re: -3, im: 4 }, 2), { re: 1, im: 2 });
			// (1 - 2i)^2 = -3 - 4i
			assertComplexClose(nthRootComplexRecursive({ re: -3, im: -4 }, 2), { re: 1, im: -2 });
		});

		it('computes cube, fifth, seventh, and composite roots of complex numbers', () => {
			// (1 + 2i)^3 = -11 - 2i; principal cube root lies in Q3/Q4? Actually Arg(-11-2i) ≈ -2.9617,
			// so principal root has angle ≈ -0.9872 (Q4). Check all branches include 1 + 2i!
			const zCube = { re: -11, im: -2 };
			const cubeRoots = [0, 1, 2].map((k) => nthRootComplexRecursive(zCube, 3, k));
			for (const w of cubeRoots) {
				assertComplexClose(complexPowIterative(w, 3), zCube, 1e-12);
			}
			assert.ok(
				cubeRoots.some((w) => Math.hypot(w.re - 1, w.im - 2) < 1e-12),
				'one of the cube roots of -11 - 2i should be 1 + 2i',
			);

			// (2 + i)^5 = -38 + 41i; principal argument of 2 + i is atan2(1, 2) ≈ 0.4636,
			// 5 * 0.4636 ≈ 2.318 ∈ (-π, π], so 2 + i IS the principal 5th root!
			assertComplexClose(nthRootComplexRecursive({ re: -38, im: 41 }, 5), { re: 2, im: 1 });

			// Composite degrees: n = 6, 9, 12, 15, 24, 30
			const z = { re: -5.5, im: 7.25 };
			for (const n of [3, 4, 5, 6, 7, 9, 12, 13, 15, 24, 30]) {
				const w = nthRootComplexRecursive(z, n);
				const ref = nthRootPolarReference(z, n, 0);
				assertComplexClose(w, ref, 1e-12, `n=${n}: `);
				assertComplexClose(complexPowIterative(w, n), z, 1e-11, `inverse n=${n}: `);
			}
		});

		it('supports branch index k including negative and wrap-around values', () => {
			const z = { re: 2, im: -3 };
			const n = 5;
			for (let k = 0; k < n; k++) {
				const wk = nthRootComplexRecursive(z, n, k);
				assertComplexClose(wk, nthRootPolarReference(z, n, k), 1e-12, `k=${k}: `);
				assertComplexClose(nthRootComplexRecursive(z, n, k + n), wk, 1e-14, `k+n: `);
				assertComplexClose(nthRootComplexRecursive(z, n, k - 2 * n), wk, 1e-14, `k-2n: `);
			}
		});
	});

	describe('edge cases and special values', () => {
		it('handles zero and negative zero inputs', () => {
			for (const n of [1, 2, 3, 7, 12]) {
				assertComplexClose(nthRootComplexRecursive({ re: 0, im: 0 }, n), { re: 0, im: 0 });
				assertComplexClose(nthRootComplexRecursive({ re: -0, im: -0 }, n, 1), { re: 0, im: 0 });
			}
		});

		it('handles degree n = 1 as identity with -0 normalized', () => {
			assertComplexClose(nthRootComplexRecursive({ re: 3.5, im: -2.25 }, 1), { re: 3.5, im: -2.25 });
			assertComplexClose(nthRootComplexRecursive({ re: -0, im: 4 }, 1), { re: 0, im: 4 });
			assertComplexClose(nthRootComplexRecursive({ re: -7, im: -0 }, 1, 5), { re: -7, im: 0 });
		});

		it('handles pure real and pure imaginary inputs and exact roots of unity', () => {
			// Positive reals
			assertComplexClose(nthRootComplexRecursive({ re: 16, im: 0 }, 4), { re: 2, im: 0 }, 1e-14);
			assertComplexClose(nthRootComplexRecursive({ re: 27, im: 0 }, 3), { re: 3, im: 0 }, 1e-14);
			assertComplexClose(nthRootComplexRecursive({ re: 32, im: 0 }, 5), { re: 2, im: 0 }, 1e-14);

			// Exact 4th roots of 1: 1, i, -1, -i
			assert.deepEqual(nthRootComplexRecursive({ re: 1, im: 0 }, 4, 0), { re: 1, im: 0 });
			assert.deepEqual(nthRootComplexRecursive({ re: 1, im: 0 }, 4, 1), { re: 0, im: 1 });
			assert.deepEqual(nthRootComplexRecursive({ re: 1, im: 0 }, 4, 2), { re: -1, im: 0 });
			assert.deepEqual(nthRootComplexRecursive({ re: 1, im: 0 }, 4, 3), { re: 0, im: -1 });

			// Negative real branch cut: principal sqrt(-1) = +i even with im = -0
			assert.deepEqual(nthRootComplexRecursive({ re: -1, im: 0 }, 2), { re: 0, im: 1 });
			assert.deepEqual(nthRootComplexRecursive({ re: -1, im: -0 }, 2), { re: 0, im: 1 });

			// Negative real cube roots of -8: principal is 1 + i*sqrt(3), k=1 is -2
			assertComplexClose(
				nthRootComplexRecursive({ re: -8, im: 0 }, 3, 0),
				{ re: 1, im: Math.sqrt(3) },
				1e-13,
			);
			assertComplexClose(
				nthRootComplexRecursive({ re: -8, im: 0 }, 3, 1),
				{ re: -2, im: 0 },
				1e-13,
			);
			assertComplexClose(
				nthRootComplexRecursive({ re: -8, im: 0 }, 3, 2),
				{ re: 1, im: -Math.sqrt(3) },
				1e-13,
			);

			// Pure imaginary: sqrt(i) and sqrt(-i)
			assertComplexClose(
				nthRootComplexRecursive({ re: 0, im: 1 }, 2),
				{ re: Math.SQRT1_2, im: Math.SQRT1_2 },
				1e-14,
			);
			assertComplexClose(
				nthRootComplexRecursive({ re: 0, im: -1 }, 2),
				{ re: Math.SQRT1_2, im: -Math.SQRT1_2 },
				1e-14,
			);
		});

		it('handles extreme magnitudes without overflow or underflow', () => {
			// Very large magnitude near float64 max
			const large = nthRootComplexRecursive({ re: 1e300, im: 1e300 }, 2);
			const expectedLarge = {
				re: Math.pow(2, 0.25) * 1e150 * Math.cos(Math.PI / 8),
				im: Math.pow(2, 0.25) * 1e150 * Math.sin(Math.PI / 8),
			};
			assertComplexClose(large, expectedLarge, 1e-12, 'large n=2: ');

			// Very small magnitude
			const small = nthRootComplexRecursive({ re: 1e-300, im: -1e-300 }, 3);
			const expectedSmall = {
				re: Math.pow(2, 1 / 6) * 1e-100 * Math.cos(-Math.PI / 12),
				im: Math.pow(2, 1 / 6) * 1e-100 * Math.sin(-Math.PI / 12),
			};
			assertComplexClose(small, expectedSmall, 1e-12, 'small n=3: ');

			// Subnormal minimum positive number
			const sub = nthRootComplexRecursive({ re: Number.MIN_VALUE, im: 0 }, 2);
			assert.ok(Number.isFinite(sub.re) && sub.re > 0);
			assert.equal(sub.im, 0);
			assert.ok(Math.abs(sub.re - Math.sqrt(Number.MIN_VALUE)) <= 1e-12 * Math.sqrt(Number.MIN_VALUE));
		});

		it('handles large composite and large prime degrees accurately', () => {
			const z = { re: -3, im: 4 };
			for (const n of [1024, 10007, 1000000007]) {
				const w = nthRootComplexRecursive(z, n);
				const ref = nthRootPolarReference(z, n, 0);
				assertComplexClose(w, ref, 1e-12, `large degree n=${n}: `);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for invalid types', () => {
			assert.throws(() => nthRootComplexRecursive(null, 2), TypeError);
			assert.throws(() => nthRootComplexRecursive(undefined, 2), TypeError);
			assert.throws(() => nthRootComplexRecursive(4, 2), TypeError);
			assert.throws(() => nthRootComplexRecursive([1, 2], 2), TypeError);
			assert.throws(() => nthRootComplexRecursive({ re: '1', im: 0 }, 2), TypeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1 }, 2), TypeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, '2'), TypeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, null), TypeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 2, '0'), TypeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 2, null), TypeError);
		});

		it('throws RangeError for non-finite numbers and invalid degree/branch', () => {
			assert.throws(() => nthRootComplexRecursive({ re: NaN, im: 0 }, 2), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 0, im: Infinity }, 2), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: -Infinity, im: 1 }, 2), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 0), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, -3), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 2.5), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, NaN), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, Infinity), RangeError);
			assert.throws(
				() => nthRootComplexRecursive({ re: 1, im: 0 }, Number.MAX_SAFE_INTEGER + 1),
				RangeError,
			);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 3, 1.5), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 3, NaN), RangeError);
			assert.throws(() => nthRootComplexRecursive({ re: 1, im: 0 }, 3, Infinity), RangeError);
		});
	});

	describe('algebraic identities and independent cross-checks', () => {
		it('satisfies Vieta identities: sum of all roots = 0 and product = (-1)^(n-1) * z', () => {
			const samples = [
				{ re: 3, im: 4 },
				{ re: -2.5, im: 1.75 },
				{ re: -4, im: -6 },
				{ re: 5, im: -12 },
			];
			for (const z of samples) {
				for (const n of [2, 3, 4, 5, 6, 7]) {
					let sumRe = 0;
					let sumIm = 0;
					let prod = { re: 1, im: 0 };

					for (let k = 0; k < n; k++) {
						const w = nthRootComplexRecursive(z, n, k);
						// Inverse power cross-check
						assertComplexClose(complexPowIterative(w, n), z, 1e-11, `w^${n} (k=${k}): `);

						sumRe += w.re;
						sumIm += w.im;
						prod = {
							re: prod.re * w.re - prod.im * w.im,
							im: prod.re * w.im + prod.im * w.re,
						};
					}

					const scale = Math.max(1, Math.hypot(z.re, z.im));
					assert.ok(Math.hypot(sumRe, sumIm) <= 1e-11 * scale, `sum of ${n}-th roots should be 0`);

					const sign = (n - 1) % 2 === 0 ? 1 : -1;
					assertComplexClose(prod, { re: sign * z.re, im: sign * z.im }, 1e-11, `product n=${n}: `);
				}
			}
		});

		it('satisfies nested principal root composition: root(z, a*b) === root(root(z, a), b)', () => {
			const z = { re: -7.2, im: -3.1 };
			const pairs = [
				[2, 3],
				[3, 5],
				[4, 3],
				[5, 7],
			];
			for (const [a, b] of pairs) {
				const direct = nthRootComplexRecursive(z, a * b);
				const nested = nthRootComplexRecursive(nthRootComplexRecursive(z, a), b);
				assertComplexClose(direct, nested, 1e-12, `(${a}, ${b}): `);
			}
		});

		it('satisfies conjugate symmetry off the negative real axis', () => {
			const samples = [
				{ re: 4, im: 3 },
				{ re: -2, im: 5 },
				{ re: 0, im: 9 },
			];
			for (const z of samples) {
				const conjZ = { re: z.re, im: -z.im };
				for (const n of [2, 3, 5, 6, 7]) {
					const w = nthRootComplexRecursive(z, n);
					const wConj = nthRootComplexRecursive(conjZ, n);
					assertComplexClose(wConj, { re: w.re, im: -w.im }, 1e-12, `conjugate n=${n}: `);
				}
			}
		});
	});
});
