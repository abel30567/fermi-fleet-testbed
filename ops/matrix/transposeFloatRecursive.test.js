import { describe, test } from 'node:test'
import assert from 'node:assert'
import { transposeFloatRecursive } from './transposeFloatRecursive.js'

/**
 * Independent naive nested-loop transpose for cross-checking.
 *
 * @param {number[][]} M
 * @returns {number[][]}
 */
function naiveTranspose(M) {
	const rows = M.length
	const cols = M[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			out[c][r] = M[r][c]
		}
	}
	return out
}

/**
 * Deterministic LCG generator producing IEEE-754 float64 test matrices.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} seed
 * @returns {number[][]}
 */
function makeDeterministicMatrix(rows, cols, seed = 1337) {
	let state = seed >>> 0
	const nextFloat = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return (state / 0x100000000) * 2000 - 1000
	}
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => nextFloat())
	)
}

describe('transposeFloatRecursive', () => {
	test('transposes square matrices', () => {
		const m2 = [
			[1.5, -2.25],
			[3.75, 4.0],
		]
		assert.deepStrictEqual(transposeFloatRecursive(m2), [
			[1.5, 3.75],
			[-2.25, 4.0],
		])

		const m3 = [
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		]
		assert.deepStrictEqual(transposeFloatRecursive(m3), [
			[1, 4, 7],
			[2, 5, 8],
			[3, 6, 9],
		])
	})

	test('transposes rectangular matrices', () => {
		const m = [
			[1.1, 2.2, 3.3],
			[4.4, 5.5, 6.6],
		]
		assert.deepStrictEqual(transposeFloatRecursive(m), [
			[1.1, 4.4],
			[2.2, 5.5],
			[3.3, 6.6],
		])

		const tall = [
			[10, 20],
			[30, 40],
			[50, 60],
			[70, 80],
		]
		assert.deepStrictEqual(transposeFloatRecursive(tall), [
			[10, 30, 50, 70],
			[20, 40, 60, 80],
		])
	})

	test('transposes row and column vectors (including sizes above base case)', () => {
		const rowVec = [[1.25, 2.5, 3.75, 5.0, 6.25]]
		const colVec = [[1.25], [2.5], [3.75], [5.0], [6.25]]
		assert.deepStrictEqual(transposeFloatRecursive(rowVec), colVec)
		assert.deepStrictEqual(transposeFloatRecursive(colVec), rowVec)

		const longRow = [Array.from({ length: 29 }, (_, i) => i * 0.5 - 7)]
		const longCol = longRow[0].map((v) => [v])
		assert.deepStrictEqual(transposeFloatRecursive(longRow), longCol)
		assert.deepStrictEqual(transposeFloatRecursive(longCol), longRow)
	})

	test('handles 1x1 matrices and special IEEE-754 float64 values', () => {
		assert.deepStrictEqual(transposeFloatRecursive([[42.5]]), [[42.5]])

		const negZeroResult = transposeFloatRecursive([[-0]])
		assert.strictEqual(negZeroResult.length, 1)
		assert.strictEqual(negZeroResult[0].length, 1)
		assert.strictEqual(Object.is(negZeroResult[0][0], -0), true)

		const special = [
			[-0, 0, Number.MIN_VALUE, Number.MAX_VALUE],
			[Infinity, -Infinity, NaN, Number.EPSILON],
			[Math.PI, -Math.SQRT2, -1e-308, 1e308],
		]
		const transposed = transposeFloatRecursive(special)
		assert.strictEqual(transposed.length, 4)
		assert.strictEqual(transposed[0].length, 3)

		// Verify exact bit-level equality including -0 vs +0 and NaN via Object.is
		for (let r = 0; r < special.length; r++) {
			for (let c = 0; c < special[0].length; c++) {
				assert.strictEqual(
					Object.is(transposed[c][r], special[r][c]),
					true,
					`Mismatch at (${c}, ${r})`
				)
			}
		}
	})

	test('does not mutate input matrix and returns an independent copy', () => {
		const input = [
			[1, 2, 3],
			[4, 5, 6],
		]
		const snapshot = input.map((row) => row.slice())
		const result = transposeFloatRecursive(input)

		assert.deepStrictEqual(input, snapshot)
		result[0][0] = 999
		assert.strictEqual(input[0][0], 1)
	})

	test('handles larger non-power-of-2 matrices and matches naive transpose + involution', () => {
		const shapes = [
			[1, 1],
			[7, 13],
			[8, 8],
			[9, 9],
			[17, 29],
			[33, 19],
			[65, 97],
			[101, 67],
		]

		for (let i = 0; i < shapes.length; i++) {
			const [rows, cols] = shapes[i]
			const M = makeDeterministicMatrix(rows, cols, 1000 + i * 7919)
			// Inject -0 into a deterministic cell to test sign preservation through recursion
			M[rows - 1][cols - 1] = -0

			const actual = transposeFloatRecursive(M)
			const expected = naiveTranspose(M)

			assert.strictEqual(actual.length, cols)
			assert.strictEqual(actual[0].length, rows)
			assert.deepStrictEqual(actual, expected)
			assert.strictEqual(Object.is(actual[cols - 1][rows - 1], -0), true)

			// Involution check: (M^T)^T == M
			const doubleTransposed = transposeFloatRecursive(actual)
			assert.deepStrictEqual(doubleTransposed, M)
			assert.strictEqual(
				Object.is(doubleTransposed[rows - 1][cols - 1], -0),
				true
			)
		}
	})

	test('satisfies transpose linearity (A + B)^T == A^T + B^T', () => {
		const rows = 19
		const cols = 23
		const A = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => (r * 3 - c) * 0.25)
		)
		const B = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => (c * 5 + r) * 0.125)
		)
		const sum = A.map((row, r) => row.map((v, c) => v + B[r][c]))

		const lhs = transposeFloatRecursive(sum)
		const At = transposeFloatRecursive(A)
		const Bt = transposeFloatRecursive(B)
		const rhs = At.map((row, r) => row.map((v, c) => v + Bt[r][c]))

		assert.deepStrictEqual(lhs, rhs)
	})

	test('throws validation errors for invalid inputs', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
			assert.throws(() => transposeFloatRecursive(bad), TypeError)
		}

		// Empty matrix or empty rows
		assert.throws(() => transposeFloatRecursive([]), RangeError)
		assert.throws(() => transposeFloatRecursive([[]]), RangeError)
		assert.throws(() => transposeFloatRecursive([[], []]), RangeError)

		// Non-array rows
		assert.throws(() => transposeFloatRecursive([1, 2, 3]), TypeError)
		assert.throws(() => transposeFloatRecursive([[1, 2], null]), TypeError)
		assert.throws(() => transposeFloatRecursive([[1, 2], 'ab']), TypeError)

		// Ragged matrices
		assert.throws(() => transposeFloatRecursive([[1, 2], [3]]), RangeError)
		assert.throws(() => transposeFloatRecursive([[1], [2, 3]]), RangeError)
		assert.throws(
			() => transposeFloatRecursive([[1, 2], [3, 4], [5, 6, 7]]),
			RangeError
		)

		// Non-numeric elements and sparse rows
		assert.throws(() => transposeFloatRecursive([[1, '2']]), TypeError)
		assert.throws(() => transposeFloatRecursive([[true]]), TypeError)
		assert.throws(() => transposeFloatRecursive([[null]]), TypeError)
		assert.throws(() => transposeFloatRecursive([[undefined]]), TypeError)
		assert.throws(() => transposeFloatRecursive([[1n]]), TypeError)
		assert.throws(() => transposeFloatRecursive([[{}]]), TypeError)
		const sparseRow = new Array(3)
		sparseRow[0] = 1
		sparseRow[2] = 3
		assert.throws(() => transposeFloatRecursive([sparseRow]), TypeError)
	})
})
