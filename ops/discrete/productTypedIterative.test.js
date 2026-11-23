import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productTypedIterative } from './productTypedIterative.js'

describe('productTypedIterative', () => {
	test('computes product of positive integers', () => {
		assert.equal(productTypedIterative(new Float64Array([2, 3, 4])), 24)
		assert.equal(productTypedIterative(new Float64Array([1, 2, 3, 4, 5])), 120)
	})

	test('computes product of floating-point numbers', () => {
		assert.equal(productTypedIterative(new Float64Array([0.5, 4, 1.5])), 3)
		assert.ok(
			Math.abs(productTypedIterative(new Float64Array([0.1, 0.2, 0.5])) - 0.01) < 1e-15,
		)
	})

	test('handles negative numbers with odd and even sign counts', () => {
		assert.equal(productTypedIterative(new Float64Array([-2, 3, 4])), -24)
		assert.equal(productTypedIterative(new Float64Array([-2, -3, 4])), 24)
		assert.equal(productTypedIterative(new Float64Array([-2, -3, -4])), -24)
	})

	test('handles single-element Float64Array', () => {
		assert.equal(productTypedIterative(new Float64Array([42.5])), 42.5)
		assert.equal(productTypedIterative(new Float64Array([-7])), -7)
		assert.equal(productTypedIterative(new Float64Array([0])), 0)
	})

	test('works on Float64Array subarray views', () => {
		const backing = new Float64Array([10, 2, 3, 5, 100])
		const view = backing.subarray(1, 4)
		assert.equal(productTypedIterative(view), 30)
	})

	test('returns 1 for empty Float64Array (empty product)', () => {
		assert.equal(productTypedIterative(new Float64Array(0)), 1)
	})

	test('handles zero and signed zero per IEEE 754', () => {
		assert.equal(productTypedIterative(new Float64Array([5, 0, 9])), 0)
		assert.ok(Object.is(productTypedIterative(new Float64Array([-0])), -0))
		assert.ok(Object.is(productTypedIterative(new Float64Array([-2, 0])), -0))
		assert.ok(Object.is(productTypedIterative(new Float64Array([-2, -0])), 0))
	})

	test('propagates NaN, Infinity, overflow, and underflow per IEEE 754', () => {
		assert.ok(Number.isNaN(productTypedIterative(new Float64Array([2, NaN, 3]))))
		assert.equal(productTypedIterative(new Float64Array([2, Infinity])), Infinity)
		assert.equal(productTypedIterative(new Float64Array([-2, Infinity])), -Infinity)
		assert.ok(Number.isNaN(productTypedIterative(new Float64Array([0, Infinity]))))
		assert.equal(productTypedIterative(new Float64Array([1e200, 1e200])), Infinity)
		assert.equal(productTypedIterative(new Float64Array([1e-200, 1e-200])), 0)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			123,
			'123',
			{ 0: 1, length: 1 },
		]

		for (const input of invalidInputs) {
			assert.throws(() => productTypedIterative(input), TypeError)
		}
	})

	test('independent cross-check: matches recursive factorial identity', () => {
		function factorial(n) {
			return n <= 1 ? 1 : n * factorial(n - 1)
		}

		for (let n = 1; n <= 15; n++) {
			const arr = Float64Array.from({ length: n }, (_, idx) => idx + 1)
			assert.equal(productTypedIterative(arr), factorial(n))
		}
	})

	test('independent cross-check: matches exp(sum(ln(x))) for positive floats', () => {
		const values = new Float64Array([1.25, 2.5, 0.75, 3.1, 0.4, 7.2, 1.8])
		const iterativeResult = productTypedIterative(values)

		let logSum = 0
		for (const x of values) {
			logSum += Math.log(x)
		}
		const logExpResult = Math.exp(logSum)

		const relErr = Math.abs(iterativeResult - logExpResult) / Math.abs(logExpResult)
		assert.ok(relErr < 1e-14, `expected relative error < 1e-14, got ${relErr}`)
	})

	test('independent cross-check: matches BigInt exact product for safe integers', () => {
		const ints = [3, -5, 7, 11, -13, 17, 19, 23]
		const typed = Float64Array.from(ints)
		const expectedBig = ints.reduce((acc, v) => acc * BigInt(v), 1n)
		assert.equal(BigInt(productTypedIterative(typed)), expectedBig)
	})
})
