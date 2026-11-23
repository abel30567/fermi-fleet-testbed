import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sinTypedIterative } from './sinTypedIterative.js';

/**
 * Independent Maclaurin series approximation of sin(x) for |x| <= 1:
 *   sin(x) = sum_{k=0}^{n} (-1)^k * x^(2k+1) / (2k+1)!
 */
function sinTaylor(x, terms = 10) {
	let sum = 0;
	let term = x;
	const negX2 = -(x * x);
	for (let k = 0; k < terms; k += 1) {
		sum += term;
		term = (term * negX2) / ((2 * k + 2) * (2 * k + 3));
	}
	return sum;
}

describe('sinTypedIterative', () => {
	it('computes sine for standard trigonometric angles', () => {
		const input = new Float64Array([
			0,
			Math.PI / 6,
			Math.PI / 4,
			Math.PI / 3,
			Math.PI / 2,
			Math.PI,
			(3 * Math.PI) / 2,
			2 * Math.PI,
		]);
		const expected = [
			0,
			0.5,
			Math.SQRT1_2,
			Math.sqrt(3) / 2,
			1,
			0,
			-1,
			0,
		];

		const output = sinTypedIterative(input);

		assert.ok(output instanceof Float64Array);
		assert.notStrictEqual(output, input);
		assert.strictEqual(output.length, input.length);
		for (let i = 0; i < expected.length; i += 1) {
			assert.ok(
				Math.abs(output[i] - expected[i]) < 1e-15,
				`index ${i}: expected ~${expected[i]}, got ${output[i]}`,
			);
		}
	});

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([0.25, -0.75, 1.5, 3.0]);
		const snapshot = new Float64Array(input);

		const output = sinTypedIterative(input);

		assert.deepStrictEqual(input, snapshot);
		assert.notStrictEqual(output, input);
	});

	it('handles empty Float64Array', () => {
		const input = new Float64Array(0);
		const output = sinTypedIterative(input);

		assert.ok(output instanceof Float64Array);
		assert.strictEqual(output.length, 0);
		assert.notStrictEqual(output, input);
	});

	it('handles special IEEE-754 values (+0, -0, NaN, +Infinity, -Infinity)', () => {
		const input = new Float64Array([0, -0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
		const output = sinTypedIterative(input);

		assert.ok(Object.is(output[0], 0));
		assert.ok(Object.is(output[1], -0));
		assert.ok(Number.isNaN(output[2]));
		assert.ok(Number.isNaN(output[3]));
		assert.ok(Number.isNaN(output[4]));
	});

	it('handles subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([99, 0, Math.PI / 2, -Math.PI / 2, 99]);
		const view = backing.subarray(1, 4);

		const output = sinTypedIterative(view);

		assert.strictEqual(output.length, 3);
		assert.strictEqual(output[0], 0);
		assert.ok(Math.abs(output[1] - 1) < 1e-15);
		assert.ok(Math.abs(output[2] - -1) < 1e-15);
	});

	it('handles large inputs iteratively without stack overflow', () => {
		const n = 20_000;
		const input = new Float64Array(n);
		for (let i = 0; i < n; i += 1) {
			input[i] = (i - n / 2) * 0.001;
		}

		const output = sinTypedIterative(input);

		assert.strictEqual(output.length, n);
		assert.ok(Math.abs(output[0] - Math.sin(input[0])) < 1e-15);
		assert.ok(Math.abs(output[n - 1] - Math.sin(input[n - 1])) < 1e-15);
	});

	it('rejects non-Float64Array inputs with TypeError', () => {
		const invalidInputs = [
			undefined,
			null,
			42,
			'0',
			[0, 1, 2],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			{ length: 1, 0: 0 },
		];

		for (const bad of invalidInputs) {
			assert.throws(() => sinTypedIterative(bad), { name: 'TypeError' });
		}
	});

	it('matches independent Maclaurin series expansion for angles in [-1, 1]', () => {
		const angles = new Float64Array([-1.0, -0.75, -0.5, -0.25, -0.1, 0.1, 0.25, 0.5, 0.75, 1.0]);
		const output = sinTypedIterative(angles);

		for (let i = 0; i < angles.length; i += 1) {
			const expected = sinTaylor(angles[i]);
			assert.ok(
				Math.abs(output[i] - expected) < 1e-15,
				`angle ${angles[i]}: iterative=${output[i]}, taylor=${expected}`,
			);
		}
	});

	it('satisfies odd symmetry sin(-x) = -sin(x) and Pythagorean identity sin^2(x) + cos^2(x) = 1', () => {
		const xs = new Float64Array([0.1, 0.7, 1.3, 2.5, 4.2, 10.7]);
		const negXs = new Float64Array(xs.length);
		for (let i = 0; i < xs.length; i += 1) {
			negXs[i] = -xs[i];
		}

		const sinPos = sinTypedIterative(xs);
		const sinNeg = sinTypedIterative(negXs);

		for (let i = 0; i < xs.length; i += 1) {
			assert.strictEqual(sinNeg[i], -sinPos[i]);
			const cosVal = Math.cos(xs[i]);
			assert.ok(
				Math.abs(sinPos[i] * sinPos[i] + cosVal * cosVal - 1) < 1e-14,
				`Pythagorean identity failed at x=${xs[i]}`,
			);
		}
	});
});
