import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialTypedIterative } from './factorialTypedIterative.js';

/**
 * Independent BigInt reference implementation of factorial.
 * @param {number} n
 * @returns {bigint}
 */
function bigIntFactorial(n) {
	let acc = 1n;
	for (let k = 2n; k <= BigInt(n); k++) {
		acc *= k;
	}
	return acc;
}

describe('factorialTypedIterative', () => {
	describe('normal cases', () => {
		it('computes factorials for standard values (0!, 1!, 5!, 10!, 20!)', () => {
			const input = new Float64Array([0, 1, 2, 3, 4, 5, 10, 20]);
			const output = factorialTypedIterative(input);

			assert.ok(output instanceof Float64Array);
			assert.notEqual(output, input);
			assert.deepEqual(
				output,
				new Float64Array([1, 1, 2, 6, 24, 120, 3628800, 2432902008176640000]),
			);
		});

		it('does not mutate the input Float64Array', () => {
			const input = new Float64Array([5, 0, 3, 5, 1]);
			const snapshot = new Float64Array(input);
			const output = factorialTypedIterative(input);

			assert.deepEqual(input, snapshot);
			assert.deepEqual(output, new Float64Array([120, 1, 6, 120, 1]));
		});

		it('handles Float64Array subarrays with non-zero byteOffset', () => {
			const backing = new Float64Array([999, 3, 6, 4, -5]);
			const view = backing.subarray(1, 4);
			const output = factorialTypedIterative(view);

			assert.deepEqual(output, new Float64Array([6, 720, 24]));
		});
	});

	describe('edge cases and IEEE-754 overflow', () => {
		it('returns an empty Float64Array for empty input', () => {
			const output = factorialTypedIterative(new Float64Array(0));
			assert.ok(output instanceof Float64Array);
			assert.equal(output.length, 0);
		});

		it('treats -0 as 0 and returns 1', () => {
			const output = factorialTypedIterative(new Float64Array([-0]));
			assert.equal(output[0], 1);
		});

		it('keeps 170! finite and overflows >170 cleanly to Infinity without hanging', () => {
			const input = new Float64Array([170, 171, 172, 1000, 1e9]);
			const output = factorialTypedIterative(input);

			assert.equal(Number.isFinite(output[0]), true);
			assert.ok(Math.abs(output[0] - 7.257415615307999e306) / 7.257415615307999e306 < 1e-14);
			assert.equal(output[1], Infinity);
			assert.equal(output[2], Infinity);
			assert.equal(output[3], Infinity);
			assert.equal(output[4], Infinity);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				5,
				'5',
				[0, 1, 2],
				new Int32Array([0, 1, 2]),
				new Float32Array([0, 1, 2]),
				new Uint32Array([0, 1, 2]),
				{ length: 2, 0: 1, 1: 2 },
			];

			for (const bad of invalidInputs) {
				assert.throws(() => factorialTypedIterative(bad), TypeError);
			}
		});

		it('throws RangeError for negative values', () => {
			assert.throws(() => factorialTypedIterative(new Float64Array([-1])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([0, 3, -5])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([-0.5])), RangeError);
		});

		it('throws RangeError for non-integer finite values', () => {
			assert.throws(() => factorialTypedIterative(new Float64Array([0.5])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([2, 3.14, 4])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([Number.EPSILON])), RangeError);
		});

		it('throws RangeError for NaN and +/-Infinity', () => {
			assert.throws(() => factorialTypedIterative(new Float64Array([NaN])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([Infinity])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([-Infinity])), RangeError);
			assert.throws(() => factorialTypedIterative(new Float64Array([1, 2, NaN])), RangeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches BigInt factorial reference for all n in 0..170', () => {
			const nValues = new Float64Array(171);
			for (let n = 0; n <= 170; n++) {
				nValues[n] = n;
			}
			const actual = factorialTypedIterative(nValues);

			for (let n = 0; n <= 170; n++) {
				const expected = Number(bigIntFactorial(n));
				if (n <= 22) {
					assert.equal(actual[n], expected, `exact mismatch at n=${n}`);
				} else {
					const relErr = Math.abs(actual[n] - expected) / expected;
					assert.ok(relErr < 1e-13, `relative error ${relErr} too large at n=${n}`);
				}
			}
		});

		it('satisfies the factorial recurrence n! = n * (n - 1)! for 1..170', () => {
			const nValues = new Float64Array(171);
			for (let n = 0; n <= 170; n++) {
				nValues[n] = n;
			}
			const facts = factorialTypedIterative(nValues);

			for (let n = 1; n <= 170; n++) {
				assert.equal(facts[n], n * facts[n - 1], `recurrence failed at n=${n}`);
			}
		});

		it('reproduces Pascal triangle binomial coefficients C(n, k) = n! / (k!(n-k)!)', () => {
			const maxN = 15;
			const inputs = new Float64Array(maxN + 1);
			for (let i = 0; i <= maxN; i++) {
				inputs[i] = i;
			}
			const facts = factorialTypedIterative(inputs);

			// Build Pascal's triangle independently via addition only.
			const pascal = [];
			for (let n = 0; n <= maxN; n++) {
				const row = new Array(n + 1).fill(1);
				for (let k = 1; k < n; k++) {
					row[k] = pascal[n - 1][k - 1] + pascal[n - 1][k];
				}
				pascal.push(row);
			}

			for (let n = 0; n <= maxN; n++) {
				for (let k = 0; k <= n; k++) {
					const viaFactorial = facts[n] / (facts[k] * facts[n - k]);
					assert.equal(viaFactorial, pascal[n][k], `C(${n}, ${k}) mismatch`);
				}
			}
		});
	});
});
