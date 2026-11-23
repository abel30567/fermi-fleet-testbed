import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { log2TypedMemo } from "./log2TypedMemo.js";

const TOLERANCE = 1e-12;

function assertClose(actual, expected, msg) {
	if (Number.isNaN(expected)) {
		assert.ok(Number.isNaN(actual), `${msg}: expected NaN, got ${actual}`);
		return;
	}
	if (!Number.isFinite(expected)) {
		assert.equal(actual, expected, `${msg}: expected ${expected}, got ${actual}`);
		return;
	}
	const diff = Math.abs(actual - expected);
	const bound = Math.max(TOLERANCE, Math.abs(expected) * 1e-14);
	assert.ok(
		diff <= bound,
		`${msg}: expected ${expected}, got ${actual} (diff=${diff}, bound=${bound})`,
	);
}

describe("log2TypedMemo", () => {
	it("computes exact values for integer powers of 2 across the float64 range", () => {
		const exponents = [-1074, -1050, -1022, -53, -10, -1, 0, 1, 2, 10, 53, 500, 1023];
		const input = Float64Array.from(exponents, (e) => 2 ** e);
		const result = log2TypedMemo(input);

		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, input.length);
		for (let i = 0; i < exponents.length; i++) {
			assert.equal(result[i], exponents[i], `2^${exponents[i]} should be exact`);
		}
	});

	it("handles normal positive inputs and small precomputed integers", () => {
		const input = new Float64Array([1, 2, 3, 5, 10, 100, 512, 1024, 1025, 0.25, 1.5, Math.PI, Math.E]);
		const result = log2TypedMemo(input);

		for (let i = 0; i < input.length; i++) {
			assertClose(result[i], Math.log2(input[i]), `index ${i} (${input[i]})`);
		}
	});

	it("handles empty Float64Array input", () => {
		const input = new Float64Array(0);
		const result = log2TypedMemo(input);

		assert.ok(result instanceof Float64Array);
		assert.equal(result.length, 0);
		assert.notEqual(result, input);
	});

	it("handles non-positive, NaN, and infinite values with IEEE 754 semantics", () => {
		const input = new Float64Array([0, -0, -1, -1024.5, -Infinity, NaN, Infinity]);
		const result = log2TypedMemo(input);

		assert.equal(result[0], -Infinity);
		assert.equal(result[1], -Infinity);
		assert.ok(Number.isNaN(result[2]));
		assert.ok(Number.isNaN(result[3]));
		assert.ok(Number.isNaN(result[4]));
		assert.ok(Number.isNaN(result[5]));
		assert.equal(result[6], Infinity);
	});

	it("rejects non-Float64Array inputs with TypeError", () => {
		const invalidInputs = [
			null,
			undefined,
			[1, 2, 4],
			new Float32Array([1, 2, 4]),
			new Int32Array([1, 2, 4]),
			new Uint8Array([1, 2, 4]),
			42,
			"123",
			{ length: 2, 0: 1, 1: 2 },
		];

		for (const bad of invalidInputs) {
			assert.throws(
				() => log2TypedMemo(bad),
				{ name: "TypeError" },
				`Expected TypeError for ${Object.prototype.toString.call(bad)}`,
			);
		}
	});

	it("preserves immutability of inputs and isolates cached results across calls", () => {
		const input = new Float64Array([3.14159, 7.5, 42.125, 1337.75]);
		const snapshot = new Float64Array(input);

		const first = log2TypedMemo(input);
		assert.deepEqual(input, snapshot, "Input Float64Array must not be mutated");

		// Mutate returned array and verify subsequent memoized call is unaffected.
		const expectedCopy = new Float64Array(first);
		first[0] = -999;
		first[3] = 12345;

		const second = log2TypedMemo(input);
		assert.notEqual(second, first);
		assert.deepEqual(second, expectedCopy);
	});

	it("reuses memoized values consistently for repeated inputs and survives cache eviction", () => {
		// Repeated non-table values in the same array and across calls (cache hits).
		const repeated = new Float64Array([1234.5678, 9876.5432, 1234.5678, 0.3719, 9876.5432, 0.3719]);
		const r1 = log2TypedMemo(repeated);
		const r2 = log2TypedMemo(repeated);

		assert.equal(r1[0], r1[2]);
		assert.equal(r1[1], r1[4]);
		assert.equal(r1[3], r1[5]);
		assert.deepEqual(r1, r2);

		// Exceed bounded cache capacity (> 4096 unique non-small-int entries) and re-query.
		const largeCount = 5000;
		const largeInput = new Float64Array(largeCount);
		for (let i = 0; i < largeCount; i++) {
			largeInput[i] = 1024.5 + i * 0.375;
		}
		const largeOut1 = log2TypedMemo(largeInput);
		const largeOut2 = log2TypedMemo(largeInput);
		assert.deepEqual(largeOut1, largeOut2);
		for (let i = 0; i < largeCount; i += 251) {
			assertClose(largeOut1[i], Math.log2(largeInput[i]), `eviction check index ${i}`);
		}
	});

	it("cross-checks accurately against Math.log(x) / Math.LN2 and Math.log2(x)", () => {
		const samples = new Float64Array([
			Number.MIN_VALUE,
			1e-300,
			1e-100,
			1e-12,
			0.000123456789,
			0.5,
			0.7071067811865476,
			0.999999999999,
			1.000000000001,
			1.4142135623730951,
			1.999999999999,
			2.718281828459045,
			10.5,
			123456.789,
			1e50,
			1e200,
			Number.MAX_VALUE,
		]);

		const actual = log2TypedMemo(samples);
		for (let i = 0; i < samples.length; i++) {
			const x = samples[i];
			const refLog2 = Math.log2(x);
			const refChangeOfBase = Math.log(x) / Math.LN2;
			assertClose(actual[i], refLog2, `Math.log2 cross-check at ${x}`);
			assertClose(actual[i], refChangeOfBase, `Math.log/LN2 cross-check at ${x}`);
		}
	});
});
