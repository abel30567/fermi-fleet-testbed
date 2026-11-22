import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialTypedRecursive } from './factorialTypedRecursive.js'

/**
 * Independent iterative reference implementation of factorial for cross-checking.
 *
 * @param {number} n - Non-negative integer.
 * @returns {number} n! in IEEE-754 double precision.
 */
function iterativeFactorial(n) {
	let acc = 1
	for (let i = 2; i <= n; i++) {
		acc *= i
		if (!Number.isFinite(acc)) {
			return Infinity
		}
	}
	return acc
}

describe('factorialTypedRecursive', () => {
	it('computes factorials for normal small and medium inputs', () => {
		const input = new Float64Array([2, 3, 4, 5, 6, 7, 10, 12])
		const result = factorialTypedRecursive(input)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(
			result,
			new Float64Array([2, 6, 24, 120, 720, 5040, 3628800, 479001600])
		)
	})

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([0, 1, 5, 8])
		const snapshot = new Float64Array(input)
		const result = factorialTypedRecursive(input)

		assert.notEqual(result, input)
		assert.deepEqual(input, snapshot)
	})

	it('handles edge cases: 0!, -0!, 1!, single-element, and subarray views', () => {
		const edge = new Float64Array([0, -0, 1])
		assert.deepEqual(factorialTypedRecursive(edge), new Float64Array([1, 1, 1]))

		const single = new Float64Array([5])
		assert.deepEqual(factorialTypedRecursive(single), new Float64Array([120]))

		const backing = new Float64Array([99, 3, 4, 5, 99])
		const view = backing.subarray(1, 4)
		assert.deepEqual(factorialTypedRecursive(view), new Float64Array([6, 24, 120]))
	})

	it('handles an empty Float64Array', () => {
		const input = new Float64Array(0)
		const result = factorialTypedRecursive(input)

		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 0)
		assert.notEqual(result, input)
	})

	it('handles float64 boundary (170!) and overflow (>170 -> Infinity)', () => {
		const input = new Float64Array([170, 171, 200, 1000, 1e9])
		const result = factorialTypedRecursive(input)

		assert.ok(Number.isFinite(result[0]))
		assert.ok(Math.abs(result[0] - 7.257415615307999e306) / 7.257415615307999e306 < 1e-13)
		assert.equal(result[1], Infinity)
		assert.equal(result[2], Infinity)
		assert.equal(result[3], Infinity)
		assert.equal(result[4], Infinity)
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			5,
			'123',
			{},
			[1, 2, 3],
			new Int32Array([1, 2, 3]),
			new Float32Array([1, 2, 3]),
			new Uint32Array([1, 2, 3])
		]

		for (const bad of invalidInputs) {
			assert.throws(() => factorialTypedRecursive(bad), {
				name: 'TypeError'
			})
		}
	})

	it('throws RangeError for negative, fractional, NaN, and infinite elements', () => {
		const invalidArrays = [
			new Float64Array([-1]),
			new Float64Array([0, 2, -5]),
			new Float64Array([0.5]),
			new Float64Array([3, 4.25, 5]),
			new Float64Array([NaN]),
			new Float64Array([1, Infinity]),
			new Float64Array([-Infinity])
		]

		for (const bad of invalidArrays) {
			assert.throws(() => factorialTypedRecursive(bad), {
				name: 'RangeError'
			})
		}
	})

	it('cross-checks against an independent iterative implementation across 0..175', () => {
		const nValues = new Float64Array(176)
		for (let i = 0; i <= 175; i++) {
			nValues[i] = i
		}

		const actual = factorialTypedRecursive(nValues)
		assert.equal(actual.length, nValues.length)

		for (let i = 0; i <= 175; i++) {
			const expected = iterativeFactorial(i)
			if (i <= 21) {
				assert.equal(actual[i], expected, `exact mismatch at ${i}!`)
			} else if (i <= 170) {
				const relErr = Math.abs(actual[i] - expected) / expected
				assert.ok(
					relErr < 1e-13,
					`relative error too large at ${i}!: got ${actual[i]}, expected ${expected}, relErr=${relErr}`
				)
			} else {
				assert.equal(actual[i], Infinity, `expected overflow Infinity at ${i}!`)
				assert.equal(expected, Infinity)
			}
		}
	})
})
