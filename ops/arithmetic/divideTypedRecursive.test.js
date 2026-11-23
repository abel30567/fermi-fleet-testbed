import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideTypedRecursive } from './divideTypedRecursive.js'

describe('divideTypedRecursive', () => {
	test('divides even-length Float64Arrays element-wise', () => {
		const a = new Float64Array([10, 20, 30, 40])
		const b = new Float64Array([2, 4, 5, 8])
		const result = divideTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(result, new Float64Array([5, 5, 6, 5]))
	})

	test('divides odd-length Float64Arrays element-wise', () => {
		const a = new Float64Array([9, 15, 21, 28, 45])
		const b = new Float64Array([3, 5, 7, 4, 9])
		const result = divideTypedRecursive(a, b)

		assert.deepEqual(result, new Float64Array([3, 3, 3, 7, 5]))
	})

	test('handles empty Float64Arrays', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const result = divideTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 0)
		assert.notEqual(result, a)
		assert.notEqual(result, b)
	})

	test('handles single-element Float64Arrays', () => {
		const a = new Float64Array([7.5])
		const b = new Float64Array([2.5])
		const result = divideTypedRecursive(a, b)

		assert.deepEqual(result, new Float64Array([3]))
	})

	test('handles negative values, zero dividends, and fractions', () => {
		const a = new Float64Array([-12, 12, -12, 0, 1, -0.5])
		const b = new Float64Array([3, -4, -6, 5, 4, 0.25])
		const result = divideTypedRecursive(a, b)

		assert.deepEqual(result, new Float64Array([-4, -3, 2, 0, 0.25, -2]))
	})

	test('does not mutate input arrays and supports subarray views', () => {
		const bufA = new Float64Array([99, 12, 18, 24, 99])
		const bufB = new Float64Array([0, 3, 6, 8, 0])
		const viewA = bufA.subarray(1, 4)
		const viewB = bufB.subarray(1, 4)

		const result = divideTypedRecursive(viewA, viewB)

		assert.deepEqual(result, new Float64Array([4, 3, 3]))
		assert.deepEqual(bufA, new Float64Array([99, 12, 18, 24, 99]))
		assert.deepEqual(bufB, new Float64Array([0, 3, 6, 8, 0]))
	})

	test('throws RangeError on division by positive or negative zero', () => {
		assert.throws(
			() => divideTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 0, 3])),
			{ name: 'RangeError', message: /index 1/ },
		)
		assert.throws(
			() => divideTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2, -0])),
			{ name: 'RangeError', message: /index 2/ },
		)
		assert.throws(
			() => divideTypedRecursive(new Float64Array([0]), new Float64Array([0])),
			{ name: 'RangeError', message: /index 0/ },
		)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2])
		const invalidInputs = [
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			null,
			undefined,
			'12',
			42,
			{},
		]

		for (const bad of invalidInputs) {
			assert.throws(() => divideTypedRecursive(bad, valid), TypeError)
			assert.throws(() => divideTypedRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched lengths', () => {
		assert.throws(
			() => divideTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError,
		)
		assert.throws(
			() => divideTypedRecursive(new Float64Array([]), new Float64Array([1])),
			RangeError,
		)
	})

	test('cross-checks against iterative reference and multiplicative inverse on large array', () => {
		const n = 1025 // non-power-of-two large length to exercise uneven splits
		const a = new Float64Array(n)
		const b = new Float64Array(n)

		for (let i = 0; i < n; i++) {
			a[i] = Math.sin(i + 1) * 1000
			const raw = ((i * 37) % 101) - 50
			b[i] = raw === 0 ? 0.5 : raw * 0.75
		}

		const result = divideTypedRecursive(a, b)
		assert.equal(result.length, n)

		for (let i = 0; i < n; i++) {
			const expected = a[i] / b[i]
			assert.equal(result[i], expected, `exact match vs iterative reference at index ${i}`)

			// Independent algebraic cross-check: (a / b) * b ≈ a
			const reconstructed = result[i] * b[i]
			const tolerance = Math.max(1e-12, Math.abs(a[i]) * 1e-12)
			assert.ok(
				Math.abs(reconstructed - a[i]) <= tolerance,
				`inverse check failed at index ${i}: ${reconstructed} vs ${a[i]}`,
			)
		}
	})
})
