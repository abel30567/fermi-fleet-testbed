import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cosTypedIterative } from './cosTypedIterative.js';

/**
 * Independent cosine approximation via range reduction to [-pi, pi]
 * followed by a Maclaurin (Taylor) series expansion.
 *
 * @param {number} x - Angle in radians.
 * @returns {number} Approximate cos(x).
 */
function taylorCos(x) {
	const TWO_PI = 2 * Math.PI;
	let r = x % TWO_PI;
	if (r > Math.PI) r -= TWO_PI;
	if (r < -Math.PI) r += TWO_PI;

	const r2 = r * r;
	let term = 1;
	let sum = 1;
	for (let k = 1; k <= 16; k += 1) {
		term *= -r2 / ((2 * k - 1) * (2 * k));
		sum += term;
	}
	return sum;
}

describe('cosTypedIterative', () => {
	it('computes exact/expected cosine values for standard angles', () => {
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
			1,
			Math.sqrt(3) / 2,
			Math.SQRT1_2,
			0.5,
			0,
			-1,
			0,
			1,
		];

		const output = cosTypedIterative(input);
		assert.ok(output instanceof Float64Array);
		assert.equal(output.length, input.length);
		assert.notEqual(output, input);

		for (let i = 0; i < expected.length; i += 1) {
			assert.ok(
				Math.abs(output[i] - expected[i]) < 1e-15,
				`index ${i}: expected ${expected[i]}, got ${output[i]}`,
			);
		}
	});

	it('does not mutate the input Float64Array', () => {
		const original = [0.25, -1.5, 3.14, 7.2];
		const input = new Float64Array(original);
		const output = cosTypedIterative(input);

		assert.deepEqual(Array.from(input), original);
		assert.notEqual(output.buffer, input.buffer);
	});

	it('handles empty Float64Array', () => {
		const input = new Float64Array(0);
		const output = cosTypedIterative(input);

		assert.ok(output instanceof Float64Array);
		assert.equal(output.length, 0);
		assert.notEqual(output, input);
	});

	it('handles special IEEE-754 values and extreme magnitudes', () => {
		const input = new Float64Array([
			-0,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			1e-12,
			Number.MIN_VALUE,
			1e6,
			-1e6,
		]);
		const output = cosTypedIterative(input);

		assert.equal(output[0], 1);
		assert.ok(Number.isNaN(output[1]));
		assert.ok(Number.isNaN(output[2]));
		assert.ok(Number.isNaN(output[3]));
		assert.equal(output[4], 1);
		assert.equal(output[5], 1);
		assert.equal(output[6], Math.cos(1e6));
		assert.equal(output[7], Math.cos(-1e6));
	});

	it('handles Float64Array subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([10, 0, Math.PI, Math.PI / 3, 20]);
		const view = backing.subarray(1, 4);
		assert.ok(view.byteOffset > 0);

		const output = cosTypedIterative(view);
		assert.equal(output.length, 3);
		assert.equal(output[0], 1);
		assert.equal(output[1], -1);
		assert.ok(Math.abs(output[2] - 0.5) < 1e-15);
	});

	it('handles large arrays accurately', () => {
		const n = 2048;
		const input = new Float64Array(n);
		for (let i = 0; i < n; i += 1) {
			input[i] = (i - n / 2) * 0.01;
		}

		const output = cosTypedIterative(input);
		assert.equal(output.length, n);
		for (let i = 0; i < n; i += 1) {
			assert.equal(output[i], Math.cos(input[i]));
		}
	});

	it('throws TypeError for invalid non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[0, 1, 2],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			0,
			'0',
			{ length: 1, 0: 0 },
		];

		for (const bad of invalidInputs) {
			assert.throws(() => cosTypedIterative(bad), {
				name: 'TypeError',
			});
		}
	});

	it('cross-checks against independent Taylor series and trigonometric identities', () => {
		const angles = new Float64Array([
			-5.7, -3.1, -2.0, -1.2345, -0.5, 0, 0.37, 1.1, 2.45, 4.8, 9.2,
		]);
		const negated = new Float64Array(angles.length);
		const doubled = new Float64Array(angles.length);
		const shifted = new Float64Array(angles.length);
		for (let i = 0; i < angles.length; i += 1) {
			negated[i] = -angles[i];
			doubled[i] = 2 * angles[i];
			shifted[i] = angles[i] + 2 * Math.PI;
		}

		const cosVals = cosTypedIterative(angles);
		const cosNeg = cosTypedIterative(negated);
		const cosDouble = cosTypedIterative(doubled);
		const cosShifted = cosTypedIterative(shifted);

		for (let i = 0; i < angles.length; i += 1) {
			const x = angles[i];
			const c = cosVals[i];

			// 1. Independent Taylor series cross-check
			const ref = taylorCos(x);
			assert.ok(
				Math.abs(c - ref) < 1e-14,
				`Taylor cross-check failed at x=${x}: got ${c}, ref ${ref}`,
			);

			// 2. Even symmetry: cos(-x) === cos(x)
			assert.equal(cosNeg[i], c);

			// 3. Pythagorean identity: cos^2(x) + sin^2(x) === 1
			const s = Math.sin(x);
			assert.ok(Math.abs(c * c + s * s - 1) < 1e-14);

			// 4. Double-angle identity: cos(2x) === 2*cos^2(x) - 1
			assert.ok(Math.abs(cosDouble[i] - (2 * c * c - 1)) < 1e-14);

			// 5. 2*pi periodicity: cos(x + 2*pi) === cos(x)
			assert.ok(Math.abs(cosShifted[i] - c) < 1e-14);
		}
	});
});
