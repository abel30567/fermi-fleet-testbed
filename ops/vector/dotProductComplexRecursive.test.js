import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductComplexRecursive } from './dotProductComplexRecursive.js';

/**
 * Independent iterative reference implementation of the Hermitian dot product:
 * sum_k a[k] * conj(b[k]).
 */
function iterativeHermitianDot(a, b) {
	let re = 0;
	let im = 0;
	for (let i = 0; i < a.length; i++) {
		re += a[i].re * b[i].re + a[i].im * b[i].im;
		im += a[i].im * b[i].re - a[i].re * b[i].im;
	}
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im };
}

function assertComplexClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`Expected re=${expected.re} ± ${tol}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`Expected im=${expected.im} ± ${tol}, got ${actual.im}`
	);
}

describe('dotProductComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes 1D complex Hermitian dot product', () => {
			// (3 + 4i) * conj(1 - 2i) = (3 + 4i)(1 + 2i) = (3 - 8) + (6 + 4)i = -5 + 10i
			const result = dotProductComplexRecursive(
				[{ re: 3, im: 4 }],
				[{ re: 1, im: -2 }]
			);
			assert.deepStrictEqual(result, { re: -5, im: 10 });
		});

		it('computes 2D complex Hermitian dot product', () => {
			// (1 + 2i)*conj(3 + 4i) + (5 - i)*conj(-2 + 6i)
			// = (1*3 + 2*4) + (2*3 - 1*4)i + (5*(-2) + (-1)*6) + ((-1)*(-2) - 5*6)i
			// = (11 + 2i) + (-16 - 28i) = -5 - 26i
			const a = [
				{ re: 1, im: 2 },
				{ re: 5, im: -1 },
			];
			const b = [
				{ re: 3, im: 4 },
				{ re: -2, im: 6 },
			];
			assert.deepStrictEqual(dotProductComplexRecursive(a, b), {
				re: -5,
				im: -26,
			});
		});

		it('computes 3D complex Hermitian dot product', () => {
			const a = [
				{ re: 2, im: -3 },
				{ re: 0, im: 4 },
				{ re: -1, im: 5 },
			];
			const b = [
				{ re: 1, im: 1 },
				{ re: 3, im: -2 },
				{ re: 4, im: 0 },
			];
			// k=0: (2*1 + (-3)*1) + (-3*1 - 2*1)i = -1 - 5i
			// k=1: (0*3 + 4*(-2)) + (4*3 - 0*(-2))i = -8 + 12i
			// k=2: (-1*4 + 5*0) + (5*4 - (-1)*0)i = -4 + 20i
			// sum = -13 + 27i
			assert.deepStrictEqual(dotProductComplexRecursive(a, b), {
				re: -13,
				im: 27,
			});
		});

		it('computes dot product for longer vectors (odd and even lengths)', () => {
			const aEven = Array.from({ length: 16 }, (_, k) => ({
				re: k + 1,
				im: -k,
			}));
			const bEven = Array.from({ length: 16 }, (_, k) => ({
				re: 2 * k - 3,
				im: k + 2,
			}));
			assertComplexClose(
				dotProductComplexRecursive(aEven, bEven),
				iterativeHermitianDot(aEven, bEven)
			);

			const aOdd = Array.from({ length: 101 }, (_, k) => ({
				re: Math.sin(k + 1),
				im: Math.cos(k + 1),
			}));
			const bOdd = Array.from({ length: 101 }, (_, k) => ({
				re: Math.cos(2 * k),
				im: -Math.sin(2 * k),
			}));
			assertComplexClose(
				dotProductComplexRecursive(aOdd, bOdd),
				iterativeHermitianDot(aOdd, bOdd),
				1e-11
			);
		});

		it('returns { re: 0, im: 0 } for orthogonal complex vectors', () => {
			// a = [1, i], b = [i, 1] -> 1*(-i) + i*(1) = 0
			const a = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
			];
			const b = [
				{ re: 0, im: 1 },
				{ re: 1, im: 0 },
			];
			assert.deepStrictEqual(dotProductComplexRecursive(a, b), {
				re: 0,
				im: 0,
			});
		});

		it('computes real non-negative squared norm for self dot product', () => {
			const v = [
				{ re: 3, im: 4 }, // |v0|^2 = 25
				{ re: -1, im: 2 }, // |v1|^2 = 5
				{ re: 0, im: -6 }, // |v2|^2 = 36
				{ re: 2, im: 0 }, // |v3|^2 = 4
			];
			const result = dotProductComplexRecursive(v, v);
			assert.deepStrictEqual(result, { re: 70, im: 0 });
		});

		it('reduces to standard real dot product when imaginary parts are zero', () => {
			const a = [
				{ re: 1, im: 0 },
				{ re: -2, im: 0 },
				{ re: 3.5, im: 0 },
			];
			const b = [
				{ re: 4, im: 0 },
				{ re: 5, im: 0 },
				{ re: 2, im: 0 },
			];
			assert.deepStrictEqual(dotProductComplexRecursive(a, b), {
				re: 1,
				im: 0,
			});
		});
	});

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for empty vectors', () => {
			assert.deepStrictEqual(dotProductComplexRecursive([], []), {
				re: 0,
				im: 0,
			});
		});

		it('handles single-element pure imaginary and zero vectors', () => {
			// i * conj(i) = i * (-i) = 1
			assert.deepStrictEqual(
				dotProductComplexRecursive([{ re: 0, im: 1 }], [{ re: 0, im: 1 }]),
				{ re: 1, im: 0 }
			);
			// zero vector
			assert.deepStrictEqual(
				dotProductComplexRecursive([{ re: 0, im: 0 }], [{ re: -5, im: 7 }]),
				{ re: 0, im: 0 }
			);
		});

		it('normalizes negative zero in output components', () => {
			const result = dotProductComplexRecursive(
				[{ re: -0, im: 0 }],
				[{ re: 1, im: -0 }]
			);
			assert.ok(Object.is(result.re, 0));
			assert.ok(Object.is(result.im, 0));
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when either argument is not an array', () => {
			assert.throws(() => dotProductComplexRecursive(null, []), TypeError);
			assert.throws(() => dotProductComplexRecursive([], undefined), TypeError);
			assert.throws(
				() => dotProductComplexRecursive('not-array', []),
				TypeError
			);
			assert.throws(
				() => dotProductComplexRecursive([], { length: 0 }),
				TypeError
			);
		});

		it('throws RangeError when vector lengths do not match', () => {
			assert.throws(
				() => dotProductComplexRecursive([{ re: 1, im: 0 }], []),
				RangeError
			);
			assert.throws(
				() =>
					dotProductComplexRecursive(
						[{ re: 1, im: 2 }],
						[
							{ re: 1, im: 2 },
							{ re: 3, im: 4 },
						]
					),
				RangeError
			);
		});

		it('throws TypeError for invalid complex element shapes', () => {
			assert.throws(
				() => dotProductComplexRecursive([null], [{ re: 1, im: 0 }]),
				TypeError
			);
			assert.throws(
				() => dotProductComplexRecursive([1], [{ re: 1, im: 0 }]),
				TypeError
			);
			assert.throws(
				() => dotProductComplexRecursive([{ re: 1 }], [{ re: 1, im: 0 }]),
				TypeError
			);
			assert.throws(
				() =>
					dotProductComplexRecursive(
						[{ re: 1, im: 0 }],
						[{ re: '1', im: 0 }]
					),
				TypeError
			);
			// sparse array hole
			const sparse = new Array(2);
			sparse[0] = { re: 1, im: 0 };
			assert.throws(
				() =>
					dotProductComplexRecursive(sparse, [
						{ re: 1, im: 0 },
						{ re: 2, im: 0 },
					]),
				TypeError
			);
		});

		it('throws RangeError for non-finite complex components (NaN, Infinity)', () => {
			assert.throws(
				() =>
					dotProductComplexRecursive(
						[{ re: Number.NaN, im: 0 }],
						[{ re: 1, im: 0 }]
					),
				RangeError
			);
			assert.throws(
				() =>
					dotProductComplexRecursive(
						[{ re: 1, im: 0 }],
						[{ re: 0, im: Number.POSITIVE_INFINITY }]
					),
				RangeError
			);
			assert.throws(
				() =>
					dotProductComplexRecursive(
						[{ re: 1, im: Number.NEGATIVE_INFINITY }],
						[{ re: 1, im: 0 }]
					),
				RangeError
			);
		});
	});

	describe('mathematical cross-checks', () => {
		it('matches independent iterative Hermitian dot product across deterministic pseudo-random vectors', () => {
			// Linear congruential generator for deterministic test data
			let seed = 42;
			const nextVal = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return (seed / 0xffffffff) * 20 - 10;
			};

			for (const len of [1, 2, 3, 7, 16, 63, 256]) {
				const a = Array.from({ length: len }, () => ({
					re: nextVal(),
					im: nextVal(),
				}));
				const b = Array.from({ length: len }, () => ({
					re: nextVal(),
					im: nextVal(),
				}));
				const actual = dotProductComplexRecursive(a, b);
				const expected = iterativeHermitianDot(a, b);
				assertComplexClose(actual, expected, 1e-10);
			}
		});

		it('satisfies conjugate symmetry: dot(a, b) === conj(dot(b, a))', () => {
			const a = [
				{ re: 1.5, im: -2.25 },
				{ re: -4.1, im: 3.7 },
				{ re: 0.25, im: 6.5 },
				{ re: -2.0, im: -1.5 },
				{ re: 7.3, im: 0.8 },
			];
			const b = [
				{ re: -3.2, im: 1.4 },
				{ re: 2.8, im: -5.6 },
				{ re: 4.0, im: 0.5 },
				{ re: 1.1, im: -3.3 },
				{ re: -0.9, im: 2.7 },
			];

			const ab = dotProductComplexRecursive(a, b);
			const ba = dotProductComplexRecursive(b, a);
			assertComplexClose(ab, { re: ba.re, im: -ba.im }, 1e-12);
		});

		it('satisfies sesquilinearity: dot(c*a, b) = c*dot(a, b) and dot(a, c*b) = conj(c)*dot(a, b)', () => {
			const mul = (u, v) => ({
				re: u.re * v.re - u.im * v.im,
				im: u.re * v.im + u.im * v.re,
			});
			const c = { re: 2.5, im: -1.5 };
			const cConj = { re: c.re, im: -c.im };
			const a = [
				{ re: 1, im: 2 },
				{ re: -3, im: 4 },
				{ re: 5, im: -6 },
			];
			const b = [
				{ re: -2, im: 1 },
				{ re: 3, im: 0.5 },
				{ re: -1, im: -4 },
			];

			const base = dotProductComplexRecursive(a, b);
			const ca = a.map((z) => mul(c, z));
			const cb = b.map((z) => mul(c, z));

			assertComplexClose(dotProductComplexRecursive(ca, b), mul(c, base));
			assertComplexClose(dotProductComplexRecursive(a, cb), mul(cConj, base));
		});
	});
});
