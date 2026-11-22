import { describe, test } from 'node:test'
import assert from 'node:assert'
import { matMulComplexSeries } from './matMulComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexMatrixClose(actual, expected, tol = 1e-12) {
	assert.strictEqual(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.strictEqual(
			actual[i].length,
			expected[i].length,
			`col count mismatch at row ${i}`,
		)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].re - expected[i][j].re) <= tol,
				`re mismatch at [${i}][${j}]: ${actual[i][j].re} vs ${expected[i][j].re}`,
			)
			assert.ok(
				Math.abs(actual[i][j].im - expected[i][j].im) <= tol,
				`im mismatch at [${i}][${j}]: ${actual[i][j].im} vs ${expected[i][j].im}`,
			)
		}
	}
}

function transpose(M) {
	const rows = M.length
	const cols = M[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => ({ re: M[i][j].re, im: M[i][j].im })),
	)
}

function conjugateTranspose(M) {
	const rows = M.length
	const cols = M[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => ({
			re: M[i][j].re,
			im: M[i][j].im === 0 ? 0 : -M[i][j].im,
		})),
	)
}

function toBlockReal(M) {
	const rows = M.length
	const cols = M[0].length
	const out = Array.from({ length: 2 * rows }, () => new Array(2 * cols).fill(0))
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[i][j] = M[i][j].re
			out[i][j + cols] = -M[i][j].im
			out[i + rows][j] = M[i][j].im
			out[i + rows][j + cols] = M[i][j].re
		}
	}
	return out
}

function matMulReal(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B[0].length
	const C = Array.from({ length: m }, () => new Array(p).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += A[i][k] * B[k][j]
			}
			C[i][j] = sum
		}
	}
	return C
}

describe('matMulComplexSeries', () => {
	describe('normal cases', () => {
		test('multiplies 2x2 square complex matrices', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(0, 4), c(-2, 1)],
			]
			const B = [
				[c(2, -1), c(1, 1)],
				[c(-1, 3), c(4, 0)],
			]
			// C[0][0] = (1+2i)(2-i) + (3-i)(-1+3i) = (4+3i) + (0+10i) = 4+13i
			// C[0][1] = (1+2i)(1+i) + (3-i)(4)     = (-1+3i) + (12-4i) = 11-i
			// C[1][0] = (4i)(2-i) + (-2+i)(-1+3i)  = (4+8i) + (-1-7i) = 3+i
			// C[1][1] = (4i)(1+i) + (-2+i)(4)      = (-4+4i) + (-8+4i) = -12+8i
			const expected = [
				[c(4, 13), c(11, -1)],
				[c(3, 1), c(-12, 8)],
			]
			assert.deepStrictEqual(matMulComplexSeries(A, B), expected)
		})

		test('multiplies rectangular complex matrices (2x3 * 3x2 -> 2x2)', () => {
			const A = [
				[c(1, 1), c(2, 0), c(0, -1)],
				[c(-1, 2), c(0, 3), c(1, 1)],
			]
			const B = [
				[c(1, 0), c(0, 1)],
				[c(2, -1), c(-1, 2)],
				[c(3, 1), c(1, -1)],
			]
			// C[0][0] = (1+i)(1) + (2)(2-i) + (-i)(3+i) = (1+i) + (4-2i) + (1-3i) = 6-4i
			// C[0][1] = (1+i)(i) + (2)(-1+2i) + (-i)(1-i) = (-1+i) + (-2+4i) + (-1-i) = -4+4i
			// C[1][0] = (-1+2i)(1) + (3i)(2-i) + (1+i)(3+i) = (-1+2i) + (3+6i) + (2+4i) = 4+12i
			// C[1][1] = (-1+2i)(i) + (3i)(-1+2i) + (1+i)(1-i) = (-2-i) + (-6-3i) + (2+0i) = -6-4i
			const expected = [
				[c(6, -4), c(-4, 4)],
				[c(4, 12), c(-6, -4)],
			]
			assert.deepStrictEqual(matMulComplexSeries(A, B), expected)
		})

		test('handles inner product (1x3 * 3x1) and outer product (3x1 * 1x2)', () => {
			const row = [[c(1, 2), c(0, -1), c(3, 0)]]
			const col = [[c(1, -2)], [c(0, 1)], [c(2, 1)]]
			// (1+2i)(1-2i) + (-i)(i) + 3(2+i) = 5 + 1 + (6+3i) = 12+3i
			assert.deepStrictEqual(matMulComplexSeries(row, col), [[c(12, 3)]])

			const u = [[c(1, 1)], [c(0, 2)], [c(-1, 0)]]
			const v = [[c(2, 0), c(0, -1)]]
			assert.deepStrictEqual(matMulComplexSeries(u, v), [
				[c(2, 2), c(1, -1)],
				[c(0, 4), c(2, 0)],
				[c(-2, 0), c(0, 1)],
			])
		})

		test('does not mutate input matrices and normalizes -0 to 0', () => {
			const A = [[c(0, 0), c(-1, 0)]]
			const B = [[c(-1, 0)], [c(0, 0)]]
			const snapA = structuredClone(A)
			const snapB = structuredClone(B)
			const C = matMulComplexSeries(A, B)
			assert.deepStrictEqual(A, snapA)
			assert.deepStrictEqual(B, snapB)
			assert.ok(Object.is(C[0][0].re, 0))
			assert.ok(Object.is(C[0][0].im, 0))
		})
	})

	describe('edge cases', () => {
		test('multiplies 1x1 complex matrices', () => {
			assert.deepStrictEqual(
				matMulComplexSeries([[c(3, 4)]], [[c(1, -2)]]),
				[[c(11, -2)]],
			)
			assert.deepStrictEqual(
				matMulComplexSeries([[c(0, 1)]], [[c(0, 1)]]),
				[[c(-1, 0)]],
			)
		})

		test('identity matrix leaves matrix unchanged on left and right', () => {
			const I2 = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(1, 0)],
			]
			const I3 = [
				[c(1, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 0)],
			]
			const A = [
				[c(2, -3), c(0.5, 4), c(-1, 0)],
				[c(7, 1), c(0, -2), c(3, 5)],
			]
			assert.deepStrictEqual(matMulComplexSeries(I2, A), A)
			assert.deepStrictEqual(matMulComplexSeries(A, I3), A)
		})

		test('zero matrix produces zero matrix on left and right', () => {
			const Z23 = [
				[c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0)],
			]
			const A32 = [
				[c(1, 2), c(-3, 4)],
				[c(5, -6), c(7, 8)],
				[c(-9, 10), c(11, -12)],
			]
			const Z22 = [
				[c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0)],
			]
			const Z33 = [
				[c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0)],
			]
			assert.deepStrictEqual(matMulComplexSeries(Z23, A32), Z22)
			assert.deepStrictEqual(matMulComplexSeries(A32, Z23), Z33)
		})

		test('rejects ragged matrices', () => {
			const ragged = [
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			]
			const valid = [[c(1, 0)], [c(2, 0)]]
			assert.throws(() => matMulComplexSeries(ragged, valid), RangeError)
			assert.throws(() => matMulComplexSeries([[c(1, 0), c(2, 0)]], ragged), RangeError)
		})

		test('rejects incompatible dimensions', () => {
			const A = [
				[c(1, 0), c(2, 0)],
				[c(3, 0), c(4, 0)],
			]
			const B = [
				[c(1, 0), c(2, 0)],
				[c(3, 0), c(4, 0)],
				[c(5, 0), c(6, 0)],
			]
			assert.throws(() => matMulComplexSeries(A, B), RangeError)
		})

		test('rejects empty matrices and non-array inputs', () => {
			const valid = [[c(1, 0)]]
			assert.throws(() => matMulComplexSeries([], valid), RangeError)
			assert.throws(() => matMulComplexSeries(valid, []), RangeError)
			assert.throws(() => matMulComplexSeries([[]], valid), RangeError)
			assert.throws(() => matMulComplexSeries(null, valid), TypeError)
			assert.throws(() => matMulComplexSeries(valid, undefined), TypeError)
			assert.throws(() => matMulComplexSeries('not a matrix', valid), TypeError)
			assert.throws(() => matMulComplexSeries([123], valid), TypeError)
		})

		test('rejects invalid complex entries', () => {
			const valid = [[c(1, 0)]]
			const badEntries = [
				null,
				undefined,
				42,
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: '2' },
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]
			for (const bad of badEntries) {
				assert.throws(() => matMulComplexSeries([[bad]], valid), TypeError)
				assert.throws(() => matMulComplexSeries(valid, [[bad]]), TypeError)
			}
		})
	})

	describe('algebraic and independent cross-checks', () => {
		const A = [
			[c(1.5, -2), c(0.25, 3), c(-4, 0.5)],
			[c(2, 1.25), c(-1.5, -0.5), c(0.75, -3)],
		]
		const B = [
			[c(-0.5, 1), c(2, -1.5), c(1, 0.25), c(0, -2)],
			[c(3, 0.5), c(-1, 2), c(0.5, -1), c(1.5, 1)],
			[c(1.25, -0.75), c(0.5, 0.5), c(-2, 3), c(-1, 0.5)],
		]
		const C = [
			[c(2, 1), c(-1, 0.5)],
			[c(0.5, -2), c(3, 1)],
			[c(-1.5, 0.25), c(0, -1)],
			[c(1, -1.5), c(2.5, 2)],
		]

		test('associativity: (A * B) * C == A * (B * C)', () => {
			const lhs = matMulComplexSeries(matMulComplexSeries(A, B), C)
			const rhs = matMulComplexSeries(A, matMulComplexSeries(B, C))
			assertComplexMatrixClose(lhs, rhs)
		})

		test('transpose identity: (A * B)^T == B^T * A^T', () => {
			const lhs = transpose(matMulComplexSeries(A, B))
			const rhs = matMulComplexSeries(transpose(B), transpose(A))
			assertComplexMatrixClose(lhs, rhs)
		})

		test('conjugate transpose (adjoint) identity: (A * B)^H == B^H * A^H', () => {
			const lhs = conjugateTranspose(matMulComplexSeries(A, B))
			const rhs = matMulComplexSeries(conjugateTranspose(B), conjugateTranspose(A))
			assertComplexMatrixClose(lhs, rhs)
		})

		test('matches block-real representation [[Re, -Im], [Im, Re]] matrix product', () => {
			const AB = matMulComplexSeries(A, B)
			const lhs = toBlockReal(AB)
			const rhs = matMulReal(toBlockReal(A), toBlockReal(B))

			assert.strictEqual(lhs.length, rhs.length)
			for (let i = 0; i < lhs.length; i++) {
				assert.strictEqual(lhs[i].length, rhs[i].length)
				for (let j = 0; j < lhs[i].length; j++) {
					assert.ok(
						Math.abs(lhs[i][j] - rhs[i][j]) <= 1e-12,
						`block-real mismatch at [${i}][${j}]: ${lhs[i][j]} vs ${rhs[i][j]}`,
					)
				}
			}
		})
	})
})
