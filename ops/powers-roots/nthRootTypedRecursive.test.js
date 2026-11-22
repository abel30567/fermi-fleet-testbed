import { describe, test } from 'node:test'
import assert from 'node:assert'
import { nthRootTypedRecursive } from './nthRootTypedRecursive.js'

/**
 * Asserts two numbers are approximately equal within an absolute/relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`Expected ${actual} to be within ${tol * scale} of ${expected}`
	)
}

describe('nthRootTypedRecursive', () => {
	test('handles empty Float64Array inputs', () => {
		const values = new Float64Array(0)
		const degrees = new Float64Array(0)
		const result = nthRootTypedRecursive(values, degrees)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, values)
		assert.notStrictEqual(result, degrees)
	})

	test('handles single-element Float64Array inputs', () => {
		const result = nthRootTypedRecursive(
			new Float64Array([81]),
			new Float64Array([4])
		)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 1)
		assertClose(result[0], 3)
	})

	test('handles even-length and odd-length arrays', () => {
		const evenResult = nthRootTypedRecursive(
			new Float64Array([4, 27, 16, 1]),
			new Float64Array([2, 3, 4, 5])
		)
		assert.strictEqual(evenResult.length, 4)
		assertClose(evenResult[0], 2)
		assertClose(evenResult[1], 3)
		assertClose(evenResult[2], 2)
		assertClose(evenResult[3], 1)

		const oddResult = nthRootTypedRecursive(
			new Float64Array([9, 125, 32, 625, 64]),
			new Float64Array([2, 3, 5, 4, 6])
		)
		assert.strictEqual(oddResult.length, 5)
		assertClose(oddResult[0], 3)
		assertClose(oddResult[1], 5)
		assertClose(oddResult[2], 2)
		assertClose(oddResult[3], 5)
		assertClose(oddResult[4], 2)
	})

	test('handles larger arrays cleanly via divide-and-conquer', () => {
		const len = 1025
		const values = new Float64Array(len)
		const degrees = new Float64Array(len)
		for (let i = 0; i < len; i++) {
			const deg = (i % 5) + 1
			const base = (i % 17) + 1
			values[i] = Math.pow(base, deg)
			degrees[i] = deg
		}

		const result = nthRootTypedRecursive(values, degrees)
		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, len)
		for (let i = 0; i < len; i++) {
			assertClose(result[i], (i % 17) + 1, 1e-10)
		}
	})

	test('handles zero values, fractional degrees, and negative degrees', () => {
		const result = nthRootTypedRecursive(
			new Float64Array([0, 0, 4, 8, 16]),
			new Float64Array([2, 3, 0.5, -3, -2])
		)
		assert.strictEqual(result[0], 0)
		assert.strictEqual(result[1], 0)
		assertClose(result[2], 16)
		assertClose(result[3], 0.5)
		assertClose(result[4], 0.25)
	})

	test('handles odd integer roots of negative values cleanly', () => {
		const result = nthRootTypedRecursive(
			new Float64Array([-8, -27, -32, -1, -8, -125]),
			new Float64Array([3, 3, 5, 1, -3, -3])
		)
		assertClose(result[0], -2)
		assertClose(result[1], -3)
		assertClose(result[2], -2)
		assertClose(result[3], -1)
		assertClose(result[4], -0.5)
		assertClose(result[5], -0.2)
	})

	test('rejects negative values with even or non-integer degrees with RangeError', () => {
		assert.throws(
			() =>
				nthRootTypedRecursive(new Float64Array([-4]), new Float64Array([2])),
			RangeError
		)
		assert.throws(
			() =>
				nthRootTypedRecursive(
					new Float64Array([9, -16, 27]),
					new Float64Array([2, 4, 3])
				),
			RangeError
		)
		assert.throws(
			() =>
				nthRootTypedRecursive(new Float64Array([-1]), new Float64Array([-2])),
			RangeError
		)
		assert.throws(
			() =>
				nthRootTypedRecursive(new Float64Array([-8]), new Float64Array([1.5])),
			RangeError
		)
		assert.throws(
			() =>
				nthRootTypedRecursive(new Float64Array([-8]), new Float64Array([3.25])),
			RangeError
		)
	})

	test('rejects zero and non-finite degrees with RangeError', () => {
		for (const badDegree of [0, -0, NaN, Infinity, -Infinity]) {
			assert.throws(
				() =>
					nthRootTypedRecursive(
						new Float64Array([4, 9]),
						new Float64Array([2, badDegree])
					),
				RangeError
			)
		}
	})

	test('rejects non-Float64Array inputs with TypeError', () => {
		const valid = new Float64Array([4, 9])
		const invalidInputs = [
			[4, 9],
			new Float32Array([4, 9]),
			new Int32Array([4, 9]),
			null,
			undefined,
			42,
			'Float64Array',
			{ length: 2, 0: 4, 1: 9 }
		]

		for (const bad of invalidInputs) {
			assert.throws(() => nthRootTypedRecursive(bad, valid), TypeError)
			assert.throws(() => nthRootTypedRecursive(valid, bad), TypeError)
		}
	})

	test('rejects mismatched lengths with RangeError', () => {
		assert.throws(
			() =>
				nthRootTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([2, 2])
				),
			RangeError
		)
		assert.throws(
			() =>
				nthRootTypedRecursive(new Float64Array([]), new Float64Array([2])),
			RangeError
		)
	})

	test('preserves input immutability', () => {
		const values = new Float64Array([16, -27, 0, 81, 100])
		const degrees = new Float64Array([4, 3, 5, 2, -2])
		const valuesSnapshot = new Float64Array(values)
		const degreesSnapshot = new Float64Array(degrees)

		const result = nthRootTypedRecursive(values, degrees)

		assert.deepStrictEqual(values, valuesSnapshot)
		assert.deepStrictEqual(degrees, degreesSnapshot)
		assert.notStrictEqual(result, values)
		assert.notStrictEqual(result, degrees)
	})

	test('cross-check: raising each result to degrees[i] recovers values[i]', () => {
		const values = new Float64Array([
			0, 1, 2, 10, 123.456, 1e6, 1e-6, -1, -8, -27.5, -0.001, 42, 7.5
		])
		const degrees = new Float64Array([
			3, 7, 2, 4, 3.5, 6, 3, 1, 3, 5, -3, -2, 0.5
		])

		const roots = nthRootTypedRecursive(values, degrees)
		assert.strictEqual(roots.length, values.length)

		for (let i = 0; i < values.length; i++) {
			const recovered = Math.pow(roots[i], degrees[i])
			assertClose(recovered, values[i], 1e-10)
		}

		// Larger mixed cross-check covering both positive and negative values
		const n = 257
		const bulkValues = new Float64Array(n)
		const bulkDegrees = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			const isNeg = i % 3 === 0
			const deg = isNeg ? ((i % 4) * 2 + 1) : ((i % 7) + 1) * 0.5
			const magnitude = 0.05 + (i * 1.37) % 500
			bulkValues[i] = isNeg ? -magnitude : magnitude
			bulkDegrees[i] = deg
		}

		const bulkRoots = nthRootTypedRecursive(bulkValues, bulkDegrees)
		for (let i = 0; i < n; i++) {
			const recovered = Math.pow(bulkRoots[i], bulkDegrees[i])
			assertClose(recovered, bulkValues[i], 1e-9)
		}
	})
})
