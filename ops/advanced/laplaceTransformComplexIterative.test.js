import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { laplaceTransformComplexIterative } from './laplaceTransformComplexIterative.js';

/** Complex helper utilities for analytical cross-checks. */
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re
});
const cDiv = (a, b) => {
	const denom = b.re * b.re + b.im * b.im;
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom
	};
};
const cExp = (z) => {
	const r = Math.exp(z.re);
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
};

function assertComplexClose(actual, expected, tol = 1e-6, label = '') {
	const errRe = Math.abs(actual.re - expected.re);
	const errIm = Math.abs(actual.im - expected.im);
	assert.ok(
		errRe <= tol && errIm <= tol,
		`${label} expected { re: ${expected.re}, im: ${expected.im} }, got { re: ${actual.re}, im: ${actual.im} } (errRe=${errRe}, errIm=${errIm}, tol=${tol})`
	);
}

describe('laplaceTransformComplexIterative', () => {
	describe('analytical cross-checks (normal cases)', () => {
		it('matches L{1}(s) = 1/s for real and complex s', () => {
			const one = () => 1;
			const points = [
				{ re: 2, im: 0 },
				{ re: 2, im: 3 },
				{ re: 0.5, im: -4 },
				{ re: 3.5, im: 1.25 }
			];

			for (const s of points) {
				const actual = laplaceTransformComplexIterative(one, s);
				const expected = cDiv({ re: 1, im: 0 }, s);
				assertComplexClose(actual, expected, 1e-8, `L{1} at (${s.re}, ${s.im})`);
			}
		});

		it('matches L{e^(a*t)}(s) = 1/(s - a) for positive and negative real a', () => {
			// Positive a with Re(s) > a
			const s1 = { re: 3, im: 2 };
			assertComplexClose(
				laplaceTransformComplexIterative((t) => Math.exp(1.5 * t), s1),
				cDiv({ re: 1, im: 0 }, cSub(s1, { re: 1.5, im: 0 })),
				1e-7,
				'L{e^(1.5t)}'
			);

			// Negative a with Re(s) <= 0 (converges because Re(s) > -5)
			const s2 = { re: -1, im: 2 };
			assertComplexClose(
				laplaceTransformComplexIterative((t) => Math.exp(-5 * t), s2),
				cDiv({ re: 1, im: 0 }, cSub(s2, { re: -5, im: 0 })),
				1e-7,
				'L{e^(-5t)} at Re(s) < 0'
			);

			const s3 = { re: 0, im: 3 };
			assertComplexClose(
				laplaceTransformComplexIterative((t) => Math.exp(-2 * t), s3),
				cDiv({ re: 1, im: 0 }, cSub(s3, { re: -2, im: 0 })),
				1e-7,
				'L{e^(-2t)} at Re(s) = 0'
			);
		});

		it('matches L{e^(z*t)}(s) = 1/(s - z) for complex-valued functions f(t)', () => {
			const z = { re: -0.5, im: 2.5 };
			const fn = (t) => cExp({ re: z.re * t, im: z.im * t });
			const s = { re: 1.5, im: -1 };

			const actual = laplaceTransformComplexIterative(fn, s);
			const expected = cDiv({ re: 1, im: 0 }, cSub(s, z));
			assertComplexClose(actual, expected, 1e-7, 'L{e^(zt)}');
		});

		it('matches L{t^n}(s) = n! / s^(n+1) for n = 1, 2, 3', () => {
			const s = { re: 2, im: -1 };
			let factorial = 1;
			let sPow = s;

			for (let n = 1; n <= 3; n++) {
				factorial *= n;
				sPow = cMul(sPow, s);
				const actual = laplaceTransformComplexIterative((t) => t ** n, s);
				const expected = cDiv({ re: factorial, im: 0 }, sPow);
				assertComplexClose(actual, expected, 1e-7, `L{t^${n}}`);
			}
		});

		it('matches L{sin(w*t)}(s) = w / (s^2 + w^2) and L{cos(w*t)}(s) = s / (s^2 + w^2)', () => {
			const w = 3;
			const s = { re: 1.5, im: 2 };
			const s2PlusW2 = cAdd(cMul(s, s), { re: w * w, im: 0 });

			assertComplexClose(
				laplaceTransformComplexIterative((t) => Math.sin(w * t), s),
				cDiv({ re: w, im: 0 }, s2PlusW2),
				1e-7,
				'L{sin(3t)}'
			);

			assertComplexClose(
				laplaceTransformComplexIterative((t) => Math.cos(w * t), s),
				cDiv(s, s2PlusW2),
				1e-7,
				'L{cos(3t)}'
			);
		});

		it('matches L{e^(-a*t) * sin(w*t)}(s) = w / ((s + a)^2 + w^2)', () => {
			const a = 1.2;
			const w = 2.4;
			const s = { re: 0.8, im: -1.5 };
			const sPlusA = { re: s.re + a, im: s.im };
			const expected = cDiv({ re: w, im: 0 }, cAdd(cMul(sPlusA, sPlusA), { re: w * w, im: 0 }));

			const actual = laplaceTransformComplexIterative(
				(t) => Math.exp(-a * t) * Math.sin(w * t),
				s
			);
			assertComplexClose(actual, expected, 1e-7, 'L{e^(-at) sin(wt)}');
		});

		it('satisfies complex linearity, frequency shift, and conjugate symmetry', () => {
			const f = (t) => Math.exp(-t) * Math.cos(2 * t);
			const g = (t) => ({ re: t * Math.exp(-2 * t), im: Math.exp(-3 * t) });
			const alpha = { re: 2, im: -1 };
			const beta = { re: -0.5, im: 3 };
			const s = { re: 1.5, im: 1 };

			// Linearity: L{alpha*f + beta*g}(s) = alpha*L{f}(s) + beta*L{g}(s)
			const combined = (t) => {
				const fv = { re: f(t), im: 0 };
				const gv = g(t);
				return cAdd(cMul(alpha, fv), cMul(beta, gv));
			};
			const lhs = laplaceTransformComplexIterative(combined, s);
			const rhs = cAdd(
				cMul(alpha, laplaceTransformComplexIterative(f, s)),
				cMul(beta, laplaceTransformComplexIterative(g, s))
			);
			assertComplexClose(lhs, rhs, 1e-7, 'linearity');

			// Frequency shift: L{e^(s0*t) * f(t)}(s) = L{f}(s - s0)
			const s0 = { re: 0.5, im: -1.25 };
			const shiftedFn = (t) => {
				const e = cExp({ re: s0.re * t, im: s0.im * t });
				const fv = f(t);
				return { re: e.re * fv, im: e.im * fv };
			};
			assertComplexClose(
				laplaceTransformComplexIterative(shiftedFn, s),
				laplaceTransformComplexIterative(f, cSub(s, s0)),
				1e-7,
				'frequency shift'
			);

			// Conjugate symmetry for real f(t): F(conj(s)) = conj(F(s))
			const fAtS = laplaceTransformComplexIterative(f, s);
			const fAtConjS = laplaceTransformComplexIterative(f, { re: s.re, im: -s.im });
			assertComplexClose(fAtConjS, { re: fAtS.re, im: -fAtS.im }, 1e-10, 'conjugate symmetry');
		});
	});

	describe('edge cases and quadrature options', () => {
		it('returns exact { re: 0, im: 0 } without negative zero for identically zero functions', () => {
			const resReal = laplaceTransformComplexIterative(() => 0, { re: 2, im: -3 });
			assert.deepStrictEqual(resReal, { re: 0, im: 0 });
			assert.ok(Object.is(resReal.re, 0));
			assert.ok(Object.is(resReal.im, 0));

			const resComplex = laplaceTransformComplexIterative(
				() => ({ re: 0, im: 0 }),
				{ re: -100, im: 5 },
				{ upperBound: 20, steps: 20 }
			);
			assert.deepStrictEqual(resComplex, { re: 0, im: 0 });
		});

		it('supports finite upperBound matching truncated integral (1 - e^(-s*T)) / s', () => {
			const s = { re: 1, im: 2 };
			const T = 3;
			const actual = laplaceTransformComplexIterative(() => 1, s, {
				upperBound: T,
				steps: 1000
			});
			const expected = cDiv(
				cSub({ re: 1, im: 0 }, cExp({ re: -s.re * T, im: -s.im * T })),
				s
			);
			assertComplexClose(actual, expected, 1e-9, 'finite upperBound');
		});

		it('supports odd step counts (Simpson 3/8 tail) and steps = 1 (trapezoid)', () => {
			const s = { re: 1, im: 1 };
			const expected = cDiv({ re: 1, im: 0 }, s);

			// Odd steps >= 3 (composite Simpson 1/3 + 3/8)
			const resOdd = laplaceTransformComplexIterative(() => 1, s, {
				upperBound: 40,
				steps: 1001
			});
			assertComplexClose(resOdd, expected, 1e-6, 'odd steps=1001');

			// Minimal odd steps = 3 (pure Simpson 3/8): exact for cubic polynomial when s = 0
			const resCubic = laplaceTransformComplexIterative((t) => t ** 3, { re: 0, im: 0 }, {
				upperBound: 2,
				steps: 3
			});
			assertComplexClose(resCubic, { re: 4, im: 0 }, 1e-12, 'steps=3 exact for t^3');

			// steps = 1 (trapezoidal rule): exact for linear function when s = 0
			const resLinear = laplaceTransformComplexIterative((t) => 2 * t + 1, { re: 0, im: 0 }, {
				upperBound: 4,
				steps: 1
			});
			assertComplexClose(resLinear, { re: 20, im: 0 }, 1e-12, 'steps=1 exact for linear');
		});

		it('handles high imaginary frequency and small positive real part', () => {
			const sHighIm = { re: 1, im: 25 };
			assertComplexClose(
				laplaceTransformComplexIterative(() => 1, sHighIm),
				cDiv({ re: 1, im: 0 }, sHighIm),
				1e-6,
				'high imaginary frequency'
			);

			const sSmallRe = { re: 0.05, im: 0.5 };
			assertComplexClose(
				laplaceTransformComplexIterative(() => 1, sSmallRe),
				cDiv({ re: 1, im: 0 }, sSmallRe),
				1e-5,
				'small positive Re(s)'
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when fn is not a function', () => {
			for (const bad of [null, undefined, 42, 'fn', {}]) {
				assert.throws(
					() => laplaceTransformComplexIterative(bad, { re: 1, im: 0 }),
					TypeError
				);
			}
		});

		it('throws TypeError or RangeError for invalid s', () => {
			const fn = () => 1;
			for (const bad of [null, undefined, 1, '1+i', [1, 0], { re: 1 }, { im: 0 }, { re: '1', im: 0 }]) {
				assert.throws(() => laplaceTransformComplexIterative(fn, bad), TypeError);
			}
			for (const bad of [
				{ re: NaN, im: 0 },
				{ re: 1, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 1, im: -Infinity }
			]) {
				assert.throws(() => laplaceTransformComplexIterative(fn, bad), RangeError);
			}
		});

		it('throws TypeError or RangeError for invalid options', () => {
			const fn = () => 1;
			const s = { re: 1, im: 0 };

			for (const badOpts of [null, 123, 'opts', []]) {
				assert.throws(() => laplaceTransformComplexIterative(fn, s, badOpts), TypeError);
			}

			assert.throws(() => laplaceTransformComplexIterative(fn, s, { upperBound: '10' }), TypeError);
			for (const badBound of [0, -5, NaN, Infinity]) {
				assert.throws(
					() => laplaceTransformComplexIterative(fn, s, { upperBound: badBound }),
					RangeError
				);
			}

			assert.throws(() => laplaceTransformComplexIterative(fn, s, { steps: '100' }), TypeError);
			for (const badSteps of [0, -2, 1.5, NaN, Infinity]) {
				assert.throws(
					() => laplaceTransformComplexIterative(fn, s, { steps: badSteps }),
					RangeError
				);
			}
		});

		it('throws when fn(t) returns invalid or non-finite values, or integrand overflows', () => {
			const s = { re: 1, im: 0 };

			for (const badReturn of [null, undefined, '1', [], { re: 1 }, { re: '1', im: 0 }]) {
				assert.throws(
					() => laplaceTransformComplexIterative(() => badReturn, s, { upperBound: 1, steps: 2 }),
					TypeError
				);
			}

			for (const nonFinite of [NaN, Infinity, { re: NaN, im: 0 }, { re: 0, im: -Infinity }]) {
				assert.throws(
					() => laplaceTransformComplexIterative(() => nonFinite, s, { upperBound: 1, steps: 2 }),
					RangeError
				);
			}

			// Overflowing exponential growth (divergent integral)
			assert.throws(
				() => laplaceTransformComplexIterative(() => 1, { re: -100, im: 0 }, { upperBound: 20, steps: 10 }),
				RangeError
			);
		});
	});
});
