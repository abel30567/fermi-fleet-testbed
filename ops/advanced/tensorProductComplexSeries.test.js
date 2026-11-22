import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductComplexSeries } from './tensorProductComplexSeries.js'

/** Helper constructors and independent reference operations */
const c = (re, im = 0) => ({ re, im })

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re
	}
}

function cConj(z) {
	return { re: z.re, im: z.im === 0 ? 0 : -z.im }
}

function matAdd(A, B) {
	return A.map((row, i) => row.map((z, j) => cAdd(z, B[i][j])))
}

function matScale(z, A) {
	return A.map((row) => row.map((w) => cMul(z, w)))
}

function matMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => Array.from({ length: n }, () => c(0, 0)))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0)
			for (let t = 0; t < k; t++) {
				sum = cAdd(sum, cMul(A[i][t], B[t][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function matTrace(A) {
	let sum = c(0, 0)
	for (let i = 0; i < A.length; i++) {
		sum = cAdd(sum, A[i][i])
	}
	return sum
}

function matDagger(A) {
	const m = A.length
	const n = A[0].length
	return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (__, i) => cConj(A[i][j])))
}

function directOuterProduct1D(u, v) {
	return u.map((ui) => v.map((vj) => cMul(ui, vj)))
}

function directKronecker2D(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B.length
	const q = B[0].length
	const out = Array.from({ length: m * p }, () => new Array(n * q))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < p; k++) {
				for (let l = 0; l < q; l++) {
					out[i * p + k][j * q + l] = cMul(A[i][j], B[k][l])
				}
			}
		}
	}
	return out
}

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} real mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} imag mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertMatrixClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			assertComplexClose(actual[i][j], expected[i][j], tol, `entry [${i}][${j}]`)
		}
	}
}

describe('tensorProductComplexSeries', () => {
	describe('1D complex vectors (outer / tensor product)', () => {
		it('computes exact outer product of two 2-element complex vectors', () => {
			const u = [c(1, 1), c(2, -1)]
			const v = [c(3, 2), c(-1, 4)]
			const actual = tensorProductComplexSeries(u, v)
			const expected = [
				[c(1, 5), c(-5, 3)],
				[c(8, 1), c(2, 9)]
			]
			assert.deepStrictEqual(actual, expected)
		})

		it('handles rectangular 1D vector lengths and 1x1 vectors', () => {
			const u = [c(1, 0), c(0, 1), c(-2, 3)]
			const v = [c(4, -1), c(0, 2)]
			const actual = tensorProductComplexSeries(u, v)
			assertMatrixClose(actual, directOuterProduct1D(u, v), 1e-14)
			assert.equal(actual.length, 3)
			assert.equal(actual[0].length, 2)

			const single = tensorProductComplexSeries([c(3, 4)], [c(5, -2)])
			assert.deepStrictEqual(single, [[c(23, 14)]])
		})

		it('handles zero, pure real, and pure imaginary vectors without -0 artifacts', () => {
			const u = [c(0, 0), c(-1, 0), c(0, -2)]
			const v = [c(0, 0), c(0, 3), c(-4, 0)]
			const actual = tensorProductComplexSeries(u, v)
			const expected = [
				[c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, -3), c(4, 0)],
				[c(0, 0), c(6, 0), c(0, 8)]
			]
			assert.deepStrictEqual(actual, expected)
			for (const row of actual) {
				for (const z of row) {
					assert.ok(!Object.is(z.re, -0), 're should not be -0')
					assert.ok(!Object.is(z.im, -0), 'im should not be -0')
				}
			}
		})
	})

	describe('2D complex matrices (Kronecker product)', () => {
		it('computes exact Kronecker product of Pauli matrices sigma_x ⊗ sigma_y', () => {
			const sigmaX = [
				[c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0)]
			]
			const sigmaY = [
				[c(0, 0), c(0, -1)],
				[c(0, 1), c(0, 0)]
			]
			const actual = tensorProductComplexSeries(sigmaX, sigmaY)
			const expected = [
				[c(0, 0), c(0, 0), c(0, 0), c(0, -1)],
				[c(0, 0), c(0, 0), c(0, 1), c(0, 0)],
				[c(0, 0), c(0, -1), c(0, 0), c(0, 0)],
				[c(0, 1), c(0, 0), c(0, 0), c(0, 0)]
			]
			assert.deepStrictEqual(actual, expected)
		})

		it('computes Kronecker product of rectangular complex matrices and 1x1 scalars', () => {
			const A = [
				[c(1, 2), c(-1, 0), c(0, 3)],
				[c(2, -1), c(4, 1), c(-2, -2)]
			]
			const B = [
				[c(0, 1), c(2, 0)],
				[c(-1, 3), c(1, -1)],
				[c(5, 2), c(0, -4)]
			]
			const actual = tensorProductComplexSeries(A, B)
			assert.equal(actual.length, 6)
			assert.equal(actual[0].length, 6)
			assertMatrixClose(actual, directKronecker2D(A, B), 1e-13)

			// 1x1 matrix acts as complex scalar multiplication
			const scalar = [[c(2, -3)]]
			const scaled = tensorProductComplexSeries(scalar, B)
			assertMatrixClose(scaled, matScale(c(2, -3), B), 1e-14)
		})
	})

	describe('algebraic and mathematical identity cross-checks', () => {
		it('satisfies mixed-product identity (A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)', () => {
			const A = [
				[c(1, 2), c(-3, 1), c(0.5, -1.5)],
				[c(2, -1), c(0, 4), c(-1, 2)]
			] // 2x3
			const C = [
				[c(2, 0), c(-1, 3)],
				[c(1, -2), c(0.5, 0.5)],
				[c(-2, 1), c(3, -1)]
			] // 3x2
			const B = [
				[c(1, -1), c(2, 3)],
				[c(-1, 0.5), c(0, -2)],
				[c(3, 1), c(-2, -1)]
			] // 3x2
			const D = [
				[c(0.5, 2), c(-1, 1)],
				[c(2, -0.5), c(1, 3)]
			] // 2x2

			const lhs = matMul(
				tensorProductComplexSeries(A, B),
				tensorProductComplexSeries(C, D)
			)
			const rhs = tensorProductComplexSeries(matMul(A, C), matMul(B, D))

			assertMatrixClose(lhs, rhs, 1e-11)
		})

		it('satisfies trace identity tr(A ⊗ B) = tr(A) * tr(B)', () => {
			const A = [
				[c(2, 3), c(-1, 4), c(0.5, -2)],
				[c(1, -1), c(-3, 2), c(2, 0)],
				[c(0, 5), c(1.5, -0.5), c(4, -1)]
			]
			const B = [
				[c(-1.5, 2.5), c(3, -1)],
				[c(0.5, 4), c(2, 1.5)]
			]

			const kron = tensorProductComplexSeries(A, B)
			const lhs = matTrace(kron)
			const rhs = cMul(matTrace(A), matTrace(B))

			assertComplexClose(lhs, rhs, 1e-12, 'trace identity')
		})

		it('satisfies bilinearity, associativity, and conjugate-transpose identity', () => {
			const A = [
				[c(1, -2), c(3, 1)],
				[c(-0.5, 2), c(1, 0.5)]
			]
			const B = [
				[c(2, 1), c(-1, 3)],
				[c(0, -2), c(4, -1)]
			]
			const C = [
				[c(-1, 0.5), c(2, -1)],
				[c(1.5, 1), c(-2, 3)]
			]
			const alpha = c(1.5, -2.5)

			// Left distributivity: (A + B) ⊗ C = (A ⊗ C) + (B ⊗ C)
			assertMatrixClose(
				tensorProductComplexSeries(matAdd(A, B), C),
				matAdd(tensorProductComplexSeries(A, C), tensorProductComplexSeries(B, C)),
				1e-12
			)

			// Right distributivity: A ⊗ (B + C) = (A ⊗ B) + (A ⊗ C)
			assertMatrixClose(
				tensorProductComplexSeries(A, matAdd(B, C)),
				matAdd(tensorProductComplexSeries(A, B), tensorProductComplexSeries(A, C)),
				1e-12
			)

			// Scalar homogeneity: (alpha A) ⊗ B = A ⊗ (alpha B) = alpha (A ⊗ B)
			const s1 = tensorProductComplexSeries(matScale(alpha, A), B)
			const s2 = tensorProductComplexSeries(A, matScale(alpha, B))
			const s3 = matScale(alpha, tensorProductComplexSeries(A, B))
			assertMatrixClose(s1, s2, 1e-12)
			assertMatrixClose(s1, s3, 1e-12)

			// Associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)
			const assocL = tensorProductComplexSeries(tensorProductComplexSeries(A, B), C)
			const assocR = tensorProductComplexSeries(A, tensorProductComplexSeries(B, C))
			assertMatrixClose(assocL, assocR, 1e-11)

			// Hermitian adjoint: (A ⊗ B)^† = A^† ⊗ B^†
			const dagL = matDagger(tensorProductComplexSeries(A, B))
			const dagR = tensorProductComplexSeries(matDagger(A), matDagger(B))
			assertMatrixClose(dagL, dagR, 1e-12)
		})

		it('matches direct element-by-element product on deterministic pseudo-random matrices', () => {
			let seed = 0x12345678
			const nextRand = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}
			const randMat = (r, cols) =>
				Array.from({ length: r }, () =>
					Array.from({ length: cols }, () => c(nextRand(), nextRand()))
				)

			const A = randMat(4, 3)
			const B = randMat(3, 5)
			const actual = tensorProductComplexSeries(A, B)
			const direct = directKronecker2D(A, B)
			assertMatrixClose(actual, direct, 1e-11)
		})

		it('preserves precision under extreme dynamic range and avoids spurious overflow', () => {
			// Extreme dynamic range where naive Gauss (a_r + a_i)(b_r + b_i) - a_r b_r - a_i b_i
			// would lose all imaginary precision due to 1e8 + 1e-8 absorption.
			const u = [c(1e8, 1e-8)]
			const v = [c(1e8, 1e-8)]
			const res = tensorProductComplexSeries(u, v)
			assertComplexClose(res[0][0], c(1e16, 2), 1e-12, 'extreme dynamic range')

			// Near-MAX_VALUE components where a_r + a_i overflows float64,
			// while the true complex product is completely finite.
			const big = [[c(1e308, 1e308)]]
			const tiny = [[c(1e-300, 0)]]
			const scaled = tensorProductComplexSeries(big, tiny)
			assertComplexClose(scaled[0][0], c(1e8, 1e8), 1e-6, 'overflow avoidance')
		})
	})

	describe('immutability', () => {
		it('does not mutate inputs or alias input complex objects', () => {
			const a = [c(1, 2), c(3, 4)]
			const b = [c(5, 6)]
			const snapshotA = structuredClone(a)
			const snapshotB = structuredClone(b)

			const out = tensorProductComplexSeries(a, b)
			out[0][0].re = 9999

			assert.deepStrictEqual(a, snapshotA)
			assert.deepStrictEqual(b, snapshotB)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			assert.throws(() => tensorProductComplexSeries(null, [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexSeries([c(1, 0)], undefined), TypeError)
			assert.throws(() => tensorProductComplexSeries(42, [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexSeries('abc', [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexSeries({ re: 1, im: 0 }, [c(1, 0)]), TypeError)
		})

		it('throws RangeError for empty arrays', () => {
			assert.throws(() => tensorProductComplexSeries([], [c(1, 0)]), RangeError)
			assert.throws(() => tensorProductComplexSeries([c(1, 0)], []), RangeError)
		})

		it('throws TypeError for rank mismatch between 1D vector and 2D matrix', () => {
			const vec = [c(1, 0), c(0, 1)]
			const mat = [[c(1, 0)], [c(0, 1)]]
			assert.throws(() => tensorProductComplexSeries(vec, mat), TypeError)
			assert.throws(() => tensorProductComplexSeries(mat, vec), TypeError)
		})

		it('throws TypeError for invalid complex elements', () => {
			assert.throws(() => tensorProductComplexSeries([null], [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexSeries([1], [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexSeries([{ re: 1 }], [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexSeries([{ re: '1', im: 0 }], [c(1, 0)]), TypeError)
			assert.throws(
				() => tensorProductComplexSeries([c(1, 0), [c(2, 0)]], [c(1, 0)]),
				TypeError
			)
			assert.throws(
				() => tensorProductComplexSeries([[c(1, 0)], c(2, 0)], [[c(1, 0)]]),
				TypeError
			)
		})

		it('throws RangeError for non-finite complex components', () => {
			assert.throws(() => tensorProductComplexSeries([c(NaN, 0)], [c(1, 0)]), RangeError)
			assert.throws(() => tensorProductComplexSeries([c(1, Infinity)], [c(1, 0)]), RangeError)
			assert.throws(() => tensorProductComplexSeries([c(1, 0)], [c(-Infinity, 0)]), RangeError)
			assert.throws(() => tensorProductComplexSeries([[c(1, 0)]], [[c(0, NaN)]]), RangeError)
		})

		it('throws RangeError for empty or ragged rows in 2D matrices', () => {
			assert.throws(() => tensorProductComplexSeries([[]], [[c(1, 0)]]), RangeError)
			assert.throws(
				() => tensorProductComplexSeries([[c(1, 0)], []], [[c(1, 0)]]),
				RangeError
			)
			assert.throws(
				() => tensorProductComplexSeries([[c(1, 0), c(2, 0)], [c(3, 0)]], [[c(1, 0)]]),
				RangeError
			)
			assert.throws(
				() => tensorProductComplexSeries([[c(1, 0)]], [[c(1, 0)], [c(2, 0), c(3, 0)]]),
				RangeError
			)
		})
	})
})
