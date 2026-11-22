import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtTypedSeries } from './sqrtTypedSeries.js';

/**
 * Computes the ULP distance between two positive finite doubles.
 *
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function ulpDiff(a, b) {
	if (a === b) return 0n;
	const buf = new ArrayBuffer(16);
	const f64 = new Float64Array(buf);
	const u64 = new BigUint64Array(buf);
	f64[0] = a;
	f64[1] = b;
	return u64[0] > u64[1] ? u64[0] - u64[1] : u64[1] - u64[0];
}

describe('sqrtTypedSeries', () => {
	test('computes exact square roots for perfect squares and powers of 2', () => {
		const input = new Float64Array([
			0, 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 144, 10000, 0.25, 0.0625,
			2 ** 20, 2 ** -20, 2 ** 100, 2 ** -100,
		]);
		const expected = new Float64Array([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 100, 0.5, 0.25,
			2 ** 10, 2 ** -10, 2 ** 50, 2 ** -50,
		]);

		const actual = sqrtTypedSeries(input);
		assert.ok(actual instanceof Float64Array);
		assert.notEqual(actual, input);
		assert.deepEqual(actual, expected);
	});

	test('handles empty Float64Array and preserves signed zero', () => {
		const empty = new Float64Array(0);
		const emptyOut = sqrtTypedSeries(empty);
		assert.ok(emptyOut instanceof Float64Array);
		assert.equal(emptyOut.length, 0);
		assert.notEqual(emptyOut, empty);

		const zeros = new Float64Array([0, -0]);
		const zerosOut = sqrtTypedSeries(zeros);
		assert.ok(Object.is(zerosOut[0], 0));
		assert.ok(Object.is(zerosOut[1], -0));
	});

	test('does not mutate input and handles subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([99, 2, 3, 4, 5, 101]);
		const snapshot = new Float64Array(backing);
		const view = backing.subarray(1, 5);

		const result = sqrtTypedSeries(view);
		assert.equal(result.length, 4);
		assert.deepEqual(backing, snapshot);

		for (let i = 0; i < view.length; i++) {
			assert.ok(
				ulpDiff(result[i], Math.sqrt(view[i])) <= 1n,
				`Mismatch at index ${i}: got ${result[i]}, expected ${Math.sqrt(view[i])}`
			);
		}
	});

	test('handles extreme normal and subnormal IEEE-754 values accurately', () => {
		const smallestNormal = 2 ** -1022;
		const largestSubnormal = smallestNormal - Number.MIN_VALUE;
		const input = new Float64Array([
			Number.MIN_VALUE, // 2^-1074 (smallest subnormal, even exponent)
			Number.MIN_VALUE * 2, // 2^-1073 (subnormal, odd exponent)
			Number.MIN_VALUE * 3,
			Number.MIN_VALUE * 1e7,
			largestSubnormal,
			smallestNormal,
			smallestNormal * 1.5,
			0.5 - Number.EPSILON / 2,
			0.5,
			0.5 + Number.EPSILON / 2,
			1 - Number.EPSILON / 2,
			1 + Number.EPSILON,
			2 - Number.EPSILON,
			2,
			2 + Number.EPSILON * 2,
			Number.MAX_SAFE_INTEGER,
			1e154,
			1e300,
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE,
		]);

		const actual = sqrtTypedSeries(input);
		for (let i = 0; i < input.length; i++) {
			const ref = Math.sqrt(input[i]);
			const ulps = ulpDiff(actual[i], ref);
			assert.ok(
				ulps <= 1n,
				`ULP diff too large for x=${input[i]}: got ${actual[i]}, ref ${ref}, ulps=${ulps}`
			);
		}
	});

	test('cross-checks against Math.sqrt across a wide log-spaced and dense grid', () => {
		const values = [];
		// Dense sweep across [0.25, 4] covering both reduction branches and worst-case |u| = 1/3
		for (let i = 0; i <= 400; i++) {
			values.push(0.25 + (3.75 * i) / 400);
		}
		// Log-spaced sweep across the full dynamic range from subnormals to MAX_VALUE
		for (let exp = -1074; exp <= 1023; exp += 7) {
			values.push(2 ** exp);
			if (exp <= 1022) {
				values.push(1.37 * 2 ** exp);
				values.push(1.999999999999 * 2 ** exp);
			}
		}

		const input = new Float64Array(values);
		const actual = sqrtTypedSeries(input);

		for (let i = 0; i < input.length; i++) {
			const ref = Math.sqrt(input[i]);
			const ulps = ulpDiff(actual[i], ref);
			assert.ok(
				ulps <= 1n,
				`Mismatch at x=${input[i]}: got ${actual[i]}, Math.sqrt=${ref}, ulps=${ulps}`
			);
		}
	});

	test('satisfies algebraic identities sqrt(x)^2 = x and sqrt(a*b) = sqrt(a)*sqrt(b)', () => {
		const xs = new Float64Array([
			1e-200, 1e-50, 0.00123456789, 0.5, 0.75, 1.0, 1.5, 2.0, Math.E,
			Math.PI, 42.195, 1e12, 1e100, 1e200,
		]);
		const roots = sqrtTypedSeries(xs);

		// Identity 1: sqrt(x)^2 === x (within ~2 ULP)
		for (let i = 0; i < xs.length; i++) {
			const sq = roots[i] * roots[i];
			const relErr = Math.abs(sq - xs[i]) / xs[i];
			assert.ok(
				relErr <= 4 * Number.EPSILON,
				`sqrt(x)^2 != x for x=${xs[i]}: relErr=${relErr}`
			);
		}

		// Identity 2: sqrt(a * b) === sqrt(a) * sqrt(b)
		const a = new Float64Array([0.3, 1.7, 2.5, 7.1, 19.3, 1e-40, 1e40]);
		const b = new Float64Array([0.9, 3.1, 4.8, 11.4, 23.7, 1e35, 1e-15]);
		const ab = new Float64Array(a.length);
		for (let i = 0; i < a.length; i++) {
			ab[i] = a[i] * b[i];
		}

		const sqrtA = sqrtTypedSeries(a);
		const sqrtB = sqrtTypedSeries(b);
		const sqrtAB = sqrtTypedSeries(ab);

		for (let i = 0; i < a.length; i++) {
			const lhs = sqrtAB[i];
			const rhs = sqrtA[i] * sqrtB[i];
			const relErr = Math.abs(lhs - rhs) / lhs;
			assert.ok(
				relErr <= 4 * Number.EPSILON,
				`sqrt(a*b) != sqrt(a)*sqrt(b) at i=${i}: relErr=${relErr}`
			);
		}
	});

	test('throws TypeError on non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			4,
			'4',
			{},
			[1, 4, 9],
			new Float32Array([1, 4, 9]),
			new Int32Array([1, 4, 9]),
			new Uint8Array([1, 4, 9]),
			new BigInt64Array([1n, 4n]),
		];

		for (const bad of invalidInputs) {
			assert.throws(() => sqrtTypedSeries(bad), { name: 'TypeError' });
		}
	});

	test('throws RangeError on negative, NaN, and infinite elements', () => {
		const invalidArrays = [
			new Float64Array([-1]),
			new Float64Array([4, -0.0001, 9]),
			new Float64Array([-Number.MIN_VALUE]),
			new Float64Array([-Number.MAX_VALUE]),
			new Float64Array([NaN]),
			new Float64Array([1, NaN, 4]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
			new Float64Array([0, Infinity]),
		];

		for (const bad of invalidArrays) {
			assert.throws(() => sqrtTypedSeries(bad), { name: 'RangeError' });
		}
	});
});
