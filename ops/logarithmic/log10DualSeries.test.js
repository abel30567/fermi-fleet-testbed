import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10DualSeries } from './log10DualSeries.js';

function assertClose(actual, expected, tol = 1e-12, message = '') {
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected}`
	);
}

describe('log10DualSeries', () => {
	describe('normal cases', () => {
		it('evaluates exact powers of 10 with unit derivative', () => {
			const cases = [
				[1, 0, Math.LOG10E],
				[10, 1, Math.LOG10E / 10],
				[100, 2, Math.LOG10E / 100],
				[1000, 3, Math.LOG10E / 1000],
				[0.1, -1, Math.LOG10E / 0.1],
				[0.001, -3, Math.LOG10E / 0.001],
			];

			for (const [v, expectedV, expectedD] of cases) {
				const res = log10DualSeries({ v, d: 1 });
				assertClose(res.v, expectedV, 1e-15, `v for ${v}`);
				assertClose(res.d, expectedD, 1e-15, `d for ${v}`);
			}
		});

		it('scales derivative linearly with input derivative d', () => {
			const v = 4.25;
			for (const d of [-7.5, -1, 0, 2.5, 13.7]) {
				const res = log10DualSeries({ v, d });
				assertClose(res.v, Math.log10(v), 1e-15);
				assertClose(res.d, (d * Math.LOG10E) / v, 1e-15);
			}
		});

		it('returns zero derivative when d is 0 or -0', () => {
			const resPos = log10DualSeries({ v: 10, d: 0 });
			assert.equal(resPos.v, 1);
			assert.equal(Object.is(resPos.d, 0), true);

			const resNeg = log10DualSeries({ v: 10, d: -0 });
			assert.equal(resNeg.v, 1);
			assert.equal(Object.is(resNeg.d, 0), true);
		});
	});

	describe('edge cases and numerical stability', () => {
		it('handles very large v and d without spurious overflow', () => {
			const resSameScale = log10DualSeries({ v: 1e308, d: 1e308 });
			assertClose(resSameScale.v, 308, 1e-14);
			assertClose(resSameScale.d, Math.LOG10E, 1e-14);

			const resLargeDSmallV = log10DualSeries({ v: 0.5, d: 1e308 });
			assertClose(resLargeDSmallV.v, Math.log10(0.5), 1e-14);
			assertClose(resLargeDSmallV.d, 2e308 * Math.LOG10E, 1e-14);
		});

		it('handles very small positive subnormal values without underflow when v and d match scale', () => {
			const res = log10DualSeries({ v: Number.MIN_VALUE, d: Number.MIN_VALUE });
			assertClose(res.v, Math.log10(Number.MIN_VALUE), 1e-14);
			assertClose(res.d, Math.LOG10E, 1e-14);
		});

		it('rejects invalid input types with TypeError', () => {
			for (const bad of [null, undefined, 10, '10', true, [10, 1], {}, { v: 10 }, { d: 1 }, { v: '10', d: 1 }, { v: 10, d: null }]) {
				assert.throws(() => log10DualSeries(bad), TypeError);
			}
		});

		it('rejects non-positive v and non-finite inputs with RangeError', () => {
			const outOfRange = [
				{ v: 0, d: 1 },
				{ v: -0, d: 1 },
				{ v: -1, d: 1 },
				{ v: -100, d: 0 },
				{ v: Number.NaN, d: 1 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 10, d: Number.POSITIVE_INFINITY },
				{ v: 10, d: Number.NEGATIVE_INFINITY },
			];

			for (const bad of outOfRange) {
				assert.throws(() => log10DualSeries(bad), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative across diverse inputs', () => {
			const points = [
				{ v: 0.05, d: 1.7 },
				{ v: 0.73, d: -2.4 },
				{ v: 1.0, d: 3.1 },
				{ v: Math.E, d: 1.0 },
				{ v: 7.89, d: -0.6 },
				{ v: 1234.5, d: 42.0 },
			];

			for (const { v, d } of points) {
				const h = 1e-6 * v;
				const fd = ((Math.log10(v + h) - Math.log10(v - h)) / (2 * h)) * d;
				const { d: dualD } = log10DualSeries({ v, d });
				assertClose(dualD, fd, 1e-8, `finite difference at v=${v}, d=${d}`);
			}
		});

		it('satisfies the dual product identity log10(a * b) = log10(a) + log10(b)', () => {
			const pairs = [
				[{ v: 2, d: 0.5 }, { v: 5, d: -1.2 }],
				[{ v: 0.3, d: 2.1 }, { v: 17.4, d: 0.8 }],
				[{ v: 100, d: -10 }, { v: 0.01, d: 0.003 }],
			];

			for (const [a, b] of pairs) {
				const prod = { v: a.v * b.v, d: a.d * b.v + a.v * b.d };
				const lhs = log10DualSeries(prod);
				const la = log10DualSeries(a);
				const lb = log10DualSeries(b);
				const rhs = { v: la.v + lb.v, d: la.d + lb.d };

				assertClose(lhs.v, rhs.v, 1e-14, 'product identity value');
				assertClose(lhs.d, rhs.d, 1e-14, 'product identity derivative');
			}
		});

		it('satisfies chain rule with exp10: log10(10^u) = u for dual u', () => {
			const dualInputs = [
				{ v: -3.2, d: 1.5 },
				{ v: 0, d: -2.7 },
				{ v: 2.45, d: 0.85 },
			];

			for (const u of dualInputs) {
				const exp10v = 10 ** u.v;
				const exp10u = { v: exp10v, d: exp10v * Math.LN10 * u.d };
				const recovered = log10DualSeries(exp10u);

				assertClose(recovered.v, u.v, 1e-14, 'inverse value');
				assertClose(recovered.d, u.d, 1e-14, 'inverse derivative');
			}
		});
	});
});
