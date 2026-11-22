import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arctanTypedIterative } from './arctanTypedIterative.js';

/**
 * Helper asserting approximate equality within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tolerance=1e-12]
 */
function assertClose(actual, expected, tolerance = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`Expected ${actual} to be within ${tolerance} of ${expected} (diff=${Math.abs(actual - expected)})`
	);
}

/**
 * Independent Maclaurin series evaluation of arctan(x) for |x| < 1:
 * arctan(x) = sum_{k=0}^{terms-1} (-1)^k * x^(2k+1) / (2k+1).
 *
 * @param {number} x
 * @param {number} [terms=80]
 * @returns {number}
 */
function arctanMaclaurin(x, terms = 80) {
	let sum = 0;
	let power = x;
	const xSquared = x * x;

	for (let k = 0; k < terms; k += 1) {
		const term = power / (2 * k + 1);
		sum += k % 2 === 0 ? term : -term;
		power *= xSquared;
	}

	return sum;
}

describe('arctanTypedIterative', () => {
	describe('normal cases', () => {
		it('evaluates exact special trigonometric angles accurately', () => {
			const input = new Float64Array([
				0,
				1,
				-1,
				Math.sqrt(3),
				-Math.sqrt(3),
				1 / Math.sqrt(3),
				-1 / Math.sqrt(3),
			]);
			const expected = [
				0,
				Math.PI / 4,
				-Math.PI / 4,
				Math.PI / 3,
				-Math.PI / 3,
				Math.PI / 6,
				-Math.PI / 6,
			];

			const actual = arctanTypedIterative(input);

			assert.ok(actual instanceof Float64Array);
			assert.equal(actual.length, input.length);
			for (let i = 0; i < expected.length; i += 1) {
				assertClose(actual[i], expected[i], 1e-15);
			}
		});

		it('returns a new Float64Array without mutating the input', () => {
			const input = new Float64Array([-10, -0.5, 0.25, 2, 100]);
			const snapshot = new Float64Array(input);

			const result = arctanTypedIterative(input);

			assert.notEqual(result, input);
			assert.deepEqual(input, snapshot);
			assert.equal(result.length, input.length);
		});
	});

	describe('edge cases', () => {
		it('handles an empty Float64Array', () => {
			const input = new Float64Array(0);
			const result = arctanTypedIterative(input);

			assert.ok(result instanceof Float64Array);
			assert.notEqual(result, input);
			assert.equal(result.length, 0);
		});

		it('preserves signed zero (+0 and -0)', () => {
			const input = new Float64Array([0, -0]);
			const result = arctanTypedIterative(input);

			assert.ok(Object.is(result[0], 0));
			assert.ok(Object.is(result[1], -0));
		});

		it('handles +Infinity, -Infinity, and NaN according to IEEE-754', () => {
			const input = new Float64Array([Infinity, -Infinity, NaN, 1]);
			const result = arctanTypedIterative(input);

			assertClose(result[0], Math.PI / 2, 1e-15);
			assertClose(result[1], -Math.PI / 2, 1e-15);
			assert.ok(Number.isNaN(result[2]));
			assertClose(result[3], Math.PI / 4, 1e-15);
		});

		it('handles extreme magnitudes and subnormal numbers', () => {
			const input = new Float64Array([
				1e308,
				-1e308,
				1e-16,
				-1e-16,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
			]);
			const result = arctanTypedIterative(input);

			assertClose(result[0], Math.PI / 2, 1e-15);
			assertClose(result[1], -Math.PI / 2, 1e-15);
			assert.equal(result[2], 1e-16);
			assert.equal(result[3], -1e-16);
			assert.equal(result[4], Number.MIN_VALUE);
			assert.equal(result[5], -Number.MIN_VALUE);
		});

		it('works properly on Float64Array subarray views', () => {
			const backing = new Float64Array([99, -1, 0, 1, -99]);
			const view = backing.subarray(1, 4);
			const result = arctanTypedIterative(view);

			assert.equal(result.length, 3);
			assertClose(result[0], -Math.PI / 4, 1e-15);
			assert.equal(result[1], 0);
			assertClose(result[2], Math.PI / 4, 1e-15);
		});

		it('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				[0, 1],
				new Float32Array([0, 1]),
				new Int32Array([0, 1]),
				42,
				'1.0',
				{ length: 2, 0: 0, 1: 1 },
			];

			for (const bad of invalidInputs) {
				assert.throws(() => arctanTypedIterative(bad), TypeError);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies tan(arctan(x)) ≈ x across finite inputs', () => {
			const input = new Float64Array([-50, -3.7, -1.2, -0.05, 0, 0.125, 0.9, 4.5, 25]);
			const angles = arctanTypedIterative(input);

			for (let i = 0; i < input.length; i += 1) {
				const reconstructed = Math.tan(angles[i]);
				const tolerance = 1e-12 * Math.max(1, Math.abs(input[i]));
				assertClose(reconstructed, input[i], tolerance);
			}
		});

		it('matches independent Maclaurin power series for |x| < 1', () => {
			const input = new Float64Array([-0.6, -0.35, -0.1, 0, 0.15, 0.4, 0.5]);
			const actual = arctanTypedIterative(input);

			for (let i = 0; i < input.length; i += 1) {
				const seriesApprox = arctanMaclaurin(input[i], 80);
				assertClose(actual[i], seriesApprox, 1e-14);
			}
		});

		it('satisfies reciprocal identity arctan(x) + arctan(1/x) = sgn(x) * pi/2', () => {
			const xs = new Float64Array([-10, -2.5, -0.4, 0.25, 1.5, 7.2]);
			const invXs = new Float64Array(xs.length);
			for (let i = 0; i < xs.length; i += 1) {
				invXs[i] = 1 / xs[i];
			}

			const a = arctanTypedIterative(xs);
			const b = arctanTypedIterative(invXs);

			for (let i = 0; i < xs.length; i += 1) {
				const expected = xs[i] > 0 ? Math.PI / 2 : -Math.PI / 2;
				assertClose(a[i] + b[i], expected, 1e-15);
			}
		});

		it('satisfies Machin formula 4*arctan(1/5) - arctan(1/239) = pi/4', () => {
			const vals = arctanTypedIterative(new Float64Array([1 / 5, 1 / 239]));
			const machin = 4 * vals[0] - vals[1];

			assertClose(machin, Math.PI / 4, 1e-15);
		});

		it('is odd (arctan(-x) === -arctan(x)) and strictly increasing', () => {
			const xs = new Float64Array([-100, -5, -1, -0.2, 0, 0.2, 1, 5, 100]);
			const negXs = new Float64Array(xs.length);
			for (let i = 0; i < xs.length; i += 1) {
				negXs[i] = -xs[i];
			}

			const ys = arctanTypedIterative(xs);
			const negYs = arctanTypedIterative(negXs);

			for (let i = 0; i < xs.length; i += 1) {
				assert.equal(negYs[i], -ys[i]);
				if (i > 0) {
					assert.ok(ys[i] > ys[i - 1], `Expected ys[${i}] > ys[${i - 1}]`);
				}
			}
		});
	});
});
