import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { integralComplexMemo } from './integralComplexMemo.js';

/** Complex arithmetic helpers for analytic antiderivatives and tests. */
const cAdd = (x, y) => ({ re: x.re + y.re, im: x.im + y.im });
const cSub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
const cMul = (x, y) => ({
	re: x.re * y.re - x.im * y.im,
	im: x.re * y.im + x.im * y.re,
});
const cDiv = (x, y) => {
	const denom = y.re * y.re + y.im * y.im;
	return {
		re: (x.re * y.re + x.im * y.im) / denom,
		im: (x.im * y.re - x.re * y.im) / denom,
	};
};
const cPowInt = (z, n) => {
	let acc = { re: 1, im: 0 };
	for (let i = 0; i < n; i++) {
		acc = cMul(acc, z);
	}
	return acc;
};
const cExp = (z) => {
	const r = Math.exp(z.re);
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
};
const cLog = (z) => ({
	re: Math.log(Math.hypot(z.re, z.im)),
	im: Math.atan2(z.im, z.re),
});
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
});
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
});

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const prefix = label ? `${label}: ` : '';
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${prefix}real part mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)})`,
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${prefix}imag part mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)})`,
	);
}

describe('integralComplexMemo', () => {
	describe('normal cases', () => {
		it('integrates constant complex function exactly', () => {
			const c = { re: 3, im: -4 };
			const a = { re: 1, im: 2 };
			const b = { re: -2, im: 5 };
			const result = integralComplexMemo(() => c, a, b);
			const expected = cMul(c, cSub(b, a));
			assertComplexClose(result, expected, 1e-13, 'constant');
		});

		it('integrates complex polynomials z^2 + (2 - i)z + 1', () => {
			const k = { re: 2, im: -1 };
			const f = (z) => cAdd(cAdd(cMul(z, z), cMul(k, z)), { re: 1, im: 0 });
			const antideriv = (z) => {
				const z3Over3 = cDiv(cPowInt(z, 3), { re: 3, im: 0 });
				const kz2Over2 = cDiv(cMul(k, cMul(z, z)), { re: 2, im: 0 });
				return cAdd(cAdd(z3Over3, kz2Over2), z);
			};

			const a = { re: -1, im: 2 };
			const b = { re: 3, im: -1.5 };
			const result = integralComplexMemo(f, a, b);
			const expected = cSub(antideriv(b), antideriv(a));
			assertComplexClose(result, expected, 1e-12, 'polynomial');
		});

		it('integrates exp(z) along a diagonal complex contour', () => {
			const a = { re: -0.5, im: Math.PI / 4 };
			const b = { re: 1.5, im: (3 * Math.PI) / 2 };
			const result = integralComplexMemo(cExp, a, b);
			const expected = cSub(cExp(b), cExp(a));
			assertComplexClose(result, expected, 1e-12, 'exp(z)');
		});

		it('integrates 1/z away from the origin and branch cut', () => {
			const inv = (z) => cDiv({ re: 1, im: 0 }, z);
			const a = { re: 1, im: 0 };
			const b = { re: 1, im: 2 };
			const result = integralComplexMemo(inv, a, b, { subintervals: 32, order: 16 });
			const expected = cSub(cLog(b), cLog(a));
			assertComplexClose(result, expected, 1e-12, '1/z');
		});

		it('supports all precomputed Gauss-Legendre orders (2, 4, 8, 16) with exact polynomial degree 2p - 1', () => {
			const a = { re: 0, im: 0 };
			const b = { re: 1, im: 0.5 };
			for (const order of [2, 4, 8, 16]) {
				const deg = 2 * order - 1;
				const f = (z) => cPowInt(z, deg);
				const expected = cDiv(
					cSub(cPowInt(b, deg + 1), cPowInt(a, deg + 1)),
					{ re: deg + 1, im: 0 },
				);
				// Even with subintervals = 1, order-p Gauss-Legendre is exact up to degree 2p - 1
				const result = integralComplexMemo(f, a, b, { subintervals: 1, order });
				const scale = Math.max(1, Math.hypot(expected.re, expected.im));
				assertComplexClose(result, expected, 1e-12 * scale, `order=${order}, deg=${deg}`);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies Fundamental Theorem of Calculus F(b) - F(a) for cos(z) and sin(z)', () => {
			const a = { re: -1.2, im: 0.7 };
			const b = { re: 2.1, im: -0.9 };

			// ∫ cos(z) dz = sin(b) - sin(a)
			const intCos = integralComplexMemo(cCos, a, b);
			assertComplexClose(intCos, cSub(cSin(b), cSin(a)), 1e-12, 'FTC cos');

			// ∫ sin(z) dz = -(cos(b) - cos(a)) = cos(a) - cos(b)
			const intSin = integralComplexMemo(cSin, a, b);
			assertComplexClose(intSin, cSub(cCos(a), cCos(b)), 1e-12, 'FTC sin');
		});

		it('satisfies path independence / Cauchy theorem: ∫_a^c + ∫_c^b = ∫_a^b for holomorphic functions', () => {
			const f = (z) => cMul(cExp(z), cAdd(cMul(z, z), { re: 0, im: 1 }));
			const a = { re: -1, im: -1 };
			const b = { re: 2, im: 1.5 };
			const c1 = { re: 2, im: -1 };
			const c2 = { re: -0.5, im: 2.5 };

			const direct = integralComplexMemo(f, a, b);
			const viaC1 = cAdd(integralComplexMemo(f, a, c1), integralComplexMemo(f, c1, b));
			const viaC2 = cAdd(integralComplexMemo(f, a, c2), integralComplexMemo(f, c2, b));

			assertComplexClose(viaC1, direct, 1e-11, 'Cauchy path via c1');
			assertComplexClose(viaC2, direct, 1e-11, 'Cauchy path via c2');

			// Closed triangle contour integral of holomorphic function is 0
			const loop = cAdd(
				cAdd(integralComplexMemo(f, a, c1), integralComplexMemo(f, c1, b)),
				integralComplexMemo(f, b, a),
			);
			assertComplexClose(loop, { re: 0, im: 0 }, 1e-11, 'Cauchy closed loop');
		});

		it('computes 2πi residue for 1/z around a closed square enclosing the origin', () => {
			const inv = (z) => cDiv({ re: 1, im: 0 }, z);
			const p1 = { re: 1, im: -1 };
			const p2 = { re: 1, im: 1 };
			const p3 = { re: -1, im: 1 };
			const p4 = { re: -1, im: -1 };
			const opts = { subintervals: 32, order: 16 };

			const total = [
				integralComplexMemo(inv, p1, p2, opts),
				integralComplexMemo(inv, p2, p3, opts),
				integralComplexMemo(inv, p3, p4, opts),
				integralComplexMemo(inv, p4, p1, opts),
			].reduce(cAdd, { re: 0, im: 0 });

			assertComplexClose(total, { re: 0, im: 2 * Math.PI }, 1e-12, 'residue 2*pi*i');
		});
	});

	describe('edge cases and memoization', () => {
		it('returns { re: 0, im: 0 } when a equals b without evaluating fn', () => {
			let calls = 0;
			const fn = (z) => {
				calls++;
				return z;
			};
			const p = { re: 2.5, im: -3.5 };
			const res = integralComplexMemo(fn, p, { re: 2.5, im: -3.5 });
			assert.deepStrictEqual(res, { re: 0, im: 0 });
			assert.equal(calls, 0);
		});

		it('negates the integral when bounds are reversed', () => {
			const f = (z) => cAdd(cExp(z), cMul(z, z));
			const a = { re: -1, im: 0.5 };
			const b = { re: 1.5, im: -2 };
			const forward = integralComplexMemo(f, a, b);
			const backward = integralComplexMemo(f, b, a);
			assertComplexClose(
				backward,
				{ re: -forward.re, im: -forward.im },
				1e-12,
				'reversed bounds',
			);
		});

		it('memoizes per function and returns fresh objects immune to caller mutation', () => {
			let evaluations = 0;
			const f = (z) => {
				evaluations++;
				return cMul(z, z);
			};
			const a = { re: 0, im: 0 };
			const b = { re: 2, im: 1 };
			const opts = { subintervals: 4, order: 4 };

			const first = integralComplexMemo(f, a, b, opts);
			const evalsAfterFirst = evaluations;
			assert.equal(evalsAfterFirst, 16); // 4 subintervals * 4 nodes

			// Mutate returned object
			const savedRe = first.re;
			const savedIm = first.im;
			first.re = 999999;
			first.im = -999999;

			// Cache hit: zero additional evaluations and uncorrupted fresh object
			const second = integralComplexMemo(f, a, b, opts);
			assert.equal(evaluations, evalsAfterFirst);
			assert.notEqual(second, first);
			assert.equal(second.re, savedRe);
			assert.equal(second.im, savedIm);

			// Changing quadrature parameters triggers fresh computation
			const third = integralComplexMemo(f, a, b, { subintervals: 8, order: 4 });
			assert.equal(evaluations, evalsAfterFirst + 32);
			assertComplexClose(third, { re: savedRe, im: savedIm }, 1e-12);

			// useCache: false forces recomputation
			integralComplexMemo(f, a, b, { ...opts, useCache: false });
			assert.equal(evaluations, evalsAfterFirst + 32 + 16);
		});

		it('enforces bounded LRU cache eviction via maxCacheSize', () => {
			let evaluations = 0;
			const f = (z) => {
				evaluations++;
				return z;
			};
			const opts = { subintervals: 1, order: 2, maxCacheSize: 2 };
			const origin = { re: 0, im: 0 };
			const b1 = { re: 1, im: 0 };
			const b2 = { re: 2, im: 0 };
			const b3 = { re: 3, im: 0 };

			integralComplexMemo(f, origin, b1, opts); // miss (cache: [b1])
			integralComplexMemo(f, origin, b2, opts); // miss (cache: [b1, b2])
			assert.equal(evaluations, 4);

			integralComplexMemo(f, origin, b1, opts); // hit -> refreshes b1 (cache: [b2, b1])
			assert.equal(evaluations, 4);

			integralComplexMemo(f, origin, b3, opts); // miss -> evicts b2 (cache: [b1, b3])
			assert.equal(evaluations, 6);

			integralComplexMemo(f, origin, b1, opts); // still cached!
			assert.equal(evaluations, 6);

			integralComplexMemo(f, origin, b2, opts); // was evicted -> miss!
			assert.equal(evaluations, 8);
		});

		it('handles -0 and +0 consistently in bounds and cache keys', () => {
			let evaluations = 0;
			const f = (z) => {
				evaluations++;
				return z;
			};
			const opts = { subintervals: 2, order: 2 };
			const r1 = integralComplexMemo(f, { re: -0, im: 0 }, { re: 1, im: -0 }, opts);
			const r2 = integralComplexMemo(f, { re: 0, im: -0 }, { re: 1, im: 0 }, opts);
			assert.equal(evaluations, 4);
			assert.deepStrictEqual(r1, r2);
		});
	});

	describe('input validation', () => {
		const validFn = (z) => z;
		const validA = { re: 0, im: 0 };
		const validB = { re: 1, im: 1 };

		it('throws TypeError when fn is not a function', () => {
			assert.throws(() => integralComplexMemo(null, validA, validB), TypeError);
			assert.throws(() => integralComplexMemo(42, validA, validB), TypeError);
		});

		it('throws TypeError or RangeError for invalid complex bounds', () => {
			assert.throws(() => integralComplexMemo(validFn, null, validB), TypeError);
			assert.throws(() => integralComplexMemo(validFn, validA, '1+i'), TypeError);
			assert.throws(() => integralComplexMemo(validFn, { re: '0', im: 0 }, validB), TypeError);
			assert.throws(() => integralComplexMemo(validFn, { re: NaN, im: 0 }, validB), RangeError);
			assert.throws(
				() => integralComplexMemo(validFn, validA, { re: 1, im: Infinity }),
				RangeError,
			);
		});

		it('throws for invalid options', () => {
			assert.throws(() => integralComplexMemo(validFn, validA, validB, null), TypeError);
			assert.throws(() => integralComplexMemo(validFn, validA, validB, []), TypeError);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { subintervals: 0 }),
				RangeError,
			);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { subintervals: 2.5 }),
				RangeError,
			);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { subintervals: '4' }),
				TypeError,
			);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { order: 3 }),
				RangeError,
			);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { order: '8' }),
				TypeError,
			);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { useCache: 1 }),
				TypeError,
			);
			assert.throws(
				() => integralComplexMemo(validFn, validA, validB, { maxCacheSize: 0 }),
				RangeError,
			);
		});

		it('throws when fn returns a non-complex or non-finite value', () => {
			assert.throws(
				() => integralComplexMemo(() => 123, validA, validB),
				TypeError,
			);
			assert.throws(
				() => integralComplexMemo(() => ({ re: NaN, im: 0 }), validA, validB),
				RangeError,
			);
			assert.throws(
				() => integralComplexMemo(() => ({ re: 0, im: Infinity }), validA, validB),
				RangeError,
			);
		});
	});
});
