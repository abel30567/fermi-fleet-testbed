import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tanTypedRecursive } from './tanTypedRecursive.js';

const EPSILON = 1e-12;

function assertClose(actual, expected, tolerance = EPSILON, message) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`,
	);
}

describe('tanTypedRecursive', () => {
	describe('normal cases across lengths', () => {
		it('handles an empty Float64Array', () => {
			const input = new Float64Array(0);
			const result = tanTypedRecursive(input);

			assert.ok(result instanceof Float64Array);
			assert.equal(result.length, 0);
			assert.notEqual(result, input);
		});

		it('handles a single-element Float64Array', () => {
			const input = new Float64Array([Math.PI / 4]);
			const result = tanTypedRecursive(input);

			assert.ok(result instanceof Float64Array);
			assert.equal(result.length, 1);
			assertClose(result[0], 1);
		});

		it('handles even-length Float64Arrays', () => {
			const input = new Float64Array([0, Math.PI / 6, Math.PI / 4, Math.PI / 3]);
			const result = tanTypedRecursive(input);

			assert.equal(result.length, 4);
			assert.equal(result[0], 0);
			assertClose(result[1], 1 / Math.sqrt(3));
			assertClose(result[2], 1);
			assertClose(result[3], Math.sqrt(3));
		});

		it('handles odd-length Float64Arrays', () => {
			const input = new Float64Array([
				-Math.PI / 3,
				-Math.PI / 4,
				0,
				Math.PI / 4,
				Math.PI / 3,
			]);
			const result = tanTypedRecursive(input);

			assert.equal(result.length, 5);
			assertClose(result[0], -Math.sqrt(3));
			assertClose(result[1], -1);
			assert.equal(result[2], 0);
			assertClose(result[3], 1);
			assertClose(result[4], Math.sqrt(3));
		});

		it('handles larger Float64Arrays via divide-and-conquer recursion', () => {
			const length = 1025;
			const input = new Float64Array(length);
			for (let i = 0; i < length; i++) {
				// Stay safely away from odd multiples of pi/2
				input[i] = -1.2 + (2.4 * i) / (length - 1);
			}

			const result = tanTypedRecursive(input);

			assert.ok(result instanceof Float64Array);
			assert.equal(result.length, length);
			for (let i = 0; i < length; i++) {
				assert.equal(result[i], Math.tan(input[i]));
			}
		});
	});

	describe('edge cases and mathematical properties', () => {
		it('handles 0, -0, pi/4, -pi/4, and negative angles accurately', () => {
			const input = new Float64Array([
				0,
				-0,
				Math.PI / 4,
				-Math.PI / 4,
				-0.75,
				0.75,
				Math.PI,
				-Math.PI,
			]);
			const result = tanTypedRecursive(input);

			assert.ok(Object.is(result[0], 0));
			assert.ok(Object.is(result[1], -0));
			assertClose(result[2], 1);
			assertClose(result[3], -1);
			// Odd function symmetry: tan(-x) === -tan(x)
			assertClose(result[4], -result[5]);
			assertClose(result[6], 0);
			assertClose(result[7], 0);
		});

		it('matches Math.sin(x) / Math.cos(x) cross-check across sample angles', () => {
			const angles = new Float64Array([
				-1.4,
				-Math.PI / 3,
				-Math.PI / 4,
				-Math.PI / 6,
				-0.5,
				-0.1,
				0,
				0.1,
				0.5,
				Math.PI / 6,
				Math.PI / 4,
				Math.PI / 3,
				1.4,
				2.5,
				-2.5,
			]);

			const result = tanTypedRecursive(angles);

			for (let i = 0; i < angles.length; i++) {
				const expected = Math.sin(angles[i]) / Math.cos(angles[i]);
				assertClose(
					result[i],
					expected,
					EPSILON,
					`Mismatch at index ${i} for angle ${angles[i]}`,
				);
			}
		});

		it('does not mutate the input Float64Array', () => {
			const originalValues = [0.25, -0.5, 1.0, -1.25, 0];
			const input = new Float64Array(originalValues);
			const result = tanTypedRecursive(input);

			assert.notEqual(result, input);
			assert.deepEqual(Array.from(input), originalValues);

			result[0] = 999;
			assert.equal(input[0], 0.25);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				[],
				[0, 1, 2],
				new Float32Array([0, 1]),
				new Int32Array([0, 1]),
				new Uint8Array([0, 1]),
				42,
				'0',
				{},
			];

			for (const invalid of invalidInputs) {
				assert.throws(
					() => tanTypedRecursive(invalid),
					{ name: 'TypeError' },
					`Expected TypeError for input: ${String(invalid)}`,
				);
			}
		});

		it('throws RangeError for NaN and non-finite elements', () => {
			const invalidArrays = [
				new Float64Array([Number.NaN]),
				new Float64Array([Number.POSITIVE_INFINITY]),
				new Float64Array([Number.NEGATIVE_INFINITY]),
				new Float64Array([0, 0.5, Number.NaN, 1.0]),
				new Float64Array([0, Number.POSITIVE_INFINITY, 0.5]),
				new Float64Array([0.1, 0.2, 0.3, 0.4, Number.NEGATIVE_INFINITY]),
			];

			for (const invalid of invalidArrays) {
				assert.throws(
					() => tanTypedRecursive(invalid),
					{ name: 'RangeError' },
				);
			}
		});
	});
});
