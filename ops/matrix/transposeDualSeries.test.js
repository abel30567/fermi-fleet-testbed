import { describe, test } from 'node:test'
import assert from 'node:assert'
import { transposeDualSeries } from './transposeDualSeries.js'

const dual = (v, d) => ({ v, d })

function mulDual(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

function addDual(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

function matMulDual(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => new Array(n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = dual(0, 0)
			for (let p = 0; p < k; p++) {
				acc = addDual(acc, mulDual(A[i][p], B[p][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

function transposeReal(M) {
	const rows = M.length
	const cols = M[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => M[i][j]),
	)
}

describe('transposeDualSeries', () => {
	describe('normal cases', () => {
		test('transposes a square 2x2 dual matrix', () => {
			const A = [
				[dual(1, 0.5), dual(2, -1)],
				[dual(3, 0), dual(-4, 2.25)],
			]
			const expected = [
				[dual(1, 0.5), dual(3, 0)],
				[dual(2, -1), dual(-4, 2.25)],
			]
			assert.deepStrictEqual(transposeDualSeries(A), expected)
		})

		test('transposes a square 3x3 dual matrix', () => {
			const A = [
				[dual(1, 10), dual(2, 20), dual(3, 30)],
				[dual(4, 40), dual(5, 50), dual(6, 60)],
				[dual(7, 70), dual(8, 80), dual(9, 90)],
			]
			const expected = [
				[dual(1, 10), dual(4, 40), dual(7, 70)],
				[dual(2, 20), dual(5, 50), dual(8, 80)],
				[dual(3, 30), dual(6, 60), dual(9, 90)],
			]
			assert.deepStrictEqual(transposeDualSeries(A), expected)
		})

		test('transposes a rectangular 2x3 dual matrix to 3x2', () => {
			const A = [
				[dual(1, -2), dual(3.5, 0.25), dual(0, 4)],
				[dual(-5, 1), dual(6, -3), dual(7.25, 0)],
			]
			const expected = [
				[dual(1, -2), dual(-5, 1)],
				[dual(3.5, 0.25), dual(6, -3)],
				[dual(0, 4), dual(7.25, 0)],
			]
			assert.deepStrictEqual(transposeDualSeries(A), expected)
		})

		test('transposes a rectangular 3x2 dual matrix to 2x3', () => {
			const A = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)],
				[dual(9, 10), dual(11, 12)],
			]
			const expected = [
				[dual(1, 2), dual(5, 6), dual(9, 10)],
				[dual(3, 4), dual(7, 8), dual(11, 12)],
			]
			assert.deepStrictEqual(transposeDualSeries(A), expected)
		})

		test('transposes a row vector (1x4) to a column vector (4x1)', () => {
			const rowVec = [[dual(1, 0.1), dual(2, 0.2), dual(3, 0.3), dual(4, 0.4)]]
			const expected = [
				[dual(1, 0.1)],
				[dual(2, 0.2)],
				[dual(3, 0.3)],
				[dual(4, 0.4)],
			]
			assert.deepStrictEqual(transposeDualSeries(rowVec), expected)
		})

		test('transposes a column vector (4x1) to a row vector (1x4)', () => {
			const colVec = [
				[dual(-1, 5)],
				[dual(0, -2)],
				[dual(8, 0)],
				[dual(3.5, 1.5)],
			]
			const expected = [
				[dual(-1, 5), dual(0, -2), dual(8, 0), dual(3.5, 1.5)],
			]
			assert.deepStrictEqual(transposeDualSeries(colVec), expected)
		})
	})

	describe('edge cases and immutability', () => {
		test('handles a 1x1 dual matrix', () => {
			const A = [[dual(42, -0.5)]]
			const AT = transposeDualSeries(A)
			assert.deepStrictEqual(AT, [[dual(42, -0.5)]])
			assert.notStrictEqual(AT, A)
			assert.notStrictEqual(AT[0], A[0])
			assert.notStrictEqual(AT[0][0], A[0][0])
		})

		test('returns fresh {v, d} objects without aliasing input objects', () => {
			const A = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)],
			]
			const AT = transposeDualSeries(A)

			for (let i = 0; i < A.length; i++) {
				for (let j = 0; j < A[0].length; j++) {
					assert.notStrictEqual(AT[j][i], A[i][j])
				}
			}

			// Mutating output must not affect input
			AT[0][1].v = 999
			AT[0][1].d = -999
			assert.deepStrictEqual(A[1][0], dual(5, 6))

			// Mutating input must not affect output
			A[0][1].v = 1234
			A[0][1].d = 5678
			assert.deepStrictEqual(AT[1][0], dual(3, 4))
		})

		test('strips extraneous properties on input dual objects', () => {
			const A = [[{ v: 2, d: 3, extra: 'ignored' }]]
			const AT = transposeDualSeries(A)
			assert.deepStrictEqual(Object.keys(AT[0][0]).sort(), ['d', 'v'])
			assert.deepStrictEqual(AT, [[{ v: 2, d: 3 }]])
		})
	})

	describe('input validation', () => {
		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 0 }]) {
				assert.throws(() => transposeDualSeries(bad), TypeError)
			}
		})

		test('rejects empty matrix and matrices with empty rows', () => {
			assert.throws(() => transposeDualSeries([]), RangeError)
			assert.throws(() => transposeDualSeries([[]]), RangeError)
			assert.throws(() => transposeDualSeries([[dual(1, 0)], []]), RangeError)
		})

		test('rejects ragged matrices', () => {
			const ragged1 = [
				[dual(1, 0), dual(2, 0)],
				[dual(3, 0)],
			]
			const ragged2 = [
				[dual(1, 0)],
				[dual(2, 0), dual(3, 0)],
			]
			assert.throws(() => transposeDualSeries(ragged1), RangeError)
			assert.throws(() => transposeDualSeries(ragged2), RangeError)
		})

		test('rejects non-array rows', () => {
			assert.throws(() => transposeDualSeries([dual(1, 0)]), TypeError)
			assert.throws(() => transposeDualSeries([[dual(1, 0)], null]), TypeError)
		})

		test('rejects invalid dual elements', () => {
			const badTypeElements = [
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
				{ v: true, d: 0 },
			]
			for (const el of badTypeElements) {
				assert.throws(() => transposeDualSeries([[el]]), TypeError)
			}

			const badRangeElements = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const el of badRangeElements) {
				assert.throws(() => transposeDualSeries([[el]]), RangeError)
			}
		})

		test('rejects sparse matrices or rows', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparseMatrix = [, [dual(1, 0)]]
			// eslint-disable-next-line no-sparse-arrays
			const sparseRow = [[dual(1, 0), , dual(2, 0)]]
			assert.throws(() => transposeDualSeries(sparseMatrix), TypeError)
			assert.throws(() => transposeDualSeries(sparseRow), TypeError)
		})
	})

	describe('mathematical cross-checks', () => {
		test('involution property: (A^T)^T === A', () => {
			const A = [
				[dual(1.5, -0.25), dual(-2, 3), dual(0, 1)],
				[dual(4.25, 0.5), dual(7, -8), dual(-3.5, 2.5)],
			]
			assert.deepStrictEqual(transposeDualSeries(transposeDualSeries(A)), A)
		})

		test('reverse-order product identity over dual matrices: (A * B)^T === B^T * A^T', () => {
			const A = [
				[dual(1, 0.5), dual(-2, 1.5), dual(3, -1)],
				[dual(0.5, 2), dual(4, -0.5), dual(-1, 3)],
			]
			const B = [
				[dual(2, -1), dual(1.5, 0.25)],
				[dual(-3, 0.5), dual(0, 2)],
				[dual(1, 1), dual(-2.5, -0.75)],
			]

			const lhs = transposeDualSeries(matMulDual(A, B))
			const rhs = matMulDual(transposeDualSeries(B), transposeDualSeries(A))

			assert.strictEqual(lhs.length, rhs.length)
			assert.strictEqual(lhs[0].length, rhs[0].length)
			for (let i = 0; i < lhs.length; i++) {
				for (let j = 0; j < lhs[0].length; j++) {
					assert.ok(Math.abs(lhs[i][j].v - rhs[i][j].v) < 1e-12)
					assert.ok(Math.abs(lhs[i][j].d - rhs[i][j].d) < 1e-12)
				}
			}
		})

		test('central finite-difference verification of d/dt [A(t)^T] = (dA/dt)^T', () => {
			const evalMatrixReal = (t) => [
				[Math.sin(t), Math.exp(0.5 * t), t ** 3 - 2 * t],
				[Math.cos(2 * t), 1 / (1 + t * t), Math.log(2 + t)],
			]

			const evalMatrixDual = (t) => [
				[
					dual(Math.sin(t), Math.cos(t)),
					dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t)),
					dual(t ** 3 - 2 * t, 3 * t * t - 2),
				],
				[
					dual(Math.cos(2 * t), -2 * Math.sin(2 * t)),
					dual(1 / (1 + t * t), (-2 * t) / (1 + t * t) ** 2),
					dual(Math.log(2 + t), 1 / (2 + t)),
				],
			]

			const t0 = 0.7
			const h = 1e-6

			const actual = transposeDualSeries(evalMatrixDual(t0))
			const primalRef = transposeReal(evalMatrixReal(t0))
			const plusRef = transposeReal(evalMatrixReal(t0 + h))
			const minusRef = transposeReal(evalMatrixReal(t0 - h))

			assert.strictEqual(actual.length, primalRef.length)
			assert.strictEqual(actual[0].length, primalRef[0].length)

			for (let i = 0; i < actual.length; i++) {
				for (let j = 0; j < actual[0].length; j++) {
					const fdDeriv = (plusRef[i][j] - minusRef[i][j]) / (2 * h)
					assert.ok(
						Math.abs(actual[i][j].v - primalRef[i][j]) < 1e-12,
						`primal mismatch at [${i}][${j}]`,
					)
					assert.ok(
						Math.abs(actual[i][j].d - fdDeriv) < 1e-8,
						`derivative mismatch at [${i}][${j}]: got ${actual[i][j].d}, expected ~${fdDeriv}`,
					)
				}
			}
		})
	})
})
