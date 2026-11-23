import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulComplexMemo } from './matMulComplexMemo.js'

const c = (re, im = 0) => ({ re, im })

function assertMatrixClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].re - expected[i][j].re) <= eps,
				`re mismatch at [${i}][${j}]: got ${actual[i][j].re}, expected ${expected[i][j].re}`
			)
			assert.ok(
				Math.abs(actual[i][j].im - expected[i][j].im) <= eps,
				`im mismatch at [${i}][${j}]: got ${actual[i][j].im}, expected ${expected[i][j].im}`
			)
		}
	}
}

function transpose(M) {
	const rows = M.length
	const cols = M[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => ({ re: M[i][j].re, im: M[i][j].im }))
	)
}

function conjugateTranspose(M) {
	const rows = M.length
	const cols = M[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => ({ re: M[i][j].re, im: -M[i][j].im }))
	)
}

function addMatrices(A, B) {
	return A.map((row, i) =>
		row.map((val, j) => ({ re: val.re + B[i][j].re, im: val.im + B[i][j].im }))
	)
}

function scaleMatrix(M, scalar) {
	return M.map((row) =>
		row.map((z) => {
			const re = z.re * scalar.re - z.im * scalar.im
			const im = z.re * scalar.im + z.im * scalar.re
			return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
		})
	)
}

function naiveMatMulComplex(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B[0].length
	return Array.from({ length: m }, (_, i) =>
		Array.from({ length: p }, (_, j) => {
			let re = 0
			let im = 0
			for (let k = 0; k < n; k++) {
				re += A[i][k].re * B[k][j].re - A[i][k].im * B[k][j].im
				im += A[i][k].re * B[k][j].im + A[i][k].im * B[k][j].re
			}
			return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
		})
	)
}

function makeSeededMatrix(rows, cols, seed) {
	let state = seed >>> 0
	const next = () => {
		state = (1664525 * state + 1013904223) >>> 0
		return ((state / 0xffffffff) * 10 - 5)
	}
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => ({
			re: Math.round(next() * 4) / 4,
			im: Math.round(next() * 4) / 4,
		}))
	)
}

describe('matMulComplexMemo', () => {
	describe('normal cases', () => {
		it('multiplies 2x2 complex matrices accurately', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(0, 4), c(-2, 1)],
			]
			const B = [
				[c(2, -1), c(1, 1)],
				[c(-1, 3), c(0, -2)],
			]
			// C[0][0] = (1+2i)(2-i) + (3-i)(-1+3i) = (4+3i) + (0+10i) = 4+13i
			// C[0][1] = (1+2i)(1+i) + (3-i)(-2i)   = (-1+3i) + (-2-6i) = -3-3i
			// C[1][0] = (4i)(2-i) + (-2+i)(-1+3i)  = (4+8i) + (-1-7i) = 3+1i
			// C[1][1] = (4i)(1+i) + (-2+i)(-2i)    = (-4+4i) + (2+4i) = -2+8i
			const expected = [
				[c(4, 13), c(-3, -3)],
				[c(3, 1), c(-2, 8)],
			]
			assert.deepStrictEqual(matMulComplexMemo(A, B), expected)
		})

		it('multiplies rectangular 2x3 and 3x2 matrices', () => {
			const A = [
				[c(1, 1), c(2, 0), c(0, -1)],
				[c(-1, 2), c(0, 3), c(1, -2)],
			]
			const B = [
				[c(2, 1), c(0, -1)],
				[c(1, -1), c(3, 0)],
				[c(0, 2), c(1, 1)],
			]
			const expected = naiveMatMulComplex(A, B)
			assert.deepStrictEqual(matMulComplexMemo(A, B), expected)
		})

		it('multiplies rectangular 3x2 and 2x4 matrices', () => {
			const A = [
				[c(1.5, -0.5), c(2, 1)],
				[c(-3, 0), c(0.25, -0.75)],
				[c(0, 2), c(-1, -1)],
			]
			const B = [
				[c(1, 0), c(0, 1), c(-1, 2), c(0.5, -0.5)],
				[c(2, -1), c(1, 1), c(0, -3), c(-2, 0)],
			]
			const result = matMulComplexMemo(A, B)
			assert.equal(result.length, 3)
			assert.equal(result[0].length, 4)
			assertMatrixClose(result, naiveMatMulComplex(A, B))
		})

		it('computes inner product (1x3 * 3x1) and outer product (3x1 * 1x3)', () => {
			const row = [[c(1, 2), c(3, -1), c(-2, 0.5)]]
			const col = [[c(0, 1)], [c(2, 2)], [c(-1, -3)]]

			const inner = matMulComplexMemo(row, col)
			assert.equal(inner.length, 1)
			assert.equal(inner[0].length, 1)
			assertMatrixClose(inner, naiveMatMulComplex(row, col))

			const outer = matMulComplexMemo(col, row)
			assert.equal(outer.length, 3)
			assert.equal(outer[0].length, 3)
			assertMatrixClose(outer, naiveMatMulComplex(col, row))
		})
	})

	describe('edge cases', () => {
		it('multiplies 1x1 complex matrices', () => {
			const A = [[c(3, 4)]]
			const B = [[c(3, -4)]]
			assert.deepStrictEqual(matMulComplexMemo(A, B), [[c(25, 0)]])
		})

		it('preserves matrix when multiplied by the complex identity matrix', () => {
			const I = [
				[c(1, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 0)],
			]
			const A = [
				[c(2, -3), c(0, 1), c(-4, 5)],
				[c(1.5, 0), c(-2, -2), c(3, 0.5)],
				[c(0, 0), c(7, -1), c(-0.25, 4)],
			]
			assert.deepStrictEqual(matMulComplexMemo(A, I), A)
			assert.deepStrictEqual(matMulComplexMemo(I, A), A)
		})

		it('produces a zero matrix when multiplied by a zero matrix', () => {
			const Z = [
				[c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0)],
			]
			const A = [
				[c(5, -7), c(1, 2)],
				[c(-3, 4), c(8, -9)],
			]
			assert.deepStrictEqual(matMulComplexMemo(A, Z), Z)
			assert.deepStrictEqual(matMulComplexMemo(Z, A), Z)
		})

		it('normalizes negative zero to positive zero', () => {
			const A = [[c(-0, -0)]]
			const B = [[c(1, -0)]]
			const res = matMulComplexMemo(A, B)
			assert.ok(Object.is(res[0][0].re, 0))
			assert.ok(Object.is(res[0][0].im, 0))
		})

		it('satisfies Pauli matrix identities', () => {
			const I = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(1, 0)],
			]
			const Z = [
				[c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0)],
			]
			const sx = [
				[c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0)],
			]
			const sy = [
				[c(0, 0), c(0, -1)],
				[c(0, 1), c(0, 0)],
			]
			const sz = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(-1, 0)],
			]

			// Involutory: sigma_k^2 = I
			assert.deepStrictEqual(matMulComplexMemo(sx, sx), I)
			assert.deepStrictEqual(matMulComplexMemo(sy, sy), I)
			assert.deepStrictEqual(matMulComplexMemo(sz, sz), I)

			// Cyclic products: sigma_x * sigma_y = i * sigma_z, etc.
			assert.deepStrictEqual(matMulComplexMemo(sx, sy), scaleMatrix(sz, c(0, 1)))
			assert.deepStrictEqual(matMulComplexMemo(sy, sz), scaleMatrix(sx, c(0, 1)))
			assert.deepStrictEqual(matMulComplexMemo(sz, sx), scaleMatrix(sy, c(0, 1)))

			// Anticommutation: {sigma_x, sigma_y} = 0
			const anticomm = addMatrices(
				matMulComplexMemo(sx, sy),
				matMulComplexMemo(sy, sx)
			)
			assert.deepStrictEqual(anticomm, Z)
		})
	})

	describe('memoization cache and immutability', () => {
		it('returns deep-cloned matrices on cache hits so caller mutations do not corrupt cache', () => {
			const A = [
				[c(2, 3), c(-1, 4)],
				[c(5, -2), c(0, 1)],
			]
			const B = [
				[c(1, -1), c(3, 2)],
				[c(-2, 0), c(4, -3)],
			]

			const first = matMulComplexMemo(A, B)
			const expected = naiveMatMulComplex(A, B)
			assert.deepStrictEqual(first, expected)

			// Mutate returned matrix in multiple ways
			first[0][0].re = 999999
			first[0][0].im = -999999
			first[0][1] = c(42, 42)
			first[1].push(c(7, 7))
			first.push([c(8, 8)])

			// Mutate original inputs after first call
			const A2 = [
				[c(2, 3), c(-1, 4)],
				[c(5, -2), c(0, 1)],
			]
			const B2 = [
				[c(1, -1), c(3, 2)],
				[c(-2, 0), c(4, -3)],
			]
			A[0][0].re = -12345
			B[1][1].im = 54321

			// Cache hit with equivalent values must still return uncorrupted result
			const second = matMulComplexMemo(A2, B2)
			assert.deepStrictEqual(second, expected)
			assert.notEqual(second, first)
			assert.notEqual(second[0], first[0])
			assert.notEqual(second[0][0], first[0][0])
		})

		it('handles bounded cache eviction gracefully beyond capacity', () => {
			for (let k = 1; k <= 160; k++) {
				const A = [[c(k, 1), c(0, -k)]]
				const B = [[c(1, 2)], [c(3, -1)]]
				const expected = [[c(k - 2 - k, 2 * k + 1 - 3 * k)]]
				assert.deepStrictEqual(matMulComplexMemo(A, B), expected)
			}
			// Re-query evicted and recent entries
			const A1 = [[c(1, 1), c(0, -1)]]
			const B1 = [[c(1, 2)], [c(3, -1)]]
			assert.deepStrictEqual(matMulComplexMemo(A1, B1), naiveMatMulComplex(A1, B1))
		})
	})

	describe('input validation', () => {
		const valid2x2 = [
			[c(1, 0), c(0, 1)],
			[c(0, -1), c(1, 0)],
		]

		it('rejects non-matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => matMulComplexMemo(bad, valid2x2), TypeError)
				assert.throws(() => matMulComplexMemo(valid2x2, bad), TypeError)
			}
		})

		it('rejects empty matrices and empty rows', () => {
			assert.throws(() => matMulComplexMemo([], valid2x2), RangeError)
			assert.throws(() => matMulComplexMemo(valid2x2, []), RangeError)
			assert.throws(() => matMulComplexMemo([[]], valid2x2), RangeError)
			assert.throws(() => matMulComplexMemo(valid2x2, [[]]), RangeError)
		})

		it('rejects non-array rows and jagged matrices', () => {
			assert.throws(() => matMulComplexMemo([123], valid2x2), TypeError)
			assert.throws(() => matMulComplexMemo([[c(1, 0)], null], valid2x2), TypeError)

			const jagged = [
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			]
			assert.throws(() => matMulComplexMemo(jagged, valid2x2), RangeError)
			assert.throws(() => matMulComplexMemo(valid2x2, jagged), RangeError)
		})

		it('rejects incompatible inner dimensions', () => {
			const A = [
				[c(1, 0), c(2, 0), c(3, 0)],
				[c(4, 0), c(5, 0), c(6, 0)],
			]
			assert.throws(() => matMulComplexMemo(A, valid2x2), RangeError)
		})

		it('rejects invalid complex entries', () => {
			const badTypeEntries = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
			]
			for (const bad of badTypeEntries) {
				assert.throws(() => matMulComplexMemo([[bad]], [[c(1, 0)]]), TypeError)
				assert.throws(() => matMulComplexMemo([[c(1, 0)]], [[bad]]), TypeError)
			}

			const nonFiniteEntries = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFiniteEntries) {
				assert.throws(() => matMulComplexMemo([[bad]], [[c(1, 0)]]), RangeError)
				assert.throws(() => matMulComplexMemo([[c(1, 0)]], [[bad]]), RangeError)
			}
		})
	})

	describe('algebraic cross-checks', () => {
		it('satisfies associativity (A * B) * C = A * (B * C)', () => {
			const A = makeSeededMatrix(2, 3, 101)
			const B = makeSeededMatrix(3, 4, 202)
			const C = makeSeededMatrix(4, 2, 303)

			const left = matMulComplexMemo(matMulComplexMemo(A, B), C)
			const right = matMulComplexMemo(A, matMulComplexMemo(B, C))
			assertMatrixClose(left, right)
		})

		it('satisfies transpose identity (A * B)^T = B^T * A^T', () => {
			const A = makeSeededMatrix(3, 4, 404)
			const B = makeSeededMatrix(4, 2, 505)

			const lhs = transpose(matMulComplexMemo(A, B))
			const rhs = matMulComplexMemo(transpose(B), transpose(A))
			assertMatrixClose(lhs, rhs)
		})

		it('satisfies Hermitian adjoint identity (A * B)^H = B^H * A^H', () => {
			const A = makeSeededMatrix(3, 5, 606)
			const B = makeSeededMatrix(5, 4, 707)

			const lhs = conjugateTranspose(matMulComplexMemo(A, B))
			const rhs = matMulComplexMemo(conjugateTranspose(B), conjugateTranspose(A))
			assertMatrixClose(lhs, rhs)
		})

		it('satisfies left distributivity A * (B + C) = A * B + A * C', () => {
			const A = makeSeededMatrix(3, 3, 808)
			const B = makeSeededMatrix(3, 4, 909)
			const C = makeSeededMatrix(3, 4, 1010)

			const lhs = matMulComplexMemo(A, addMatrices(B, C))
			const rhs = addMatrices(matMulComplexMemo(A, B), matMulComplexMemo(A, C))
			assertMatrixClose(lhs, rhs)
		})

		it('matches naive reference across larger deterministic complex matrices', () => {
			const A = makeSeededMatrix(6, 7, 1111)
			const B = makeSeededMatrix(7, 5, 2222)
			assertMatrixClose(matMulComplexMemo(A, B), naiveMatMulComplex(A, B))
		})
	})
})
