import { describe, test } from 'node:test'
import assert from 'node:assert'
import { arccosTypedRecursive } from './arccosTypedRecursive.js'

function assertClose(actual, expected, eps = 1e-12, message) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		message ?? `Expected ${actual} to be within ${eps} of ${expected}`
	)
}

describe('arccosTypedRecursive', () => {
	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const output = arccosTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 0)
		assert.notStrictEqual(output, input)
	})

	test('handles single-element Float64Array', () => {
		const input = new Float64Array([0.5])
		const output = arccosTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 1)
		assertClose(output[0], Math.PI / 3)
	})

	test('handles exact boundary and standard trigonometric values', () => {
		const input = new Float64Array([-1, -Math.SQRT1_2, -0.5, -0, 0, 0.5, Math.SQRT1_2, 1])
		const expected = [
			Math.PI,
			(3 * Math.PI) / 4,
			(2 * Math.PI) / 3,
			Math.PI / 2,
			Math.PI / 2,
			Math.PI / 3,
			Math.PI / 4,
			0,
		]
		const output = arccosTypedRecursive(input)
		assert.strictEqual(output.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assertClose(output[i], expected[i])
		}
	})

	test('handles odd, even, and larger array lengths', () => {
		for (const len of [2, 3, 4, 5, 7, 8, 15, 16, 129, 512]) {
			const input = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				input[i] = len === 1 ? 0 : -1 + (2 * i) / (len - 1)
			}
			const output = arccosTypedRecursive(input)
			assert.ok(output instanceof Float64Array)
			assert.strictEqual(output.length, len)
			for (let i = 0; i < len; i++) {
				assert.strictEqual(output[i], Math.acos(input[i]))
			}
		}
	})

	test('does not mutate the input Float64Array', () => {
		const originalValues = [-1, -0.75, -0.25, 0, 0.25, 0.75, 1]
		const input = new Float64Array(originalValues)
		const output = arccosTypedRecursive(input)
		assert.notStrictEqual(output, input)
		assert.notStrictEqual(output.buffer, input.buffer)
		assert.deepStrictEqual(Array.from(input), originalValues)
	})

	test('cross-checks against Math.cos(y) ≈ x and Math.PI / 2 - Math.asin(x)', () => {
		const count = 201
		const input = new Float64Array(count)
		for (let i = 0; i < count; i++) {
			input[i] = -1 + (2 * i) / (count - 1)
		}
		const output = arccosTypedRecursive(input)
		for (let i = 0; i < count; i++) {
			const x = input[i]
			const y = output[i]
			assert.ok(y >= 0 && y <= Math.PI, `Output ${y} out of [0, π]`)
			assertClose(Math.cos(y), x, 1e-12, `cos(acos(${x})) !== ${x}`)
			assertClose(y, Math.PI / 2 - Math.asin(x), 1e-12, `acos(${x}) !== π/2 - asin(${x})`)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			[0, 0.5, 1],
			new Float32Array([0, 0.5]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			new ArrayBuffer(16),
			null,
			undefined,
			0.5,
			'0.5',
			{ length: 1, 0: 0.5 },
		]
		for (const bad of invalidInputs) {
			assert.throws(() => arccosTypedRecursive(bad), TypeError)
		}
	})

	test('throws RangeError for elements outside [-1, 1] or NaN', () => {
		const invalidArrays = [
			new Float64Array([1.0000001]),
			new Float64Array([-1.0000001]),
			new Float64Array([2]),
			new Float64Array([-2]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
			new Float64Array([NaN]),
			new Float64Array([-1, 0, 1.5, 0.5, 1]),
			new Float64Array([0, 0.25, -0.5, NaN, 0.75]),
			new Float64Array([0.1, 0.2, 0.3, 0.4, -1.1]),
		]
		for (const bad of invalidArrays) {
			assert.throws(() => arccosTypedRecursive(bad), RangeError)
		}
	})
})
