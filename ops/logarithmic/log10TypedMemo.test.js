import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	log10TypedMemo,
	getLog10MemoStats,
	clearLog10MemoCache,
} from './log10TypedMemo.js';

describe('log10TypedMemo', () => {
	beforeEach(() => {
		clearLog10MemoCache();
	});

	it('computes exact values for powers of 10', () => {
		const exponents = [-308, -100, -12, -3, -2, -1, 0, 1, 2, 3, 6, 12, 100, 308];
		const input = new Float64Array(exponents.map((e) => Number(`1e${e}`)));
		const result = log10TypedMemo(input);

		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, input.length);
		for (let i = 0; i < exponents.length; i++) {
			assert.equal(result[i], exponents[i], `expected log10(1e${exponents[i]}) === ${exponents[i]}`);
		}
	});

	it('serves small integers 1..1024 from the precomputed integer table', () => {
		const input = new Float64Array(1024);
		for (let i = 0; i < 1024; i++) {
			input[i] = i + 1;
		}
		const result = log10TypedMemo(input);
		const stats = getLog10MemoStats();

		assert.equal(stats.tableHits, 1024);
		assert.equal(stats.cacheMisses, 0);
		for (let i = 0; i < 1024; i++) {
			assert.equal(result[i], Math.log10(i + 1));
		}
	});

	it('handles empty Float64Array', () => {
		const input = new Float64Array(0);
		const result = log10TypedMemo(input);

		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, 0);
		assert.notEqual(result, input);
	});

	it('strictly validates that input is a Float64Array', () => {
		const invalidInputs = [
			null,
			undefined,
			[1, 10, 100],
			new Float32Array([1, 10]),
			new Int32Array([1, 10]),
			new Uint8Array([1, 10]),
			new ArrayBuffer(16),
			10,
			'10',
			{ length: 1, 0: 10 },
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => log10TypedMemo(bad),
				{ name: 'TypeError' },
				`should throw TypeError for ${Object.prototype.toString.call(bad)}`
			);
		}
	});

	it('handles non-positive, NaN, and infinite element values with IEEE-754 semantics', () => {
		const input = new Float64Array([0, -0, -1, -1e10, -Infinity, NaN, Infinity]);
		const result = log10TypedMemo(input);

		assert.equal(result[0], -Infinity);
		assert.equal(result[1], -Infinity);
		assert.ok(Number.isNaN(result[2]));
		assert.ok(Number.isNaN(result[3]));
		assert.ok(Number.isNaN(result[4]));
		assert.ok(Number.isNaN(result[5]));
		assert.equal(result[6], Infinity);
	});

	it('handles subnormal and extreme finite positive doubles', () => {
		const input = new Float64Array([
			Number.MIN_VALUE,
			1e-320,
			1e-310,
			2.2250738585072014e-308, // smallest normal positive double
			Number.MAX_VALUE,
		]);
		const result = log10TypedMemo(input);

		for (let i = 0; i < input.length; i++) {
			const expected = Math.log10(input[i]);
			assert.ok(
				Math.abs(result[i] - expected) <= 1e-13 * Math.max(1, Math.abs(expected)),
				`mismatch at ${input[i]}: got ${result[i]}, expected ${expected}`
			);
		}
	});

	it('reuses memoized values on cache hits within and across calls', () => {
		const values = new Float64Array([2.5, 3.141592653589793, 2.5, 0.123456789, 3.141592653589793]);
		const first = log10TypedMemo(values);
		const afterFirst = getLog10MemoStats();

		assert.equal(afterFirst.cacheMisses, 3);
		assert.equal(afterFirst.cacheHits, 2);
		assert.equal(afterFirst.cacheSize, 3);
		assert.equal(first[0], first[2]);
		assert.equal(first[1], first[4]);

		const second = log10TypedMemo(values);
		const afterSecond = getLog10MemoStats();

		assert.equal(afterSecond.cacheMisses, 3);
		assert.equal(afterSecond.cacheHits, 7);
		assert.deepEqual(second, first);
		assert.notEqual(second, first);
	});

	it('keeps memoization cache bounded under high cardinality inputs', () => {
		const count = 5000;
		const input = new Float64Array(count);
		for (let i = 0; i < count; i++) {
			input[i] = 1024.5 + i * 0.37;
		}
		const result = log10TypedMemo(input);
		const stats = getLog10MemoStats();

		assert.equal(result.length, count);
		assert.equal(stats.cacheSize, stats.maxCacheSize);
		assert.ok(stats.cacheSize <= 4096);
	});

	it('preserves input immutability and isolates returned buffers from cache', () => {
		const input = new Float64Array([1.5, 10, 42.25, 1000.75]);
		const snapshot = new Float64Array(input);

		const out1 = log10TypedMemo(input);
		assert.deepEqual(input, snapshot);
		assert.notEqual(out1, input);

		// Mutate returned array and verify subsequent call is unaffected.
		const expected0 = out1[0];
		const expected2 = out1[2];
		out1.fill(999);

		const out2 = log10TypedMemo(input);
		assert.equal(out2[0], expected0);
		assert.equal(out2[2], expected2);
		assert.deepEqual(input, snapshot);
	});

	it('handles Float64Array subarrays with non-zero byteOffset', () => {
		const backing = new Float64Array([1, 2.5, 25.5, 250.5, 1000]);
		const view = backing.subarray(1, 4);
		const result = log10TypedMemo(view);

		assert.equal(result.length, 3);
		for (let i = 0; i < view.length; i++) {
			assert.ok(Math.abs(result[i] - Math.log10(view[i])) <= 1e-14);
		}
	});

	it('cross-checks against Math.log10 and Math.log(x) / Math.LN10 and log identities', () => {
		const samples = new Float64Array([
			0.000123456789,
			0.25,
			0.5,
			0.7071067811865476,
			1.0000001,
			1.5,
			Math.E,
			Math.PI,
			7.77,
			99.9999,
			1024.5,
			65536.125,
			1.23456789e15,
			9.87654321e-25,
			3.14159265e150,
			2.71828182e-150,
		]);

		const actual = log10TypedMemo(samples);

		for (let i = 0; i < samples.length; i++) {
			const x = samples[i];
			const refLog10 = Math.log10(x);
			const refLnRatio = Math.log(x) / Math.LN10;
			const tol = 1e-14 * Math.max(1, Math.abs(refLog10));

			assert.ok(
				Math.abs(actual[i] - refLog10) <= tol,
				`Math.log10 mismatch at ${x}: got ${actual[i]}, ref ${refLog10}`
			);
			assert.ok(
				Math.abs(actual[i] - refLnRatio) <= tol,
				`Math.log/LN10 mismatch at ${x}: got ${actual[i]}, ref ${refLnRatio}`
			);
		}

		// Algebraic identities: log10(a * b) == log10(a) + log10(b) and log10(1 / a) == -log10(a)
		const a = 17.35;
		const b = 83.25;
		const idOut = log10TypedMemo(new Float64Array([a, b, a * b, 1 / a]));
		assert.ok(Math.abs(idOut[2] - (idOut[0] + idOut[1])) <= 1e-14);
		assert.ok(Math.abs(idOut[3] + idOut[0]) <= 1e-14);
	});
});
