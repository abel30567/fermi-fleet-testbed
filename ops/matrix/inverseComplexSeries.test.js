import { describe, it } from 'node:test'
import assert from 'node:assert'
import { inverseComplexSeries } from './inverseComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

function matMul(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let re = 0
			let im = 0
			for (let k = 0; k < n; k++) {
				re += A[i][k].re * B[k][j].re - A[i][k].im * B[k][j].im
				im += A[i][k].re * B[k][j].im + A[i][k].im * B[k][j].re
			}
			out[i][j] = { re, im }
		}
	}
	return out
}

function matAdd(A, B) {
	return A.map((row, i) =>
		row.map((val, j) => ({ re: val.re + B[i][j].re, im: val.im + B[i][j].im }))
	)
}

function matSub(A, B) {
	return A.map((row, i) =>
		row.map((val, j) => ({ re: val.re - B[i][j].re, im: val.im - B[i][j].im }))
	)
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: i === j ? 1 : 0, im: 0 }))
	)
}

function conjTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: A[j][i].re, im: -A[j][i].im }))
	)
}

function assertMatrixClose(actual, expected, eps = 1e-11) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			const diffRe = Math.abs(actual[i][j].re - expected[i][j].re)
			const diffIm = Math.abs(actual[i][j].im - expected[i][j].im)
			assert.ok(
				diffRe <= eps && diffIm <= eps,
				`Mismatch at [${i}][${j}]: got (${actual[i][j].re}, ${actual[i][j].im}i), expected (${expected[i][j].re}, ${expected[i][j].im}i)`
			)
		}
	}
}

describe('inverseComplexSeries', () => {
	describe('normal cases', () => {
		it('inverts a 1x1 complex matrix', () => {
			const A = [[c(3, 4)]]
			const inv = inverseComplexSeries(A)
			assertMatrixClose(inv, [[c(0.12, -0.16)]])
			assertMatrixClose(matMul(A, inv), identity(1))
			assertMatrixClose(matMul(inv, A), identity(1))
		})

		it('inverts a 2x2 complex matrix and matches analytical formula', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(2, 0), c(-1, 1)],
			]
			// det = (1+2i)(-1+i) - (3-i)(2) = (-3 - i) - (6 - 2i) = -9 + i, |det|^2 = 82
			const expected = [
				[c((-1 * -9 + 1 * 1) / 82, (1 * -9 - -1 * 1) / 82), c((-3 * -9 + 1 * 1) / 82, (1 * -9 - -3 * 1) / 82)],
				[c((-2 * -9 + 0 * 1) / 82, (0 * -9 - -2 * 1) / 82), c((1 * -9 + 2 * 1) / 82, (2 * -9 - 1 * 1) / 82)],
			]
			const inv = inverseComplexSeries(A)
			assertMatrixClose(inv, expected)
			assertMatrixClose(matMul(A, inv), identity(2))
			assertMatrixClose(matMul(inv, A), identity(2))
		})

		it('inverts a 3x3 complex matrix requiring partial pivoting', () => {
			const A = [
				[c(0, 0), c(1, 1), c(2, -1)],
				[c(2, -1), c(0, 3), c(1, 0)],
				[c(1, 2), c(-1, 1), c(0, -2)],
			]
			const inv = inverseComplexSeries(A)
			assertMatrixClose(matMul(A, inv), identity(3))
			assertMatrixClose(matMul(inv, A), identity(3))
		})

		it('inverts a 4x4 dense complex matrix', () => {
			const A = [
				[c(2, 1), c(-1, 2), c(0, -1), c(3, 0)],
				[c(1, -1), c(3, 2), c(2, 1), c(-1, 1)],
				[c(0, 2), c(1, -3), c(4, -1), c(2, 2)],
				[c(-2, 1), c(0, 1), c(1, -2), c(5, -1)],
			]
			const inv = inverseComplexSeries(A)
			assertMatrixClose(matMul(A, inv), identity(4))
			assertMatrixClose(matMul(inv, A), identity(4))
		})
	})

	describe('edge cases', () => {
		it('returns identity for identity matrices (1x1 and 3x3)', () => {
			const I1 = identity(1)
			const I3 = identity(3)
			assertMatrixClose(inverseComplexSeries(I1), I1)
			assertMatrixClose(inverseComplexSeries(I3), I3)
		})

		it('satisfies A^-1 = A^H for a 2x2 unitary matrix', () => {
			const s = Math.SQRT1_2
			const U = [
				[c(s, 0), c(0, s)],
				[c(0, s), c(s, 0)],
			]
			const inv = inverseComplexSeries(U)
			assertMatrixClose(inv, conjTranspose(U))
			assertMatrixClose(matMul(U, inv), identity(2))
		})

		it('satisfies A^-1 = A^H for the 3x3 normalized DFT unitary matrix', () => {
			const scale = 1 / Math.sqrt(3)
			const F3 = Array.from({ length: 3 }, (_, j) =>
				Array.from({ length: 3 }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / 3
					return c(scale * Math.cos(angle), scale * Math.sin(angle))
				})
			)
			const inv = inverseComplexSeries(F3)
			assertMatrixClose(inv, conjTranspose(F3))
			assertMatrixClose(matMul(F3, inv), identity(3))
			assertMatrixClose(matMul(inv, F3), identity(3))
		})

		it('does not mutate the input matrix or its entries', () => {
			const A = [
				[c(1, 2), c(3, 4), c(5, 6)],
				[c(0, 1), c(-2, 3), c(1, -1)],
				[c(4, -2), c(2, 0), c(3, 5)],
			]
			const snapshot = JSON.parse(JSON.stringify(A))
			inverseComplexSeries(A)
			assert.deepStrictEqual(A, snapshot)
		})

		it('throws on singular matrices', () => {
			// 1x1 zero
			assert.throws(() => inverseComplexSeries([[c(0, 0)]]), RangeError)

			// 2x2 with row 2 = i * row 1
			assert.throws(
				() =>
					inverseComplexSeries([
						[c(1, 2), c(3, -1)],
						[c(-2, 1), c(1, 3)],
					]),
				RangeError
			)

			// 3x3 with row 3 = (1 + i)*row 1 + (2 - i)*row 2
			assert.throws(
				() =>
					inverseComplexSeries([
						[c(1, 0), c(0, 1), c(2, -1)],
						[c(0, 2), c(1, -1), c(1, 1)],
						[c(3, 5), c(0, -2), c(6, 2)],
					]),
				RangeError
			)

			// All-zero 3x3
			const zero3 = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => c(0, 0)))
			assert.throws(() => inverseComplexSeries(zero3), RangeError)
		})

		it('throws on empty, non-square, and invalid inputs', () => {
			assert.throws(() => inverseComplexSeries(null), TypeError)
			assert.throws(() => inverseComplexSeries(undefined), TypeError)
			assert.throws(() => inverseComplexSeries(42), TypeError)
			assert.throws(() => inverseComplexSeries([]), RangeError)
			assert.throws(() => inverseComplexSeries([[]]), RangeError)
			assert.throws(() => inverseComplexSeries([[c(1, 0), c(2, 0)]]), RangeError)
			assert.throws(
				() =>
					inverseComplexSeries([
						[c(1, 0), c(0, 0)],
						[c(0, 0)],
					]),
				RangeError
			)
			assert.throws(() => inverseComplexSeries(['not-a-row']), TypeError)
			assert.throws(() => inverseComplexSeries([[null]]), TypeError)
			assert.throws(() => inverseComplexSeries([[1]]), TypeError)
			assert.throws(() => inverseComplexSeries([[{ re: 1 }]]), TypeError)
			assert.throws(() => inverseComplexSeries([[{ re: NaN, im: 0 }]]), TypeError)
			assert.throws(() => inverseComplexSeries([[{ re: 0, im: Infinity }]]), TypeError)
			assert.throws(() => inverseComplexSeries([[{ re: '1', im: 0 }]]), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		function neumannSeriesInverse(A, terms = 60) {
			const n = A.length
			const I = identity(n)
			const B = matSub(I, A)
			let sum = identity(n)
			let power = identity(n)
			for (let k = 1; k <= terms; k++) {
				power = matMul(power, B)
				sum = matAdd(sum, power)
			}
			return sum
		}

		it('matches Neumann series sum_{k=0}^N (I - A)^k for 2x2 matrix with ||I - A|| < 1', () => {
			const A = [
				[c(0.9, 0.1), c(-0.15, 0.05)],
				[c(0.1, -0.1), c(1.05, -0.15)],
			]
			const inv = inverseComplexSeries(A)
			const seriesInv = neumannSeriesInverse(A, 60)
			assertMatrixClose(inv, seriesInv, 1e-12)
			assertMatrixClose(matMul(A, inv), identity(2), 1e-12)
			assertMatrixClose(matMul(inv, A), identity(2), 1e-12)
		})

		it('matches Neumann series sum_{k=0}^N (I - A)^k for 3x3 matrix with ||I - A|| < 1', () => {
			const A = [
				[c(1.0, 0.1), c(-0.1, 0.05), c(0.05, -0.05)],
				[c(0.08, -0.04), c(0.95, -0.08), c(-0.07, 0.06)],
				[c(-0.05, 0.05), c(0.06, 0.04), c(1.05, 0.05)],
			]
			const inv = inverseComplexSeries(A)
			const seriesInv = neumannSeriesInverse(A, 60)
			assertMatrixClose(inv, seriesInv, 1e-12)
			assertMatrixClose(matMul(A, inv), identity(3), 1e-12)
			assertMatrixClose(matMul(inv, A), identity(3), 1e-12)
		})

		it('satisfies (A^-1)^-1 = A and (AB)^-1 = B^-1 A^-1', () => {
			const A = [
				[c(2, -1), c(0, 3), c(1, 1)],
				[c(-1, 2), c(4, 0), c(0, -2)],
				[c(3, 1), c(-2, -1), c(1, 3)],
			]
			const B = [
				[c(1, 1), c(2, 0), c(-1, 2)],
				[c(0, -1), c(1, -2), c(3, 1)],
				[c(2, 1), c(-1, 1), c(2, -1)],
			]

			const invA = inverseComplexSeries(A)
			const invB = inverseComplexSeries(B)
			assertMatrixClose(inverseComplexSeries(invA), A, 1e-11)
			assertMatrixClose(inverseComplexSeries(matMul(A, B)), matMul(invB, invA), 1e-11)
		})
	})
})
