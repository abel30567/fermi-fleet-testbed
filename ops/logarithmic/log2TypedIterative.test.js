import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log2TypedIterative } from './log2TypedIterative.js';

describe('log2TypedIterative', () => {
	describe('normal cases', () => {
		it('computes exact base-2 logarithms for powers of two', () => {
			const input = new Float64Array([
				0.125,
				0.25,
				0.5,
				1,
				2,
				4,
				8,
				16,
				1024,
				2 ** 53,
				2 ** -53,
			]);
			const result = log2TypedIterative(input);

			assert.ok(result instanceof Float64Array);
			assert.deepEqual(
				result,
				new Float64Array([-3, -2, -1, 0, 1, 2, 3, 4, 10, 53, -53]),
			);
		});

		it('computes accurate base-2 logarithms for non-power-of-two positive values', () => {
			const input = new Float64Array([3, 5, 10, Math.E, Math.PI, 100]);
			const result = log2TypedIterative(input);

			assert.equal(result.length, input.length);
			for (let i = 0; i < input.length; i++) {
				assert.ok(
					Math.abs(result[i] - Math.log2(input[i])) <= 1e-15,
					`mismatch at index ${i}`,
				);
			}
		});

		it('does not mutate the input Float64Array and returns a new instance', () => {
			const input = new Float64Array([1, 2, 4, 8]);
			const snapshot = new Float64Array(input);
			const result = log2TypedIterative(input);

			assert.notEqual(result, input);
			assert.deepEqual(input, snapshot);
		});

		it('handles subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([99, 1, 4, 16, 99]);
			const view = backing.subarray(1, 4);
			const result = log2TypedIterative(view);

			assert.ok(result instanceof Float64Array);
			assert.deepEqual(result, new Float64Array([0, 2, 4]));
		});
	});

	describe('edge cases', () => {
		it('returns an empty Float64Array for empty input', () => {
			const input = new Float64Array(0);
			const result = log2TypedIterative(input);

			assert.ok(result instanceof Float64Array);
			assert.equal(result.length, 0);
			assert.notEqual(result, input);
		});

		it('handles single-element Float64Array', () => {
			const result = log2TypedIterative(new Float64Array([32]));
			assert.deepEqual(result, new Float64Array([5]));
		});

		it('follows IEEE 754 semantics for 0, -0, Infinity, negatives, and NaN', () => {
			const input = new Float64Array([
				0,
				-0,
				Infinity,
				-1,
				-0.5,
				-Infinity,
				NaN,
			]);
			const result = log2TypedIterative(input);

			assert.equal(result[0], -Infinity);
			assert.equal(result[1], -Infinity);
			assert.equal(result[2], Infinity);
			assert.ok(Number.isNaN(result[3]));
			assert.ok(Number.isNaN(result[4]));
			assert.ok(Number.isNaN(result[5]));
			assert.ok(Number.isNaN(result[6]));
		});

		it('handles extreme and subnormal IEEE 754 float64 values', () => {
			const input = new Float64Array([
				Number.MIN_VALUE,
				Number.EPSILON,
				Number.MAX_VALUE,
			]);
			const result = log2TypedIterative(input);

			assert.equal(result[0], -1074);
			assert.equal(result[1], -52);
			assert.ok(Math.abs(result[2] - 1024) < 1e-12);
		});

		it('handles large Float64Array inputs', () => {
			const n = 10000;
			const input = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				input[i] = i + 1;
			}

			const result = log2TypedIterative(input);
			assert.equal(result.length, n);
			assert.equal(result[0], 0);
			assert.equal(result[1], 1);
			assert.equal(result[1023], 10);
			assert.equal(result[8191], 13);
		});
	});

	describe('input validation', () => {
		const invalidInputs = [
			['null', null],
			['undefined', undefined],
			['number', 42],
			['string', '123'],
			['boolean', true],
			['plain object', { 0: 1, length: 1 }],
			['plain Array', [1, 2, 4]],
			['Float32Array', new Float32Array([1, 2, 4])],
			['Int32Array', new Int32Array([1, 2, 4])],
			['Uint8Array', new Uint8Array([1, 2, 4])],
			['ArrayBuffer', new ArrayBuffer(16)],
		];

		for (const [label, value] of invalidInputs) {
			it(`throws TypeError for ${label}`, () => {
				assert.throws(() => log2TypedIterative(value), {
					name: 'TypeError',
				});
			});
		}
	});

	describe('independent cross-checks', () => {
		it('agrees with change-of-base formula ln(x) / ln(2) and log10(x) / log10(2)', () => {
			const input = new Float64Array([
				0.001, 0.1, 0.75, 1.5, 2.718281828, 7, 42, 123.456, 999999.5,
			]);
			const result = log2TypedIterative(input);

			for (let i = 0; i < input.length; i++) {
				const viaLn = Math.log(input[i]) / Math.LN2;
				const viaLog10 = Math.log10(input[i]) / Math.log10(2);

				assert.ok(
					Math.abs(result[i] - viaLn) <= 1e-13,
					`ln cross-check failed at index ${i}: got ${result[i]}, expected ~${viaLn}`,
				);
				assert.ok(
					Math.abs(result[i] - viaLog10) <= 1e-13,
					`log10 cross-check failed at index ${i}: got ${result[i]}, expected ~${viaLog10}`,
				);
			}
		});

		it('satisfies inverse exponentiation (2 ** log2(x) == x) and product/quotient laws', () => {
			const a = new Float64Array([0.3, 1.7, 5.5, 12.25, 250]);
			const b = new Float64Array([0.6, 3.1, 2.2, 8.75, 40]);
			const prod = new Float64Array(a.length);
			const quot = new Float64Array(a.length);

			for (let i = 0; i < a.length; i++) {
				prod[i] = a[i] * b[i];
				quot[i] = a[i] / b[i];
			}

			const logA = log2TypedIterative(a);
			const logB = log2TypedIterative(b);
			const logProd = log2TypedIterative(prod);
			const logQuot = log2TypedIterative(quot);

			for (let i = 0; i < a.length; i++) {
				const reconstructed = 2 ** logA[i];
				assert.ok(
					Math.abs(reconstructed - a[i]) <= Math.abs(a[i]) * 1e-13,
					`inverse check failed at index ${i}`,
				);
				assert.ok(
					Math.abs(logProd[i] - (logA[i] + logB[i])) <= 1e-13,
					`product law failed at index ${i}`,
				);
				assert.ok(
					Math.abs(logQuot[i] - (logA[i] - logB[i])) <= 1e-13,
					`quotient law failed at index ${i}`,
				);
			}
		});
	});
});
