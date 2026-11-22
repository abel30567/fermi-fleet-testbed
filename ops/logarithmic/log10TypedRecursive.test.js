import { describe, test } from 'node:test'
import assert from 'node:assert'
import { log10TypedRecursive } from './log10TypedRecursive.js'

describe('log10TypedRecursive', () => {
	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const output = log10TypedRecursive(input)

		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 0)
		assert.notStrictEqual(output, input)
	})

	test('handles single-element Float64Array', () => {
		const input = new Float64Array([100])
		const output = log10TypedRecursive(input)

		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 1)
		assert.strictEqual(output[0], 2)
	})

	test('handles odd, even, and larger array lengths', () => {
		const lengths = [2, 3, 4, 5, 7, 8, 16, 127, 1025]
		for (const length of lengths) {
			const input = new Float64Array(length)
			for (let i = 0; i < length; i++) {
				input[i] = 10 ** ((i % 13) - 6)
			}
			const output = log10TypedRecursive(input)
			assert.ok(output instanceof Float64Array)
			assert.strictEqual(output.length, length)
			for (let i = 0; i < length; i++) {
				const expected = (i % 13) - 6
				assert.ok(
					Math.abs(output[i] - expected) < 1e-12,
					`length=${length} index=${i}: expected ${expected}, got ${output[i]}`,
				)
			}
		}
	})

	test('handles 1, fractional values, powers of 10, and positive extremes', () => {
		const input = new Float64Array([
			1,
			0.1,
			0.01,
			0.001,
			0.5,
			10,
			1000,
			1e9,
			1e-12,
			Number.MIN_VALUE,
			Number.MAX_VALUE,
			Infinity,
		])
		const output = log10TypedRecursive(input)

		assert.strictEqual(output[0], 0)
		assert.ok(Math.abs(output[1] - -1) < 1e-15)
		assert.ok(Math.abs(output[2] - -2) < 1e-15)
		assert.ok(Math.abs(output[3] - -3) < 1e-15)
		assert.ok(Math.abs(output[4] - Math.log10(0.5)) < 1e-15)
		assert.strictEqual(output[5], 1)
		assert.strictEqual(output[6], 3)
		assert.strictEqual(output[7], 9)
		assert.ok(Math.abs(output[8] - -12) < 1e-14)
		assert.strictEqual(output[9], Math.log10(Number.MIN_VALUE))
		assert.strictEqual(output[10], Math.log10(Number.MAX_VALUE))
		assert.strictEqual(output[11], Infinity)
	})

	test('does not mutate input Float64Array and returns a distinct buffer', () => {
		const input = new Float64Array([1, 2, 10, 50, 1000])
		const snapshot = new Float64Array(input)
		const output = log10TypedRecursive(input)

		assert.notStrictEqual(output, input)
		assert.notStrictEqual(output.buffer, input.buffer)
		assert.deepStrictEqual(input, snapshot)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			[1, 10, 100],
			new Float32Array([1, 10]),
			new Int32Array([1, 10]),
			new Uint8Array([1, 10]),
			null,
			undefined,
			10,
			'10',
			{ 0: 10, length: 1 },
		]

		for (const invalid of invalidInputs) {
			assert.throws(() => log10TypedRecursive(invalid), TypeError)
		}
	})

	test('throws RangeError for values <= 0 or NaN', () => {
		const badArrays = [
			new Float64Array([0]),
			new Float64Array([-0]),
			new Float64Array([-1]),
			new Float64Array([-Infinity]),
			new Float64Array([NaN]),
			new Float64Array([1, 10, 0, 100, 1000]),
			new Float64Array([1, 2, 3, 4, -0.0001]),
			new Float64Array([1, 2, NaN, 4, 5, 6, 7]),
		]

		for (const bad of badArrays) {
			assert.throws(() => log10TypedRecursive(bad), RangeError)
		}
	})

	test('cross-checks against Math.log(x) / Math.LN10 and round-trip 10 ** y ≈ x', () => {
		const samples = new Float64Array([
			1e-9,
			0.0025,
			0.25,
			0.75,
			1,
			Math.E,
			Math.PI,
			7.5,
			42,
			123.456,
			987654.321,
			1e12,
		])
		const output = log10TypedRecursive(samples)

		for (let i = 0; i < samples.length; i++) {
			const x = samples[i]
			const y = output[i]
			const expectedViaLn = Math.log(x) / Math.LN10

			assert.ok(
				Math.abs(y - expectedViaLn) <= 1e-12 * Math.max(1, Math.abs(expectedViaLn)),
				`Math.log/LN10 mismatch at index ${i}: got ${y}, expected ${expectedViaLn}`,
			)

			const reconstructed = 10 ** y
			assert.ok(
				Math.abs(reconstructed - x) <= 1e-12 * Math.max(1, Math.abs(x)),
				`10 ** y round-trip mismatch at index ${i}: 10 ** ${y} = ${reconstructed} != ${x}`,
			)
		}
	})
})
