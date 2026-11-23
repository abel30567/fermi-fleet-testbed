import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialTypedIterative } from './factorialTypedIterative.js'

/**
 * Independent BigInt recursive reference implementation for exact cross-checks.
 * @param {number} n
 * @returns {bigint}
 */
function exactFactorialBigInt(n) {
	if (n <= 1) return 1n
	return BigInt(n) * exactFactorialBigInt(n - 1)
}

describe('factorialTypedIterative', () => {
	it('computes factorials for small non-negative integers', () => {
		const input = new Float64Array([0, 1, 2, 3, 4, 5, 6, 10])
		const result = factorialTypedIterative(input)

		assert.ok(result instanceof Float64Array)
		assert.notStrictEqual(result, input)
		assert.deepStrictEqual(
			result,
			new Float64Array([1, 1, 2, 6, 24, 120, 720, 3628800])
		)
	})

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([0, 3, 5, 7])
		const snapshot = new Float64Array(input)
		factorialTypedIterative(input)
		assert.deepStrictEqual(input, snapshot)
	})

	it('handles empty Float64Array and negative zero', () => {
		const empty = factorialTypedIterative(new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.strictEqual(empty.length, 0)

		const negZero = factorialTypedIterative(new Float64Array([-0, 0]))
		assert.deepStrictEqual(negZero, new Float64Array([1, 1]))
	})

	it('handles Float64Array subarray views correctly', () => {
		const backing = new Float64Array([99, 2, 4, 5, 99])
		const view = backing.subarray(1, 4)
		const result = factorialTypedIterative(view)
		assert.deepStrictEqual(result, new Float64Array([2, 24, 120]))
	})

	it('handles boundary value 170 and overflows to Infinity for >= 171', () => {
		const input = new Float64Array([170, 171, 200, 1e9])
		const result = factorialTypedIterative(input)

		assert.ok(Number.isFinite(result[0]))
		assert.strictEqual(result[1], Infinity)
		assert.strictEqual(result[2], Infinity)
		assert.strictEqual(result[3], Infinity)
	})

	it('cross-checks against exact BigInt reference for n = 0..170', () => {
		const nValues = new Float64Array(171)
		for (let i = 0; i <= 170; i++) {
			nValues[i] = i
		}
		const result = factorialTypedIterative(nValues)

		for (let n = 0; n <= 22; n++) {
			assert.strictEqual(
				result[n],
				Number(exactFactorialBigInt(n)),
				`Exact match failed at n=${n}`
			)
		}

		for (let n = 23; n <= 170; n++) {
			const expected = Number(exactFactorialBigInt(n))
			const relErr = Math.abs(result[n] - expected) / expected
			assert.ok(
				relErr < 1e-13,
				`Relative error too large at n=${n}: ${relErr}`
			)
		}
	})

	it('cross-checks against log-sum exponential and recurrence identity', () => {
		const input = new Float64Array([10, 25, 50, 100, 150])
		const result = factorialTypedIterative(input)

		for (let i = 0; i < input.length; i++) {
			const n = input[i]
			let logSum = 0
			for (let k = 2; k <= n; k++) {
				logSum += Math.log(k)
			}
			const logExpected = Math.exp(logSum)
			const relErr = Math.abs(result[i] - logExpected) / logExpected
			assert.ok(
				relErr < 1e-12,
				`Log-sum cross-check failed at n=${n}: relErr=${relErr}`
			)
		}

		// Recurrence: n! = n * (n - 1)!
		const seq = new Float64Array(21)
		for (let i = 0; i <= 20; i++) seq[i] = i
		const facts = factorialTypedIterative(seq)
		for (let n = 1; n <= 20; n++) {
			assert.strictEqual(facts[n], n * facts[n - 1])
		}
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		for (const bad of [
			null,
			undefined,
			5,
			'123',
			[1, 2, 3],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			{}
		]) {
			assert.throws(() => factorialTypedIterative(bad), TypeError)
		}
	})

	it('throws RangeError for negative, non-integer, NaN, or infinite elements', () => {
		const invalidCases = [
			new Float64Array([-1]),
			new Float64Array([0, 2, -5]),
			new Float64Array([1.5]),
			new Float64Array([0.0001]),
			new Float64Array([NaN]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity])
		]

		for (const arr of invalidCases) {
			assert.throws(() => factorialTypedIterative(arr), RangeError)
		}
	})
})
