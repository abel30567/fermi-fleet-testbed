import { describe, test } from 'node:test'
import assert from 'node:assert'
import { arcsinTypedRecursive } from './arcsinTypedRecursive.js'

const EPSILON = 1e-12

function assertClose(actual, expected, eps = EPSILON) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('arcsinTypedRecursive', () => {
	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const output = arcsinTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 0)
		assert.notStrictEqual(output, input)
	})

	test('handles single-element Float64Array', () => {
		const input = new Float64Array([0.5])
		const output = arcsinTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 1)
		assertClose(output[0], Math.PI / 6)
	})

	test('handles odd-length and even-length arrays with known trigonometric values', () => {
		const evenInput = new Float64Array([-0.5, 0, 0.5, Math.SQRT1_2])
		const evenExpected = [-Math.PI / 6, 0, Math.PI / 6, Math.PI / 4]
		const evenOutput = arcsinTypedRecursive(evenInput)
		assert.strictEqual(evenOutput.length, evenInput.length)
		for (let i = 0; i < evenInput.length; i++) {
			assertClose(evenOutput[i], evenExpected[i])
		}

		const oddInput = new Float64Array([
			-Math.sqrt(3) / 2,
			-Math.SQRT1_2,
			0,
			Math.SQRT1_2,
			Math.sqrt(3) / 2,
		])
		const oddExpected = [
			-Math.PI / 3,
			-Math.PI / 4,
			0,
			Math.PI / 4,
			Math.PI / 3,
		]
		const oddOutput = arcsinTypedRecursive(oddInput)
		assert.strictEqual(oddOutput.length, oddInput.length)
		for (let i = 0; i < oddInput.length; i++) {
			assertClose(oddOutput[i], oddExpected[i])
		}
	})

	test('handles boundary values -1, -0, 0, and 1', () => {
		const input = new Float64Array([-1, -0, 0, 1])
		const output = arcsinTypedRecursive(input)
		assertClose(output[0], -Math.PI / 2)
		assert.ok(Object.is(output[1], -0))
		assert.ok(Object.is(output[2], 0))
		assertClose(output[3], Math.PI / 2)
	})

	test('handles larger arrays and satisfies sin(y) ≈ x and atan2 identity', () => {
		const n = 1025
		const input = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			input[i] = -1 + (2 * i) / (n - 1)
		}

		const output = arcsinTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, n)

		for (let i = 0; i < n; i++) {
			const x = input[i]
			const y = output[i]
			assertClose(Math.sin(y), x, 1e-12)
			const viaAtan2 = Math.atan2(x, Math.sqrt(1 - x * x))
			assertClose(y, viaAtan2, 1e-12)
		}
	})

	test('preserves input immutability and returns a distinct buffer', () => {
		const original = [-0.75, -0.25, 0.25, 0.75]
		const input = new Float64Array(original)
		const output = arcsinTypedRecursive(input)

		assert.notStrictEqual(output, input)
		assert.notStrictEqual(output.buffer, input.buffer)
		assert.deepStrictEqual(Array.from(input), original)

		output[0] = 999
		assert.deepStrictEqual(Array.from(input), original)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			[0, 0.5],
			new Float32Array([0, 0.5]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			null,
			undefined,
			0.5,
			'0.5',
			{ length: 1, 0: 0.5 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => arcsinTypedRecursive(bad), TypeError)
		}
	})

	test('throws RangeError for elements outside [-1, 1] or NaN', () => {
		const outOfRangeCases = [
			new Float64Array([1.0000001]),
			new Float64Array([-1.0000001]),
			new Float64Array([0, 0.5, 2, 0.1]),
			new Float64Array([0, -2, 0.5]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
			new Float64Array([NaN]),
			new Float64Array([0.1, 0.2, NaN, 0.3]),
		]

		for (const bad of outOfRangeCases) {
			assert.throws(() => arcsinTypedRecursive(bad), RangeError)
		}
	})
})
