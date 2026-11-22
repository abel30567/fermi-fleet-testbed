import { describe, test } from 'node:test'
import assert from 'node:assert'
import { matMulFloatIterative } from './matMulFloatIterative.js'

function assertMatrixClose(actual, expected, eps = 1e-12) {
	assert.strictEqual(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j])
			assert.ok(
				diff <= eps,
				`mismatch at [${i}][${j}]: got ${actual[i][j]}, expected ${expected[i][j]} (diff ${diff} > ${eps})`
			)
		}
	}
}

function transpose(m) {
	const rows = m.length
	const cols = m[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = m[i][j]
		}
	}
	return out
}

function matAdd(a, b) {
	return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

describe('matMulFloatIterative', () => {
	describe('normal cases', () => {
		test('multiplies 2x2 square matrices', () => {
			const a = [
				[1, 2],
				[3, 4]
			]
			const b = [
				[5, 6],
				[7, 8]
			]
			assert.deepStrictEqual(matMulFloatIterative(a, b), [
				[19, 22],
				[43, 50]
			])
		})

		test('multiplies 3x3 square matrices', () => {
			const a = [
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9]
			]
			const b = [
				[9, 8, 7],
				[6, 5, 4],
				[3, 2, 1]
			]
			assert.deepStrictEqual(matMulFloatIterative(a, b), [
				[30, 24, 18],
				[84, 69, 54],
				[138, 114, 90]
			])
		})

		test('multiplies rectangular matrices (2x3 * 3x2 and 3x2 * 2x4)', () => {
			const a = [
				[1, 2, 3],
				[4, 5, 6]
			]
			const b = [
				[7, 8],
				[9, 10],
				[11, 12]
			]
			assert.deepStrictEqual(matMulFloatIterative(a, b), [
				[58, 64],
				[139, 154]
			])

			const c = [
				[1, -2],
				[0, 3],
				[4, 5]
			]
			const d = [
				[2, 0, -1, 3],
				[1, 4, 2, -2]
			]
			assert.deepStrictEqual(matMulFloatIterative(c, d), [
				[0, -8, -5, 7],
				[3, 12, 6, -6],
				[13, 20, 6, 2]
			])
		})

		test('preserves matrix under left and right identity multiplication', () => {
			const m = [
				[1.5, -2.25, 3.75],
				[0, 4.125, -5.5]
			]
			const i2 = [
				[1, 0],
				[0, 1]
			]
			const i3 = [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1]
			]
			assert.deepStrictEqual(matMulFloatIterative(i2, m), m)
			assert.deepStrictEqual(matMulFloatIterative(m, i3), m)
		})

		test('returns zero matrix when multiplied by a zero matrix', () => {
			const a = [
				[2.5, -3.1, 4.2],
				[-1.7, 0.5, 9.8]
			]
			const zeroRight = [
				[0, 0],
				[0, 0],
				[0, 0]
			]
			const zeroLeft = [
				[0, 0],
				[0, 0],
				[0, 0]
			]
			assertMatrixClose(matMulFloatIterative(a, zeroRight), [
				[0, 0],
				[0, 0]
			])
			assertMatrixClose(matMulFloatIterative(zeroLeft, a), [
				[0, 0, 0],
				[0, 0, 0],
				[0, 0, 0]
			])
		})

		test('handles floating-point entries accurately without mutating inputs', () => {
			const a = [
				[0.1, 0.2, -0.3],
				[1.25, -2.5, 0.75]
			]
			const b = [
				[0.5, -1.5],
				[2.0, 0.25],
				[-0.4, 3.2]
			]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const expected = [
				[0.1 * 0.5 + 0.2 * 2.0 + -0.3 * -0.4, 0.1 * -1.5 + 0.2 * 0.25 + -0.3 * 3.2],
				[1.25 * 0.5 + -2.5 * 2.0 + 0.75 * -0.4, 1.25 * -1.5 + -2.5 * 0.25 + 0.75 * 3.2]
			]

			assertMatrixClose(matMulFloatIterative(a, b), expected)
			assert.deepStrictEqual(a, aSnapshot)
			assert.deepStrictEqual(b, bSnapshot)
		})
	})

	describe('edge cases', () => {
		test('multiplies 1x1 matrices', () => {
			assert.deepStrictEqual(matMulFloatIterative([[3.5]], [[-2]]), [[-7]])
		})

		test('multiplies row vector by column vector (1xn * nx1 -> 1x1 dot product)', () => {
			const row = [[1.5, -2, 4, 0.5]]
			const col = [[2], [3], [-1], [8]]
			assert.deepStrictEqual(matMulFloatIterative(row, col), [[-3]])
		})

		test('multiplies column vector by row vector (mx1 * 1xn -> mxn outer product)', () => {
			const col = [[2], [-3], [0.5]]
			const row = [[4, -1, 6]]
			assert.deepStrictEqual(matMulFloatIterative(col, row), [
				[8, -2, 12],
				[-12, 3, -18],
				[2, -0.5, 3]
			])
		})

		test('propagates IEEE-754 special float64 values (NaN, Infinity)', () => {
			const withNaN = matMulFloatIterative([[Number.NaN]], [[1]])
			assert.ok(Number.isNaN(withNaN[0][0]))

			const withInf = matMulFloatIterative([[Number.POSITIVE_INFINITY, 1]], [[2], [3]])
			assert.strictEqual(withInf[0][0], Number.POSITIVE_INFINITY)
		})

		test('throws RangeError for empty matrices', () => {
			assert.throws(() => matMulFloatIterative([], [[1]]), RangeError)
			assert.throws(() => matMulFloatIterative([[1]], []), RangeError)
			assert.throws(() => matMulFloatIterative([[]], [[1]]), RangeError)
			assert.throws(() => matMulFloatIterative([[1]], [[]]), RangeError)
		})

		test('throws RangeError for ragged matrices', () => {
			assert.throws(
				() =>
					matMulFloatIterative(
						[
							[1, 2],
							[3]
						],
						[
							[1],
							[2]
						]
					),
				RangeError
			)
			assert.throws(
				() =>
					matMulFloatIterative(
						[[1, 2]],
						[
							[1, 2],
							[3, 4, 5]
						]
					),
				RangeError
			)
			assert.throws(
				() =>
					matMulFloatIterative(
						[
							[1, 2],
							[]
						],
						[
							[1],
							[2]
						]
					),
				RangeError
			)
		})

		test('throws RangeError for incompatible inner dimensions', () => {
			assert.throws(
				() =>
					matMulFloatIterative(
						[
							[1, 2, 3],
							[4, 5, 6]
						],
						[
							[1, 2],
							[3, 4]
						]
					),
				RangeError
			)
			assert.throws(() => matMulFloatIterative([[1, 2]], [[3, 4]]), RangeError)
		})

		test('throws TypeError for non-2D-array inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, [1, 2, 3]]) {
				assert.throws(() => matMulFloatIterative(bad, [[1]]), TypeError)
				assert.throws(() => matMulFloatIterative([[1]], bad), TypeError)
			}
			assert.throws(
				() => matMulFloatIterative([[1, 2], 'not-a-row'], [[1], [2]]),
				TypeError
			)
			assert.throws(
				() => matMulFloatIterative([[1, 2]], [[1], null]),
				TypeError
			)
		})

		test('throws TypeError for non-number elements including sparse holes', () => {
			const badValues = ['1', true, null, undefined, {}, [], 1n, Symbol('x')]
			for (const bad of badValues) {
				assert.throws(() => matMulFloatIterative([[1, bad]], [[1], [2]]), TypeError)
				assert.throws(() => matMulFloatIterative([[1, 2]], [[1], [bad]]), TypeError)
			}

			const sparseRow = new Array(2)
			sparseRow[0] = 1
			assert.throws(() => matMulFloatIterative([sparseRow], [[1], [2]]), TypeError)
		})
	})

	describe('algebraic cross-checks', () => {
		const a = [
			[1.2, -0.5, 3.4, 2.1],
			[-2.3, 4.1, 0.7, -1.8],
			[0.9, -3.2, 2.6, 5.0]
		]
		const b = [
			[0.4, -1.7],
			[2.5, 3.1],
			[-0.8, 1.9],
			[4.2, -2.6]
		]
		const c = [
			[1.1, -0.3, 2.8, -1.4, 0.6],
			[-2.2, 3.5, -0.9, 4.0, 1.3]
		]

		test('satisfies associativity: (A * B) * C ≈ A * (B * C)', () => {
			const left = matMulFloatIterative(matMulFloatIterative(a, b), c)
			const right = matMulFloatIterative(a, matMulFloatIterative(b, c))
			assertMatrixClose(left, right, 1e-11)
		})

		test('satisfies transpose identity: (A * B)^T ≈ B^T * A^T', () => {
			const abT = transpose(matMulFloatIterative(a, b))
			const bTaT = matMulFloatIterative(transpose(b), transpose(a))
			assertMatrixClose(abT, bTaT, 1e-12)
		})

		test('satisfies distributivity: A * (B + D) ≈ A * B + A * D', () => {
			const d = [
				[-1.5, 2.2],
				[0.3, -4.1],
				[3.7, 0.8],
				[-2.9, 1.4]
			]
			const left = matMulFloatIterative(a, matAdd(b, d))
			const right = matAdd(matMulFloatIterative(a, b), matMulFloatIterative(a, d))
			assertMatrixClose(left, right, 1e-11)
		})
	})
})
