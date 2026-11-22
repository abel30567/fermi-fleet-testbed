import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductTypedRecursive } from './tensorProductTypedRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function iterativeTensorProduct(a, b) {
	const out = new Float64Array(a.length * b.length)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i * b.length + j] = a[i] * b[j]
		}
	}
	return out
}

describe('tensorProductTypedRecursive', () => {
	test('computes tensor product for standard vectors', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5])
		const result = tensorProductTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(result, new Float64Array([4, 5, 8, 10, 12, 15]))
	})

	test('handles single-element Float64Arrays', () => {
		const a = new Float64Array([7.5])
		const b = new Float64Array([-2])
		const result = tensorProductTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(result, new Float64Array([-15]))
	})

	test('handles empty Float64Arrays', () => {
		const empty = new Float64Array(0)
		const nonEmpty = new Float64Array([1, 2, 3])

		assert.deepEqual(tensorProductTypedRecursive(empty, empty), new Float64Array(0))
		assert.deepEqual(tensorProductTypedRecursive(empty, nonEmpty), new Float64Array(0))
		assert.deepEqual(tensorProductTypedRecursive(nonEmpty, empty), new Float64Array(0))
	})

	test('handles negative, fractional, and zero values', () => {
		const a = new Float64Array([-1.5, 0, 2.25])
		const b = new Float64Array([-4, 0.5, -0.25])
		const result = tensorProductTypedRecursive(a, b)
		const expected = new Float64Array([
			6, -0.75, 0.375,
			-0, 0, -0,
			-9, 1.125, -0.5625,
		])

		assert.equal(result.length, expected.length)
		for (let i = 0; i < result.length; i++) {
			assert.ok(Object.is(result[i], expected[i]), `Mismatch at index ${i}: ${result[i]} vs ${expected[i]}`)
		}
	})

	test('handles asymmetric dimensions (odd/even lengths, tall and wide)', () => {
		const tallA = new Float64Array([1, 2, 3, 4, 5, 6, 7])
		const tallB = new Float64Array([10, 20])
		assert.deepEqual(
			tensorProductTypedRecursive(tallA, tallB),
			iterativeTensorProduct(tallA, tallB)
		)

		const wideA = new Float64Array([3, -1])
		const wideB = new Float64Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
		assert.deepEqual(
			tensorProductTypedRecursive(wideA, wideB),
			iterativeTensorProduct(wideA, wideB)
		)
	})

	test('does not mutate input Float64Arrays', () => {
		const a = new Float64Array([2, 4, 6])
		const b = new Float64Array([1, 3, 5])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		tensorProductTypedRecursive(a, b)

		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('cross-checks against independent iterative computation on larger inputs', () => {
		// Deterministic pseudo-random values via simple LCG
		let seed = 42
		const nextVal = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return (seed / 0xffffffff - 0.5) * 100
		}

		const a = Float64Array.from({ length: 37 }, nextVal)
		const b = Float64Array.from({ length: 53 }, nextVal)

		const recursiveResult = tensorProductTypedRecursive(a, b)
		const iterativeResult = iterativeTensorProduct(a, b)

		assert.equal(recursiveResult.length, 37 * 53)
		assert.deepEqual(recursiveResult, iterativeResult)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2])

		assert.throws(() => tensorProductTypedRecursive([1, 2], valid), TypeError)
		assert.throws(() => tensorProductTypedRecursive(valid, [1, 2]), TypeError)
		assert.throws(() => tensorProductTypedRecursive(new Float32Array([1, 2]), valid), TypeError)
		assert.throws(() => tensorProductTypedRecursive(valid, new Int32Array([1, 2])), TypeError)
		assert.throws(() => tensorProductTypedRecursive(null, valid), TypeError)
		assert.throws(() => tensorProductTypedRecursive(valid, undefined), TypeError)
		assert.throws(() => tensorProductTypedRecursive('12', valid), TypeError)
		assert.throws(() => tensorProductTypedRecursive(valid, 42), TypeError)
	})

	test('throws RangeError for non-finite elements (NaN, Infinity, -Infinity)', () => {
		const valid = new Float64Array([1, 2])
		const empty = new Float64Array(0)

		assert.throws(
			() => tensorProductTypedRecursive(new Float64Array([1, NaN]), valid),
			RangeError
		)
		assert.throws(
			() => tensorProductTypedRecursive(valid, new Float64Array([Infinity, 2])),
			RangeError
		)
		assert.throws(
			() => tensorProductTypedRecursive(new Float64Array([-Infinity]), valid),
			RangeError
		)
		// Still validates non-empty array even when the other input is empty
		assert.throws(
			() => tensorProductTypedRecursive(empty, new Float64Array([NaN])),
			RangeError
		)
	})
})
