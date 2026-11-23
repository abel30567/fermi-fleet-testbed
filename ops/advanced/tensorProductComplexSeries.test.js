import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductComplexSeries } from './tensorProductComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im }
}

function cMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	}
}

function cConj(z) {
	return { re: z.re, im: z.im === 0 ? 0 : -z.im }
}

function matMulComplex(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => Array.from({ length: n }, () => c(0, 0)))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = c(0, 0)
			for (let t = 0; t < k; t++) {
				acc = cAdd(acc, cMul(A[i][t], B[t][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

function matAddComplex(A, B) {
	return A.map((row, i) => row.map((z, j) => cAdd(z, B[i][j])))
}

function matScaleComplex(z, A) {
	return A.map((row) => row.map((entry) => cMul(z, entry)))
}

function matDagger(A) {
	const rows = A.length
	const cols = A[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => cConj(A[i][j])),
	)
}

function matTrace(A) {
	let sum = c(0, 0)
	for (let i = 0; i < A.length; i++) {
		sum = cAdd(sum, A[i][i])
	}
	return sum
}

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`re mismatch: ${actual.re} vs ${expected.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`im mismatch: ${actual.im} vs ${expected.im}`,
	)
}

function assertComplexMatrixClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < expected[i].length; j++) {
			assertComplexClose(actual[i][j], expected[i][j], eps)
		}
	}
}

/**
 * Independent reference implementation using Gauss's 3-product complex identity:
 *   P1 = A_R ⊗ B_R
 *   P2 = A_I ⊗ B_I
 *   P3 = (A_R + A_I) ⊗ (B_R + B_I)
 *   Re(A ⊗ B) = P1 - P2
 *   Im(A ⊗ B) = P3 - P1 - P2
 */
function gaussIdentityKron2D(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B.length
	const q = B[0].length
	const out = Array.from({ length: m * p }, () => new Array(n * q))

	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			const ar = A[i][j].re
			const ai = A[i][j].im
			const as = ar + ai
			for (let k = 0; k < p; k++) {
				for (let l = 0; l < q; l++) {
					const br = B[k][l].re
					const bi = B[k][l].im
					const p1 = ar * br
					const p2 = ai * bi
					const p3 = as * (br + bi)
					out[i * p + k][j * q + l] = {
						re: p1 - p2,
						im: p3 - p1 - p2,
					}
				}
			}
		}
	}
	return out
}

describe('tensorProductComplexSeries', () => {
	test('computes 2x2 Pauli matrix tensor product σ_y ⊗ σ_z', () => {
		const sigmaY = [
			[c(0, 0), c(0, -1)],
			[c(0, 1), c(0, 0)],
		]
		const sigmaZ = [
			[c(1, 0), c(0, 0)],
			[c(0, 0), c(-1, 0)],
		]

		const expected = [
			[c(0, 0), c(0, 0), c(0, -1), c(0, 0)],
			[c(0, 0), c(0, 0), c(0, 0), c(0, 1)],
			[c(0, 1), c(0, 0), c(0, 0), c(0, 0)],
			[c(0, 0), c(0, -1), c(0, 0), c(0, 0)],
		]

		const result = tensorProductComplexSeries(sigmaY, sigmaZ)
		assert.deepStrictEqual(result, expected)
	})

	test('computes rectangular 2D complex matrix Kronecker product', () => {
		const A = [
			[c(1, 2), c(3, -1)],
		] // 1 x 2
		const B = [
			[c(0, 1)],
			[c(2, 1)],
		] // 2 x 1

		const result = tensorProductComplexSeries(A, B)
		assert.equal(result.length, 2)
		assert.equal(result[0].length, 2)
		assert.deepStrictEqual(result, [
			[c(-2, 1), c(1, 3)],
			[c(0, 5), c(7, 1)],
		])
	})

	test('computes 1D complex vector Kronecker product', () => {
		const u = [c(1, 1), c(0, -2)]
		const v = [c(3, 0), c(1, 4)]

		const result = tensorProductComplexSeries(u, v)
		assert.deepStrictEqual(result, [
			c(3, 3),
			c(-3, 5),
			c(0, -6),
			c(8, -2),
		])
	})

	test('handles 1x1 matrices and single-element vectors (complex scalar multiplication)', () => {
		const matRes = tensorProductComplexSeries([[c(3, 4)]], [[c(1, -2)]])
		assert.deepStrictEqual(matRes, [[c(11, -2)]])

		const vecRes = tensorProductComplexSeries([c(0, 1)], [c(0, 1)])
		assert.deepStrictEqual(vecRes, [c(-1, 0)])
	})

	test('normalizes negative zero (-0) to +0 in real and imaginary parts', () => {
		const A = [[c(-0, 0)]]
		const B = [[c(2, -3)]]
		const result = tensorProductComplexSeries(A, B)
		assert.ok(Object.is(result[0][0].re, 0))
		assert.ok(Object.is(result[0][0].im, 0))
	})

	test('preserves precision when real and imaginary scales differ drastically', () => {
		const A = [[c(1e8, 1e-8)]]
		const B = [[c(1e8, 1e-8)]]
		const result = tensorProductComplexSeries(A, B)
		assertComplexClose(result[0][0], c(1e16, 2), 1e-12)
	})

	test('does not mutate input arrays or complex objects', () => {
		const A = [[c(1, 2), c(3, 4)]]
		const B = [[c(5, 6)], [c(7, 8)]]
		const snapA = structuredClone(A)
		const snapB = structuredClone(B)

		const result = tensorProductComplexSeries(A, B)
		result[0][0].re = 999

		assert.deepStrictEqual(A, snapA)
		assert.deepStrictEqual(B, snapB)
	})

	test('independent cross-check: matches Gauss 3-product algebraic identity', () => {
		const A = [
			[c(1.5, -2.25), c(0.5, 3.0), c(-1.0, 0.25)],
			[c(2.0, 1.0), c(-0.75, -1.5), c(4.0, -0.5)],
		]
		const B = [
			[c(-1.25, 0.5), c(2.5, -1.0)],
			[c(0.0, 3.5), c(-2.0, -0.25)],
			[c(1.0, 1.0), c(0.5, -2.5)],
		]

		const actual = tensorProductComplexSeries(A, B)
		const expected = gaussIdentityKron2D(A, B)
		assertComplexMatrixClose(actual, expected, 1e-12)
	})

	test('independent cross-check: mixed-product property (A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)', () => {
		const A = [
			[c(1, 1), c(2, -1)],
			[c(0, 3), c(-1, 2)],
		]
		const C = [
			[c(2, 0), c(1, 2), c(-1, 1)],
			[c(0, -1), c(3, 1), c(2, -2)],
		]
		const B = [
			[c(1, -2), c(0, 1), c(2, 1)],
			[c(-1, 0), c(2, 2), c(1, -1)],
		]
		const D = [
			[c(0, 1), c(1, 0)],
			[c(2, -1), c(-1, 1)],
			[c(1, 2), c(0, -2)],
		]

		const lhs = matMulComplex(
			tensorProductComplexSeries(A, B),
			tensorProductComplexSeries(C, D),
		)
		const rhs = tensorProductComplexSeries(matMulComplex(A, C), matMulComplex(B, D))

		assertComplexMatrixClose(lhs, rhs, 1e-11)
	})

	test('independent cross-check: associativity, bilinearity, adjoint, and trace identities', () => {
		const A = [
			[c(1, -1), c(2, 0)],
			[c(0, 2), c(3, 1)],
		]
		const B = [
			[c(-1, 2), c(1, 1)],
			[c(2, -1), c(0, -3)],
		]
		const C = [
			[c(2, 1), c(-1, 0)],
			[c(1, -2), c(0, 1)],
		]
		const alpha = c(2, -3)

		// Associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)
		assertComplexMatrixClose(
			tensorProductComplexSeries(tensorProductComplexSeries(A, B), C),
			tensorProductComplexSeries(A, tensorProductComplexSeries(B, C)),
		)

		// Distributivity: (A + B) ⊗ C = (A ⊗ C) + (B ⊗ C)
		assertComplexMatrixClose(
			tensorProductComplexSeries(matAddComplex(A, B), C),
			matAddComplex(tensorProductComplexSeries(A, C), tensorProductComplexSeries(B, C)),
		)

		// Complex scalar bilinearity: (αA) ⊗ B = A ⊗ (αB) = α(A ⊗ B)
		const ab = tensorProductComplexSeries(A, B)
		assertComplexMatrixClose(
			tensorProductComplexSeries(matScaleComplex(alpha, A), B),
			matScaleComplex(alpha, ab),
		)
		assertComplexMatrixClose(
			tensorProductComplexSeries(A, matScaleComplex(alpha, B)),
			matScaleComplex(alpha, ab),
		)

		// Hermitian adjoint: (A ⊗ B)† = A† ⊗ B†
		assertComplexMatrixClose(
			matDagger(ab),
			tensorProductComplexSeries(matDagger(A), matDagger(B)),
		)

		// Trace multiplicativity: tr(A ⊗ B) = tr(A) · tr(B)
		assertComplexClose(matTrace(ab), cMul(matTrace(A), matTrace(B)))
	})

	test('rejects invalid input types, shapes, and non-finite complex values', () => {
		const validVec = [c(1, 0)]
		const validMat = [[c(1, 0)]]

		// Non-array or missing operands
		assert.throws(() => tensorProductComplexSeries(null, validMat), TypeError)
		assert.throws(() => tensorProductComplexSeries(validMat, undefined), TypeError)
		assert.throws(() => tensorProductComplexSeries('bad', validVec), TypeError)
		assert.throws(() => tensorProductComplexSeries(123, validVec), TypeError)

		// Empty arrays / empty rows
		assert.throws(() => tensorProductComplexSeries([], validVec), RangeError)
		assert.throws(() => tensorProductComplexSeries(validVec, []), RangeError)
		assert.throws(() => tensorProductComplexSeries([[]], validMat), RangeError)

		// Rank mismatch (1D vs 2D)
		assert.throws(() => tensorProductComplexSeries(validVec, validMat), TypeError)
		assert.throws(() => tensorProductComplexSeries(validMat, validVec), TypeError)

		// Ragged 2D matrices and mixed row types
		assert.throws(
			() => tensorProductComplexSeries([[c(1, 0)], [c(1, 0), c(2, 0)]], validMat),
			RangeError,
		)
		assert.throws(() => tensorProductComplexSeries([[c(1, 0)], c(2, 0)], validMat), TypeError)

		// Malformed complex entries
		assert.throws(() => tensorProductComplexSeries([1], validVec), TypeError)
		assert.throws(() => tensorProductComplexSeries([null], validVec), TypeError)
		assert.throws(() => tensorProductComplexSeries([{ re: 1 }], validVec), TypeError)
		assert.throws(() => tensorProductComplexSeries([{ re: '1', im: 0 }], validVec), TypeError)
		assert.throws(() => tensorProductComplexSeries([c(1, 0), [c(2, 0)]], validVec), TypeError)

		// Non-finite values and overflow
		assert.throws(() => tensorProductComplexSeries([c(NaN, 0)], validVec), RangeError)
		assert.throws(() => tensorProductComplexSeries([c(0, Infinity)], validVec), RangeError)
		assert.throws(() => tensorProductComplexSeries(validMat, [[c(-Infinity, 0)]]), RangeError)
		assert.throws(
			() => tensorProductComplexSeries([[c(1e200, 0)]], [[c(1e200, 0)]]),
			RangeError,
		)
	})
})
