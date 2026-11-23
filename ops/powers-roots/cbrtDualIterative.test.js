import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtDualIterative } from './cbrtDualIterative.js';

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected);
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= bound,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`,
	);
}

describe('cbrtDualIterative', () => {
	describe('normal cases', () => {
		it('computes exact/high-precision values and derivatives for positive perfect cubes', () => {
			const cases = [
				{ input: { v: 1, d: 1 }, expectedV: 1, expectedD: 1 / 3 },
				{ input: { v: 8, d: 1 }, expectedV: 2, expectedD: 1 / 12 },
				{ input: { v: 27, d: 3 }, expectedV: 3, expectedD: 1 / 9 },
				{ input: { v: 64, d: -4.5 }, expectedV: 4, expectedD: -4.5 / 48 },
				{ input: { v: 1000, d: 30 }, expectedV: 10, expectedD: 0.1 },
			];

			for (const { input, expectedV, expectedD } of cases) {
				const res = cbrtDualIterative(input);
				assertClose(res.v, expectedV, 1e-15, 1e-15, `v for ${input.v}`);
				assertClose(res.d, expectedD, 1e-14, 1e-15, `d for ${input.v}`);
			}
		});

		it('computes values and derivatives for negative inputs', () => {
			const cases = [
				{ input: { v: -1, d: 1 }, expectedV: -1, expectedD: 1 / 3 },
				{ input: { v: -8, d: 1 }, expectedV: -2, expectedD: 1 / 12 },
				{ input: { v: -27, d: -9 }, expectedV: -3, expectedD: -1 / 3 },
				{ input: { v: -0.125, d: 2 }, expectedV: -0.5, expectedD: 8 / 3 },
			];

			for (const { input, expectedV, expectedD } of cases) {
				const res = cbrtDualIterative(input);
				assertClose(res.v, expectedV, 1e-15, 1e-15, `v for ${input.v}`);
				assertClose(res.d, expectedD, 1e-14, 1e-15, `d for ${input.v}`);
			}
		});

		it('computes non-perfect cubes and matches Math.cbrt', () => {
			const values = [0.003, 0.25, 2, 5, Math.PI, 42.7, -2, -7.5, -123.456];
			for (const v of values) {
				const d = 1.75;
				const res = cbrtDualIterative({ v, d });
				const refV = Math.cbrt(v);
				const refD = d / (3 * refV * refV);
				assertClose(res.v, refV, 1e-15, 1e-15, `v for ${v}`);
				assertClose(res.d, refD, 1e-14, 1e-15, `d for ${v}`);
			}
		});

		it('does not mutate the input object', () => {
			const input = { v: 27, d: 5 };
			const res = cbrtDualIterative(input);
			assert.notEqual(res, input);
			assert.deepEqual(input, { v: 27, d: 5 });
		});
	});

	describe('edge cases', () => {
		it('handles v = 0 with zero, positive, and negative derivatives', () => {
			const r0 = cbrtDualIterative({ v: 0, d: 0 });
			assert.ok(Object.is(r0.v, 0));
			assert.ok(Object.is(r0.d, 0));

			const rNeg0 = cbrtDualIterative({ v: -0, d: -0 });
			assert.ok(Object.is(rNeg0.v, -0));
			assert.ok(Object.is(rNeg0.d, -0));

			const rPos = cbrtDualIterative({ v: 0, d: 2.5 });
			assert.equal(rPos.v, 0);
			assert.equal(rPos.d, Infinity);

			const rNeg = cbrtDualIterative({ v: 0, d: -2.5 });
			assert.equal(rNeg.v, 0);
			assert.equal(rNeg.d, -Infinity);
		});

		it('handles zero derivative for nonzero values', () => {
			const resPos = cbrtDualIterative({ v: 125, d: 0 });
			assertClose(resPos.v, 5);
			assert.equal(resPos.d, 0);

			const resNeg = cbrtDualIterative({ v: -64, d: 0 });
			assertClose(resNeg.v, -4);
			assert.equal(resNeg.d, 0);
		});

		it('handles very large, very small, and subnormal magnitudes without overflow/underflow', () => {
			const large = cbrtDualIterative({ v: 1e300, d: 3e200 });
			assertClose(large.v, 1e100, 1e-14);
			assertClose(large.d, 1, 1e-14);

			const largeNeg = cbrtDualIterative({ v: -1e300, d: -6e200 });
			assertClose(largeNeg.v, -1e100, 1e-14);
			assertClose(largeNeg.d, -2, 1e-14);

			const small = cbrtDualIterative({ v: 1e-300, d: 3e-200 });
			assertClose(small.v, 1e-100, 1e-14);
			assertClose(small.d, 1, 1e-14);

			const maxVal = cbrtDualIterative({ v: Number.MAX_VALUE, d: 1e205 });
			assertClose(maxVal.v, Math.cbrt(Number.MAX_VALUE), 1e-14);
			assert.ok(Number.isFinite(maxVal.d));

			const subnormal = cbrtDualIterative({ v: Number.MIN_VALUE, d: 1e-220 });
			const refSubV = Math.cbrt(Number.MIN_VALUE);
			assertClose(subnormal.v, refSubV, 1e-14);
			assertClose(subnormal.d, 1e-220 / (3 * refSubV * refSubV), 1e-14);
		});

		it('respects custom tolerance and maxIterations options', () => {
			const res = cbrtDualIterative({ v: 10, d: 2 }, { maxIterations: 32, tolerance: 1e-12 });
			assertClose(res.v, Math.cbrt(10), 1e-11);
			assertClose(res.d, 2 / (3 * Math.cbrt(10) ** 2), 1e-11);

			const singleStep = cbrtDualIterative({ v: 8, d: 1 }, { maxIterations: 1, tolerance: 0 });
			assert.ok(Number.isFinite(singleStep.v));
			assert.ok(Number.isFinite(singleStep.d));
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives across positive and negative points', () => {
			const samples = [
				{ v: 0.5, d: 1.2 },
				{ v: 3.7, d: -2.4 },
				{ v: 19.25, d: 0.8 },
				{ v: -0.75, d: 1.5 },
				{ v: -11.3, d: -3.1 },
				{ v: 150, d: 4.2 },
			];

			for (const { v, d } of samples) {
				const h = 1e-6 * Math.max(1, Math.abs(v) / Math.max(1, Math.abs(d)));
				const fd = (Math.cbrt(v + d * h) - Math.cbrt(v - d * h)) / (2 * h);
				const res = cbrtDualIterative({ v, d });
				assertClose(res.d, fd, 1e-7, 1e-9, `finite-diff for v=${v}, d=${d}`);
			}
		});

		it('satisfies the dual-number cube identity (y)^3 = x', () => {
			const samples = [
				{ v: 2, d: 3 },
				{ v: -17.5, d: 4.25 },
				{ v: 0.013, d: -0.7 },
				{ v: 98765.4321, d: 12.34 },
			];

			for (const x of samples) {
				const y = cbrtDualIterative(x);
				// Dual cube: (yv + yd*ε)^3 = yv^3 + (3 * yv^2 * yd)*ε
				const cubeV = y.v * y.v * y.v;
				const cubeD = 3 * y.v * y.v * y.d;
				assertClose(cubeV, x.v, 1e-14, 1e-15, `cube primal for ${x.v}`);
				assertClose(cubeD, x.d, 1e-14, 1e-15, `cube derivative for ${x.v}`);
			}
		});

		it('satisfies chain rule under composition cbrt(cbrt(t)) = t^(1/9) and cbrt(t^2 + 3t + 1)', () => {
			for (const t of [0.5, 2, 7.5, -3]) {
				const composed = cbrtDualIterative(cbrtDualIterative({ v: t, d: 1 }));
				const sign = t < 0 ? -1 : 1;
				const expectedV = sign * Math.abs(t) ** (1 / 9);
				const expectedD = (1 / 9) * Math.abs(t) ** (-8 / 9);
				assertClose(composed.v, expectedV, 1e-14, 1e-15, `t^(1/9) v at ${t}`);
				assertClose(composed.d, expectedD, 1e-13, 1e-15, `t^(1/9) d at ${t}`);
			}

			// f(t) = cbrt(t^2 + 3t + 1) at t = 2 -> inner = { v: 11, d: 7 }
			const t = 2;
			const inner = { v: t * t + 3 * t + 1, d: 2 * t + 3 };
			const res = cbrtDualIterative(inner);
			const h = 1e-6;
			const f = (u) => Math.cbrt(u * u + 3 * u + 1);
			const fd = (f(t + h) - f(t - h)) / (2 * h);
			assertClose(res.v, f(t), 1e-15);
			assertClose(res.d, fd, 1e-8);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed x', () => {
			for (const bad of [undefined, null, 8, '8', true, [8, 1], () => {}]) {
				assert.throws(() => cbrtDualIterative(bad), TypeError);
			}
			for (const bad of [{}, { v: 8 }, { d: 1 }, { v: '8', d: 1 }, { v: 8, d: null }, { v: 8n, d: 1n }]) {
				assert.throws(() => cbrtDualIterative(bad), TypeError);
			}
		});

		it('throws RangeError for non-finite v or d', () => {
			for (const bad of [
				{ v: NaN, d: 1 },
				{ v: 8, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 8, d: Infinity },
				{ v: 8, d: -Infinity },
			]) {
				assert.throws(() => cbrtDualIterative(bad), RangeError);
			}
		});

		it('throws TypeError or RangeError for invalid options', () => {
			for (const badOpts of [null, 5, 'opts', []]) {
				assert.throws(() => cbrtDualIterative({ v: 8, d: 1 }, badOpts), TypeError);
			}
			assert.throws(() => cbrtDualIterative({ v: 8, d: 1 }, { maxIterations: '10' }), TypeError);
			assert.throws(() => cbrtDualIterative({ v: 8, d: 1 }, { tolerance: '1e-12' }), TypeError);

			for (const badMax of [0, -5, 1.5, NaN, Infinity]) {
				assert.throws(() => cbrtDualIterative({ v: 8, d: 1 }, { maxIterations: badMax }), RangeError);
			}
			for (const badTol of [-1e-12, NaN, Infinity, -Infinity]) {
				assert.throws(() => cbrtDualIterative({ v: 8, d: 1 }, { tolerance: badTol }), RangeError);
			}
		});
	});
});
