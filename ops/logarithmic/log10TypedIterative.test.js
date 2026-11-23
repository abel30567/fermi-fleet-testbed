import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log10TypedIterative } from './log10TypedIterative.js';

describe('log10TypedIterative', () => {
	describe('normal cases', () => {
		it('computes exact base-10 logarithms for integer powers of 10', () => {
			const input = new Float64Array([1, 10, 100, 1000, 1e6, 1e15]);
			const output = log10TypedIterative(input);

			assert.ok(output instanceof Float64Array);
			assert.equal(output.length, input.length);
			assert.deepEqual(Array.from(output), [0, 1, 2, 3, 6, 15]);
		});

		it('computes base-10 logarithms for fractional powers of 10 and positive reals', () => {
			const input = new Float64Array([0.1, 0.01, 1e-6, 2, 5, Math.E, Math.PI, 42.5]);
			const output = log10TypedIterative(input);
			const expected = [
				-1,
				-2,
				-6,
				0.3010299956639812,
				0.6989700043360189,
				Math.LOG10E,
				Math.log10(Math.PI),
				Math.log10(42.5),
			];

			assert.equal(output.length, expected.length);
			for (let i = 0; i < expected.length; i++) {
				assert.ok(
					Math.abs(output[i] - expected[i]) <= 1e-15,
					`index ${i}: got ${output[i]}, expected ${expected[i]}`
				);
			}
		});

		it('returns a new Float64Array and does not mutate the input', () => {
			const input = new Float64Array([1, 10, 100]);
			const snapshot = Array.from(input);
			const output = log10TypedIterative(input);

			assert.notEqual(output, input);
			assert.notEqual(output.buffer, input.buffer);
			assert.deepEqual(Array.from(input), snapshot);
		});

		it('handles subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([999, 1, 10, 1000, 888]);
			const view = backing.subarray(1, 4);
			const output = log10TypedIterative(view);

			assert.ok(output instanceof Float64Array);
			assert.deepEqual(Array.from(output), [0, 1, 3]);
		});
	});

	describe('edge cases', () => {
		it('handles an empty Float64Array', () => {
			const input = new Float64Array(0);
			const output = log10TypedIterative(input);

			assert.ok(output instanceof Float64Array);
			assert.equal(output.length, 0);
		});

		it('handles a single-element Float64Array', () => {
			const output = log10TypedIterative(new Float64Array([10000]));
			assert.deepEqual(Array.from(output), [4]);
		});

		it('handles zero, negative values, infinities, and NaN per IEEE 754', () => {
			const input = new Float64Array([0, -0, -1, -100, Infinity, -Infinity, NaN]);
			const output = log10TypedIterative(input);

			assert.equal(output[0], -Infinity);
			assert.equal(output[1], -Infinity);
			assert.ok(Number.isNaN(output[2]));
			assert.ok(Number.isNaN(output[3]));
			assert.equal(output[4], Infinity);
			assert.ok(Number.isNaN(output[5]));
			assert.ok(Number.isNaN(output[6]));
		});

		it('handles extreme positive IEEE 754 values (MAX_VALUE, MIN_VALUE, EPSILON)', () => {
			const input = new Float64Array([Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON]);
			const output = log10TypedIterative(input);

			assert.ok(Math.abs(output[0] - 308.25471555991675) <= 1e-12);
			assert.ok(Math.abs(output[1] - -323.3062153431158) <= 1e-12);
			assert.ok(Math.abs(output[2] - Math.log(Number.EPSILON) / Math.LN10) <= 1e-12);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				[1, 10, 100],
				new Float32Array([1, 10]),
				new Int32Array([1, 10]),
				new Uint8Array([1, 10]),
				10,
				'10',
				{ length: 2, 0: 1, 1: 10 },
			];

			for (const bad of invalidInputs) {
				assert.throws(
					() => log10TypedIterative(bad),
					{ name: 'TypeError' },
					`expected TypeError for ${String(bad)}`
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches change-of-base identity ln(x) / ln(10) across a sweep of values', () => {
			const count = 256;
			const input = new Float64Array(count);
			for (let i = 0; i < count; i++) {
				// Positive values spanning ~1e-10 to ~1e10
				input[i] = Math.exp((i - 128) * 0.18);
			}

			const output = log10TypedIterative(input);
			for (let i = 0; i < count; i++) {
				const reference = Math.log(input[i]) / Math.LN10;
				assert.ok(
					Math.abs(output[i] - reference) <= 1e-12,
					`mismatch at index ${i}: ${output[i]} vs ${reference}`
				);
			}
		});

		it('satisfies inverse exponential identity 10 ** log10(x) === x within relative tolerance', () => {
			const input = new Float64Array([0.00073, 0.5, 1.23456789, 7.5, 9876.54321, 1.23e20]);
			const output = log10TypedIterative(input);

			for (let i = 0; i < input.length; i++) {
				const reconstructed = 10 ** output[i];
				const relError = Math.abs(reconstructed - input[i]) / input[i];
				assert.ok(
					relError <= 1e-12,
					`inverse check failed at index ${i}: relError=${relError}`
				);
			}
		});

		it('satisfies logarithmic product law log10(a * b) === log10(a) + log10(b)', () => {
			const a = new Float64Array([2, 3.5, 0.25, 17, 1e-4, 42.125]);
			const b = new Float64Array([5, 7.2, 8, 0.125, 1e6, 3.14159]);
			const prod = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) {
				prod[i] = a[i] * b[i];
			}

			const logA = log10TypedIterative(a);
			const logB = log10TypedIterative(b);
			const logProd = log10TypedIterative(prod);

			for (let i = 0; i < a.length; i++) {
				assert.ok(
					Math.abs(logProd[i] - (logA[i] + logB[i])) <= 1e-12,
					`product law failed at index ${i}`
				);
			}
		});
	});
});
