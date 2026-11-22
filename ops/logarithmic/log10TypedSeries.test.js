import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10TypedSeries } from './log10TypedSeries.js';

/**
 * Helper to assert two finite numbers are within a tight relative/absolute tolerance.
 */
function assertClose(actual, expected, tol = 1e-14, message = '') {
	assert.equal(typeof actual, 'number', message);
	assert.ok(Number.isFinite(actual), `Expected finite actual, got ${actual} ${message}`);
	const scale = expected === 0 ? 1 : Math.abs(expected);
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol * scale,
		`${message}: expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	);
}

describe('log10TypedSeries', () => {
	it('returns a new Float64Array without mutating the input', () => {
		const input = new Float64Array([1, 10, 100, 1000]);
		const snapshot = new Float64Array(input);
		const result = log10TypedSeries(input);

		assert.ok(result instanceof Float64Array);
		assert.notEqual(result, input);
		assert.equal(result.length, input.length);
		assert.deepEqual(input, snapshot);
	});

	it('handles empty Float64Array', () => {
		const result = log10TypedSeries(new Float64Array(0));
		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, 0);
	});

	it('computes exact/high-precision results for 1 and powers of 10', () => {
		const exponents = [-300, -100, -12, -6, -3, -2, -1, 0, 1, 2, 3, 6, 12, 100, 300, 308];
		const input = new Float64Array(exponents.map((e) => Number(`1e${e}`)));
		const result = log10TypedSeries(input);

		assert.ok(Object.is(result[exponents.indexOf(0)], 0), 'log10(1) should be +0');

		for (let i = 0; i < exponents.length; i++) {
			assertClose(result[i], exponents[i], 1e-14, `1e${exponents[i]}`);
		}
	});

	it('handles IEEE-754 special values (0, -0, negative, NaN, Infinity)', () => {
		const input = new Float64Array([0, -0, -1, -1e-300, -Infinity, Number.NaN, Infinity]);
		const result = log10TypedSeries(input);

		assert.equal(result[0], -Infinity);
		assert.equal(result[1], -Infinity);
		assert.ok(Number.isNaN(result[2]));
		assert.ok(Number.isNaN(result[3]));
		assert.ok(Number.isNaN(result[4]));
		assert.ok(Number.isNaN(result[5]));
		assert.equal(result[6], Infinity);
	});

	it('handles subnormals, very small, very large, and near-1 values', () => {
		const values = [
			Number.MIN_VALUE, // 5e-324 (smallest positive subnormal)
			1e-320, // subnormal
			2.225073858507201e-308, // largest subnormal
			2.2250738585072014e-308, // smallest normal
			1 - 1e-15,
			1 - 1e-8,
			1 + 1e-15,
			1 + 1e-8,
			Math.SQRT1_2,
			Math.SQRT2,
			Math.E,
			Math.PI,
			1e150,
			Number.MAX_VALUE,
		];
		const input = new Float64Array(values);
		const result = log10TypedSeries(input);

		for (let i = 0; i < values.length; i++) {
			assertClose(result[i], Math.log10(values[i]), 1e-14, `x=${values[i]}`);
		}
	});

	it('cross-checks against Math.log10 and the inverse identity 10**y ≈ x', () => {
		const values = [];
		// Deterministic log-spaced grid spanning 10^-250 to 10^250 plus dense values around [0.1, 10]
		for (let exp = -250; exp <= 250; exp += 5) {
			values.push(1.23456789 * 10 ** exp);
			values.push(7.65432109 * 10 ** exp);
		}
		for (let i = 1; i <= 200; i++) {
			values.push(i * 0.05);
		}

		const input = new Float64Array(values);
		const result = log10TypedSeries(input);

		for (let i = 0; i < values.length; i++) {
			const x = values[i];
			const y = result[i];
			const ref = Math.log10(x);
			assertClose(y, ref, 1e-14, `Math.log10 cross-check for x=${x}`);

			// Inverse identity check: 10**y ≈ x
			const reconstructed = 10 ** y;
			assertClose(reconstructed, x, 1e-12, `10**y ≈ x for x=${x}`);
		}
	});

	it('satisfies the product logarithm identity log10(a * b) ≈ log10(a) + log10(b)', () => {
		const a = new Float64Array([0.37, 2.5, 13.7, 999.1, 1e-40, 4.2e50]);
		const b = new Float64Array([8.1, 0.04, 17.3, 0.0012, 3.5e60, 2.1e-30]);
		const ab = new Float64Array(a.length);
		for (let i = 0; i < a.length; i++) {
			ab[i] = a[i] * b[i];
		}

		const logA = log10TypedSeries(a);
		const logB = log10TypedSeries(b);
		const logAB = log10TypedSeries(ab);

		for (let i = 0; i < a.length; i++) {
			assertClose(logAB[i], logA[i] + logB[i], 1e-14, `product identity at index ${i}`);
		}
	});

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			'123',
			true,
			{},
			[1, 10, 100],
			new Float32Array([1, 10]),
			new Int32Array([1, 10]),
			new Uint8Array([1, 10]),
			new ArrayBuffer(16),
		];

		for (const bad of invalidInputs) {
			assert.throws(() => log10TypedSeries(bad), TypeError);
		}
	});
});
