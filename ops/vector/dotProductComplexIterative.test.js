import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductComplexIterative } from './dotProductComplexIterative.js';

function assertComplexClose(actual, expected, eps = 1e-9) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`expected re ${actual.re} to be within ${eps} of ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`expected im ${actual.im} to be within ${eps} of ${expected.im}`
	);
}

describe('dotProductComplexIterative', () => {
	describe('normal cases', () => {
		it('computes dot product of single-element complex vectors', () => {
			// (2 + 3i)(4 + 5i) = (8 - 15) + (10 + 12)i = -7 + 22i
			const result = dotProductComplexIterative([{ re: 2, im: 3 }], [{ re: 4, im: 5 }]);
			assert.deepStrictEqual(result, { re: -7, im: 22 });
		});

		it('computes dot product of multi-element complex vectors', () => {
			// (1 + 2i)(3 - i) = (3 + 2) + (-1 + 6)i = 5 + 5i
			// (-2 + i)(4 + 3i) = (-8 - 3) + (-6 + 4)i = -11 - 2i
			// (0 - 3i)(-1 + 2i) = (0 + 6) + (0 + 3)i = 6 + 3i
			// Sum = (5 - 11 + 6) + (5 - 2 + 3)i = 0 + 6i
			const a = [
				{ re: 1, im: 2 },
				{ re: -2, im: 1 },
				{ re: 0, im: -3 },
			];
			const b = [
				{ re: 3, im: -1 },
				{ re: 4, im: 3 },
				{ re: -1, im: 2 },
			];
			const result = dotProductComplexIterative(a, b);
			assert.deepStrictEqual(result, { re: 0, im: 6 });
		});

		it('matches real dot product when imaginary parts are zero', () => {
			const a = [
				{ re: 1.5, im: 0 },
				{ re: -2, im: 0 },
				{ re: 4, im: 0 },
			];
			const b = [
				{ re: 2, im: 0 },
				{ re: 3.5, im: 0 },
				{ re: 0.5, im: 0 },
			];
			// 3 - 7 + 2 = -2
			const result = dotProductComplexIterative(a, b);
			assert.deepStrictEqual(result, { re: -2, im: 0 });
		});

		it('computes dot product of purely imaginary vectors', () => {
			// (2i)(4i) + (3i)(5i) = -8 + -15 = -23
			const a = [
				{ re: 0, im: 2 },
				{ re: 0, im: 3 },
			];
			const b = [
				{ re: 0, im: 4 },
				{ re: 0, im: 5 },
			];
			const result = dotProductComplexIterative(a, b);
			assert.deepStrictEqual(result, { re: -23, im: 0 });
		});
	});

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for empty vectors', () => {
			const result = dotProductComplexIterative([], []);
			assert.deepStrictEqual(result, { re: 0, im: 0 });
		});

		it('returns { re: 0, im: 0 } with positive zero when terms cancel', () => {
			const a = [
				{ re: 1, im: 1 },
				{ re: -1, im: -1 },
			];
			const b = [
				{ re: -0, im: 1 },
				{ re: 0, im: 1 },
			];
			const result = dotProductComplexIterative(a, b);
			assert.ok(Object.is(result.re, 0));
			assert.ok(Object.is(result.im, 0));
		});

		it('handles zero vectors', () => {
			const a = [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			];
			const b = [
				{ re: 123, im: -456 },
				{ re: 789, im: 10 },
			];
			assert.deepStrictEqual(dotProductComplexIterative(a, b), { re: 0, im: 0 });
		});

		it('does not mutate input vectors or elements', () => {
			const a = [{ re: 1, im: 2 }, { re: 3, im: 4 }];
			const b = [{ re: 5, im: 6 }, { re: 7, im: 8 }];
			const aCopy = structuredClone(a);
			const bCopy = structuredClone(b);
			dotProductComplexIterative(a, b);
			assert.deepStrictEqual(a, aCopy);
			assert.deepStrictEqual(b, bCopy);
		});

		it('handles larger vectors accurately', () => {
			const n = 1000;
			const a = Array.from({ length: n }, () => ({ re: 1, im: 1 }));
			const b = Array.from({ length: n }, () => ({ re: 1, im: -1 }));
			// Each term: (1 + i)(1 - i) = 2 + 0i -> sum = 2000 + 0i
			assert.deepStrictEqual(dotProductComplexIterative(a, b), { re: 2000, im: 0 });
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when arguments are not arrays', () => {
			assert.throws(() => dotProductComplexIterative(null, []), TypeError);
			assert.throws(() => dotProductComplexIterative([], undefined), TypeError);
			assert.throws(() => dotProductComplexIterative('abc', []), TypeError);
			assert.throws(() => dotProductComplexIterative([], { re: 1, im: 2 }), TypeError);
		});

		it('throws RangeError when vector lengths differ', () => {
			assert.throws(
				() => dotProductComplexIterative([{ re: 1, im: 0 }], []),
				RangeError
			);
			assert.throws(
				() => dotProductComplexIterative([{ re: 1, im: 0 }], [{ re: 1, im: 0 }, { re: 2, im: 0 }]),
				RangeError
			);
		});

		it('throws TypeError for malformed complex elements', () => {
			assert.throws(() => dotProductComplexIterative([null], [{ re: 1, im: 0 }]), TypeError);
			assert.throws(() => dotProductComplexIterative([{ re: 1, im: 0 }], [42]), TypeError);
			assert.throws(() => dotProductComplexIterative([{ re: 1 }], [{ re: 1, im: 0 }]), TypeError);
			assert.throws(() => dotProductComplexIterative([{ re: '1', im: 0 }], [{ re: 1, im: 0 }]), TypeError);
		});

		it('throws RangeError for non-finite complex components', () => {
			assert.throws(() => dotProductComplexIterative([{ re: NaN, im: 0 }], [{ re: 1, im: 0 }]), RangeError);
			assert.throws(() => dotProductComplexIterative([{ re: 1, im: Infinity }], [{ re: 1, im: 0 }]), RangeError);
			assert.throws(() => dotProductComplexIterative([{ re: 1, im: 0 }], [{ re: 0, im: -Infinity }]), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches polar-form multiplication reference implementation', () => {
			// Independent polar-coordinate reference: (r1*r2)*exp(i*(t1+t2))
			function polarDotReference(u, v) {
				let re = 0;
				let im = 0;
				for (let i = 0; i < u.length; i++) {
					const r1 = Math.hypot(u[i].re, u[i].im);
					const t1 = Math.atan2(u[i].im, u[i].re);
					const r2 = Math.hypot(v[i].re, v[i].im);
					const t2 = Math.atan2(v[i].im, v[i].re);
					const r = r1 * r2;
					const t = t1 + t2;
					re += r * Math.cos(t);
					im += r * Math.sin(t);
				}
				return { re, im };
			}

			// Deterministic pseudo-random vectors via LCG
			let seed = 1337;
			const next = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return (seed / 0xffffffff) * 20 - 10;
			};

			const a = Array.from({ length: 50 }, () => ({ re: next(), im: next() }));
			const b = Array.from({ length: 50 }, () => ({ re: next(), im: next() }));

			const actual = dotProductComplexIterative(a, b);
			const expected = polarDotReference(a, b);
			assertComplexClose(actual, expected, 1e-9);
		});

		it('satisfies symmetry, distributivity, and bilinearity', () => {
			const a = [
				{ re: 1.5, im: -2.5 },
				{ re: 3, im: 4 },
				{ re: -0.5, im: 1.25 },
			];
			const b = [
				{ re: -2, im: 1 },
				{ re: 0.5, im: -3 },
				{ re: 4, im: 2 },
			];
			const c = [
				{ re: 2.25, im: 0.75 },
				{ re: -1.5, im: 2 },
				{ re: 3, im: -1.5 },
			];
			const scalar = { re: -1.5, im: 2.5 };

			// Symmetry: a . b == b . a
			assertComplexClose(
				dotProductComplexIterative(a, b),
				dotProductComplexIterative(b, a)
			);

			// Distributivity: (a + b) . c == a . c + b . c
			const aPlusB = a.map((v, i) => ({ re: v.re + b[i].re, im: v.im + b[i].im }));
			const ac = dotProductComplexIterative(a, c);
			const bc = dotProductComplexIterative(b, c);
			assertComplexClose(
				dotProductComplexIterative(aPlusB, c),
				{ re: ac.re + bc.re, im: ac.im + bc.im }
			);

			// Bilinearity: (s * a) . b == s * (a . b)
			const mul = (x, y) => ({
				re: x.re * y.re - x.im * y.im,
				im: x.re * y.im + x.im * y.re,
			});
			const sa = a.map((v) => mul(scalar, v));
			const ab = dotProductComplexIterative(a, b);
			assertComplexClose(dotProductComplexIterative(sa, b), mul(scalar, ab));
		});
	});
});
