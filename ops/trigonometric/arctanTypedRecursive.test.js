import { describe, test } from 'node:test'
import assert from 'node:assert'
import { arctanTypedRecursive } from './arctanTypedRecursive.js'

const EPSILON = 1e-12

describe('arctanTypedRecursive', () => {
	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const output = arctanTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 0)
		assert.notStrictEqual(output, input)
	})

	test('handles single-element Float64Array', () => {
		const input = new Float64Array([1])
		const output = arctanTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, 1)
		assert.ok(Math.abs(output[0] - Math.PI / 4) < EPSILON)
	})

	test('handles odd and even array lengths', () => {
		const oddInput = new Float64Array([-3, -1, 0, 1, 3])
		const oddOutput = arctanTypedRecursive(oddInput)
		assert.strictEqual(oddOutput.length, 5)
		for (let i = 0; i < oddInput.length; i++) {
			assert.strictEqual(oddOutput[i], Math.atan(oddInput[i]))
		}

		const evenInput = new Float64Array([-2, -0.5, 0.5, 2, 10, -10])
		const evenOutput = arctanTypedRecursive(evenInput)
		assert.strictEqual(evenOutput.length, 6)
		for (let i = 0; i < evenInput.length; i++) {
			assert.strictEqual(evenOutput[i], Math.atan(evenInput[i]))
		}
	})

	test('handles larger arrays cleanly via divide-and-conquer', () => {
		const size = 2049
		const input = new Float64Array(size)
		for (let i = 0; i < size; i++) {
			input[i] = (i - 1024) * 0.125
		}
		const output = arctanTypedRecursive(input)
		assert.ok(output instanceof Float64Array)
		assert.strictEqual(output.length, size)
		for (let i = 0; i < size; i++) {
			assert.strictEqual(output[i], Math.atan(input[i]))
		}
	})

	test('handles known trigonometric values and edge values', () => {
		const input = new Float64Array([
			0,
			-0,
			1,
			-1,
			Math.sqrt(3),
			-Math.sqrt(3),
			1 / Math.sqrt(3),
			1e12,
			-1e12,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
			Infinity,
			-Infinity,
		])
		const output = arctanTypedRecursive(input)

		assert.ok(Object.is(output[0], 0))
		assert.ok(Object.is(output[1], -0))
		assert.ok(Math.abs(output[2] - Math.PI / 4) < EPSILON)
		assert.ok(Math.abs(output[3] - -Math.PI / 4) < EPSILON)
		assert.ok(Math.abs(output[4] - Math.PI / 3) < EPSILON)
		assert.ok(Math.abs(output[5] - -Math.PI / 3) < EPSILON)
		assert.ok(Math.abs(output[6] - Math.PI / 6) < EPSILON)
		assert.ok(Math.abs(output[7] - Math.PI / 2) < 1e-11)
		assert.ok(Math.abs(output[8] - -Math.PI / 2) < 1e-11)
		assert.strictEqual(output[9], Math.PI / 2)
		assert.strictEqual(output[10], -Math.PI / 2)
		assert.strictEqual(output[11], Math.PI / 2)
		assert.strictEqual(output[12], -Math.PI / 2)
	})

	test('cross-checks Math.tan(y) ≈ x and Math.atan2(x, 1)', () => {
		const finiteInputs = new Float64Array([-10, -2.5, -1, -0.25, 0, 0.25, 1, 2.5, 10])
		const finiteOutputs = arctanTypedRecursive(finiteInputs)

		for (let i = 0; i < finiteInputs.length; i++) {
			const x = finiteInputs[i]
			const y = finiteOutputs[i]
			assert.ok(
				Math.abs(Math.tan(y) - x) < 1e-11,
				`Expected tan(atan(${x})) ≈ ${x}, got ${Math.tan(y)}`
			)
			assert.strictEqual(y, Math.atan2(x, 1))
		}

		const extendedInputs = new Float64Array([-Infinity, -1e6, -0, 0, 1e6, Infinity])
		const extendedOutputs = arctanTypedRecursive(extendedInputs)
		for (let i = 0; i < extendedInputs.length; i++) {
			assert.ok(Object.is(extendedOutputs[i], Math.atan2(extendedInputs[i], 1)))
		}
	})

	test('preserves input immutability and works on subarrays', () => {
		const backing = new Float64Array([99, -1, 0, 1, 42])
		const view = backing.subarray(1, 4)
		const snapshot = new Float64Array(view)

		const output = arctanTypedRecursive(view)
		assert.notStrictEqual(output, view)
		assert.deepStrictEqual(view, snapshot)
		assert.strictEqual(output.length, 3)
		assert.ok(Math.abs(output[0] - -Math.PI / 4) < EPSILON)
		assert.strictEqual(output[1], 0)
		assert.ok(Math.abs(output[2] - Math.PI / 4) < EPSILON)

		output[0] = 123
		assert.deepStrictEqual(view, snapshot)
	})

	test('rejects non-Float64Array inputs with TypeError', () => {
		const invalidInputs = [
			null,
			undefined,
			[0, 1],
			new Float32Array([0, 1]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			0,
			'0',
			{},
		]
		for (const bad of invalidInputs) {
			assert.throws(() => arctanTypedRecursive(bad), TypeError)
		}
	})

	test('rejects NaN elements with RangeError', () => {
		assert.throws(() => arctanTypedRecursive(new Float64Array([NaN])), RangeError)
		assert.throws(() => arctanTypedRecursive(new Float64Array([NaN, 1, 2])), RangeError)
		assert.throws(() => arctanTypedRecursive(new Float64Array([1, NaN, 2])), RangeError)
		assert.throws(() => arctanTypedRecursive(new Float64Array([1, 2, 3, NaN])), RangeError)
	})
})
