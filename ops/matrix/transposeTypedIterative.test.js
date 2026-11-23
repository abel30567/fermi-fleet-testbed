import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeTypedIterative } from './transposeTypedIterative.js'

/**
 * Independent reference implementation using nested 2D arrays.
 * @param {Float64Array} flat
 * @param {number} rows
 * @param {number} cols
 * @returns {Float64Array}
 */
function referenceTranspose2D(flat, rows, cols) {
	const grid = Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) => flat[r * cols + c]),
	)
	const transposedGrid = Array.from({ length: cols }, (_, c) =>
		Array.from({ length: rows }, (_, r) => grid[r][c]),
	)
	return Float64Array.from(transposedGrid.flat())
}

/**
 * Helper for matrix-vector product (row-major matrix of shape rows x cols).
 * @param {Float64Array} mat
 * @param {number} rows
 * @param {number} cols
 * @param {Float64Array} vec
 * @returns {Float64Array}
 */
function matVec(mat, rows, cols, vec) {
	const out = new Float64Array(rows)
	for (let r = 0; r < rows; r++) {
		let sum = 0
		for (let c = 0; c < cols; c++) {
			sum += mat[r * cols + c] * vec[c]
		}
		out[r] = sum
	}
	return out
}

/**
 * Helper for dot product of two equal-length Float64Arrays.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number}
 */
function dot(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

describe('transposeTypedIterative', () => {
	test('transposes a 2x3 rectangular matrix', () => {
		const input = new Float64Array([1, 2, 3, 4, 5, 6])
		const output = transposeTypedIterative(input, 2, 3)

		assert.ok(output instanceof Float64Array)
		assert.deepEqual(output, new Float64Array([1, 4, 2, 5, 3, 6]))
		// Ensure input is not mutated
		assert.deepEqual(input, new Float64Array([1, 2, 3, 4, 5, 6]))
		assert.notEqual(output, input)
	})

	test('transposes a 3x2 rectangular matrix', () => {
		const input = new Float64Array([10, 20, 30, 40, 50, 60])
		const output = transposeTypedIterative(input, 3, 2)

		assert.deepEqual(output, new Float64Array([10, 30, 50, 20, 40, 60]))
	})

	test('transposes a 3x3 square matrix', () => {
		const input = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
		const output = transposeTypedIterative(input, 3, 3)

		assert.deepEqual(output, new Float64Array([1, 4, 7, 2, 5, 8, 3, 6, 9]))
	})

	test('handles 1x1 matrix, row vector (1xN), and column vector (Nx1)', () => {
		assert.deepEqual(
			transposeTypedIterative(new Float64Array([42.5]), 1, 1),
			new Float64Array([42.5]),
		)

		const rowVec = new Float64Array([1.5, -2.5, 3.5, 4.5])
		assert.deepEqual(transposeTypedIterative(rowVec, 1, 4), rowVec)
		assert.deepEqual(transposeTypedIterative(rowVec, 4, 1), rowVec)
	})

	test('handles empty matrices (0x0, 0xN, Nx0)', () => {
		const empty = new Float64Array(0)
		assert.deepEqual(transposeTypedIterative(empty, 0, 0), new Float64Array(0))
		assert.deepEqual(transposeTypedIterative(empty, 0, 5), new Float64Array(0))
		assert.deepEqual(transposeTypedIterative(empty, 5, 0), new Float64Array(0))
	})

	test('preserves special IEEE 754 float64 values (NaN, +/-Infinity, -0)', () => {
		const input = new Float64Array([NaN, Infinity, -Infinity, -0])
		const output = transposeTypedIterative(input, 2, 2)

		assert.ok(Number.isNaN(output[0]))
		assert.equal(output[1], -Infinity)
		assert.equal(output[2], Infinity)
		assert.ok(Object.is(output[3], -0))
	})

	test('validates inputs and throws appropriate errors', () => {
		assert.throws(
			() => transposeTypedIterative([1, 2, 3, 4], 2, 2),
			TypeError,
		)
		assert.throws(
			() => transposeTypedIterative(new Float32Array([1, 2, 3, 4]), 2, 2),
			TypeError,
		)
		assert.throws(() => transposeTypedIterative(null, 0, 0), TypeError)

		const mat = new Float64Array([1, 2, 3, 4])
		assert.throws(() => transposeTypedIterative(mat, -1, 4), RangeError)
		assert.throws(() => transposeTypedIterative(mat, 2, -2), RangeError)
		assert.throws(() => transposeTypedIterative(mat, 1.5, 2), RangeError)
		assert.throws(() => transposeTypedIterative(mat, 2, NaN), RangeError)
		assert.throws(() => transposeTypedIterative(mat, 2, Infinity), RangeError)
		assert.throws(() => transposeTypedIterative(mat, 3, 2), RangeError)
		assert.throws(() => transposeTypedIterative(mat, 1, 1), RangeError)
	})

	test('cross-check: involution property (A^T)^T === A and matches 2D reference', () => {
		const shapes = [
			[1, 7],
			[7, 1],
			[4, 4],
			[5, 9],
			[13, 6],
			[37, 29],
		]

		for (const [rows, cols] of shapes) {
			const data = new Float64Array(rows * cols)
			for (let i = 0; i < data.length; i++) {
				// Deterministic non-trivial floating-point values
				data[i] = Math.sin(i * 1.37 + rows) * 100 - cols * 0.25
			}

			const transposed = transposeTypedIterative(data, rows, cols)
			const expected = referenceTranspose2D(data, rows, cols)
			assert.deepEqual(transposed, expected)

			const roundTrip = transposeTypedIterative(transposed, cols, rows)
			assert.deepEqual(roundTrip, data)
		}
	})

	test('cross-check: satisfies adjoint identity <Ax, y> === <x, A^T y>', () => {
		const rows = 6
		const cols = 4
		const A = Float64Array.from(
			{ length: rows * cols },
			(_, i) => ((i * 7 + 3) % 19) - 9,
		)
		const x = new Float64Array([1.5, -2.0, 0.5, 4.0])
		const y = new Float64Array([-1.0, 2.5, 3.0, -0.5, 1.25, -3.75])

		const AT = transposeTypedIterative(A, rows, cols)
		const lhs = dot(matVec(A, rows, cols, x), y)
		const rhs = dot(x, matVec(AT, cols, rows, y))

		assert.ok(
			Math.abs(lhs - rhs) < 1e-12,
			`Expected <Ax, y> (${lhs}) to equal <x, A^T y> (${rhs})`,
		)
	})
})
