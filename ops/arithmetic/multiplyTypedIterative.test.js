import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyTypedIterative } from './multiplyTypedIterative.js'

describe('multiplyTypedIterative', () => {
	test('multiplies positive, negative, and fractional Float64Arrays element-wise', () => {
		const a = new Float64Array([1, -2, 3.5, 0.25, -4.5])
		const b = new Float64Array([5, 6, -2, 8, -2])
		const out = multiplyTypedIterative(a, b)

		assert.ok(out instanceof Float64Array)
		assert.deepEqual(out, new Float64Array([5, -12, -7, 2, 9]))
	})

	test('does not mutate inputs and works when both arguments alias the same array', () => {
		const a = new Float64Array([2, -3, 4.5])
		const b = new Float64Array([10, 20, 2])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		const out = multiplyTypedIterative(a, b)
		assert.notEqual(out, a)
		assert.notEqual(out, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)

		const squared = multiplyTypedIterative(a, a)
		assert.deepEqual(squared, new Float64Array([4, 9, 20.25]))
		assert.deepEqual(a, aCopy)
	})

	test('handles empty Float64Arrays', () => {
		const out = multiplyTypedIterative(new Float64Array(0), new Float64Array(0))
		assert.ok(out instanceof Float64Array)
		assert.equal(out.length, 0)
	})

	test('handles signed zeros, Infinity, NaN, overflow, and subnormals', () => {
		const a = new Float64Array([0, -0, Infinity, -Infinity, 0, NaN, 1e308, 1e-308])
		const b = new Float64Array([-1, -0, 2, -3, Infinity, 5, 1e10, 1e-20])
		const out = multiplyTypedIterative(a, b)

		assert.ok(Object.is(out[0], -0))
		assert.ok(Object.is(out[1], 0))
		assert.equal(out[2], Infinity)
		assert.equal(out[3], Infinity)
		assert.ok(Number.isNaN(out[4]))
		assert.ok(Number.isNaN(out[5]))
		assert.equal(out[6], Infinity)
		assert.equal(out[7], 1e-308 * 1e-20)
	})

	test('handles Float64Array subarrays with non-zero byte offsets', () => {
		const bufA = new Float64Array([99, 2, 3, 4, 88])
		const bufB = new Float64Array([77, 66, 10, 20, 30])
		const subA = bufA.subarray(1, 4)
		const subB = bufB.subarray(2, 5)

		const out = multiplyTypedIterative(subA, subB)
		assert.deepEqual(out, new Float64Array([20, 60, 120]))
	})

	test('validates that both inputs are Float64Array instances', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidValues = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			42,
			'123',
			{ length: 3, 0: 1, 1: 2, 2: 3 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => multiplyTypedIterative(bad, valid), TypeError)
			assert.throws(() => multiplyTypedIterative(valid, bad), TypeError)
		}
	})

	test('throws RangeError on mismatched input lengths', () => {
		assert.throws(
			() => multiplyTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
			RangeError,
		)
		assert.throws(
			() => multiplyTypedIterative(new Float64Array([1]), new Float64Array(0)),
			RangeError,
		)
	})

	test('independent cross-check against Array.from reference and algebraic identities', () => {
		// Deterministic PRNG (LCG) for reproducible pseudo-random float values
		let seed = 0x12345678
		const nextFloat = () => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
			return (seed / 0xffffffff) * 2000 - 1000
		}

		for (const n of [1, 7, 64, 513]) {
			const a = Float64Array.from({ length: n }, nextFloat)
			const b = Float64Array.from({ length: n }, nextFloat)
			const ones = new Float64Array(n).fill(1)

			const actual = multiplyTypedIterative(a, b)
			const reference = Float64Array.from(Array.from(a, (val, idx) => val * b[idx]))
			assert.deepEqual(actual, reference)

			// Commutativity: a * b === b * a
			assert.deepEqual(actual, multiplyTypedIterative(b, a))

			// Multiplicative identity: a * 1 === a
			assert.deepEqual(multiplyTypedIterative(a, ones), a)
		}
	})
})
