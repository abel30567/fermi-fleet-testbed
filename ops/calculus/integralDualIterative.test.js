import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { integralDualIterative } from './integralDualIterative.js';

/**
 * Helper: asserts two numbers are within an absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-10, label = '') {
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	);
}

// Local dual arithmetic helpers for constructing test integrands (zero external deps).
const dualAdd = (x, y) => ({ v: x.v + y.v, d: x.d + y.d });
const dualMul = (x, y) => ({ v: x.v * y.v, d: x.v * y.d + x.d * y.v });
const dualDiv = (x, y) => ({
	v: x.v / y.v,
	d: (x.d * y.v - x.v * y.d) / (y.v * y.v),
});
const dualSin = (x) => ({ v: Math.sin(x.v), d: Math.cos(x.v) * x.d });
const dualCos = (x) => ({ v: Math.cos(x.v), d: -Math.sin(x.v) * x.d });
const dualExp = (x) => {
	const e = Math.exp(x.v);
	return { v: e, d: e * x.d };
};

describe('integralDualIterative', () => {
	describe('normal cases', () => {
		test('integrates polynomials up to degree 3 exactly under Simpson rule (even with steps=2)', () => {
			// f(x) = 4x^3 - 3x^2 + 2x - 5
			// Antiderivative F(x) = x^4 - x^3 + x^2 - 5x
			const poly = (x) => {
				const x2 = dualMul(x, x);
				const x3 = dualMul(x2, x);
				return {
					v: 4 * x3.v - 3 * x2.v + 2 * x.v - 5,
					d: 4 * x3.d - 3 * x2.d + 2 * x.d,
				};
			};
			const F = (x) => x ** 4 - x ** 3 + x ** 2 - 5 * x;
			const f = (x) => 4 * x ** 3 - 3 * x ** 2 + 2 * x - 5;

			const a = { v: -1.5, d: 2.25 };
			const b = { v: 2.5, d: -0.75 };
			const res = integralDualIterative(poly, a, b, 2);

			const expectedV = F(b.v) - F(a.v);
			const expectedD = f(b.v) * b.d - f(a.v) * a.d;

			assertClose(res.v, expectedV, 1e-13, 'primal value');
			assertClose(res.d, expectedD, 1e-13, 'Leibniz derivative');
		});

		test('integrates trigonometric and exponential functions accurately', () => {
			// ∫_0^π sin(x) dx = 2, fixed limits => d = 0
			const sinRes = integralDualIterative(
				dualSin,
				{ v: 0, d: 0 },
				{ v: Math.PI, d: 0 },
			);
			assertClose(sinRes.v, 2, 1e-11, '∫ sin(x) primal');
			assertClose(sinRes.d, 0, 1e-12, '∫ sin(x) derivative');

			// ∫_0^1 exp(x) dx = e - 1, with moving limits a(t)=0 (a'=0.5), b(t)=1 (b'=1.5)
			const expRes = integralDualIterative(
				dualExp,
				{ v: 0, d: 0.5 },
				{ v: 1, d: 1.5 },
			);
			assertClose(expRes.v, Math.E - 1, 1e-12, '∫ exp(x) primal');
			assertClose(expRes.d, Math.E * 1.5 - 1 * 0.5, 1e-12, '∫ exp(x) derivative');
		});

		test('propagates derivative from a parameter inside the integrand (Feynman trick / differentiation under the integral)', () => {
			// I(t) = ∫_0^2 exp(t * x) dx = (exp(2t) - 1) / t
			// dI/dt = ∫_0^2 x * exp(t * x) dx = (2t * exp(2t) - exp(2t) + 1) / t^2
			const tVal = 1.3;
			const tDual = { v: tVal, d: 1 };
			const integrand = (x) => dualExp(dualMul(tDual, x));

			const res = integralDualIterative(
				integrand,
				{ v: 0, d: 0 },
				{ v: 2, d: 0 },
			);

			const e2t = Math.exp(2 * tVal);
			const expectedV = (e2t - 1) / tVal;
			const expectedD = (2 * tVal * e2t - e2t + 1) / (tVal * tVal);

			assertClose(res.v, expectedV, 1e-11, 'primal ∫ exp(t*x)');
			assertClose(res.d, expectedD, 1e-10, 'd/dt ∫ exp(t*x)');
		});

		test('computes full Leibniz rule with both moving limits and parameter-dependent integrand', () => {
			// I(t) = ∫_{a(t)}^{b(t)} 1 / (x + t) dx = ln((b(t) + t) / (a(t) + t))
			// Let t = 2, a(t) = t - 1 (a=1, a'=1), b(t) = t^2 (b=4, b'=4)
			const tVal = 2;
			const tDual = { v: tVal, d: 1 };
			const a = { v: tVal - 1, d: 1 };
			const b = { v: tVal * tVal, d: 2 * tVal };

			const integrand = (x) => dualDiv({ v: 1, d: 0 }, dualAdd(x, tDual));
			const res = integralDualIterative(integrand, a, b, 1000);

			// Closed-form: ln((t^2 + t) / (2t - 1))
			// Derivative: (2t + 1) / (t^2 + t) - 2 / (2t - 1)
			const expectedV = Math.log((b.v + tVal) / (a.v + tVal));
			const expectedD =
				(b.d + 1) / (b.v + tVal) - (a.d + 1) / (a.v + tVal);

			assertClose(res.v, expectedV, 1e-12, 'full Leibniz primal');
			assertClose(res.d, expectedD, 1e-12, 'full Leibniz derivative');
		});
	});

	describe('edge cases', () => {
		test('verifies Fundamental Theorem of Calculus for varying upper and lower limits', () => {
			// f(x) = cos(x^2) + exp(-x)
			const fn = (x) =>
				dualAdd(
					dualCos(dualMul(x, x)),
					dualExp({ v: -x.v, d: -x.d }),
				);
			const fScalar = (x) => Math.cos(x * x) + Math.exp(-x);

			// d/db ∫_a^b f(x) dx = f(b)
			const upperRes = integralDualIterative(
				fn,
				{ v: 0.25, d: 0 },
				{ v: 1.75, d: 1 },
				1000,
			);
			assertClose(upperRes.d, fScalar(1.75), 1e-11, 'FTC upper limit');

			// d/da ∫_a^b f(x) dx = -f(a)
			const lowerRes = integralDualIterative(
				fn,
				{ v: 0.25, d: 1 },
				{ v: 1.75, d: 0 },
				1000,
			);
			assertClose(lowerRes.d, -fScalar(0.25), 1e-11, 'FTC lower limit');
		});

		test('handles reversed limits (a.v > b.v) with moving bounds', () => {
			// ∫_3^1 x^2 dx = (1 - 27)/3 = -26/3
			// With a = {v:3, d:2}, b = {v:1, d:5}: d = 5*1^2 - 2*3^2 = -13
			const square = (x) => dualMul(x, x);
			const res = integralDualIterative(
				square,
				{ v: 3, d: 2 },
				{ v: 1, d: 5 },
				100,
			);

			assertClose(res.v, -26 / 3, 1e-13, 'reversed primal');
			assertClose(res.d, -13, 1e-13, 'reversed derivative');
		});

		test('handles equal limits (a.v === b.v) with both equal and unequal derivatives', () => {
			const fn = (x) => ({ v: -(x.v * x.v + 1), d: -2 * x.v * x.d });

			// Equal limits and equal derivatives -> exact { v: 0, d: 0 }, no -0
			const resZero = integralDualIterative(
				fn,
				{ v: 2, d: 3 },
				{ v: 2, d: 3 },
				10,
			);
			assert.equal(Object.is(resZero.v, 0), true);
			assert.equal(Object.is(resZero.d, 0), true);

			// Equal limits with different derivatives:
			// Leibniz rule gives v = 0, d = f(a.v) * (b.d - a.d)
			const resMoving = integralDualIterative(
				fn,
				{ v: 2, d: 1 },
				{ v: 2, d: 4 },
				10,
			);
			assert.equal(Object.is(resMoving.v, 0), true);
			assertClose(resMoving.d, -(2 * 2 + 1) * (4 - 1), 1e-14, 'degenerate Leibniz d');
		});

		test('does not mutate caller limit objects even if fn mutates its argument', () => {
			const a = { v: 0, d: 1 };
			const b = { v: 2, d: 3 };
			const mutatingFn = (x) => {
				const out = { v: x.v, d: x.d };
				x.v = 999;
				x.d = 999;
				return out;
			};

			const res = integralDualIterative(mutatingFn, a, b, 4);
			assert.deepEqual(a, { v: 0, d: 1 });
			assert.deepEqual(b, { v: 2, d: 3 });
			assertClose(res.v, 2, 1e-14);
			assertClose(res.d, 2 * 3 - 0 * 1, 1e-14);
		});

		test('throws TypeError or RangeError on invalid inputs', () => {
			const id = (x) => x;
			const a = { v: 0, d: 0 };
			const b = { v: 1, d: 0 };

			// Invalid fn
			assert.throws(() => integralDualIterative(null, a, b), TypeError);
			assert.throws(() => integralDualIterative(42, a, b), TypeError);

			// Invalid a / b
			assert.throws(() => integralDualIterative(id, null, b), TypeError);
			assert.throws(() => integralDualIterative(id, 0, b), TypeError);
			assert.throws(() => integralDualIterative(id, { v: 0 }, b), TypeError);
			assert.throws(() => integralDualIterative(id, a, { v: '1', d: 0 }), TypeError);
			assert.throws(() => integralDualIterative(id, { v: NaN, d: 0 }, b), RangeError);
			assert.throws(() => integralDualIterative(id, a, { v: 1, d: Infinity }), RangeError);
			assert.throws(() => integralDualIterative(id, { v: -Infinity, d: 0 }, b), RangeError);

			// Invalid steps
			assert.throws(() => integralDualIterative(id, a, b, '10'), TypeError);
			assert.throws(() => integralDualIterative(id, a, b, null), TypeError);
			assert.throws(() => integralDualIterative(id, a, b, 0), RangeError);
			assert.throws(() => integralDualIterative(id, a, b, -4), RangeError);
			assert.throws(() => integralDualIterative(id, a, b, 3), RangeError);
			assert.throws(() => integralDualIterative(id, a, b, 2.5), RangeError);
			assert.throws(() => integralDualIterative(id, a, b, NaN), RangeError);
			assert.throws(() => integralDualIterative(id, a, b, Infinity), RangeError);
			assert.throws(
				() => integralDualIterative(id, a, b, Number.MAX_SAFE_INTEGER + 1),
				RangeError,
			);

			// Invalid return value from fn
			assert.throws(() => integralDualIterative(() => null, a, b, 2), TypeError);
			assert.throws(() => integralDualIterative(() => ({ v: 1 }), a, b, 2), TypeError);
			assert.throws(
				() => integralDualIterative((x) => ({ v: 1 / (x.v - 0.5), d: 0 }), a, b, 2),
				RangeError,
			);
			assert.throws(
				() => integralDualIterative(() => ({ v: 1, d: NaN }), a, b, 2),
				RangeError,
			);

			// Overflowing integration span
			assert.throws(
				() =>
					integralDualIterative(
						id,
						{ v: -1e308, d: 0 },
						{ v: 1e308, d: 0 },
						2,
					),
				RangeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		test('matches central finite-difference numerical derivative for parameter-dependent integral with moving bounds', () => {
			// I(t) = ∫_{a(t)}^{b(t)} exp(-t * x) * cos(x + t) dx
			// where a(t) = t^2 / 4, b(t) = 1 + sin(t)
			const evalIntegralAtT = (tVal, withDerivative) => {
				const d = withDerivative ? 1 : 0;
				const tDual = { v: tVal, d };
				const a = { v: (tVal * tVal) / 4, d: (tVal / 2) * d };
				const b = { v: 1 + Math.sin(tVal), d: Math.cos(tVal) * d };
				const fn = (x) =>
					dualMul(
						dualExp({
							v: -tDual.v * x.v,
							d: -(tDual.v * x.d + tDual.d * x.v),
						}),
						dualCos(dualAdd(x, tDual)),
					);
				return integralDualIterative(fn, a, b, 1000);
			};

			const t0 = 0.7;
			const dualResult = evalIntegralAtT(t0, true);

			// Independent central finite difference: (I(t0 + h) - I(t0 - h)) / (2h)
			const h = 1e-6;
			const plus = evalIntegralAtT(t0 + h, false).v;
			const minus = evalIntegralAtT(t0 - h, false).v;
			const numericalDerivative = (plus - minus) / (2 * h);

			assertClose(
				dualResult.d,
				numericalDerivative,
				1e-8,
				'central finite-difference cross-check',
			);
		});

		test('satisfies interval additivity ∫_a^c + ∫_c^b = ∫_a^b for both primal and derivative (with arbitrary c.d)', () => {
			// Even when the split point c carries a nonzero derivative c.d,
			// the boundary terms +f(c)*c.d and -f(c)*c.d must cancel identically.
			const tDual = { v: 0.8, d: 1 };
			const fn = (x) =>
				dualAdd(
					dualSin(dualMul(tDual, x)),
					dualDiv({ v: 1, d: 0 }, dualAdd({ v: 2, d: 0 }, dualMul(x, x))),
				);

			const a = { v: -0.5, d: 1.2 };
			const c = { v: 0.7, d: -3.5 };
			const b = { v: 2.1, d: 0.4 };

			const full = integralDualIterative(fn, a, b, 1000);
			const left = integralDualIterative(fn, a, c, 500);
			const right = integralDualIterative(fn, c, b, 500);

			assertClose(left.v + right.v, full.v, 1e-11, 'additivity primal');
			assertClose(left.d + right.d, full.d, 1e-11, 'additivity derivative');
		});
	});
});
