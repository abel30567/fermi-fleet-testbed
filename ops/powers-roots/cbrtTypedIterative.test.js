import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtTypedIterative } from './cbrtTypedIterative.js';

describe('cbrtTypedIterative', () => {
	it('computes cube roots for positive perfect cubes and decimals', () => {
		const input = new Float64Array([1, 8, 27, 64, 125, 1000, 0.125]);
		const result = cbrtTypedIterative(input);

		assert.ok(result instanceof Float64Array);
		assert.notEqual(result, input);
		assert.deepEqual(result, new Float64Array([1, 2, 3, 4, 5, 10, 0.5]));
	});

	it('computes cube roots for negative numbers', () => {
		const input = new Float64Array([-1, -8, -27, -64, -0.001]);
		const result = cbrtTypedIterative(input);

		assert.equal(result[0], -1);
		assert.equal(result[1], -2);
		assert.equal(result[2], -3);
		assert.equal(result[3], -4);
		assert.ok(Math.abs(result[4] - -0.1) < 1e-15);
	});

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([8, -27, 64]);
		const snapshot = new Float64Array(input);
		const result = cbrtTypedIterative(input);

		assert.deepEqual(input, snapshot);
		assert.deepEqual(result, new Float64Array([2, -3, 4]));
	});

	it('handles empty Float64Array and subarray views', () => {
		const empty = cbrtTypedIterative(new Float64Array(0));
		assert.ok(empty instanceof Float64Array);
		assert.equal(empty.length, 0);

		const backing = new Float64Array([999, 8, -27, 64, 999]);
		const view = backing.subarray(1, 4);
		const result = cbrtTypedIterative(view);
		assert.deepEqual(result, new Float64Array([2, -3, 4]));
	});

	it('preserves IEEE-754 edge cases (+0, -0, NaN, ±Infinity, extreme magnitudes)', () => {
		const input = new Float64Array([
			0,
			-0,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
		]);
		const result = cbrtTypedIterative(input);

		assert.ok(Object.is(result[0], 0));
		assert.ok(Object.is(result[1], -0));
		assert.ok(Number.isNaN(result[2]));
		assert.equal(result[3], Infinity);
		assert.equal(result[4], -Infinity);

		assert.ok(Number.isFinite(result[5]) && result[5] > 0);
		assert.equal(result[6], -result[5]);
		assert.ok(Number.isFinite(result[7]) && result[7] > 0);
		assert.equal(result[8], -result[7]);
	});

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			'8',
			{},
			[1, 8, 27],
			new Float32Array([1, 8, 27]),
			new Int32Array([1, 8, 27]),
			new ArrayBuffer(16),
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => cbrtTypedIterative(bad),
				{ name: 'TypeError' },
				`Expected TypeError for input: ${String(bad)}`
			);
		}
	});

	it('matches independent inverse-cube and log-exp cross-checks', () => {
		const values = new Float64Array([
			-1e12,
			-12345.6789,
			-2,
			-0.000729,
			0.000729,
			2,
			Math.PI,
			42.5,
			12345.6789,
			1e12,
		]);
		const roots = cbrtTypedIterative(values);

		for (let i = 0; i < values.length; i += 1) {
			const x = values[i];
			const r = roots[i];

			// Cross-check 1: cubing the result reconstructs x within relative tolerance
			const cubed = r * r * r;
			const relErrCube = Math.abs(cubed - x) / Math.abs(x);
			assert.ok(
				relErrCube < 1e-14,
				`Cube reconstruction failed for ${x}: got ${cubed} (relErr=${relErrCube})`
			);

			// Cross-check 2: independent sign(x) * exp(ln(|x|) / 3) formula
			const logExpRoot = Math.sign(x) * Math.exp(Math.log(Math.abs(x)) / 3);
			const relErrLogExp = Math.abs(r - logExpRoot) / Math.abs(logExpRoot);
			assert.ok(
				relErrLogExp < 1e-14,
				`Log-exp cross-check failed for ${x}: got ${r} vs ${logExpRoot}`
			);
		}
	});
});
