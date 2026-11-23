import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { divideDualSeries } from './divideDualSeries.js';

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	);
}

describe('divideDualSeries', () => {
	it('divides standard dual numbers correctly', () => {
		// (6 + 5ε) / (2 + 1ε) = 3 + (5*2 - 6*1)/4 ε = 3 + 1ε
		const res = divideDualSeries({ v: 6, d: 5 }, { v: 2, d: 1 });
		assert.deepStrictEqual(res, { v: 3, d: 1 });

		// (-7 + 3ε) / (4 - 2ε) = -1.75 + (3*4 - (-7)*(-2))/16 ε = -1.75 + (12 - 14)/16 ε = -1.75 - 0.125ε
		const res2 = divideDualSeries({ v: -7, d: 3 }, { v: 4, d: -2 });
		assertClose(res2.v, -1.75);
		assertClose(res2.d, -0.125);
	});

	it('handles constant divisor (b.d === 0) and constant dividend (a.d === 0)', () => {
		const resConstDiv = divideDualSeries({ v: 10, d: -4 }, { v: 2, d: 0 });
		assert.deepStrictEqual(resConstDiv, { v: 5, d: -2 });

		// (1 + 0ε) / (4 + 3ε) = 0.25 - (3 / 16)ε = 0.25 - 0.1875ε
		const resRecip = divideDualSeries({ v: 1, d: 0 }, { v: 4, d: 3 });
		assertClose(resRecip.v, 0.25);
		assertClose(resRecip.d, -0.1875);
	});

	it('returns { v: 1, d: 0 } when dividing a dual number by itself', () => {
		for (const x of [
			{ v: 3.5, d: -2.25 },
			{ v: -12, d: 7 },
			{ v: 1e-6, d: 1e6 },
		]) {
			const res = divideDualSeries(x, x);
			assertClose(res.v, 1, 1e-15);
			assertClose(res.d, 0, 1e-15);
		}
	});

	it('normalizes -0 to 0 in value and derivative', () => {
		const res = divideDualSeries({ v: 0, d: 0 }, { v: -5, d: 3 });
		assert.ok(Object.is(res.v, 0), `expected +0, got ${res.v}`);
		assert.ok(Object.is(res.d, 0), `expected +0, got ${res.d}`);

		const res2 = divideDualSeries({ v: 0, d: 3 }, { v: -2, d: 5 });
		assert.ok(Object.is(res2.v, 0), `expected +0, got ${res2.v}`);
		assert.strictEqual(res2.d, -1.5);
	});

	it('avoids intermediate b.v² overflow and underflow for extreme scales', () => {
		// Naive (a.d * b.v - a.v * b.d) / (b.v * b.v) overflows b.v² to Infinity here
		const large = divideDualSeries({ v: 6e200, d: 5e200 }, { v: 2e200, d: 1e200 });
		assert.ok(Number.isFinite(large.v) && Number.isFinite(large.d));
		assertClose(large.v, 3, 1e-12);
		assertClose(large.d, 1, 1e-12);

		// Naive b.v² underflows to 0 here, producing NaN/Infinity
		const small = divideDualSeries({ v: 6e-200, d: 5e-200 }, { v: 2e-200, d: 1e-200 });
		assert.ok(Number.isFinite(small.v) && Number.isFinite(small.d));
		assertClose(small.v, 3, 1e-12);
		assertClose(small.d, 1, 1e-12);
	});

	it('does not mutate input dual numbers', () => {
		const a = Object.freeze({ v: 8, d: 3 });
		const b = Object.freeze({ v: 2, d: -1 });
		const res = divideDualSeries(a, b);
		assert.notStrictEqual(res, a);
		assert.notStrictEqual(res, b);
		assert.deepStrictEqual(res, { v: 4, d: 3.5 });
	});

	it('validates inputs and throws appropriate errors', () => {
		// Division by zero
		assert.throws(() => divideDualSeries({ v: 1, d: 1 }, { v: 0, d: 2 }), RangeError);
		assert.throws(() => divideDualSeries({ v: 0, d: 0 }, { v: -0, d: 0 }), RangeError);

		// Invalid object shapes
		for (const bad of [null, undefined, 42, '1', [], true]) {
			assert.throws(() => divideDualSeries(bad, { v: 1, d: 0 }), TypeError);
			assert.throws(() => divideDualSeries({ v: 1, d: 0 }, bad), TypeError);
		}

		// Missing or non-numeric components
		assert.throws(() => divideDualSeries({ v: 1 }, { v: 1, d: 0 }), TypeError);
		assert.throws(() => divideDualSeries({ v: '1', d: 0 }, { v: 1, d: 0 }), TypeError);
		assert.throws(() => divideDualSeries({ v: 1, d: 0 }, { v: 1, d: null }), TypeError);

		// Non-finite components
		for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			assert.throws(() => divideDualSeries({ v: nonFinite, d: 0 }, { v: 1, d: 0 }), RangeError);
			assert.throws(() => divideDualSeries({ v: 1, d: nonFinite }, { v: 1, d: 0 }), RangeError);
			assert.throws(() => divideDualSeries({ v: 1, d: 0 }, { v: nonFinite, d: 0 }), RangeError);
			assert.throws(() => divideDualSeries({ v: 1, d: 0 }, { v: 1, d: nonFinite }), RangeError);
		}
	});

	it('satisfies algebraic multiplication inverse identity (a / b) * b === a', () => {
		const multiplyDual = (x, y) => ({
			v: x.v * y.v,
			d: x.v * y.d + x.d * y.v,
		});

		const pairs = [
			[{ v: 3.14, d: -2.71 }, { v: 1.41, d: 0.57 }],
			[{ v: -9.5, d: 4.25 }, { v: -3.2, d: -1.8 }],
			[{ v: 0, d: 7.5 }, { v: 2.5, d: -4.1 }],
			[{ v: 123.456, d: 0 }, { v: 0.0125, d: 9.8 }],
		];

		for (const [a, b] of pairs) {
			const q = divideDualSeries(a, b);
			const reconstructed = multiplyDual(q, b);
			assertClose(reconstructed.v, a.v, 1e-12, 'inverse value');
			assertClose(reconstructed.d, a.d, 1e-12, 'inverse derivative');
		}
	});

	it('matches central finite-difference derivatives for smooth quotient functions', () => {
		// h(x) = f(x) / g(x) with f(x) = x^3 - 2x + 5, g(x) = x^2 + 1
		const f = (x) => x ** 3 - 2 * x + 5;
		const df = (x) => 3 * x ** 2 - 2;
		const g = (x) => x ** 2 + 1;
		const dg = (x) => 2 * x;

		// Also test transcendental quotient: p(x) = sin(x), q(x) = exp(0.5x) + 2
		const p = (x) => Math.sin(x);
		const dp = (x) => Math.cos(x);
		const q = (x) => Math.exp(0.5 * x) + 2;
		const dq = (x) => 0.5 * Math.exp(0.5 * x);

		const h = 1e-6;
		for (const x of [-3.2, -0.7, 0, 1.3, 4.5]) {
			const dual1 = divideDualSeries({ v: f(x), d: df(x) }, { v: g(x), d: dg(x) });
			const fd1 = (f(x + h) / g(x + h) - f(x - h) / g(x - h)) / (2 * h);
			assertClose(dual1.v, f(x) / g(x), 1e-12, `poly value at x=${x}`);
			assertClose(dual1.d, fd1, 1e-7, `poly derivative at x=${x}`);

			const dual2 = divideDualSeries({ v: p(x), d: dp(x) }, { v: q(x), d: dq(x) });
			const fd2 = (p(x + h) / q(x + h) - p(x - h) / q(x - h)) / (2 * h);
			assertClose(dual2.v, p(x) / q(x), 1e-12, `transcendental value at x=${x}`);
			assertClose(dual2.d, fd2, 1e-7, `transcendental derivative at x=${x}`);
		}
	});
});
