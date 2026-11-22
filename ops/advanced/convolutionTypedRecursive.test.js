import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionTypedRecursive } from './convolutionTypedRecursive.js'

/**
 * Independent direct O(N * M) discrete linear convolution used as a reference oracle.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function directConvolution(a, b) {
	if (a.length === 0 || b.length === 0) {
		return new Float64Array(0)
	}
	const out = new Float64Array(a.length + b.length - 1)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j]
		}
	}
	return out
}

/**
 * Asserts two Float64Arrays have identical lengths and element-wise values within tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [tolerance=1e-9]
 */
function assertFloat64ArrayClose(actual, expected, tolerance = 1e-9) {
	assert.ok(actual instanceof Float64Array, 'Expected result to be a Float64Array')
	assert.equal(actual.length, expected.length, `Length mismatch: ${actual.length} !== ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tolerance,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${tolerance}`
		)
	}
}

describe('convolutionTypedRecursive', () => {
	describe('normal cases', () => {
		test('convolves equal-length integer-valued Float64Arrays', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5, 6])
			const result = convolutionTypedRecursive(a, b)
			assert.deepEqual(result, new Float64Array([4, 13, 28, 27, 18]))
		})

		test('convolves power-of-two lengths with negative and fractional values', () => {
			const a = new Float64Array([1.5, -2.25, 0.5, 4.0])
			const b = new Float64Array([-0.5, 3.0, -1.25, 2.5])
			const result = convolutionTypedRecursive(a, b)
			const expected = directConvolution(a, b)
			assertFloat64ArrayClose(result, expected, 1e-12)
		})

		test('does not mutate input arrays and returns a new Float64Array', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([1])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)
			const result = convolutionTypedRecursive(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})

		test('handles Float64Array subarray views with non-zero byteOffset', () => {
			const buf = new Float64Array([99, 1, 2, 3, 4, 88])
			const a = buf.subarray(1, 4) // [1, 2, 3]
			const b = buf.subarray(2, 5) // [2, 3, 4]
			const result = convolutionTypedRecursive(a, b)
			assert.deepEqual(result, new Float64Array([2, 7, 16, 17, 12]))
		})
	})

	describe('edge cases', () => {
		test('empty arrays return an empty Float64Array', () => {
			const empty = new Float64Array(0)
			const nonEmpty = new Float64Array([1, 2, 3])

			assert.deepEqual(convolutionTypedRecursive(empty, empty), new Float64Array(0))
			assert.deepEqual(convolutionTypedRecursive(empty, nonEmpty), new Float64Array(0))
			assert.deepEqual(convolutionTypedRecursive(nonEmpty, empty), new Float64Array(0))
		})

		test('single-element arrays', () => {
			assert.deepEqual(
				convolutionTypedRecursive(new Float64Array([3]), new Float64Array([7])),
				new Float64Array([21])
			)
			assert.deepEqual(
				convolutionTypedRecursive(new Float64Array([2.5]), new Float64Array([-4, 0, 2])),
				new Float64Array([-10, 0, 5])
			)
			assert.deepEqual(
				convolutionTypedRecursive(new Float64Array([-4, 0, 2]), new Float64Array([2.5])),
				new Float64Array([-10, 0, 5])
			)
		})

		test('impulse delta (unit impulse and shifted impulse)', () => {
			const signal = new Float64Array([3, -1.5, 0, 7.25, 2])
			const delta = new Float64Array([1])
			assert.deepEqual(convolutionTypedRecursive(signal, delta), signal)
			assert.deepEqual(convolutionTypedRecursive(delta, signal), signal)

			const shiftedDelta = new Float64Array([0, 0, 1, 0])
			assert.deepEqual(
				convolutionTypedRecursive(signal, shiftedDelta),
				new Float64Array([0, 0, 3, -1.5, 0, 7.25, 2, 0])
			)
		})

		test('all-zero arrays produce +0 without negative zero', () => {
			const zeros = new Float64Array([0, 0, 0])
			const neg = new Float64Array([-1, -2, -3, -4])
			const res = convolutionTypedRecursive(zeros, neg)
			assert.equal(res.length, 6)
			for (let i = 0; i < res.length; i++) {
				assert.ok(Object.is(res[i], 0), `Expected +0 at index ${i}, got ${res[i]}`)
			}
		})

		test('unequal lengths (short x long and long x short)', () => {
			const shortArr = new Float64Array([2, -3])
			const longArr = new Float64Array([1, 4, -2, 0, 5, 3, -1, 7, 2])

			const res1 = convolutionTypedRecursive(shortArr, longArr)
			const res2 = convolutionTypedRecursive(longArr, shortArr)
			const expected = directConvolution(shortArr, longArr)

			assert.equal(res1.length, shortArr.length + longArr.length - 1)
			assertFloat64ArrayClose(res1, expected, 1e-12)
			assertFloat64ArrayClose(res2, expected, 1e-12)
		})

		test('commutativity across equal and unequal lengths', () => {
			const pairs = [
				[new Float64Array([1, 2, 3, 4, 5]), new Float64Array([6, 7, 8, 9, 10])],
				[new Float64Array([1.1, -2.2, 3.3]), new Float64Array([0.5, 1.5, -2.5, 3.5, 4.5, -5.5, 6.5])],
				[new Float64Array([42]), new Float64Array([-1, 0, 1, 2, 3, 4])]
			]
			for (const [a, b] of pairs) {
				const ab = convolutionTypedRecursive(a, b)
				const ba = convolutionTypedRecursive(b, a)
				assertFloat64ArrayClose(ab, ba, 1e-12)
			}
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2])
			const invalidInputs = [
				null,
				undefined,
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				'12',
				123,
				{}
			]
			for (const bad of invalidInputs) {
				assert.throws(() => convolutionTypedRecursive(bad, valid), TypeError)
				assert.throws(() => convolutionTypedRecursive(valid, bad), TypeError)
			}
		})

		test('throws RangeError for non-finite values (NaN, Infinity, -Infinity)', () => {
			const valid = new Float64Array([1, 2, 3])
			const nonFiniteArrays = [
				new Float64Array([1, Number.NaN, 3]),
				new Float64Array([Number.POSITIVE_INFINITY, 2]),
				new Float64Array([1, 2, Number.NEGATIVE_INFINITY])
			]
			for (const bad of nonFiniteArrays) {
				assert.throws(() => convolutionTypedRecursive(bad, valid), RangeError)
				assert.throws(() => convolutionTypedRecursive(valid, bad), RangeError)
			}
		})
	})

	describe('cross-check against direct O(N*M) discrete convolution', () => {
		test('matches direct convolution on deterministic pseudo-random signals of varied sizes', () => {
			// Deterministic linear congruential generator for reproducible tests
			let seed = 1337
			const nextFloat = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}

			const shapes = [
				[7, 11],
				[16, 16],
				[31, 13],
				[19, 64],
				[65, 65],
				[128, 97]
			]

			for (const [n, m] of shapes) {
				const signal = new Float64Array(n)
				const kernel = new Float64Array(m)
				for (let i = 0; i < n; i++) signal[i] = nextFloat()
				for (let j = 0; j < m; j++) kernel[j] = nextFloat()

				const actual = convolutionTypedRecursive(signal, kernel)
				const expected = directConvolution(signal, kernel)
				assertFloat64ArrayClose(actual, expected, 1e-9)
			}
		})
	})
})
