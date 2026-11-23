import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddTypedRecursive } from './vectorAddTypedRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function iterativeVectorAdd(a, b) {
	const out = new Float64Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = a[i] + b[i]
	}
	return out
}

describe('vectorAddTypedRecursive', () => {
	test('adds two equal-length Float64Array vectors (even length)', () => {
		const a = new Float64Array([1, 2, 3, 4])
		const b = new Float64Array([10, 20, 30, 40])
		const res = vectorAddTypedRecursive(a, b)

		assert.ok(res instanceof Float64Array)
		assert.deepEqual(res, new Float64Array([11, 22, 33, 44]))
	})

	test('adds two equal-length Float64Array vectors (odd length)', () => {
		const a = new Float64Array([1.5, 2.25, 3.75, 4.5, 5.125])
		const b = new Float64Array([0.5, 0.75, 0.25, 0.5, 0.875])
		const res = vectorAddTypedRecursive(a, b)

		assert.deepEqual(res, new Float64Array([2, 3, 4, 5, 6]))
	})

	test('handles empty Float64Array inputs', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const res = vectorAddTypedRecursive(a, b)

		assert.ok(res instanceof Float64Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('handles single-element Float64Array inputs', () => {
		const a = new Float64Array([42.5])
		const b = new Float64Array([-12.5])
		const res = vectorAddTypedRecursive(a, b)

		assert.deepEqual(res, new Float64Array([30]))
	})

	test('preserves additive identity with zero vector', () => {
		const a = new Float64Array([-3.5, 0, 7.25, 1e12, -1e-12])
		const zero = new Float64Array(a.length)

		assert.deepEqual(vectorAddTypedRecursive(a, zero), a)
		assert.deepEqual(vectorAddTypedRecursive(zero, a), a)
	})

	test('handles negative numbers and additive inverses', () => {
		const a = new Float64Array([-1, -2.5, 3.75, -100, 0])
		const b = new Float64Array([-4, 2.5, -3.75, 100, -5])
		const res = vectorAddTypedRecursive(a, b)

		assert.deepEqual(res, new Float64Array([-5, 0, 0, 0, -5]))
	})

	test('does not mutate inputs and supports aliased inputs (a === b)', () => {
		const a = new Float64Array([1, -2, 3.5, 4])
		const b = new Float64Array([5, 6, -1.5, 8])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		const sum = vectorAddTypedRecursive(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
		assert.notEqual(sum, a)
		assert.notEqual(sum, b)

		const doubled = vectorAddTypedRecursive(a, a)
		assert.deepEqual(doubled, new Float64Array([2, -4, 7, 8]))
		assert.deepEqual(a, aCopy)
	})

	test('works with Float64Array subarrays (non-zero byteOffset)', () => {
		const bufA = new Float64Array([99, 1, 2, 3, 99])
		const bufB = new Float64Array([88, 10, 20, 30, 88])
		const subA = bufA.subarray(1, 4)
		const subB = bufB.subarray(1, 4)

		assert.deepEqual(
			vectorAddTypedRecursive(subA, subB),
			new Float64Array([11, 22, 33]),
		)
	})

	test('handles IEEE-754 special values (Infinity, -Infinity, NaN)', () => {
		const a = new Float64Array([Infinity, -Infinity, Infinity, NaN])
		const b = new Float64Array([1, -1, -Infinity, 5])
		const res = vectorAddTypedRecursive(a, b)

		assert.equal(res[0], Infinity)
		assert.equal(res[1], -Infinity)
		assert.ok(Number.isNaN(res[2]))
		assert.ok(Number.isNaN(res[3]))
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidValues = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			123,
			'123',
			{ length: 3, 0: 1, 1: 2, 2: 3 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => vectorAddTypedRecursive(bad, valid), TypeError)
			assert.throws(() => vectorAddTypedRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(
			() =>
				vectorAddTypedRecursive(
					new Float64Array([1, 2]),
					new Float64Array([1, 2, 3]),
				),
			RangeError,
		)
		assert.throws(
			() =>
				vectorAddTypedRecursive(
					new Float64Array(0),
					new Float64Array([0]),
				),
			RangeError,
		)
	})

	test('cross-check: commutativity (a + b === b + a)', () => {
		const lengths = [0, 1, 2, 3, 7, 16, 31, 128]
		for (const len of lengths) {
			const a = new Float64Array(len)
			const b = new Float64Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = Math.sin(i * 1.3 + 0.5) * 100
				b[i] = Math.cos(i * 0.7 - 1.2) * 100
			}
			assert.deepEqual(
				vectorAddTypedRecursive(a, b),
				vectorAddTypedRecursive(b, a),
			)
		}
	})

	test('cross-check: associativity ((a + b) + c === a + (b + c)) on exact dyadic values', () => {
		// Powers of two / small integers avoid floating-point rounding discrepancies
		const a = new Float64Array([1, -2, 0.5, 4, -8, 16, 0.25, -32, 64])
		const b = new Float64Array([2, 3, -0.25, -4, 1, -8, 0.75, 16, -32])
		const c = new Float64Array([-3, 5, 0.125, 8, 7, -8, -1, 16, -32])

		const left = vectorAddTypedRecursive(vectorAddTypedRecursive(a, b), c)
		const right = vectorAddTypedRecursive(a, vectorAddTypedRecursive(b, c))
		assert.deepEqual(left, right)
	})

	test('cross-check: matches iterative implementation across power-of-two, odd, and large sizes', () => {
		const sizes = [0, 1, 2, 3, 4, 5, 15, 16, 17, 100, 1023, 1024, 10000]
		for (const n of sizes) {
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = (i - n / 2) * 0.375
				b[i] = ((i * 7) % 19 - 9) * 1.125
			}
			const actual = vectorAddTypedRecursive(a, b)
			const expected = iterativeVectorAdd(a, b)
			assert.deepEqual(actual, expected)
		}
	})
})
