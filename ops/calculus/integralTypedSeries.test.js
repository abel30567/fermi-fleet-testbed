import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { integralTypedSeries } from './integralTypedSeries.js';

function sample(fn, a, b, intervals) {
	const step = (b - a) / intervals;
	const arr = new Float64Array(intervals + 1);
	for (let i = 0; i <= intervals; i++) {
		arr[i] = fn(a + i * step);
	}
	return { arr, step };
}

describe('integralTypedSeries', () => {
	describe('exactness on polynomials (normal cases)', () => {
		it('integrates constant functions exactly for even and odd interval counts', () => {
			for (const intervals of [1, 2, 3, 4, 5, 10, 11]) {
				const { arr, step } = sample(() => 3.5, 0, 4, intervals);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - 14) < 1e-12,
					`intervals=${intervals}: expected 14, got ${result}`
				);
			}
		});

		it('integrates linear functions exactly for all interval counts >= 1', () => {
			// Integral of (2x + 1) on [1, 5] = [x^2 + x]_1^5 = 30 - 2 = 28
			for (const intervals of [1, 2, 3, 4, 5, 9, 10]) {
				const { arr, step } = sample((x) => 2 * x + 1, 1, 5, intervals);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - 28) < 1e-12,
					`intervals=${intervals}: expected 28, got ${result}`
				);
			}
		});

		it('integrates quadratic functions exactly for even and odd intervals >= 2', () => {
			// Integral of (3x^2 - 2x + 4) on [0, 3] = [x^3 - x^2 + 4x]_0^3 = 30
			for (const intervals of [2, 3, 4, 5, 6, 7, 12, 13]) {
				const { arr, step } = sample(
					(x) => 3 * x * x - 2 * x + 4,
					0,
					3,
					intervals
				);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - 30) < 1e-11,
					`intervals=${intervals}: expected 30, got ${result}`
				);
			}
		});

		it('integrates cubic functions exactly under Simpson 1/3, 3/8, and combined rules', () => {
			// Integral of (4x^3 - 3x^2 + 2x - 1) on [-1, 2]
			// Antiderivative: x^4 - x^3 + x^2 - x
			// F(2) = 16 - 8 + 4 - 2 = 10; F(-1) = 1 + 1 + 1 + 1 = 4; diff = 6
			for (const intervals of [2, 3, 4, 5, 6, 7, 10, 11]) {
				const { arr, step } = sample(
					(x) => 4 * x ** 3 - 3 * x ** 2 + 2 * x - 1,
					-1,
					2,
					intervals
				);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - 6) < 1e-11,
					`intervals=${intervals}: expected 6, got ${result}`
				);
			}
		});

		it('uses default step = 1 when omitted', () => {
			// f(x) = x^3 for x = 0, 1, 2, 3, 4, 5 -> integral on [0, 5] = 625/4 = 156.25
			const arr = new Float64Array([0, 1, 8, 27, 64, 125]);
			assert.ok(Math.abs(integralTypedSeries(arr) - 156.25) < 1e-12);
		});
	});

	describe('edge cases and input validation', () => {
		it('returns 0 for empty and single-element Float64Array', () => {
			assert.strictEqual(integralTypedSeries(new Float64Array(0)), 0);
			assert.strictEqual(integralTypedSeries(new Float64Array(0), 0.5), 0);
			assert.strictEqual(integralTypedSeries(new Float64Array([42])), 0);
			assert.strictEqual(integralTypedSeries(new Float64Array([-7.5]), 2), 0);
		});

		it('applies trapezoidal rule for length-2 Float64Array', () => {
			const arr = new Float64Array([2, 6]);
			assert.strictEqual(integralTypedSeries(arr, 0.5), 2);
			assert.strictEqual(integralTypedSeries(arr), 4);
		});

		it('handles negative values and exact signed cancellation', () => {
			// Constant negative function
			const neg = new Float64Array([-2, -2, -2, -2, -2]);
			assert.strictEqual(integralTypedSeries(neg, 0.5), -4);

			// Odd function x^3 on symmetric interval [-2, 2] integrates to 0
			for (const intervals of [2, 3, 6, 7]) {
				const { arr, step } = sample((x) => x ** 3, -2, 2, intervals);
				const result = integralTypedSeries(arr, step);
				assert.ok(Math.abs(result) < 1e-12);
			}
		});

		it('rejects non-Float64Array inputs with TypeError', () => {
			for (const bad of [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				null,
				undefined,
				'123',
				{ length: 3, 0: 1, 1: 2, 2: 3 },
			]) {
				assert.throws(() => integralTypedSeries(bad), TypeError);
			}
		});

		it('rejects non-numeric, non-positive, or non-finite step values', () => {
			const valid = new Float64Array([1, 2, 3]);
			for (const badType of ['1', null, true, {}, []]) {
				assert.throws(() => integralTypedSeries(valid, badType), TypeError);
			}
			for (const badRange of [0, -0, -1, -1e-9, NaN, Infinity, -Infinity]) {
				assert.throws(() => integralTypedSeries(valid, badRange), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches analytic integral of sin(x) on [0, pi] (= 2)', () => {
			for (const intervals of [100, 101]) {
				const { arr, step } = sample(Math.sin, 0, Math.PI, intervals);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - 2) < 1e-7,
					`intervals=${intervals}: expected ~2, got ${result}`
				);
			}
		});

		it('matches analytic integral of exp(x) on [0, 1] (= e - 1)', () => {
			const expected = Math.E - 1;
			for (const intervals of [64, 65]) {
				const { arr, step } = sample(Math.exp, 0, 1, intervals);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - expected) < 1e-8,
					`intervals=${intervals}: expected ~${expected}, got ${result}`
				);
			}
		});

		it('satisfies Fundamental Theorem of Calculus on smooth composite function', () => {
			// F(x) = sin(x) + 0.5 * x^2 + exp(0.5 * x)
			// f(x) = F'(x) = cos(x) + x + 0.5 * exp(0.5 * x)
			const F = (x) => Math.sin(x) + 0.5 * x * x + Math.exp(0.5 * x);
			const f = (x) => Math.cos(x) + x + 0.5 * Math.exp(0.5 * x);
			const a = 0.25;
			const b = 2.75;
			const expected = F(b) - F(a);

			for (const intervals of [100, 101]) {
				const { arr, step } = sample(f, a, b, intervals);
				const result = integralTypedSeries(arr, step);
				assert.ok(
					Math.abs(result - expected) < 1e-7,
					`intervals=${intervals}: expected ${expected}, got ${result}`
				);
			}
		});

		it('satisfies linearity and interval additivity', () => {
			const alpha = 2.7;
			const beta = -1.3;
			const f = (x) => Math.cos(x);
			const g = (x) => x * x + 1;
			const { arr: fArr, step } = sample(f, 0, 2, 41);
			const { arr: gArr } = sample(g, 0, 2, 41);
			const combo = new Float64Array(fArr.length);
			for (let i = 0; i < fArr.length; i++) {
				combo[i] = alpha * fArr[i] + beta * gArr[i];
			}

			const lhs = integralTypedSeries(combo, step);
			const rhs =
				alpha * integralTypedSeries(fArr, step) +
				beta * integralTypedSeries(gArr, step);
			assert.ok(Math.abs(lhs - rhs) < 1e-12);

			// Additivity: [0, 1] + [1, 2] == [0, 2]
			const { arr: left, step: s1 } = sample(Math.exp, 0, 1, 50);
			const { arr: right, step: s2 } = sample(Math.exp, 1, 2, 51);
			const { arr: whole, step: s3 } = sample(Math.exp, 0, 2, 100);
			const sumParts =
				integralTypedSeries(left, s1) + integralTypedSeries(right, s2);
			assert.ok(Math.abs(sumParts - integralTypedSeries(whole, s3)) < 1e-7);
		});

		it('exhibits O(h^4) convergence rate on quartic polynomial x^4', () => {
			// Integral of x^4 on [0, 1] = 0.2
			const exact = 0.2;
			const { arr: coarse, step: h1 } = sample((x) => x ** 4, 0, 1, 10);
			const { arr: fine, step: h2 } = sample((x) => x ** 4, 0, 1, 20);
			const errCoarse = Math.abs(integralTypedSeries(coarse, h1) - exact);
			const errFine = Math.abs(integralTypedSeries(fine, h2) - exact);
			const ratio = errCoarse / errFine;
			assert.ok(
				ratio > 15.5 && ratio < 16.5,
				`expected ~16x error reduction for O(h^4), got ${ratio}`
			);
		});
	});
});
