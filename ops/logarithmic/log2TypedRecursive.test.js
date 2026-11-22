import { describe, test } from 'node:test'
import assert from 'node:assert'
import { log2TypedRecursive } from './log2TypedRecursive.js'

describe('log2TypedRecursive', () => {
	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const result = log2TypedRecursive(input)

		assert.ok(result instanceof Float64Array)
		assert.notStrictEqual(result, input)
		assert.strictEqual(result.length, 0)
	})

	test('handles single-element Float64Array', () => {
		const input = new Float64Array([8])
		const result = log2TypedRecursive(input)

		assert.ok(result instanceof Float64Array)
		assert.deepStrictEqual(result, new Float64Array([3]))
	})

	test('handles odd and even length arrays including 1, powers of 2, and fractions', () => {
		const oddInput = new Float64Array([1, 2, 4, 8, 16])
		assert.deepStrictEqual(
			log2TypedRecursive(oddInput),
			new Float64Array([0, 1, 2, 3, 4])
		)

		const evenInput = new Float64Array([0.125, 0.25, 0.5, 1, 2, 1024])
		assert.deepStrictEqual(
			log2TypedRecursive(evenInput),
			new Float64Array([-3, -2, -1, 0, 1, 10])
		)

		const extremePowers = new Float64Array([2 ** -50, 2 ** 50, Number.POSITIVE_INFINITY])
		assert.deepStrictEqual(
			log2TypedRecursive(extremePowers),
			new Float64Array([-50, 50, Number.POSITIVE_INFINITY])
		)
	})

	test('handles larger arrays (even and odd lengths) and cross-checks against Math.log(x)/Math.LN2 and 2**y ≈ x', () => {
		for (const length of [256, 1025]) {
			const input = new Float64Array(length)
			for (let i = 0; i < length; i++) {
				// Mix of fractions, integers, and wider magnitudes
				input[i] = (i + 1) * 0.37 + 0.05
			}

			const result = log2TypedRecursive(input)
			assert.ok(result instanceof Float64Array)
			assert.strictEqual(result.length, length)

			for (let i = 0; i < length; i++) {
				const x = input[i]
				const y = result[i]
				const expected = Math.log(x) / Math.LN2
				const reconstructed = 2 ** y

				assert.ok(
					Math.abs(y - expected) <= 1e-12,
					`index ${i}: log2(${x}) = ${y}, expected ≈ ${expected}`
				)
				assert.ok(
					Math.abs(reconstructed - x) <= Math.max(1e-12, x * 1e-12),
					`index ${i}: 2 ** ${y} = ${reconstructed}, expected ≈ ${x}`
				)
			}
		}
	})

	test('does not mutate input Float64Array', () => {
		const input = new Float64Array([0.5, 1, 2, 4, 16, 32])
		const snapshot = new Float64Array(input)
		const result = log2TypedRecursive(input)

		assert.notStrictEqual(result, input)
		assert.deepStrictEqual(input, snapshot)
		assert.deepStrictEqual(result, new Float64Array([-1, 0, 1, 2, 4, 5]))
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			[1, 2, 4],
			new Float32Array([1, 2, 4]),
			new Int32Array([1, 2, 4]),
			new Uint8Array([1, 2, 4]),
			null,
			undefined,
			42,
			'123',
			{ length: 1, 0: 1 },
		]

		for (const badInput of invalidInputs) {
			assert.throws(
				() => log2TypedRecursive(badInput),
				{ name: 'TypeError' }
			)
		}
	})

	test('throws RangeError for values <= 0 or NaN', () => {
		const invalidArrays = [
			new Float64Array([0]),
			new Float64Array([-0]),
			new Float64Array([-1]),
			new Float64Array([-0.0001]),
			new Float64Array([Number.NEGATIVE_INFINITY]),
			new Float64Array([Number.NaN]),
			new Float64Array([1, 2, 0, 4, 8]),
			new Float64Array([1, 2, 4, 8, -16]),
			new Float64Array([1, 2, 4, Number.NaN, 8, 16]),
		]

		for (const badArray of invalidArrays) {
			assert.throws(
				() => log2TypedRecursive(badArray),
				{ name: 'RangeError' }
			)
		}
	})
})
