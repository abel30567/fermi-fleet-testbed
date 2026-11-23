import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductComplexMemo } from './dotProductComplexMemo.js';

const EPS = 1e-9;

function assertComplexClose(actual, expected, eps = EPS) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: expected ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: expected ${expected.im}, got ${actual.im}`
	);
}

function complexMul(z, w) {
	return {
		re: z.re * w.re - z.im * w.im,
		im: z.re * w.im + z.im * w.re,
	};
}

function complexAdd(z, w) {
	return { re: z.re + w.re, im: z.im + w.im };
}

function complexConj(z) {
	return { re: z.re, im: -z.im };
}

function complexAbsSq(z) {
	return z.re * z.re + z.im * z.im;
}

function scaleVector(scalar, vec) {
	return vec.map((z) => complexMul(scalar, z));
}

function addVectors(u, v) {
	return u.map((z, i) => complexAdd(z, v[i]));
}

describe('dotProductComplexMemo', () => {
	describe('normal cases', () => {
		it('computes Hermitian inner product by default (sum of a[k] * conj(b[k]))', () => {
			const a = [
				{ re: 1, im: 2 },
				{ re: 3, im: -1 },
			];
			const b = [
				{ re: 4, im: -5 },
				{ re: -2, im: 1 },
			];
			assert.deepStrictEqual(dotProductComplexMemo(a, b), { re: -13, im: 12 });
		});

		it('computes Hermitian inner product over precomputed small-integer range [-2, 2]', () => {
			const a = [
				{ re: 1, im: -2 },
				{ re: -1, im: 2 },
				{ re: 2, im: 0 },
			];
			const b = [
				{ re: 2, im: 1 },
				{ re: 0, im: -2 },
				{ re: -2, im: 2 },
			];
			// k=0: (1-2i)(2-i) = (2-2) + (-1-4)i = 0 - 5i
			// k=1: (-1+2i)(0+2i) = -4 - 2i
			// k=2: (2+0i)(-2-2i) = -4 - 4i
			// total: -8 - 11i
			assert.deepStrictEqual(dotProductComplexMemo(a, b), { re: -8, im: -11 });
		});

		it('computes bilinear dot product when options.conjugate is false', () => {
			const a = [
				{ re: 1, im: 2 },
				{ re: 3, im: -1 },
			];
			const b = [
				{ re: 4, im: -5 },
				{ re: -2, im: 1 },
			];
			assert.deepStrictEqual(dotProductComplexMemo(a, b, { conjugate: false }), { re: 9, im: 8 });
		});

		it('handles floating-point complex components accurately', () => {
			const a = [
				{ re: 1.5, im: -0.25 },
				{ re: -2.75, im: 3.5 },
			];
			const b = [
				{ re: 0.5, im: 4.0 },
				{ re: 1.25, im: -1.5 },
			];
			// k=0: (1.5 - 0.25i)(0.5 - 4i) = (0.75 - 1) + (-6 - 0.125)i = -0.25 - 6.125i
			// k=1: (-2.75 + 3.5i)(1.25 + 1.5i) = (-3.4375 - 5.25) + (-4.125 + 4.375)i = -8.6875 + 0.25i
			// total: -8.9375 - 5.875i
			assertComplexClose(dotProductComplexMemo(a, b), { re: -8.9375, im: -5.875 });
		});
	});

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for empty vectors', () => {
			assert.deepStrictEqual(dotProductComplexMemo([], []), { re: 0, im: 0 });
			assert.deepStrictEqual(dotProductComplexMemo([], [], { conjugate: false }), { re: 0, im: 0 });
		});

		it('handles single-element vectors', () => {
			assert.deepStrictEqual(dotProductComplexMemo([{ re: 0, im: 1 }], [{ re: 0, im: 1 }]), {
				re: 1,
				im: 0,
			});
			assert.deepStrictEqual(
				dotProductComplexMemo([{ re: 0, im: 1 }], [{ re: 0, im: 1 }], { conjugate: false }),
				{ re: -1, im: 0 }
			);
		});

		it('returns zero for orthogonal complex vectors', () => {
			const u = [
				{ re: 1, im: 1 },
				{ re: 1, im: -1 },
			];
			const v = [
				{ re: 1, im: -1 },
				{ re: -1, im: -1 },
			];
			// (1+i)(1+i) + (1-i)(-1+i) = (0+2i) + (0+2i)? Wait: let's check orthogonal pair:
			// u = [1, i], v = [i, 1] -> <u, v> = 1*(-i) + i*(1) = 0
			const a = [
				{ re: 1, im: 0 },
				{ re: 0, im: 1 },
			];
			const b = [
				{ re: 0, im: 1 },
				{ re: 1, im: 0 },
			];
			assert.deepStrictEqual(dotProductComplexMemo(a, b), { re: 0, im: 0 });
			// Also verify u and w where w = [1-i, -1+i]: (1+i)(1+i) + (1-i)(-1-i) = 2i + (-2) != 0;
			// True orthogonal pair to u = [1+i, 1-i]: w = [1+i, -1+i] -> (1+i)(1-i) + (1-i)(-1-i) = 2 + (-2) = 0
			const w = [
				{ re: 1, im: 1 },
				{ re: -1, im: 1 },
			];
			assert.deepStrictEqual(dotProductComplexMemo(u, w), { re: 0, im: 0 });
			// Suppress unused v warning by checking non-zero
			assert.notDeepStrictEqual(dotProductComplexMemo(u, v), { re: 0, im: 0 });
		});

		it('self-dot product is real and non-negative', () => {
			const v = [
				{ re: 3, im: -4 },
				{ re: -1.5, im: 2.5 },
				{ re: 0, im: 7 },
			];
			const selfDot = dotProductComplexMemo(v, v);
			assert.strictEqual(selfDot.im, 0);
			assert.ok(selfDot.re >= 0);
			// 9+16 + 2.25+6.25 + 49 = 82.5
			assertComplexClose(selfDot, { re: 82.5, im: 0 });
		});

		it('normalizes negative zero to positive zero', () => {
			const res = dotProductComplexMemo([{ re: -0, im: -0 }], [{ re: 1, im: -0 }]);
			assert.ok(Object.is(res.re, 0));
			assert.ok(Object.is(res.im, 0));
		});
	});

	describe('memoization and immutability', () => {
		it('returns fresh objects on cache hits so caller mutations do not corrupt the cache', () => {
			const a = [
				{ re: 7.5, im: -3.25 },
				{ re: 11.25, im: 4.5 },
			];
			const b = [
				{ re: -2.5, im: 6.75 },
				{ re: 8.5, im: -1.25 },
			];

			const first = dotProductComplexMemo(a, b);
			const expected = { re: first.re, im: first.im };

			// Mutate the returned object
			first.re = 999999;
			first.im = -999999;

			const second = dotProductComplexMemo(a, b);
			assert.notStrictEqual(first, second);
			assert.deepStrictEqual(second, expected);
		});

		it('matches uncached execution across both Hermitian and bilinear modes', () => {
			const a = [
				{ re: 12.3, im: -4.5 },
				{ re: 0.7, im: 8.9 },
				{ re: -2, im: 1 },
			];
			const b = [
				{ re: -6.1, im: 2.4 },
				{ re: 3.3, im: -7.7 },
				{ re: 1, im: -2 },
			];

			const hCached1 = dotProductComplexMemo(a, b, { conjugate: true, useCache: true });
			const hCached2 = dotProductComplexMemo(a, b, { conjugate: true, useCache: true });
			const hUncached = dotProductComplexMemo(a, b, { conjugate: true, useCache: false });
			assert.deepStrictEqual(hCached1, hUncached);
			assert.deepStrictEqual(hCached2, hUncached);

			const bCached1 = dotProductComplexMemo(a, b, { conjugate: false, useCache: true });
			const bCached2 = dotProductComplexMemo(a, b, { conjugate: false, useCache: true });
			const bUncached = dotProductComplexMemo(a, b, { conjugate: false, useCache: false });
			assert.deepStrictEqual(bCached1, bUncached);
			assert.deepStrictEqual(bCached2, bUncached);
		});

		it('handles repeated evictions beyond bounded cache capacity cleanly', () => {
			for (let k = 0; k < 600; k++) {
				const a = [{ re: k + 0.5, im: -1 }];
				const b = [{ re: 2, im: 0.5 }];
				// (k+0.5 - i)(2 - 0.5i) = (2k + 1 - 0.5) + (-0.5k - 0.25 - 2)i = (2k + 0.5) + (-0.5k - 2.25)i
				const res = dotProductComplexMemo(a, b);
				assertComplexClose(res, { re: 2 * k + 0.5, im: -0.5 * k - 2.25 });
			}
		});
	});

	describe('mathematical cross-checks', () => {
		const u = [
			{ re: 2.5, im: -1.5 },
			{ re: -3, im: 4.25 },
			{ re: 0.75, im: 1.25 },
			{ re: -1, im: -2 },
		];
		const v = [
			{ re: -1.25, im: 3.5 },
			{ re: 2.25, im: -0.5 },
			{ re: 4, im: -2.75 },
			{ re: 1.5, im: 0.5 },
		];
		const w = [
			{ re: 0.5, im: -2.5 },
			{ re: -1.75, im: -1.25 },
			{ re: 2, im: 3 },
			{ re: -0.25, im: 4.5 },
		];

		it('satisfies conjugate symmetry: <a, b> = conj(<b, a>)', () => {
			const ab = dotProductComplexMemo(u, v);
			const ba = dotProductComplexMemo(v, u);
			assertComplexClose(ab, complexConj(ba));
		});

		it('satisfies Cauchy-Schwarz inequality: |<a, b>|^2 <= <a, a> * <b, b>', () => {
			const ab = dotProductComplexMemo(u, v);
			const aa = dotProductComplexMemo(u, u);
			const bb = dotProductComplexMemo(v, v);
			assert.strictEqual(aa.im, 0);
			assert.strictEqual(bb.im, 0);
			assert.ok(complexAbsSq(ab) <= aa.re * bb.re + EPS);

			// Equality holds when vectors are linearly dependent
			const scaled = scaleVector({ re: 2.5, im: -1.5 }, u);
			const aScaled = dotProductComplexMemo(u, scaled);
			const ss = dotProductComplexMemo(scaled, scaled);
			assert.ok(Math.abs(complexAbsSq(aScaled) - aa.re * ss.re) <= 1e-6);
		});

		it('satisfies sesquilinearity: linear in first arg, conjugate-linear in second arg', () => {
			const alpha = { re: 1.5, im: -2.25 };
			const beta = { re: -0.75, im: 3.0 };

			// Linearity in first argument: <alpha*u + beta*v, w> = alpha*<u, w> + beta*<v, w>
			const lhsFirst = dotProductComplexMemo(
				addVectors(scaleVector(alpha, u), scaleVector(beta, v)),
				w
			);
			const rhsFirst = complexAdd(
				complexMul(alpha, dotProductComplexMemo(u, w)),
				complexMul(beta, dotProductComplexMemo(v, w))
			);
			assertComplexClose(lhsFirst, rhsFirst);

			// Conjugate-linearity in second argument: <u, alpha*v + beta*w> = conj(alpha)*<u, v> + conj(beta)*<u, w>
			const lhsSecond = dotProductComplexMemo(
				u,
				addVectors(scaleVector(alpha, v), scaleVector(beta, w))
			);
			const rhsSecond = complexAdd(
				complexMul(complexConj(alpha), dotProductComplexMemo(u, v)),
				complexMul(complexConj(beta), dotProductComplexMemo(u, w))
			);
			assertComplexClose(lhsSecond, rhsSecond);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			assert.throws(() => dotProductComplexMemo(null, []), TypeError);
			assert.throws(() => dotProductComplexMemo([], undefined), TypeError);
			assert.throws(() => dotProductComplexMemo('abc', []), TypeError);
			assert.throws(() => dotProductComplexMemo({}, {}), TypeError);
		});

		it('throws RangeError for length mismatches', () => {
			assert.throws(
				() => dotProductComplexMemo([{ re: 1, im: 0 }], []),
				RangeError
			);
			assert.throws(
				() =>
					dotProductComplexMemo(
						[{ re: 1, im: 0 }],
						[
							{ re: 1, im: 0 },
							{ re: 2, im: 0 },
						]
					),
				RangeError
			);
		});

		it('throws TypeError for invalid complex element shapes or types', () => {
			assert.throws(() => dotProductComplexMemo([null], [{ re: 1, im: 0 }]), TypeError);
			assert.throws(() => dotProductComplexMemo([{ re: 1, im: 0 }], [undefined]), TypeError);
			assert.throws(() => dotProductComplexMemo([[1, 2]], [{ re: 1, im: 0 }]), TypeError);
			assert.throws(() => dotProductComplexMemo([{ re: 1 }], [{ re: 1, im: 0 }]), TypeError);
			assert.throws(() => dotProductComplexMemo([{ re: '1', im: 0 }], [{ re: 1, im: 0 }]), TypeError);
			assert.throws(() => dotProductComplexMemo(new Array(1), [{ re: 1, im: 0 }]), TypeError);
		});

		it('throws RangeError for NaN or Infinity components', () => {
			assert.throws(() => dotProductComplexMemo([{ re: NaN, im: 0 }], [{ re: 1, im: 0 }]), RangeError);
			assert.throws(() => dotProductComplexMemo([{ re: 1, im: 0 }], [{ re: 1, im: Infinity }]), RangeError);
			assert.throws(() => dotProductComplexMemo([{ re: -Infinity, im: 0 }], [{ re: 1, im: 0 }]), RangeError);
		});

		it('throws TypeError for invalid options', () => {
			assert.throws(() => dotProductComplexMemo([], [], null), TypeError);
			assert.throws(() => dotProductComplexMemo([], [], []), TypeError);
			assert.throws(() => dotProductComplexMemo([], [], { conjugate: 'yes' }), TypeError);
			assert.throws(() => dotProductComplexMemo([], [], { useCache: 1 }), TypeError);
		});
	});
});
