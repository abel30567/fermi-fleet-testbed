import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { factorialTypedMemo } from './factorialTypedMemo.js';

/**
 * Independent reference implementation using BigInt multiplication.
 * @param {number} n
 * @returns {number}
 */
function referenceBigIntFactorial(n) {
	let acc = 1n;
	for (let k = 2n; k <= BigInt(n); k++) {
		acc *= k;
	}
	return Number(acc);
}

/**
 * Independent log-sum approximation: exp(sum_{k=2}^n ln(k)).
 * @param {number} n
 * @returns {number}
 */
function referenceLogSumFactorial(n) {
	let logSum = 0;
	for (let k = 2; k <= n; k++) {
		logSum += Math.log(k);
	}
	return Math.exp(logSum);
}

describe('factorialTypedMemo', () => {
	it('computes small factorials accurately', () => {
		const input = new Float64Array([0, 1, 2, 3, 4, 5, 6, 7, 10]);
		const result = factorialTypedMemo(input);

		assert.ok(result instanceof Float64Array);
		assert.notEqual(result, input);
		assert.deepEqual(
			Array.from(result),
			[1, 1, 2, 6, 24, 120, 720, 5040, 3628800],
		);
	});

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([3, 5, 0, 8]);
		const snapshot = Float64Array.from(input);
		factorialTypedMemo(input);
		assert.deepEqual(Array.from(input), Array.from(snapshot));
	});

	it('handles empty Float64Array', () => {
		const result = factorialTypedMemo(new Float64Array(0));
		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, 0);
	});

	it('handles -0 as 0 (0! = 1) and duplicate/descending memo lookups', () => {
		const input = new Float64Array([-0, 12, 5, 12, 0, 1, 5]);
		const result = factorialTypedMemo(input);
		assert.deepEqual(
			Array.from(result),
			[1, 479001600, 120, 479001600, 1, 1, 120],
		);
	});

	it('handles Float64Array subarrays with non-zero byteOffset', () => {
		const backing = new Float64Array([-99, 4, 6, 0, 999.5]);
		const view = backing.subarray(1, 4);
		const result = factorialTypedMemo(view);
		assert.deepEqual(Array.from(result), [24, 720, 1]);
	});

	it('handles boundary at 170! (finite) and 171!+ (Infinity)', () => {
		const input = new Float64Array([169, 170, 171, 200, 1e6]);
		const result = factorialTypedMemo(input);

		assert.ok(Number.isFinite(result[0]));
		assert.ok(Number.isFinite(result[1]));
		assert.equal(result[1], referenceBigIntFactorial(170));
		assert.equal(result[2], Infinity);
		assert.equal(result[3], Infinity);
		assert.equal(result[4], Infinity);
	});

	it('cross-checks all finite values 0..170 against independent BigInt reference', () => {
		const input = new Float64Array(171);
		for (let i = 0; i <= 170; i++) {
			input[i] = i;
		}
		const result = factorialTypedMemo(input);

		for (let i = 0; i <= 170; i++) {
			const expected = referenceBigIntFactorial(i);
			assert.equal(
				result[i],
				expected,
				`Mismatch at n=${i}: got ${result[i]}, expected ${expected}`,
			);
		}
	});

	it('cross-checks against independent log-sum exponential formula', () => {
		const samples = new Float64Array([0, 1, 5, 15, 30, 60, 100, 150, 170]);
		const result = factorialTypedMemo(samples);

		for (let i = 0; i < samples.length; i++) {
			const approx = referenceLogSumFactorial(samples[i]);
			const relErr = Math.abs(result[i] - approx) / result[i];
			assert.ok(
				relErr < 1e-12,
				`Relative error too large at n=${samples[i]}: ${relErr}`,
			);
		}
	});

	it('produces identical results across repeated calls (memoization consistency)', () => {
		const input = new Float64Array([20, 0, 170, 42, 171, 18]);
		const first = factorialTypedMemo(input);
		const second = factorialTypedMemo(input);
		assert.deepEqual(Array.from(first), Array.from(second));
	});

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			5,
			'5',
			[1, 2, 3],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			new Uint32Array([1, 2]),
			{},
		];
		for (const bad of invalidInputs) {
			assert.throws(() => factorialTypedMemo(bad), TypeError);
		}
	});

	it('throws RangeError for negative, fractional, NaN, or infinite elements', () => {
		const badArrays = [
			new Float64Array([-1]),
			new Float64Array([0, 1, -5]),
			new Float64Array([0.5]),
			new Float64Array([3.14159]),
			new Float64Array([NaN]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
			new Float64Array([2, 3, 4.0001]),
		];
		for (const arr of badArrays) {
			assert.throws(() => factorialTypedMemo(arr), RangeError);
		}
	});
});
