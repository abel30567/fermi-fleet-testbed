import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnTypedIterative } from './lnTypedIterative.js';

/**
 * Independent natural logarithm via the atanh series for positive x near 1:
 * ln(x) = 2 * sum_{k=0}^{terms-1} (u^(2k+1)) / (2k+1), where u = (x - 1) / (x + 1).
 *
 * @param {number} x
 * @param {number} [terms=60]
 * @returns {number}
 */
function lnAtanhSeries(x, terms = 60) {
	const u = (x - 1) / (x + 1);
	const u2 = u * u;
	let power = u;
	let sum = 0;
	for (let k = 0; k < terms; k++) {
		sum += power / (2 * k + 1);
		power *= u2;
	}
	return 2 * sum;
}

describe('lnTypedIterative', () => {
	describe('normal cases', () => {
		it('computes natural logarithms for known analytic values', () => {
			const input = new Float64Array([1, Math.E, Math.E ** 2, 1 / Math.E, 2, 10]);
			const output = lnTypedIterative(input);

			assert.ok(output instanceof Float64Array);
			assert.equal(output.length, input.length);
			assert.equal(output[0], 0);
			assert.ok(Math.abs(output[1] - 1) <= 1e-15);
			assert.ok(Math.abs(output[2] - 2) <= 1e-15);
			assert.ok(Math.abs(output[3] - -1) <= 1e-15);
			assert.ok(Math.abs(output[4] - Math.LN2) <= 1e-15);
			assert.ok(Math.abs(output[5] - Math.LN10) <= 1e-15);
		});

		it('does not mutate the input Float64Array and returns a distinct instance', () => {
			const input = new Float64Array([0.5, 1, 2.5, 100]);
			const snapshot = new Float64Array(input);
			const output = lnTypedIterative(input);

			assert.notEqual(output, input);
			assert.deepEqual(input, snapshot);
		});

		it('handles Float64Array subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([999, 1, Math.E, Math.E ** 3, -5]);
			const view = backing.subarray(1, 4);
			const output = lnTypedIterative(view);

			assert.equal(output.length, 3);
			assert.equal(output[0], 0);
			assert.ok(Math.abs(output[1] - 1) <= 1e-15);
			assert.ok(Math.abs(output[2] - 3) <= 1e-14);
		});
	});

	describe('edge cases', () => {
		it('returns an empty Float64Array for an empty input', () => {
			const output = lnTypedIterative(new Float64Array(0));
			assert.ok(output instanceof Float64Array);
			assert.equal(output.length, 0);
		});

		it('handles zeros, negative numbers, infinities, and NaN per IEEE 754', () => {
			const input = new Float64Array([0, -0, -1, -1e10, Infinity, -Infinity, NaN]);
			const output = lnTypedIterative(input);

			assert.equal(output[0], -Infinity);
			assert.equal(output[1], -Infinity);
			assert.ok(Number.isNaN(output[2]));
			assert.ok(Number.isNaN(output[3]));
			assert.equal(output[4], Infinity);
			assert.ok(Number.isNaN(output[5]));
			assert.ok(Number.isNaN(output[6]));
		});

		it('handles extreme positive finite IEEE 754 values', () => {
			const minNormal = 2.2250738585072014e-308;
			const input = new Float64Array([Number.MIN_VALUE, minNormal, Number.MAX_VALUE]);
			const output = lnTypedIterative(input);

			assert.ok(Number.isFinite(output[0]) && output[0] < -740);
			assert.ok(Number.isFinite(output[1]) && output[1] < -708);
			assert.ok(Number.isFinite(output[2]) && output[2] > 709);
			assert.ok(Math.abs(output[0] - -1074 * Math.LN2) <= 1e-12);
			assert.ok(Math.abs(output[1] - -1022 * Math.LN2) <= 1e-12);
		});

		it('handles large Float64Array inputs accurately', () => {
			const n = 10000;
			const input = new Float64Array(n);
			for (let i = 0; i < n; i++) {
				input[i] = i + 1;
			}
			const output = lnTypedIterative(input);

			assert.equal(output.length, n);
			assert.equal(output[0], 0);
			assert.ok(Math.abs(output[n - 1] - Math.log(n)) <= 1e-15);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'123',
				[1, 2, 3],
				{ 0: 1, length: 1 },
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				new ArrayBuffer(16),
			];

			for (const invalid of invalidInputs) {
				assert.throws(() => lnTypedIterative(invalid), {
					name: 'TypeError',
				});
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent atanh power series expansion', () => {
			const input = new Float64Array([0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5]);
			const output = lnTypedIterative(input);

			for (let i = 0; i < input.length; i++) {
				const expected = lnAtanhSeries(input[i]);
				assert.ok(
					Math.abs(output[i] - expected) <= 1e-14,
					`index ${i}: expected ${expected}, got ${output[i]}`,
				);
			}
		});

		it('satisfies exponential inverse and logarithmic product/change-of-base identities', () => {
			const a = new Float64Array([0.125, 1.5, 3.7, 42.25, 1234.5]);
			const b = new Float64Array([8.0, 2.5, 0.3, 19.75, 0.008]);
			const ab = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) {
				ab[i] = a[i] * b[i];
			}

			const lnA = lnTypedIterative(a);
			const lnB = lnTypedIterative(b);
			const lnAB = lnTypedIterative(ab);

			for (let i = 0; i < a.length; i++) {
				// Inverse identity: exp(ln(x)) === x
				const relErrExp = Math.abs(Math.exp(lnA[i]) - a[i]) / a[i];
				assert.ok(relErrExp <= 1e-14, `exp(ln(${a[i]})) relErr=${relErrExp}`);

				// Product identity: ln(a * b) === ln(a) + ln(b)
				assert.ok(
					Math.abs(lnAB[i] - (lnA[i] + lnB[i])) <= 1e-13,
					`product identity failed at index ${i}`,
				);

				// Change-of-base cross-check via log2 and log10
				assert.ok(Math.abs(lnA[i] - Math.log2(a[i]) * Math.LN2) <= 1e-13);
				assert.ok(Math.abs(lnA[i] - Math.log10(a[i]) * Math.LN10) <= 1e-13);
			}
		});
	});
});
