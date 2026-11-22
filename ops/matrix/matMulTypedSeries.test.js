import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulTypedSeries } from './matMulTypedSeries.js'

/**
 * Transposes a single or batched series of row-major Float64Array matrices.
 */
function transposeSeries(arr, rows, cols) {
	const size = rows * cols
	const count = arr.length / size
	const out = new Float64Array(arr.length)
	for (let m = 0; m < count; m++) {
		const base = m * size
		for (let i = 0; i < rows; i++) {
			for (let j = 0; j < cols; j++) {
				out[base + j * rows + i] = arr[base + i * cols + j]
			}
		}
	}
	return out
}

/**
 * Asserts two Float64Arrays have equal length and close element-wise values.
 */
function assertCloseArray(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'Expected result to be a Float64Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tol,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${tol}`,
		)
	}
}

describe('matMulTypedSeries', () => {
	describe('normal cases', () => {
		test('multiplies 2x2 square matrices', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([5, 6, 7, 8])
			const result = matMulTypedSeries(a, b, 2, 2, 2)
			assert.deepEqual(result, new Float64Array([19, 22, 43, 50]))
		})

		test('multiplies 3x3 square matrices and supports aliased input (A * A)', () => {
			const a = new Float64Array([2, -1, 0, -1, 2, -1, 0, -1, 2])
			const result = matMulTypedSeries(a, a, 3, 3, 3)
			assert.deepEqual(result, new Float64Array([5, -4, 1, -4, 6, -4, 1, -4, 5]))
		})

		test('multiplies rectangular matrices (2x3 * 3x4 -> 2x4)', () => {
			const a = new Float64Array([1, 2, 3, 4, 5, 6])
			const b = new Float64Array([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
			const result = matMulTypedSeries(a, b, 2, 3, 4)
			assert.deepEqual(
				result,
				new Float64Array([74, 80, 86, 92, 173, 188, 203, 218]),
			)
		})

		test('computes inner product (1x4 * 4x1 -> 1x1) and outer product (3x1 * 1x3 -> 3x3)', () => {
			const row = new Float64Array([1, -2, 3, -4])
			const col = new Float64Array([5, 6, 7, 8])
			assert.deepEqual(matMulTypedSeries(row, col, 1, 4, 1), new Float64Array([-18]))

			const u = new Float64Array([2, 3, 5])
			const v = new Float64Array([7, 11, 13])
			assert.deepEqual(
				matMulTypedSeries(u, v, 3, 1, 3),
				new Float64Array([14, 22, 26, 21, 33, 39, 35, 55, 65]),
			)
		})

		test('multiplies a batched series of rectangular matrices without mutating inputs', () => {
			// Batch of 3 pairs of (2x3) * (3x2) -> (2x2)
			const a = new Float64Array([
				// batch 0
				1, 2, 3, 4, 5, 6,
				// batch 1
				0, 1, 0, 2, 0, 3,
				// batch 2
				-1, 0.5, 2, 3, -2, 0.25,
			])
			const b = new Float64Array([
				// batch 0
				7, 8, 9, 10, 11, 12,
				// batch 1
				1, 2, 3, 4, 5, 6,
				// batch 2
				4, -2, 6, 8, -1, 0.5,
			])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const result = matMulTypedSeries(a, b, 2, 3, 2)
			assert.equal(result.length, 3 * 2 * 2)
			assert.deepEqual(
				result,
				new Float64Array([
					// batch 0
					58, 64, 139, 154,
					// batch 1
					3, 4, 17, 22,
					// batch 2
					-3, 7, -0.25, -21.875,
				]),
			)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})

		test('uses compensated summation to avoid catastrophic cancellation', () => {
			// Naive left-to-right sum of [1, 1e16, 1, -1e16] gives 0 instead of 2.
			const a = new Float64Array([1, 1e16, 1, -1e16])
			const b = new Float64Array([1, 1, 1, 1])
			const result = matMulTypedSeries(a, b, 1, 4, 1)
			assert.equal(result[0], 2)
		})
	})

	describe('edge cases', () => {
		test('handles empty batch (length 0 inputs)', () => {
			const result = matMulTypedSeries(new Float64Array(0), new Float64Array(0), 3, 4, 2)
			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 0)
		})

		test('handles 1x1 single and batched matrices', () => {
			assert.deepEqual(
				matMulTypedSeries(new Float64Array([6]), new Float64Array([-7]), 1, 1, 1),
				new Float64Array([-42]),
			)
			assert.deepEqual(
				matMulTypedSeries(
					new Float64Array([2, -3, 0.5]),
					new Float64Array([4, 5, -8]),
					1,
					1,
					1,
				),
				new Float64Array([8, -15, -4]),
			)
		})

		test('preserves matrix when multiplied by identity matrix on left or right', () => {
			const a = new Float64Array([1.5, -2.25, 3.75, 4, 5.5, -6])
			const id2 = new Float64Array([1, 0, 0, 1])
			const id3 = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

			assert.deepEqual(matMulTypedSeries(id2, a, 2, 2, 3), a)
			assert.deepEqual(matMulTypedSeries(a, id3, 2, 3, 3), a)
		})

		test('produces zero matrix when multiplied by zero matrix', () => {
			const a = new Float64Array([1, 2, 3, 4, 5, 6])
			const zero3x2 = new Float64Array(6)
			const zero2x2 = new Float64Array(4)

			assert.deepEqual(matMulTypedSeries(a, zero3x2, 2, 3, 2), new Float64Array(4))
			assert.deepEqual(matMulTypedSeries(zero2x2, a, 2, 2, 3), new Float64Array(6))
		})

		test('preserves IEEE 754 non-finite semantics without spurious NaN from compensation', () => {
			const a = new Float64Array([Infinity, 1])
			const b = new Float64Array([2, 3])
			const res = matMulTypedSeries(a, b, 1, 2, 1)
			assert.equal(res[0], Infinity)

			const nanRes = matMulTypedSeries(new Float64Array([NaN]), new Float64Array([1]), 1, 1, 1)
			assert.ok(Number.isNaN(nanRes[0]))
		})

		test('throws TypeError on non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2, 3, 4])
			for (const bad of [[1, 2, 3, 4], new Float32Array([1, 2, 3, 4]), null, undefined, {}]) {
				assert.throws(() => matMulTypedSeries(bad, valid, 2, 2, 2), TypeError)
				assert.throws(() => matMulTypedSeries(valid, bad, 2, 2, 2), TypeError)
			}
		})

		test('throws TypeError on non-number dimensions and RangeError on invalid dimensions', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([1, 2, 3, 4])

			assert.throws(() => matMulTypedSeries(a, b, '2', 2, 2), TypeError)
			assert.throws(() => matMulTypedSeries(a, b, 2, null, 2), TypeError)
			assert.throws(() => matMulTypedSeries(a, b, 2, 2, undefined), TypeError)

			for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
				assert.throws(() => matMulTypedSeries(a, b, bad, 2, 2), RangeError)
				assert.throws(() => matMulTypedSeries(a, b, 2, bad, 2), RangeError)
				assert.throws(() => matMulTypedSeries(a, b, 2, 2, bad), RangeError)
			}
		})

		test('throws RangeError on incompatible lengths or mismatched batch counts', () => {
			// Not divisible by matrix size
			assert.throws(
				() => matMulTypedSeries(new Float64Array(5), new Float64Array(4), 2, 2, 2),
				RangeError,
			)
			assert.throws(
				() => matMulTypedSeries(new Float64Array(4), new Float64Array(5), 2, 2, 2),
				RangeError,
			)
			// Different batch counts (2 vs 1)
			assert.throws(
				() => matMulTypedSeries(new Float64Array(8), new Float64Array(4), 2, 2, 2),
				RangeError,
			)
			// One empty batch, one non-empty batch
			assert.throws(
				() => matMulTypedSeries(new Float64Array(0), new Float64Array(4), 2, 2, 2),
				RangeError,
			)
		})
	})

	describe('mathematical identity cross-checks', () => {
		test('associativity identity: (A * B) * C === A * (B * C) over batched series', () => {
			// Batch of 3: A is 2x3, B is 3x4, C is 4x2
			const a = new Float64Array([
				1.2, -0.5, 2.3, 0.7, 3.1, -1.4,
				-2.0, 1.5, 0.25, 4.0, -0.75, 2.5,
				0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
			])
			const b = new Float64Array([
				0.5, -1.1, 2.0, 0.3, -0.8, 1.4, -0.2, 3.0, 1.7, 0.6, -2.5, 0.9,
				2.1, 0.4, -1.3, 1.8, 0.9, -2.2, 1.1, -0.5, -0.6, 3.3, 0.8, -1.7,
				1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0,
			])
			const c = new Float64Array([
				-1.5, 0.8, 2.2, -0.4, 0.7, 1.9, -2.3, 0.6,
				0.3, -1.2, 1.4, 2.5, -0.9, 0.1, 3.1, -1.6,
				-0.5, 1.5, -2.5, 3.5, 0.25, -0.75, 1.25, -1.75,
			])

			const ab = matMulTypedSeries(a, b, 2, 3, 4)
			const lhs = matMulTypedSeries(ab, c, 2, 4, 2)

			const bc = matMulTypedSeries(b, c, 3, 4, 2)
			const rhs = matMulTypedSeries(a, bc, 2, 3, 2)

			assertCloseArray(lhs, rhs, 1e-11)
		})

		test('transpose identity: (A * B)^T === B^T * A^T over batched series', () => {
			// Batch of 2: A is 3x4, B is 4x2
			const a = new Float64Array([
				1.5, -2.0, 0.75, 3.25, -1.25, 4.0, 2.5, -0.5, 0.25, -3.5, 1.75, 2.0,
				-0.8, 1.2, 2.4, -3.6, 0.5, -1.5, 2.5, 3.5, 4.1, -0.9, 1.3, -2.7,
			])
			const b = new Float64Array([
				2.0, -1.5, 0.5, 3.0, -2.5, 1.0, 4.0, -0.25,
				-1.1, 2.2, 3.3, -0.4, 0.7, -1.8, 2.9, 1.6,
			])

			const ab = matMulTypedSeries(a, b, 3, 4, 2)
			const abT = transposeSeries(ab, 3, 2)

			const bT = transposeSeries(b, 4, 2)
			const aT = transposeSeries(a, 3, 4)
			const bTaT = matMulTypedSeries(bT, aT, 2, 4, 3)

			assertCloseArray(abT, bTaT, 1e-12)
		})

		test('distributivity identity: A * (B + C) === A * B + A * C', () => {
			const a = new Float64Array([1.3, -2.7, 0.9, 4.1, -0.6, 2.2])
			const b = new Float64Array([0.5, 1.5, -2.5, 3.5, 0.25, -1.75])
			const c = new Float64Array([-1.2, 0.8, 3.1, -0.4, 2.6, 1.1])
			const bPlusC = Float64Array.from(b, (val, idx) => val + c[idx])

			const lhs = matMulTypedSeries(a, bPlusC, 2, 3, 2)
			const ab = matMulTypedSeries(a, b, 2, 3, 2)
			const ac = matMulTypedSeries(a, c, 2, 3, 2)
			const rhs = Float64Array.from(ab, (val, idx) => val + ac[idx])

			assertCloseArray(lhs, rhs, 1e-12)
		})
	})
})
