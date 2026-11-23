import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosTypedRecursive } from './arccosTypedRecursive.js'

const EPS = 1e-12

function assertApproxEqual(actual, expected, eps = EPS, message) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		message ?? `Expected ${actual} to be within ${eps} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('arccosTypedRecursive', () => {
	test('computes known standard trigonometric values accurately', () => {
		const input = new Float64Array([
			-1,
			-Math.sqrt(3) / 2,
			-Math.SQRT1_2,
			-0.5,
			0,
			0.5,
			Math.SQRT1_2,
			Math.sqrt(3) / 2,
			1
		])
		const expected = [
			Math.PI,
			(5 * Math.PI) / 6,
			(3 * Math.PI) / 4,
			(2 * Math.PI) / 3,
			Math.PI / 2,
			Math.PI / 3,
			Math.PI / 4,
			Math.PI / 6,
			0
		]

		const result = arccosTypedRecursive(input)
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, input.length)
		for (let i = 0; i < expected.length; i++) {
			assertApproxEqual(result[i], expected[i], EPS, `mismatch at index ${i}`)
		}
	})

	test('handles empty Float64Array', () => {
		const input = new Float64Array(0)
		const result = arccosTypedRecursive(input)
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 0)
		assert.notEqual(result, input)
	})

	test('handles single-element Float64Array for boundary and interior points', () => {
		const cases = [
			[-1, Math.PI],
			[0, Math.PI / 2],
			[-0, Math.PI / 2],
			[0.5, Math.PI / 3],
			[1, 0]
		]
		for (const [x, expected] of cases) {
			const result = arccosTypedRecursive(new Float64Array([x]))
			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 1)
			assertApproxEqual(result[0], expected)
		}
	})

	test('handles odd, even, and large arrays via divide-and-conquer without mutating input', () => {
		for (const n of [2, 3, 7, 16, 1025]) {
			const input = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				input[i] = -1 + (2 * i) / (n - 1)
			}
			const snapshot = new Float64Array(input)
			const result = arccosTypedRecursive(input)

			assert.ok(result instanceof Float64Array)
			assert.notEqual(result, input)
			assert.equal(result.length, n)
			assert.deepEqual(input, snapshot)

			for (let i = 0; i < n; i++) {
				assertApproxEqual(result[i], Math.acos(input[i]), EPS)
			}
		}
	})

	test('handles Float64Array subarray views with non-zero byteOffset', () => {
		const backing = new Float64Array([99, -1, 0, 1, -99])
		const view = backing.subarray(1, 4)
		const result = arccosTypedRecursive(view)
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 3)
		assertApproxEqual(result[0], Math.PI)
		assertApproxEqual(result[1], Math.PI / 2)
		assertApproxEqual(result[2], 0)
	})

	test('throws RangeError for out-of-domain and non-finite elements', () => {
		const invalidArrays = [
			new Float64Array([1.000001]),
			new Float64Array([-1.000001]),
			new Float64Array([1 + Number.EPSILON]),
			new Float64Array([-1 - Number.EPSILON]),
			new Float64Array([0, 0.5, 2]),
			new Float64Array([-5, 0]),
			new Float64Array([0, NaN, 1]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity])
		]

		for (const arr of invalidArrays) {
			assert.throws(
				() => arccosTypedRecursive(arr),
				RangeError,
				`Expected RangeError for [${Array.from(arr).join(', ')}]`
			)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			[0, 0.5, 1],
			new Float32Array([0, 0.5]),
			new Int32Array([0, 1]),
			new Uint8Array([0, 1]),
			null,
			undefined,
			0.5,
			'0.5',
			{},
			{ length: 1, 0: 0.5 }
		]

		for (const bad of invalidInputs) {
			assert.throws(() => arccosTypedRecursive(bad), TypeError)
		}
	})

	test('cross-check: Math.cos(arccos(x)) ≈ x across [-1, 1]', () => {
		const n = 201
		const input = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			input[i] = -1 + (2 * i) / (n - 1)
		}
		const output = arccosTypedRecursive(input)
		for (let i = 0; i < n; i++) {
			assertApproxEqual(Math.cos(output[i]), input[i], EPS)
		}
	})

	test('cross-check: arccos(x) + arcsin(x) ≈ π/2 and reflection arccos(-x) + arccos(x) ≈ π', () => {
		const n = 101
		const input = new Float64Array(n)
		const negated = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			const x = -1 + (2 * i) / (n - 1)
			input[i] = x
			negated[i] = -x
		}
		const out = arccosTypedRecursive(input)
		const outNeg = arccosTypedRecursive(negated)

		for (let i = 0; i < n; i++) {
			assertApproxEqual(out[i] + Math.asin(input[i]), Math.PI / 2, EPS)
			assertApproxEqual(out[i] + outNeg[i], Math.PI, EPS)
			if (i > 0) {
				assert.ok(out[i] < out[i - 1], `Expected strictly decreasing arccos at index ${i}`)
			}
		}
	})
})
