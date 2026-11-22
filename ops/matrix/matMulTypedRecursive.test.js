import { describe, test } from 'node:test'
import assert from 'node:assert'
import { matMulTypedRecursive } from './matMulTypedRecursive.js'

/**
 * Independent triple-loop reference matrix multiplication for verification.
 */
function referenceMatMul(a, b, rowsA, colsA, colsB) {
	const out = new Float64Array(rowsA * colsB)
	for (let i = 0; i < rowsA; i++) {
		for (let j = 0; j < colsB; j++) {
			let sum = 0
			for (let k = 0; k < colsA; k++) {
				sum += a[i * colsA + k] * b[k * colsB + j]
			}
			out[i * colsB + j] = sum
		}
	}
	return out
}

/**
 * Deterministic matrix generator for reproducible tests.
 */
function makeMatrix(rows, cols, seed = 1) {
	const arr = new Float64Array(rows * cols)
	let state = seed >>> 0
	for (let i = 0; i < arr.length; i++) {
		// Linear congruential generator mapped to [-5, 5]
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		arr[i] = ((state / 0xffffffff) * 10) - 5
	}
	return arr
}

/**
 * Creates an n x n identity matrix as a Float64Array.
 */
function identityMatrix(n) {
	const arr = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		arr[i * n + i] = 1
	}
	return arr
}

/**
 * Asserts two Float64Array matrices are element-wise close within tolerance.
 */
function assertMatrixClose(actual, expected, eps = 1e-11) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= eps,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff}`
		)
	}
}

describe('matMulTypedRecursive', () => {
	describe('normal cases', () => {
		test('1x1 matrix multiplication', () => {
			const a = new Float64Array([3.5])
			const b = new Float64Array([-2])
			const c = matMulTypedRecursive(a, b, 1, 1, 1)
			assert.ok(c instanceof Float64Array)
			assert.deepStrictEqual(c, new Float64Array([-7]))
		})

		test('2x2 matrix multiplication', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([5, 6, 7, 8])
			const c = matMulTypedRecursive(a, b, 2, 2, 2)
			assert.deepStrictEqual(c, new Float64Array([19, 22, 43, 50]))
		})

		test('3x3 matrix multiplication with negative and fractional values', () => {
			const a = new Float64Array([
				1, -2, 0.5,
				3, 4, -1,
				0, 2.5, 2,
			])
			const b = new Float64Array([
				2, 0, -1,
				-0.5, 3, 1,
				4, -2, 0.5,
			])
			const expected = new Float64Array([
				5, -7, -2.75,
				0, 14, 0.5,
				6.75, 3.5, 3.5,
			])
			const c = matMulTypedRecursive(a, b, 3, 3, 3)
			assertMatrixClose(c, expected, 1e-12)
		})

		test('rectangular matrices (3x5 * 5x4)', () => {
			const a = new Float64Array([
				1, 2, 3, 4, 5,
				-1, 0, 2, -3, 1,
				4, -2, 1, 0, 3,
			])
			const b = new Float64Array([
				2, -1, 0, 3,
				1, 4, -2, 1,
				0, 2, 5, -1,
				-3, 1, 1, 2,
				4, 0, -3, 1,
			])
			const expected = referenceMatMul(a, b, 3, 5, 4)
			const c = matMulTypedRecursive(a, b, 3, 5, 4)
			assertMatrixClose(c, expected, 1e-12)
		})

		test('dot product (1x4 * 4x1) and outer product (4x1 * 1x3)', () => {
			const row = new Float64Array([1, 2, 3, 4])
			const col = new Float64Array([5, 6, 7, 8])
			assert.deepStrictEqual(
				matMulTypedRecursive(row, col, 1, 4, 1),
				new Float64Array([70])
			)

			const u = new Float64Array([2, -1, 3, 0.5])
			const v = new Float64Array([4, 0, -2])
			assert.deepStrictEqual(
				matMulTypedRecursive(u, v, 4, 1, 3),
				new Float64Array([
					8, 0, -4,
					-4, 0, 2,
					12, 0, -6,
					2, 0, -1,
				])
			)
		})

		test('16x16 matrices exercising deep recursion', () => {
			const a = makeMatrix(16, 16, 42)
			const b = makeMatrix(16, 16, 1337)
			const actual = matMulTypedRecursive(a, b, 16, 16, 16)
			const expected = referenceMatMul(a, b, 16, 16, 16)
			assertMatrixClose(actual, expected, 1e-11)
		})
	})

	describe('edge cases', () => {
		test('identity matrix multiplication (left and right)', () => {
			const a = makeMatrix(5, 5, 7)
			const id = identityMatrix(5)
			assertMatrixClose(matMulTypedRecursive(a, id, 5, 5, 5), a, 0)
			assertMatrixClose(matMulTypedRecursive(id, a, 5, 5, 5), a, 0)

			// Rectangular matrix with left and right identities
			const rect = makeMatrix(3, 6, 11)
			const id3 = identityMatrix(3)
			const id6 = identityMatrix(6)
			assertMatrixClose(matMulTypedRecursive(id3, rect, 3, 3, 6), rect, 0)
			assertMatrixClose(matMulTypedRecursive(rect, id6, 3, 6, 6), rect, 0)
		})

		test('zero matrix multiplication', () => {
			const a = makeMatrix(4, 5, 19)
			const zeroRight = new Float64Array(5 * 3)
			const zeroLeft = new Float64Array(2 * 4)

			assert.deepStrictEqual(
				matMulTypedRecursive(a, zeroRight, 4, 5, 3),
				new Float64Array(4 * 3)
			)
			assert.deepStrictEqual(
				matMulTypedRecursive(zeroLeft, a, 2, 4, 5),
				new Float64Array(2 * 5)
			)
		})

		test('empty dimensions', () => {
			// 0x3 * 3x2 => 0x2 (length 0)
			assert.deepStrictEqual(
				matMulTypedRecursive(new Float64Array(0), makeMatrix(3, 2, 1), 0, 3, 2),
				new Float64Array(0)
			)

			// 2x0 * 0x3 => 2x3 (all zeros)
			assert.deepStrictEqual(
				matMulTypedRecursive(new Float64Array(0), new Float64Array(0), 2, 0, 3),
				new Float64Array(6)
			)

			// 2x3 * 3x0 => 2x0 (length 0)
			assert.deepStrictEqual(
				matMulTypedRecursive(makeMatrix(2, 3, 2), new Float64Array(0), 2, 3, 0),
				new Float64Array(0)
			)

			// 0x0 * 0x0 => 0x0 (length 0)
			assert.deepStrictEqual(
				matMulTypedRecursive(new Float64Array(0), new Float64Array(0), 0, 0, 0),
				new Float64Array(0)
			)
		})

		test('input immutability and fresh output allocation', () => {
			const a = new Float64Array([1, 2, 3, 4, 5, 6])
			const b = new Float64Array([7, 8, 9, 10, 11, 12])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const c = matMulTypedRecursive(a, b, 2, 3, 2)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
			assert.notStrictEqual(c, a)
			assert.notStrictEqual(c, b)
		})

		test('invalid types throw TypeError', () => {
			const valid = new Float64Array([1])

			// Invalid matrix types
			assert.throws(() => matMulTypedRecursive([1], valid, 1, 1, 1), TypeError)
			assert.throws(() => matMulTypedRecursive(valid, [1], 1, 1, 1), TypeError)
			assert.throws(
				() => matMulTypedRecursive(new Float32Array([1]), valid, 1, 1, 1),
				TypeError
			)
			assert.throws(
				() => matMulTypedRecursive(valid, new Int32Array([1]), 1, 1, 1),
				TypeError
			)
			assert.throws(() => matMulTypedRecursive(null, valid, 1, 1, 1), TypeError)
			assert.throws(
				() => matMulTypedRecursive(valid, undefined, 1, 1, 1),
				TypeError
			)

			// Invalid dimension types
			assert.throws(() => matMulTypedRecursive(valid, valid, '1', 1, 1), TypeError)
			assert.throws(() => matMulTypedRecursive(valid, valid, 1, null, 1), TypeError)
			assert.throws(
				() => matMulTypedRecursive(valid, valid, 1, 1, undefined),
				TypeError
			)
			assert.throws(() => matMulTypedRecursive(valid, valid, 1n, 1, 1), TypeError)
		})

		test('invalid dimensions, lengths, and non-finite values throw RangeError', () => {
			const valid = new Float64Array([1])

			// Negative dimensions
			assert.throws(() => matMulTypedRecursive(valid, valid, -1, 1, 1), RangeError)
			assert.throws(() => matMulTypedRecursive(valid, valid, 1, -1, 1), RangeError)
			assert.throws(() => matMulTypedRecursive(valid, valid, 1, 1, -1), RangeError)

			// Non-integer and non-finite dimensions
			assert.throws(() => matMulTypedRecursive(valid, valid, 1.5, 1, 1), RangeError)
			assert.throws(() => matMulTypedRecursive(valid, valid, NaN, 1, 1), RangeError)
			assert.throws(
				() => matMulTypedRecursive(valid, valid, Infinity, 1, 1),
				RangeError
			)
			assert.throws(
				() => matMulTypedRecursive(valid, valid, 1, -Infinity, 1),
				RangeError
			)
			assert.throws(
				() =>
					matMulTypedRecursive(
						valid,
						valid,
						Number.MAX_SAFE_INTEGER + 1,
						1,
						1
					),
				RangeError
			)

			// Length mismatches
			assert.throws(
				() => matMulTypedRecursive(new Float64Array([1, 2, 3]), valid, 2, 2, 1),
				RangeError
			)
			assert.throws(
				() => matMulTypedRecursive(valid, new Float64Array([1, 2]), 1, 1, 1),
				RangeError
			)

			// Non-finite elements in a or b
			assert.throws(
				() => matMulTypedRecursive(new Float64Array([NaN]), valid, 1, 1, 1),
				RangeError
			)
			assert.throws(
				() => matMulTypedRecursive(new Float64Array([Infinity]), valid, 1, 1, 1),
				RangeError
			)
			assert.throws(
				() =>
					matMulTypedRecursive(valid, new Float64Array([-Infinity]), 1, 1, 1),
				RangeError
			)
			assert.throws(
				() =>
					matMulTypedRecursive(
						new Float64Array([1, NaN]),
						new Float64Array(0),
						1,
						2,
						0
					),
				RangeError
			)
		})
	})

	describe('mathematical properties and reference cross-checks', () => {
		test('matches triple-loop reference across diverse shapes', () => {
			const shapes = [
				[1, 7, 1],
				[7, 1, 5],
				[4, 4, 4],
				[5, 7, 3],
				[9, 11, 13],
				[17, 19, 15],
			]

			for (const [m, k, n] of shapes) {
				const a = makeMatrix(m, k, m * 31 + k)
				const b = makeMatrix(k, n, k * 37 + n)
				const actual = matMulTypedRecursive(a, b, m, k, n)
				const expected = referenceMatMul(a, b, m, k, n)
				assertMatrixClose(actual, expected, 1e-11)
			}
		})

		test('satisfies associativity: (A * B) * C === A * (B * C)', () => {
			const a = makeMatrix(5, 7, 101)
			const b = makeMatrix(7, 6, 202)
			const c = makeMatrix(6, 4, 303)

			const ab = matMulTypedRecursive(a, b, 5, 7, 6)
			const ab_c = matMulTypedRecursive(ab, c, 5, 6, 4)

			const bc = matMulTypedRecursive(b, c, 7, 6, 4)
			const a_bc = matMulTypedRecursive(a, bc, 5, 7, 4)

			assertMatrixClose(ab_c, a_bc, 1e-10)
		})
	})
})
