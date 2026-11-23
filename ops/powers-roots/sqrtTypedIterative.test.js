import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtTypedIterative } from './sqrtTypedIterative.js'

/**
 * Independent reference square root via Newton-Raphson (Babylonian) iteration
 * for positive finite numbers.
 *
 * @param {number} x
 * @returns {number}
 */
function newtonSqrt(x) {
	if (x === 0) return x
	let guess = x > 1 ? x / 2 : 1
	for (let i = 0; i < 100; i++) {
		const next = 0.5 * (guess + x / guess)
		if (next === guess) break
		guess = next
	}
	return guess
}

describe('sqrtTypedIterative', () => {
	test('computes exact square roots for perfect squares', () => {
		const input = new Float64Array([0, 1, 4, 9, 16, 25, 144, 10000])
		const result = sqrtTypedIterative(input)

		assert.ok(result instanceof Float64Array)
		assert.notEqual(result, input)
		assert.deepEqual(result, new Float64Array([0, 1, 2, 3, 4, 5, 12, 100]))
	})

	test('computes square roots for fractional and irrational results', () => {
		const input = new Float64Array([0.25, 0.01, 2.25, 2, 3, 10])
		const result = sqrtTypedIterative(input)

		assert.equal(result[0], 0.5)
		assert.ok(Math.abs(result[1] - 0.1) < 1e-15)
		assert.equal(result[2], 1.5)
		assert.ok(Math.abs(result[3] - Math.SQRT2) <= Number.EPSILON)
		assert.ok(Math.abs(result[4] - 1.7320508075688772) < 1e-15)
		assert.ok(Math.abs(result[5] - 3.1622776601683795) < 1e-15)
	})

	test('does not mutate the input Float64Array', () => {
		const input = new Float64Array([4, 9, 16])
		const snapshot = new Float64Array(input)
		const result = sqrtTypedIterative(input)

		assert.deepEqual(input, snapshot)
		assert.deepEqual(result, new Float64Array([2, 3, 4]))
	})

	test('handles empty and single-element Float64Arrays', () => {
		const empty = new Float64Array(0)
		const emptyResult = sqrtTypedIterative(empty)
		assert.ok(emptyResult instanceof Float64Array)
		assert.equal(emptyResult.length, 0)
		assert.notEqual(emptyResult, empty)

		const single = new Float64Array([49])
		assert.deepEqual(sqrtTypedIterative(single), new Float64Array([7]))
	})

	test('handles IEEE-754 special values (-0, +0, negatives, Infinity, NaN)', () => {
		const input = new Float64Array([0, -0, -1, -0.25, Infinity, -Infinity, NaN])
		const result = sqrtTypedIterative(input)

		assert.ok(Object.is(result[0], 0))
		assert.ok(Object.is(result[1], -0))
		assert.ok(Number.isNaN(result[2]))
		assert.ok(Number.isNaN(result[3]))
		assert.equal(result[4], Infinity)
		assert.ok(Number.isNaN(result[5]))
		assert.ok(Number.isNaN(result[6]))
	})

	test('handles extreme finite values (subnormal MIN_VALUE and MAX_VALUE)', () => {
		const input = new Float64Array([Number.MIN_VALUE, 1e-300, 1e300, Number.MAX_VALUE])
		const result = sqrtTypedIterative(input)

		assert.ok(Number.isFinite(result[0]) && result[0] > 0)
		assert.ok(Math.abs(result[1] - 1e-150) / 1e-150 < 1e-14)
		assert.ok(Math.abs(result[2] - 1e150) / 1e150 < 1e-14)
		assert.ok(Number.isFinite(result[3]) && result[3] > 0)
		assert.ok(Math.abs(result[3] / 1.3407807929942596e154 - 1) < 1e-14)
	})

	test('handles subarray views with non-zero byteOffset', () => {
		const base = new Float64Array([1, 4, 9, 16, 25])
		const view = base.subarray(1, 4)
		const result = sqrtTypedIterative(view)

		assert.equal(result.length, 3)
		assert.deepEqual(result, new Float64Array([2, 3, 4]))
		assert.deepEqual(base, new Float64Array([1, 4, 9, 16, 25]))
	})

	test('validates input type and rejects non-Float64Array values', () => {
		const invalidInputs = [
			undefined,
			null,
			4,
			'4',
			true,
			{},
			[1, 4, 9],
			new Float32Array([1, 4, 9]),
			new Int32Array([1, 4, 9]),
			new Uint8Array([1, 4, 9]),
			{ length: 2, 0: 4, 1: 9 },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => sqrtTypedIterative(bad), { name: 'TypeError' })
		}
	})

	test('independent cross-check: squaring output recovers input and matches Newton-Raphson & x**0.5', () => {
		const values = []
		for (let i = 1; i <= 50; i++) {
			values.push(i * 0.37)
			values.push(i * i * 1.25)
			values.push(10 ** (i % 12 - 6) * (i + 0.5))
		}
		const input = new Float64Array(values)
		const result = sqrtTypedIterative(input)

		assert.equal(result.length, input.length)
		for (let i = 0; i < input.length; i++) {
			const x = input[i]
			const y = result[i]

			// Inverse property: y >= 0 and y * y ≈ x
			assert.ok(y >= 0)
			assert.ok(Math.abs(y * y - x) / x < 1e-14, `y*y mismatch for x=${x}: got ${y * y}`)

			// Independent Newton-Raphson cross-check
			const nr = newtonSqrt(x)
			assert.ok(Math.abs(y - nr) / nr < 1e-14, `Newton mismatch for x=${x}: ${y} vs ${nr}`)

			// Exponentiation cross-check: x ** 0.5
			const pow = x ** 0.5
			assert.ok(Math.abs(y - pow) / pow < 1e-14, `Pow mismatch for x=${x}: ${y} vs ${pow}`)
		}
	})
})
