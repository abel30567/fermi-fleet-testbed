import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulTypedIterative } from './matMulTypedIterative.js'

/**
 * Asserts two Float64Arrays have identical lengths and element-wise values within tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [eps=1e-12]
 */
function assertCloseArray(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= eps,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${eps}`,
		)
	}
}

/**
 * Independent 2D array matrix multiplication reference for cross-checking.
 *
 * @param {number[][]} matA
 * @param {number[][]} matB
 * @returns {number[][]}
 */
function referenceMatMul2D(matA, matB) {
	const m = matA.length
	const k = m > 0 ? matA[0].length : matB.length
	const n = k > 0 ? matB[0].length : 0
	const out = Array.from({ length: m }, () => Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = 0
			for (let p = 0; p < k; p++) {
				acc += matA[i][p] * matB[p][j]
			}
			out[i][j] = acc
		}
	}
	return out
}

/**
 * Transposes a row-major Float64Array matrix of shape rows x cols.
 *
 * @param {Float64Array} mat
 * @param {number} rows
 * @param {number} cols
 * @returns {Float64Array}
 */
function transpose(mat, rows, cols) {
	const out = new Float64Array(rows * cols)
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j * rows + i] = mat[i * cols + j]
		}
	}
	return out
}

/**
 * Deterministic LCG pseudo-random Float64Array generator in [-10, 10).
 *
 * @param {number} length
 * @param {number} seed
 * @returns {Float64Array}
 */
function seededMatrix(length, seed) {
	let state = seed >>> 0
	const out = new Float64Array(length)
	for (let i = 0; i < length; i++) {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		out[i] = (state / 0x100000000) * 20 - 10
	}
	return out
}

describe('matMulTypedIterative', () => {
	describe('normal cases', () => {
		test('multiplies 2x2 square matrices', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([5, 6, 7, 8])
			const result = matMulTypedIterative(a, b, 2, 2, 2)
			assert.deepEqual(result, new Float64Array([19, 22, 43, 50]))
		})

		test('multiplies rectangular matrices (2x3 * 3x2 -> 2x2)', () => {
			const a = new Float64Array([1, 2, 3, 4, 5, 6])
			const b = new Float64Array([7, 8, 9, 10, 11, 12])
			const result = matMulTypedIterative(a, b, 2, 3, 2)
			assert.deepEqual(result, new Float64Array([58, 64, 139, 154]))
		})

		test('multiplies rectangular matrices (3x2 * 2x4 -> 3x4)', () => {
			const a = new Float64Array([2, -1, 0, 3, -2, 4])
			const b = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8])
			const result = matMulTypedIterative(a, b, 3, 2, 4)
			assert.deepEqual(
				result,
				new Float64Array([-3, -2, -1, 0, 15, 18, 21, 24, 18, 20, 22, 24]),
			)
		})

		test('handles identity matrix on left and right', () => {
			const a = new Float64Array([2.5, -3.25, 0, 4.125, 7, -1.5])
			const i2 = new Float64Array([1, 0, 0, 1])
			const i3 = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

			assert.deepEqual(matMulTypedIterative(i2, a, 2, 2, 3), a)
			assert.deepEqual(matMulTypedIterative(a, i3, 2, 3, 3), a)
		})

		test('computes inner product (1x4 * 4x1) and outer product (3x1 * 1x3)', () => {
			const row = new Float64Array([1, -2, 3, -4])
			const col = new Float64Array([5, 6, 7, 8])
			assert.deepEqual(matMulTypedIterative(row, col, 1, 4, 1), new Float64Array([-18]))

			const u = new Float64Array([2, 3, 5])
			const v = new Float64Array([7, 11, 13])
			assert.deepEqual(
				matMulTypedIterative(u, v, 3, 1, 3),
				new Float64Array([14, 22, 26, 21, 33, 39, 35, 55, 65]),
			)
		})

		test('does not mutate input Float64Arrays', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([5, 6, 7, 8])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const result = matMulTypedIterative(a, b, 2, 2, 2)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 matrices', () => {
			const a = new Float64Array([-3.5])
			const b = new Float64Array([2])
			assert.deepEqual(matMulTypedIterative(a, b, 1, 1, 1), new Float64Array([-7]))
		})

		test('handles zero matrices', () => {
			const a = new Float64Array([1, 2, 3, 4, 5, 6])
			const zeros = new Float64Array(6)
			assert.deepEqual(matMulTypedIterative(a, zeros, 2, 3, 2), new Float64Array(4))
		})

		test('handles empty dimensions (zero rows, zero inner dim, zero cols)', () => {
			assert.deepEqual(
				matMulTypedIterative(new Float64Array(0), new Float64Array(6), 0, 3, 2),
				new Float64Array(0),
			)
			assert.deepEqual(
				matMulTypedIterative(new Float64Array(6), new Float64Array(0), 2, 3, 0),
				new Float64Array(0),
			)
			assert.deepEqual(
				matMulTypedIterative(new Float64Array(0), new Float64Array(0), 2, 0, 3),
				new Float64Array(6),
			)
			assert.deepEqual(
				matMulTypedIterative(new Float64Array(0), new Float64Array(0), 0, 0, 0),
				new Float64Array(0),
			)
		})

		test('propagates NaN and Infinity per IEEE 754 arithmetic', () => {
			const a = new Float64Array([NaN, 1, 2, 3])
			const b = new Float64Array([1, 0, 0, 1])
			const resNaN = matMulTypedIterative(a, b, 2, 2, 2)
			assert.ok(Number.isNaN(resNaN[0]))
			assert.ok(Number.isNaN(resNaN[1]))
			assert.equal(resNaN[2], 2)
			assert.equal(resNaN[3], 3)

			const inf = new Float64Array([Infinity, 1])
			const pos = new Float64Array([2, 3])
			const resInf = matMulTypedIterative(inf, pos, 1, 2, 1)
			assert.equal(resInf[0], Infinity)
		})

		test('rejects invalid input types', () => {
			const valid = new Float64Array([1, 2, 3, 4])
			assert.throws(() => matMulTypedIterative([1, 2, 3, 4], valid, 2, 2, 2), TypeError)
			assert.throws(() => matMulTypedIterative(valid, [1, 2, 3, 4], 2, 2, 2), TypeError)
			assert.throws(
				() => matMulTypedIterative(new Float32Array([1, 2, 3, 4]), valid, 2, 2, 2),
				TypeError,
			)
			assert.throws(() => matMulTypedIterative(null, valid, 2, 2, 2), TypeError)
			assert.throws(() => matMulTypedIterative(valid, undefined, 2, 2, 2), TypeError)
		})

		test('rejects invalid or mismatched dimensions', () => {
			const valid = new Float64Array([1, 2, 3, 4])
			assert.throws(() => matMulTypedIterative(valid, valid, 1.5, 2, 2), TypeError)
			assert.throws(() => matMulTypedIterative(valid, valid, 2, NaN, 2), TypeError)
			assert.throws(() => matMulTypedIterative(valid, valid, 2, 2, Infinity), TypeError)
			assert.throws(() => matMulTypedIterative(valid, valid, -1, 2, 2), RangeError)
			assert.throws(() => matMulTypedIterative(valid, valid, 2, -2, 2), RangeError)
			assert.throws(() => matMulTypedIterative(valid, valid, 3, 2, 2), RangeError)
			assert.throws(() => matMulTypedIterative(valid, valid, 2, 2, 3), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent 2D array implementation on pseudo-random matrices', () => {
			const shapes = [
				[5, 7, 4],
				[8, 8, 8],
				[1, 13, 6],
				[9, 3, 11],
			]

			for (const [m, k, n] of shapes) {
				const aFlat = seededMatrix(m * k, 100 + m * 31 + k)
				const bFlat = seededMatrix(k * n, 200 + k * 17 + n)

				const a2D = Array.from({ length: m }, (_, i) =>
					Array.from(aFlat.subarray(i * k, (i + 1) * k)),
				)
				const b2D = Array.from({ length: k }, (_, i) =>
					Array.from(bFlat.subarray(i * n, (i + 1) * n)),
				)

				const expectedFlat = referenceMatMul2D(a2D, b2D).flat()
				const actual = matMulTypedIterative(aFlat, bFlat, m, k, n)
				assertCloseArray(actual, expectedFlat, 1e-11)
			}
		})

		test('satisfies matrix algebra identities: associativity, distributivity, and transpose', () => {
			const m = 4
			const k = 5
			const n = 3
			const p = 6

			const A = seededMatrix(m * k, 42)
			const B = seededMatrix(k * n, 43)
			const B2 = seededMatrix(k * n, 44)
			const C = seededMatrix(n * p, 45)

			// Associativity: (A * B) * C == A * (B * C)
			const ab = matMulTypedIterative(A, B, m, k, n)
			const ab_c = matMulTypedIterative(ab, C, m, n, p)
			const bc = matMulTypedIterative(B, C, k, n, p)
			const a_bc = matMulTypedIterative(A, bc, m, k, p)
			assertCloseArray(ab_c, a_bc, 1e-9)

			// Distributivity: A * (B + B2) == A * B + A * B2
			const bPlusB2 = new Float64Array(k * n)
			for (let i = 0; i < k * n; i++) bPlusB2[i] = B[i] + B2[i]
			const lhsDist = matMulTypedIterative(A, bPlusB2, m, k, n)
			const ab2 = matMulTypedIterative(A, B2, m, k, n)
			const rhsDist = new Float64Array(m * n)
			for (let i = 0; i < m * n; i++) rhsDist[i] = ab[i] + ab2[i]
			assertCloseArray(lhsDist, rhsDist, 1e-10)

			// Transpose identity: (A * B)^T == B^T * A^T
			const abT = transpose(ab, m, n)
			const bT = transpose(B, k, n)
			const aT = transpose(A, m, k)
			const bTaT = matMulTypedIterative(bT, aT, n, k, m)
			assertCloseArray(abT, bTaT, 1e-10)
		})
	})
})
