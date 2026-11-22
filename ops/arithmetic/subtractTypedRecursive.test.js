import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractTypedRecursive } from './subtractTypedRecursive.js'

describe('subtractTypedRecursive', () => {
	test('handles empty Float64Arrays', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const res = subtractTypedRecursive(a, b)
		assert.ok(res instanceof Float64Array)
		assert.equal(res.length, 0)
		assert.deepEqual(res, new Float64Array(0))
	})

	test('handles single-element Float64Arrays', () => {
		const a = new Float64Array([10.5])
		const b = new Float64Array([3.25])
		const res = subtractTypedRecursive(a, b)
		assert.ok(res instanceof Float64Array)
		assert.deepEqual(res, new Float64Array([7.25]))
	})

	test('handles odd-length Float64Arrays', () => {
		const a = new Float64Array([10, 20, 30, 40, 50])
		const b = new Float64Array([1, 2, 3, 4, 5])
		const res = subtractTypedRecursive(a, b)
		assert.deepEqual(res, new Float64Array([9, 18, 27, 36, 45]))
	})

	test('handles even-length Float64Arrays', () => {
		const a = new Float64Array([8, 16, 24, 32, 40, 48])
		const b = new Float64Array([3, 6, 9, 12, 15, 18])
		const res = subtractTypedRecursive(a, b)
		assert.deepEqual(res, new Float64Array([5, 10, 15, 20, 25, 30]))
	})

	test('handles negatives, zeros, decimals, and special IEEE 754 values', () => {
		const a = new Float64Array([-5.5, 0, -0, 0.3, Infinity, -Infinity, NaN, 1e-12])
		const b = new Float64Array([-2.5, 0, 0, 0.1, 1, 1, 5, -1e-12])
		const res = subtractTypedRecursive(a, b)

		assert.equal(res[0], -3)
		assert.equal(res[1], 0)
		assert.ok(Object.is(res[2], -0))
		assert.equal(res[3], 0.3 - 0.1)
		assert.equal(res[4], Infinity)
		assert.equal(res[5], -Infinity)
		assert.ok(Number.isNaN(res[6]))
		assert.equal(res[7], 1e-12 - -1e-12)
	})

	test('preserves input immutability and returns a new Float64Array', () => {
		const a = new Float64Array([1.5, -2.5, 3.5, 4.5])
		const b = new Float64Array([0.5, 1.5, -0.5, 2.5])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		const res = subtractTypedRecursive(a, b)

		assert.notEqual(res, a)
		assert.notEqual(res, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)

		res[0] = 999
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidValues = [
			null,
			undefined,
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			42,
			'123',
			{ length: 3, 0: 1, 1: 2, 2: 3 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => subtractTypedRecursive(bad, valid), TypeError)
			assert.throws(() => subtractTypedRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched lengths', () => {
		assert.throws(
			() => subtractTypedRecursive(new Float64Array(0), new Float64Array(1)),
			RangeError
		)
		assert.throws(
			() => subtractTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError
		)
		assert.throws(
			() => subtractTypedRecursive(new Float64Array(4), new Float64Array(5)),
			RangeError
		)
	})

	test('cross-checks large odd and even arrays against iterative subtraction', () => {
		for (const n of [1000, 4097]) {
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			const expected = new Float64Array(n)

			for (let i = 0; i < n; i++) {
				a[i] = Math.sin(i * 0.37) * 1000 - i * 0.125
				b[i] = Math.cos(i * 0.53) * 500 + (i % 7) * 0.25
				expected[i] = a[i] - b[i]
			}

			const actual = subtractTypedRecursive(a, b)
			assert.ok(actual instanceof Float64Array)
			assert.equal(actual.length, n)
			assert.deepEqual(actual, expected)
		}
	})
})
