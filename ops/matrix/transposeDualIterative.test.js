import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeDualIterative } from './transposeDualIterative.js'

/**
 * Helper to create a dual number `{ v, d }`.
 */
function dual(v, d = 0) {
	return { v, d }
}

/**
 * Independent dual matrix multiplication helper:
 * (A * B)_{i,j} = sum_k (A_{i,k} * B_{k,j})
 * where (a_v + a_d ε)(b_v + b_d ε) = (a_v b_v) + (a_v b_d + a_d b_v) ε.
 */
function matMulDual(A, B) {
	const m = A.length
	const kLen = A[0].length
	const n = B[0].length
	const out = new Array(m)
	for (let i = 0; i < m; i += 1) {
		out[i] = new Array(n)
		for (let j = 0; j < n; j += 1) {
			let v = 0
			let d = 0
			for (let k = 0; k < kLen; k += 1) {
				const a = A[i][k]
				const b = B[k][j]
				v += a.v * b.v
				d += a.v * b.d + a.d * b.v
			}
			out[i][j] = { v, d }
		}
	}
	return out
}

/**
 * Helper to compare two dual matrices element-by-element within floating-point tolerance.
 */
function assertDualMatrixClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i += 1) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j += 1) {
			assert.ok(
				Math.abs(actual[i][j].v - expected[i][j].v) <= tol,
				`v mismatch at [${i}][${j}]: got ${actual[i][j].v}, expected ${expected[i][j].v}`
			)
			assert.ok(
				Math.abs(actual[i][j].d - expected[i][j].d) <= tol,
				`d mismatch at [${i}][${j}]: got ${actual[i][j].d}, expected ${expected[i][j].d}`
			)
		}
	}
}

describe('transposeDualIterative', () => {
	describe('normal cases', () => {
		test('transposes a 2x2 square dual matrix', () => {
			const A = [
				[dual(1, 0.5), dual(-2, 3)],
				[dual(4.5, 0), dual(0, -1.25)]
			]
			const expected = [
				[dual(1, 0.5), dual(4.5, 0)],
				[dual(-2, 3), dual(0, -1.25)]
			]
			assert.deepEqual(transposeDualIterative(A), expected)
		})

		test('transposes a 3x3 square dual matrix', () => {
			const A = [
				[dual(1, 10), dual(2, 20), dual(3, 30)],
				[dual(4, 40), dual(5, 50), dual(6, 60)],
				[dual(7, 70), dual(8, 80), dual(9, 90)]
			]
			const expected = [
				[dual(1, 10), dual(4, 40), dual(7, 70)],
				[dual(2, 20), dual(5, 50), dual(8, 80)],
				[dual(3, 30), dual(6, 60), dual(9, 90)]
			]
			assert.deepEqual(transposeDualIterative(A), expected)
		})

		test('transposes a rectangular 2x3 dual matrix into 3x2', () => {
			const A = [
				[dual(1, 2), dual(3, 4), dual(5, 6)],
				[dual(-7, 0.1), dual(0, -0.2), dual(8.5, 0)]
			]
			const expected = [
				[dual(1, 2), dual(-7, 0.1)],
				[dual(3, 4), dual(0, -0.2)],
				[dual(5, 6), dual(8.5, 0)]
			]
			const result = transposeDualIterative(A)
			assert.equal(result.length, 3)
			assert.equal(result[0].length, 2)
			assert.deepEqual(result, expected)
		})

		test('transposes a rectangular 3x2 dual matrix into 2x3', () => {
			const A = [
				[dual(10, -1), dual(20, -2)],
				[dual(30, -3), dual(40, -4)],
				[dual(50, -5), dual(60, -6)]
			]
			const expected = [
				[dual(10, -1), dual(30, -3), dual(50, -5)],
				[dual(20, -2), dual(40, -4), dual(60, -6)]
			]
			assert.deepEqual(transposeDualIterative(A), expected)
		})
	})

	describe('edge cases', () => {
		test('transposes a 1x1 matrix and returns a fresh dual object', () => {
			const A = [[dual(42, -3.5)]]
			const result = transposeDualIterative(A)
			assert.deepEqual(result, [[dual(42, -3.5)]])
			assert.notEqual(result, A)
			assert.notEqual(result[0], A[0])
			assert.notEqual(result[0][0], A[0][0])
		})

		test('transposes a row vector (1xn) into a column vector (nx1)', () => {
			const rowVec = [[dual(1, 0), dual(2, 1), dual(3, -2), dual(4, 0.5)]]
			const colVec = transposeDualIterative(rowVec)
			assert.deepEqual(colVec, [
				[dual(1, 0)],
				[dual(2, 1)],
				[dual(3, -2)],
				[dual(4, 0.5)]
			])
		})

		test('transposes a column vector (nx1) into a row vector (1xn)', () => {
			const colVec = [[dual(-1, 5)], [dual(0, 0)], [dual(2.5, -0.5)]]
			const rowVec = transposeDualIterative(colVec)
			assert.deepEqual(rowVec, [[dual(-1, 5), dual(0, 0), dual(2.5, -0.5)]])
		})

		test('deep-copies dual entries so input and output are independent', () => {
			const A = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)]
			]
			const AT = transposeDualIterative(A)

			// Mutate output
			AT[0][1].v = 999
			AT[0][1].d = -999
			assert.deepEqual(A[1][0], dual(5, 6))

			// Mutate input
			A[0][1].v = -111
			A[0][1].d = 222
			assert.deepEqual(AT[1][0], dual(3, 4))
		})

		test('handles zero derivatives and large finite numbers', () => {
			const A = [
				[dual(0, 0), dual(1e150, 0)],
				[dual(-1e-150, 0), dual(Number.MAX_SAFE_INTEGER, 0)]
			]
			const expected = [
				[dual(0, 0), dual(-1e-150, 0)],
				[dual(1e150, 0), dual(Number.MAX_SAFE_INTEGER, 0)]
			]
			assert.deepEqual(transposeDualIterative(A), expected)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => transposeDualIterative(bad), TypeError)
			}
		})

		test('throws RangeError for empty matrix or empty rows', () => {
			assert.throws(() => transposeDualIterative([]), RangeError)
			assert.throws(() => transposeDualIterative([[]]), RangeError)
			assert.throws(() => transposeDualIterative([[], []]), RangeError)
		})

		test('throws TypeError when any row is not an array', () => {
			assert.throws(() => transposeDualIterative([null]), TypeError)
			assert.throws(() => transposeDualIterative([dual(1, 0)]), TypeError)
			assert.throws(
				() => transposeDualIterative([[dual(1, 0)], 'not-an-array']),
				TypeError
			)
		})

		test('throws RangeError for ragged matrices', () => {
			assert.throws(
				() =>
					transposeDualIterative([
						[dual(1, 0), dual(2, 0)],
						[dual(3, 0)]
					]),
				RangeError
			)
			assert.throws(
				() =>
					transposeDualIterative([
						[dual(1, 0)],
						[dual(2, 0), dual(3, 0)]
					]),
				RangeError
			)
		})

		test('throws TypeError for invalid dual entries', () => {
			const badEntries = [
				null,
				undefined,
				5,
				'1',
				[1, 2],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: null },
				{ v: true, d: 0 }
			]
			for (const entry of badEntries) {
				assert.throws(() => transposeDualIterative([[entry]]), TypeError)
			}
		})

		test('throws TypeError for sparse rows containing holes', () => {
			const sparseRow = new Array(2)
			sparseRow[0] = dual(1, 0)
			assert.throws(() => transposeDualIterative([sparseRow]), TypeError)
		})

		test('throws RangeError for non-finite dual components', () => {
			const nonFiniteEntries = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY }
			]
			for (const entry of nonFiniteEntries) {
				assert.throws(() => transposeDualIterative([[entry]]), RangeError)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		test('involution property: (A^T)^T == A for rectangular and square dual matrices', () => {
			const matrices = [
				[
					[dual(1.2, -0.3), dual(4.5, 2.1), dual(-7.8, 0.0)],
					[dual(0.0, 9.9), dual(-3.14, 1.618), dual(2.718, -0.577)]
				],
				[
					[dual(2, 1), dual(-1, 3)],
					[dual(0, -4), dual(5, 0.25)]
				],
				[[dual(-9, 4), dual(8, -7), dual(6, 5)]]
			]

			for (const A of matrices) {
				const ATT = transposeDualIterative(transposeDualIterative(A))
				assert.deepEqual(ATT, A)
			}
		})

		test('product transpose identity: (A * B)^T == B^T * A^T over dual matrices', () => {
			// A is 2x3, B is 3x4 -> A*B is 2x4, (A*B)^T is 4x2
			const A = [
				[dual(1.5, 0.25), dual(-2.0, 1.0), dual(0.5, -0.75)],
				[dual(3.0, -1.5), dual(0.25, 0.5), dual(-1.25, 2.0)]
			]
			const B = [
				[dual(2.0, -0.5), dual(-1.0, 0.25), dual(0.5, 1.5), dual(3.0, 0.0)],
				[dual(-0.5, 1.0), dual(4.0, -2.0), dual(1.25, 0.75), dual(-2.5, 0.5)],
				[dual(1.0, 0.5), dual(0.0, -1.5), dual(-3.0, 0.25), dual(1.5, -1.0)]
			]

			const lhs = transposeDualIterative(matMulDual(A, B))
			const rhs = matMulDual(
				transposeDualIterative(B),
				transposeDualIterative(A)
			)

			assertDualMatrixClose(lhs, rhs, 1e-12)
		})

		test('central finite-difference derivative matches forward-mode transpose derivative', () => {
			const makeMatrixAt = (t) => [
				[
					dual(Math.sin(t), Math.cos(t)),
					dual(t * t + 3 * t, 2 * t + 3),
					dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t))
				],
				[
					dual(Math.cos(2 * t), -2 * Math.sin(2 * t)),
					dual(1 / (1 + t * t), (-2 * t) / (1 + t * t) ** 2),
					dual(Math.log(1 + t), 1 / (1 + t))
				]
			]

			const t0 = 0.7
			const h = 1e-6
			const transposedDual = transposeDualIterative(makeMatrixAt(t0))
			const transposedPlus = transposeDualIterative(makeMatrixAt(t0 + h))
			const transposedMinus = transposeDualIterative(makeMatrixAt(t0 - h))

			for (let i = 0; i < transposedDual.length; i += 1) {
				for (let j = 0; j < transposedDual[i].length; j += 1) {
					const fd = (transposedPlus[i][j].v - transposedMinus[i][j].v) / (2 * h)
					assert.ok(
						Math.abs(transposedDual[i][j].d - fd) < 1e-8,
						`derivative mismatch at [${i}][${j}]: dual=${transposedDual[i][j].d}, fd=${fd}`
					)
				}
			}
		})
	})
})
