import { describe, test } from 'node:test'
import assert from 'node:assert'
import { divideTypedIterative } from './divideTypedIterative.js'

describe('divideTypedIterative', () => {
	test('divides positive, negative, and fractional values element-wise', () => {
		const a = new Float64Array([10, -9, 7.5, 0, -12.5])
		const b = new Float64Array([2, 3, 2.5, 5, -2.5])
		const result = divideTypedIterative(a, b)

		assert.ok(result instanceof Float64Array)
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
		assert.deepStrictEqual(result, new Float64Array([5, -3, 3, 0, 5]))
		// Verify inputs were not mutated
		assert.deepStrictEqual(a, new Float64Array([10, -9, 7.5, 0, -12.5]))
		assert.deepStrictEqual(b, new Float64Array([2, 3, 2.5, 5, -2.5]))
	})

	test('handles single-element and empty Float64Arrays', () => {
		const emptyResult = divideTypedIterative(new Float64Array(0), new Float64Array(0))
		assert.ok(emptyResult instanceof Float64Array)
		assert.strictEqual(emptyResult.length, 0)

		const singleResult = divideTypedIterative(new Float64Array([42]), new Float64Array([6]))
		assert.deepStrictEqual(singleResult, new Float64Array([7]))
	})

	test('preserves IEEE 754 special values (zeros, signed zero, Infinity, NaN)', () => {
		const a = new Float64Array([1, -1, 0, 1, 0, Infinity, -Infinity, NaN, 5])
		const b = new Float64Array([0, 0, 0, -0, -1, 2, Infinity, 3, Infinity])
		const result = divideTypedIterative(a, b)

		assert.strictEqual(result[0], Infinity)
		assert.strictEqual(result[1], -Infinity)
		assert.ok(Number.isNaN(result[2]))
		assert.strictEqual(result[3], -Infinity)
		assert.ok(Object.is(result[4], -0))
		assert.strictEqual(result[5], Infinity)
		assert.ok(Number.isNaN(result[6]))
		assert.ok(Number.isNaN(result[7]))
		assert.ok(Object.is(result[8], 0))
	})

	test('works with Float64Array subarrays and aliased inputs', () => {
		const bufA = new Float64Array([99, 20, 30, 40, 99])
		const bufB = new Float64Array([88, 88, 4, 5, 8])
		const viewA = bufA.subarray(1, 4)
		const viewB = bufB.subarray(2, 5)

		assert.deepStrictEqual(divideTypedIterative(viewA, viewB), new Float64Array([5, 6, 5]))

		const self = new Float64Array([3.5, -7.25, 100])
		assert.deepStrictEqual(divideTypedIterative(self, self), new Float64Array([1, 1, 1]))
		assert.deepStrictEqual(self, new Float64Array([3.5, -7.25, 100]))
	})

	test('handles extreme magnitudes without premature overflow or underflow', () => {
		const a = new Float64Array([Number.MAX_VALUE, Number.MIN_VALUE, 1e-300])
		const b = new Float64Array([Number.MAX_VALUE, Number.MIN_VALUE, 1e-300])
		assert.deepStrictEqual(divideTypedIterative(a, b), new Float64Array([1, 1, 1]))
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2])
		const invalidInputs = [
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			null,
			undefined,
			42,
			'12',
			{ 0: 1, 1: 2, length: 2 }
		]

		for (const bad of invalidInputs) {
			assert.throws(() => divideTypedIterative(bad, valid), TypeError)
			assert.throws(() => divideTypedIterative(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched lengths', () => {
		assert.throws(
			() => divideTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError
		)
		assert.throws(
			() => divideTypedIterative(new Float64Array(0), new Float64Array([1])),
			RangeError
		)
	})

	test('cross-checks against independent map reference and multiplicative inverse property', () => {
		// Deterministic LCG for reproducible pseudo-random double values
		let state = 0x12345678
		const nextRand = () => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0
			return (state / 0x100000000) * 200 - 100
		}

		const n = 256
		const a = new Float64Array(n)
		const b = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = nextRand()
			const denom = nextRand()
			// Avoid near-zero divisors so multiplicative inverse check stays well-conditioned
			b[i] = Math.abs(denom) < 0.5 ? (denom < 0 ? -1.5 : 1.5) : denom
		}

		const actual = divideTypedIterative(a, b)
		const reference = Float64Array.from(Array.from(a).map((val, idx) => val / b[idx]))

		assert.deepStrictEqual(actual, reference)

		// Independent algebraic cross-check: (a[i] / b[i]) * b[i] ≈ a[i]
		for (let i = 0; i < n; i++) {
			const reconstructed = actual[i] * b[i]
			const tol = Math.max(1e-12, Math.abs(a[i]) * 1e-12)
			assert.ok(
				Math.abs(reconstructed - a[i]) <= tol,
				`index ${i}: expected ${reconstructed} to approximate ${a[i]}`
			)
		}
	})
})
