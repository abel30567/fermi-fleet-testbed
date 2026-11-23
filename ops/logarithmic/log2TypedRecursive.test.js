import { describe, test } from 'node:test'
import assert from 'node:assert'
import { log2TypedRecursive } from './log2TypedRecursive.js'

function assertApproxEqual(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(actual), Math.abs(expected))
	assert.ok(
		diff <= Math.max(absTol, relTol * scale),
		`Expected ${actual} to be approximately ${expected} (diff=${diff})`
	)
}

describe('log2TypedRecursive', () => {
	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const result = log2TypedRecursive(input)
		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, input)
	})

	test('handles single-element Float64Array', () => {
		const singleCases = [
			[1, 0],
			[2, 1],
			[8, 3],
			[0.5, -1],
			[0.125, -3],
		]
		for (const [x, expected] of singleCases) {
			const input = new Float64Array([x])
			const result = log2TypedRecursive(input)
			assert.ok(result instanceof Float64Array)
			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0], expected)
		}
	})

	test('computes exact values for positive, zero, and negative powers of 2', () => {
		const exponents = [-20, -10, -5, -2, -1, 0, 1, 2, 3, 8, 16, 30, 53]
		const input = Float64Array.from(exponents, (e) => 2 ** e)
		const result = log2TypedRecursive(input)

		assert.strictEqual(result.length, exponents.length)
		for (let i = 0; i < exponents.length; i++) {
			assert.strictEqual(result[i], exponents[i])
		}
	})

	test('computes accurate values for fractional and non-power-of-2 inputs', () => {
		const input = new Float64Array([0.1, 0.25, 0.75, 1.5, 3, 5, 10, Math.E, Math.PI, 1000])
		const result = log2TypedRecursive(input)

		assert.strictEqual(result.length, input.length)
		for (let i = 0; i < input.length; i++) {
			assertApproxEqual(result[i], Math.log2(input[i]), 1e-14, 1e-14)
		}
	})

	test('does not mutate the input Float64Array', () => {
		const originalValues = [1, 2, 4, 8, 16, 32]
		const input = new Float64Array(originalValues)
		const result = log2TypedRecursive(input)

		assert.notStrictEqual(result, input)
		assert.deepStrictEqual(Array.from(input), originalValues)
		assert.deepStrictEqual(Array.from(result), [0, 1, 2, 3, 4, 5])
	})

	test('handles various odd, even, and large lengths across recursive split boundaries', () => {
		const lengths = [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 63, 64, 65, 1000, 1024]
		for (const len of lengths) {
			const input = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				input[i] = (i + 1) * 0.5
			}
			const result = log2TypedRecursive(input)
			assert.strictEqual(result.length, len)
			for (let i = 0; i < len; i++) {
				assertApproxEqual(result[i], Math.log2(input[i]), 1e-14, 1e-14)
			}
		}
	})

	test('handles Float64Array subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([-999, 0, 1, 4, 16, 64, -5])
		const view = backing.subarray(2, 6)
		const result = log2TypedRecursive(view)

		assert.deepStrictEqual(Array.from(result), [0, 2, 4, 6])
	})

	test('handles extreme finite positive values', () => {
		const input = new Float64Array([
			Number.MIN_VALUE,
			2.2250738585072014e-308,
			1e-300,
			1e300,
			Number.MAX_VALUE,
		])
		const result = log2TypedRecursive(input)

		assert.strictEqual(result[0], -1074)
		assert.strictEqual(result[1], -1022)
		assertApproxEqual(result[2], Math.log(1e-300) / Math.LN2, 1e-13, 1e-13)
		assertApproxEqual(result[3], Math.log(1e300) / Math.LN2, 1e-13, 1e-13)
		assertApproxEqual(result[4], 1024, 1e-12, 1e-12)
	})

	test('throws RangeError for zero, negative, NaN, and infinite elements', () => {
		const invalidCases = [
			new Float64Array([0]),
			new Float64Array([-0]),
			new Float64Array([-1]),
			new Float64Array([-0.0001]),
			new Float64Array([1, 2, 0, 4]),
			new Float64Array([1, 2, 4, -8]),
			new Float64Array([NaN]),
			new Float64Array([1, NaN, 4]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
			new Float64Array([2, 4, Infinity]),
		]

		for (const invalid of invalidCases) {
			assert.throws(() => log2TypedRecursive(invalid), RangeError)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const nonFloat64Inputs = [
			null,
			undefined,
			[1, 2, 4],
			new Float32Array([1, 2, 4]),
			new Int32Array([1, 2, 4]),
			new Uint8Array([1, 2, 4]),
			42,
			'123',
			{ 0: 1, length: 1 },
			new ArrayBuffer(16),
		]

		for (const invalid of nonFloat64Inputs) {
			assert.throws(() => log2TypedRecursive(invalid), TypeError)
		}
	})

	test('cross-check: satisfies inverse identity 2 ** y ≈ x', () => {
		const input = new Float64Array([
			1e-12, 0.001, 0.123456, 0.5, 0.999999, 1, 1.000001, 2.718281828, 3.1415926535,
			7, 42, 12345.6789, 1e15, 1e100,
		])
		const y = log2TypedRecursive(input)

		for (let i = 0; i < input.length; i++) {
			const reconstructed = 2 ** y[i]
			assertApproxEqual(reconstructed, input[i], 1e-12, 1e-24)
		}
	})

	test('cross-check: matches change-of-base formulas Math.log(x) / Math.LN2 and log10', () => {
		const n = 257
		const input = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			// Deterministic positive sweep across several orders of magnitude
			input[i] = 10 ** ((i - 128) / 20) * (1 + (i % 7) * 0.13)
		}
		const result = log2TypedRecursive(input)
		const log10Of2 = Math.log10(2)

		for (let i = 0; i < n; i++) {
			const viaLn = Math.log(input[i]) / Math.LN2
			const viaLog10 = Math.log10(input[i]) / log10Of2
			assertApproxEqual(result[i], viaLn, 1e-13, 1e-13)
			assertApproxEqual(result[i], viaLog10, 1e-13, 1e-13)
		}
	})
})
