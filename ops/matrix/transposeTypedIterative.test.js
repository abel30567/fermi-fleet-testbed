import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transposeTypedIterative } from './transposeTypedIterative.js'

/**
 * Independent reference matrix multiplication for row-major Float64Arrays:
 * C (m × p) = A (m × n) * B (n × p).
 */
function matMulRef(a, m, n, b, p) {
	const out = new Float64Array(m * p)
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[i * n + k] * b[k * p + j]
			}
			out[i * p + j] = sum
		}
	}
	return out
}

/**
 * Independent Frobenius norm computation: sqrt(sum_i x_i^2).
 */
function frobeniusNorm(arr) {
	let sumSq = 0
	for (let i = 0; i < arr.length; i++) {
		sumSq += arr[i] * arr[i]
	}
	return Math.sqrt(sumSq)
}

/**
 * Independent 2D-nested-array reference transpose.
 */
function transposeVia2DRef(flat, rows, cols) {
	const grid = []
	for (let r = 0; r < rows; r++) {
		grid.push(Array.from(flat.slice(r * cols, (r + 1) * cols)))
	}
	const transposed = []
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows; r++) {
			transposed.push(grid[r][c])
		}
	}
	return new Float64Array(transposed)
}

describe('transposeTypedIterative', () => {
	describe('normal cases', () => {
		it('transposes a 2x3 matrix into a 3x2 matrix', () => {
			// [1, 2, 3]
			// [4, 5, 6]
			const input = new Float64Array([1, 2, 3, 4, 5, 6])
			const result = transposeTypedIterative(input, 2, 3)

			assert.ok(result instanceof Float64Array)
			assert.deepEqual(result, new Float64Array([1, 4, 2, 5, 3, 6]))
		})

		it('transposes a 3x2 matrix into a 2x3 matrix', () => {
			const input = new Float64Array([1, 4, 2, 5, 3, 6])
			const result = transposeTypedIterative(input, 3, 2)

			assert.deepEqual(result, new Float64Array([1, 2, 3, 4, 5, 6]))
		})

		it('transposes a 3x3 square matrix', () => {
			const input = new Float64Array([
				1, 2, 3,
				4, 5, 6,
				7, 8, 9
			])
			const result = transposeTypedIterative(input, 3, 3)

			assert.deepEqual(
				result,
				new Float64Array([
					1, 4, 7,
					2, 5, 8,
					3, 6, 9
				])
			)
		})

		it('transposes a 1xN row vector and an Nx1 column vector as fresh copies', () => {
			const vec = new Float64Array([10, -20.5, 30.25, 0])

			const fromRow = transposeTypedIterative(vec, 1, 4)
			assert.notEqual(fromRow, vec)
			assert.deepEqual(fromRow, vec)

			const fromCol = transposeTypedIterative(vec, 4, 1)
			assert.notEqual(fromCol, vec)
			assert.deepEqual(fromCol, vec)
		})

		it('does not mutate the input matrix', () => {
			const input = new Float64Array([1.5, -2.5, 3.5, 4.5, 5.5, 6.5])
			const snapshot = new Float64Array(input)

			const result = transposeTypedIterative(input, 2, 3)
			assert.notEqual(result, input)
			assert.deepEqual(input, snapshot)
		})

		it('handles a Float64Array subarray view with non-zero byteOffset', () => {
			const backing = new Float64Array([99, 98, 1, 2, 3, 4, 5, 6, 97])
			const view = backing.subarray(2, 8) // 2x3: [1,2,3; 4,5,6]
			const result = transposeTypedIterative(view, 2, 3)

			assert.deepEqual(result, new Float64Array([1, 4, 2, 5, 3, 6]))
		})

		it('transposes a larger non-square 17x13 matrix accurately', () => {
			const rows = 17
			const cols = 13
			const input = new Float64Array(rows * cols)
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					input[r * cols + c] = (r + 1) * 100 + (c + 1) + 0.125
				}
			}

			const result = transposeTypedIterative(input, rows, cols)
			assert.equal(result.length, rows * cols)
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					assert.equal(result[c * rows + r], input[r * cols + c])
				}
			}
		})
	})

	describe('edge cases', () => {
		it('handles empty matrices (0x0, 0xN, Nx0)', () => {
			const empty = new Float64Array(0)

			const r00 = transposeTypedIterative(empty, 0, 0)
			assert.ok(r00 instanceof Float64Array)
			assert.equal(r00.length, 0)
			assert.notEqual(r00, empty)

			const r04 = transposeTypedIterative(empty, 0, 4)
			assert.equal(r04.length, 0)

			const r40 = transposeTypedIterative(empty, 4, 0)
			assert.equal(r40.length, 0)
		})

		it('handles a 1x1 matrix', () => {
			const input = new Float64Array([-42.5])
			const result = transposeTypedIterative(input, 1, 1)

			assert.notEqual(result, input)
			assert.deepEqual(result, new Float64Array([-42.5]))
		})

		it('preserves negative values, signed zero, extreme finite floats, Infinity, and NaN', () => {
			const input = new Float64Array([
				-0,
				Number.MAX_VALUE,
				Number.MIN_VALUE,
				Infinity,
				-Infinity,
				NaN
			])
			const result = transposeTypedIterative(input, 2, 3)

			// Expected 3x2: [-0, Infinity, MAX_VALUE, -Infinity, MIN_VALUE, NaN]
			assert.ok(Object.is(result[0], -0))
			assert.equal(result[1], Infinity)
			assert.equal(result[2], Number.MAX_VALUE)
			assert.equal(result[3], -Infinity)
			assert.equal(result[4], Number.MIN_VALUE)
			assert.ok(Number.isNaN(result[5]))
		})

		it('throws TypeError when matrix is not a Float64Array', () => {
			const invalidMatrices = [
				null,
				undefined,
				[1, 2, 3, 4],
				new Float32Array([1, 2, 3, 4]),
				new Int32Array([1, 2, 3, 4]),
				{ length: 4 },
				'1234'
			]
			for (const bad of invalidMatrices) {
				assert.throws(() => transposeTypedIterative(bad, 2, 2), TypeError)
			}
		})

		it('throws TypeError when rows or cols is not a number', () => {
			const m = new Float64Array([1, 2, 3, 4])
			assert.throws(() => transposeTypedIterative(m, '2', 2), TypeError)
			assert.throws(() => transposeTypedIterative(m, 2, '2'), TypeError)
			assert.throws(() => transposeTypedIterative(m, null, 2), TypeError)
			assert.throws(() => transposeTypedIterative(m, 2, undefined), TypeError)
			assert.throws(() => transposeTypedIterative(m, 2n, 2), TypeError)
		})

		it('throws RangeError for negative, fractional, non-finite, or unsafe dimensions', () => {
			const m = new Float64Array(0)
			assert.throws(() => transposeTypedIterative(m, -1, 0), RangeError)
			assert.throws(() => transposeTypedIterative(m, 0, -2), RangeError)
			assert.throws(() => transposeTypedIterative(m, 1.5, 2), RangeError)
			assert.throws(() => transposeTypedIterative(m, 2, 0.5), RangeError)
			assert.throws(() => transposeTypedIterative(m, NaN, 2), RangeError)
			assert.throws(() => transposeTypedIterative(m, 2, NaN), RangeError)
			assert.throws(() => transposeTypedIterative(m, Infinity, 1), RangeError)
			assert.throws(() => transposeTypedIterative(m, 1, -Infinity), RangeError)
			assert.throws(
				() => transposeTypedIterative(m, Number.MAX_SAFE_INTEGER + 1, 0),
				RangeError
			)
		})

		it('throws RangeError when matrix length does not match rows * cols', () => {
			assert.throws(
				() => transposeTypedIterative(new Float64Array([1, 2, 3]), 2, 2),
				RangeError
			)
			assert.throws(
				() => transposeTypedIterative(new Float64Array([1, 2, 3, 4, 5]), 2, 2),
				RangeError
			)
			assert.throws(
				() => transposeTypedIterative(new Float64Array([1]), 0, 3),
				RangeError
			)
			assert.throws(
				() => transposeTypedIterative(new Float64Array(0), 2 ** 30, 2 ** 30),
				RangeError
			)
		})
	})

	describe('mathematical cross-checks', () => {
		it('satisfies involution: (A^T)^T == A across multiple shapes', () => {
			const shapes = [
				[0, 0],
				[1, 1],
				[1, 5],
				[5, 1],
				[2, 3],
				[4, 4],
				[7, 11]
			]
			for (const [rows, cols] of shapes) {
				const a = new Float64Array(rows * cols)
				for (let i = 0; i < a.length; i++) {
					a[i] = Math.sin(i + 1) * 10 - 3.25
				}
				const at = transposeTypedIterative(a, rows, cols)
				const att = transposeTypedIterative(at, cols, rows)
				assert.deepEqual(att, a)
			}
		})

		it('preserves Frobenius norm: ||A^T||_F == ||A||_F', () => {
			const rows = 5
			const cols = 8
			const a = new Float64Array(rows * cols)
			for (let i = 0; i < a.length; i++) {
				a[i] = (i - 19) * 0.75
			}
			const at = transposeTypedIterative(a, rows, cols)
			const normA = frobeniusNorm(a)
			const normAT = frobeniusNorm(at)

			assert.ok(Math.abs(normAT - normA) <= 1e-12 * Math.max(1, normA))
		})

		it('satisfies linearity: (A + B)^T == A^T + B^T and (cA)^T == c(A^T)', () => {
			const rows = 4
			const cols = 6
			const a = new Float64Array(rows * cols)
			const b = new Float64Array(rows * cols)
			const sum = new Float64Array(rows * cols)
			const scaled = new Float64Array(rows * cols)
			const alpha = -3.5

			for (let i = 0; i < rows * cols; i++) {
				a[i] = i * 1.25 - 7
				b[i] = Math.cos(i) * 4
				sum[i] = a[i] + b[i]
				scaled[i] = alpha * a[i]
			}

			const at = transposeTypedIterative(a, rows, cols)
			const bt = transposeTypedIterative(b, rows, cols)
			const sumT = transposeTypedIterative(sum, rows, cols)
			const scaledT = transposeTypedIterative(scaled, rows, cols)

			for (let i = 0; i < rows * cols; i++) {
				assert.ok(Math.abs(sumT[i] - (at[i] + bt[i])) <= 1e-12)
				assert.ok(Math.abs(scaledT[i] - alpha * at[i]) <= 1e-12)
			}
		})

		it('satisfies reverse-order product identity: (A * B)^T == B^T * A^T', () => {
			const m = 3
			const n = 4
			const p = 5
			const a = new Float64Array(m * n)
			const b = new Float64Array(n * p)
			for (let i = 0; i < a.length; i++) a[i] = ((i * 7) % 11) - 5
			for (let i = 0; i < b.length; i++) b[i] = ((i * 5) % 9) - 4

			const ab = matMulRef(a, m, n, b, p)
			const abT = transposeTypedIterative(ab, m, p)

			const aT = transposeTypedIterative(a, m, n)
			const bT = transposeTypedIterative(b, n, p)
			const bTaT = matMulRef(bT, p, n, aT, m)

			assert.equal(abT.length, bTaT.length)
			for (let i = 0; i < abT.length; i++) {
				assert.ok(Math.abs(abT[i] - bTaT[i]) <= 1e-12)
			}
		})

		it('matches independent 2D-array reference transpose', () => {
			const rows = 6
			const cols = 9
			const a = new Float64Array(rows * cols)
			for (let i = 0; i < a.length; i++) {
				a[i] = (i * 3.14159) - 25.5
			}
			const actual = transposeTypedIterative(a, rows, cols)
			const expected = transposeVia2DRef(a, rows, cols)
			assert.deepEqual(actual, expected)
		})
	})
})
