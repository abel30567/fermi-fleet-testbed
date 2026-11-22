import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcsinFloatRecursive } from './arcsinFloatRecursive.js';

function assertClose(actual, expected, tolerance = 1e-14, message = '') {
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tolerance,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`
	);
}

describe('arcsinFloatRecursive', () => {
	describe('exact and standard values', () => {
		it('handles exact boundary and zero values including signed zero', () => {
			assert.ok(Object.is(arcsinFloatRecursive(0), 0));
			assert.ok(Object.is(arcsinFloatRecursive(-0), -0));
			assert.equal(arcsinFloatRecursive(1), Math.PI / 2);
			assert.equal(arcsinFloatRecursive(-1), -Math.PI / 2);
		});

		it('computes known trigonometric angles accurately', () => {
			const cases = [
				[0.5, Math.PI / 6],
				[-0.5, -Math.PI / 6],
				[Math.SQRT1_2, Math.PI / 4],
				[-Math.SQRT1_2, -Math.PI / 4],
				[Math.sqrt(3) / 2, Math.PI / 3],
				[-Math.sqrt(3) / 2, -Math.PI / 3],
			];
			for (const [input, expected] of cases) {
				assertClose(arcsinFloatRecursive(input), expected, 1e-15, `arcsin(${input})`);
			}
		});

		it('satisfies odd symmetry arcsin(-x) === -arcsin(x)', () => {
			const samples = [1e-12, 1e-6, 0.005, 0.1, 0.25, 0.499, 0.5, 0.501, 0.75, 0.99, 1 - 1e-12];
			for (const x of samples) {
				assert.equal(arcsinFloatRecursive(-x), -arcsinFloatRecursive(x));
			}
		});
	});

	describe('edge cases near 0 and +/-1', () => {
		it('handles very small and subnormal numbers without underflow errors', () => {
			const smalls = [1e-16, 1e-12, 1e-8, 1e-5, Number.MIN_VALUE, -Number.MIN_VALUE, -1e-12];
			for (const x of smalls) {
				assertClose(arcsinFloatRecursive(x), Math.asin(x), 1e-15, `small x=${x}`);
			}
			assert.equal(arcsinFloatRecursive(Number.MIN_VALUE), Number.MIN_VALUE);
			assert.equal(arcsinFloatRecursive(-Number.MIN_VALUE), -Number.MIN_VALUE);
		});

		it('maintains high precision near +1 and -1', () => {
			const nearOnes = [
				0.99,
				0.9999,
				0.999999,
				1 - 1e-9,
				1 - 1e-12,
				1 - 1e-15,
				1 - Number.EPSILON,
				1 - Number.EPSILON / 2,
			];
			for (const x of nearOnes) {
				assertClose(arcsinFloatRecursive(x), Math.asin(x), 1e-14, `near +1 x=${x}`);
				assertClose(arcsinFloatRecursive(-x), Math.asin(-x), 1e-14, `near -1 x=${-x}`);
			}
		});

		it('handles points around the 0.5 and 1/128 regime transitions smoothly', () => {
			const transitions = [
				1 / 128 - 1e-12,
				1 / 128,
				1 / 128 + 1e-12,
				0.5 - 1e-12,
				0.5,
				0.5 + 1e-12,
			];
			for (const x of transitions) {
				assertClose(arcsinFloatRecursive(x), Math.asin(x), 1e-15, `transition x=${x}`);
			}
		});
	});

	describe('NaN, out-of-domain, and input validation', () => {
		it('propagates NaN as NaN', () => {
			assert.ok(Number.isNaN(arcsinFloatRecursive(Number.NaN)));
		});

		it('throws RangeError for out-of-domain numeric inputs |x| > 1 and infinities', () => {
			const outOfDomain = [
				1 + Number.EPSILON,
				-1 - Number.EPSILON,
				1.000001,
				-1.000001,
				2,
				-2,
				1e100,
				-1e100,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
			];
			for (const x of outOfDomain) {
				assert.throws(() => arcsinFloatRecursive(x), RangeError, `expected RangeError for ${x}`);
			}
		});

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'0.5',
				'0',
				'',
				true,
				false,
				{},
				[],
				[0.5],
				0n,
				1n,
				Symbol('x'),
				() => 0,
			];
			for (const input of invalidInputs) {
				assert.throws(() => arcsinFloatRecursive(input), TypeError);
			}
			assert.throws(() => arcsinFloatRecursive(), TypeError);
		});
	});

	describe('independent cross-checks across [-1, 1]', () => {
		it('matches Math.asin and satisfies sin(arcsin(x)) ≈ x over a dense sweep', () => {
			const steps = 2000;
			let maxAsinErr = 0;
			let maxRoundTripErr = 0;

			for (let i = 0; i <= steps; i++) {
				const x = -1 + (2 * i) / steps;
				const y = arcsinFloatRecursive(x);
				const ref = Math.asin(x);

				const asinErr = Math.abs(y - ref);
				const roundTripErr = Math.abs(Math.sin(y) - x);

				if (asinErr > maxAsinErr) maxAsinErr = asinErr;
				if (roundTripErr > maxRoundTripErr) maxRoundTripErr = roundTripErr;

				assert.ok(y >= -Math.PI / 2 && y <= Math.PI / 2, `result out of range for x=${x}`);
			}

			assert.ok(maxAsinErr < 1e-14, `max |arcsinFloatRecursive(x) - Math.asin(x)| was ${maxAsinErr}`);
			assert.ok(maxRoundTripErr < 1e-14, `max |Math.sin(arcsinFloatRecursive(x)) - x| was ${maxRoundTripErr}`);
		});

		it('is strictly monotonically increasing on [-1, 1]', () => {
			let prev = -Infinity;
			for (let i = 0; i <= 500; i++) {
				const x = -1 + (2 * i) / 500;
				const y = arcsinFloatRecursive(x);
				assert.ok(y > prev, `monotonicity violated at x=${x}: ${y} <= ${prev}`);
				prev = y;
			}
		});
	});
});
