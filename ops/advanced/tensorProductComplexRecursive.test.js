import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductComplexRecursive } from './tensorProductComplexRecursive.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12, msg = '') {
	assert.equal(typeof actual, 'object', `${msg}: expected complex object`)
	assert.ok(actual !== null && !Array.isArray(actual), `${msg}: expected non-null non-array object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${msg}: re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${msg}: im mismatch: got ${actual.im}, expected ${expected.im}`
	)
	assert.ok(!Object.is(actual.re, -0), `${msg}: re must not be -0`)
	assert.ok(!Object.is(actual.im, -0), `${msg}: im must not be -0`)
}

function assertTensorClose(actual, expected, eps = 1e-12, path = 'root') {
	if (Array.isArray(expected)) {
		assert.ok(Array.isArray(actual), `${path}: expected array`)
		assert.equal(actual.length, expected.length, `${path}: length mismatch`)
		for (let i = 0; i < expected.length; i++) {
			assertTensorClose(actual[i], expected[i], eps, `${path}[${i}]`)
		}
	} else {
		assertComplexClose(actual, expected, eps, path)
	}
}

// --- Independent reference helpers for cross-checking ---

function refMul(a, b) {
	const re = a.re * b.re - a.im * b.im
	const im = a.re * b.im + a.im * b.re
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
}

function refAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function refConj(z) {
	return { re: z.re, im: z.im === 0 ? 0 : -z.im }
}

function refMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => Array.from({ length: n }, () => c(0, 0)))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0)
			for (let t = 0; t < k; t++) {
				sum = refAdd(sum, refMul(A[i][t], B[t][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function refMatAdd(A, B) {
	return A.map((row, i) => row.map((val, j) => refAdd(val, B[i][j])))
}

function refMatDagger(A) {
	const m = A.length
	const n = A[0].length
	return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => refConj(A[i][j])))
}

function refMatTrace(A) {
	let sum = c(0, 0)
	for (let i = 0; i < A.length; i++) {
		sum = refAdd(sum, A[i][i])
	}
	return sum
}

function refIterativeKron2D(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B.length
	const q = B[0].length
	const out = Array.from({ length: m * p }, () => new Array(n * q))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			for (let r = 0; r < p; r++) {
				for (let s = 0; s < q; s++) {
					out[i * p + r][j * q + s] = refMul(A[i][j], B[r][s])
				}
			}
		}
	}
	return out
}

function refIterativeKron3D(A, B) {
	const [d0, d1, d2] = [A.length, A[0].length, A[0][0].length]
	const [e0, e1, e2] = [B.length, B[0].length, B[0][0].length]
	const out = Array.from({ length: d0 * e0 }, () =>
		Array.from({ length: d1 * e1 }, () => new Array(d2 * e2))
	)
	for (let i0 = 0; i0 < d0; i0++) {
		for (let i1 = 0; i1 < d1; i1++) {
			for (let i2 = 0; i2 < d2; i2++) {
				for (let j0 = 0; j0 < e0; j0++) {
					for (let j1 = 0; j1 < e1; j1++) {
						for (let j2 = 0; j2 < e2; j2++) {
							out[i0 * e0 + j0][i1 * e1 + j1][i2 * e2 + j2] = refMul(
								A[i0][i1][i2],
								B[j0][j1][j2]
							)
						}
					}
				}
			}
		}
	}
	return out
}

describe('tensorProductComplexRecursive', () => {
	describe('normal cases', () => {
		it('multiplies two complex scalars (rank 0)', () => {
			assertTensorClose(tensorProductComplexRecursive(c(1, 2), c(3, -4)), c(11, 2))
			assertTensorClose(tensorProductComplexRecursive(c(0, 1), c(0, 1)), c(-1, 0))
			assertTensorClose(tensorProductComplexRecursive(c(0, 0), c(5, -7)), c(0, 0))
		})

		it('computes scalar × vector and vector × scalar', () => {
			const s = c(2, -1)
			const v = [c(1, 0), c(0, 3), c(-2, 4)]
			const expected = [c(2, -1), c(3, 6), c(0, 10)]

			assertTensorClose(tensorProductComplexRecursive(s, v), expected)
			assertTensorClose(tensorProductComplexRecursive(v, s), expected)
		})

		it('computes scalar × matrix and matrix × scalar', () => {
			const s = c(0, 2)
			const M = [
				[c(1, 1), c(-2, 0)],
				[c(0, -3), c(4, 5)],
			]
			const expected = [
				[c(-2, 2), c(0, -4)],
				[c(6, 0), c(-10, 8)],
			]

			assertTensorClose(tensorProductComplexRecursive(s, M), expected)
			assertTensorClose(tensorProductComplexRecursive(M, s), expected)
		})

		it('computes Kronecker product of complex vectors (1D)', () => {
			const u = [c(1, 1), c(0, -2), c(3, 0)]
			const v = [c(2, 0), c(-1, 1)]
			const expected = [
				c(2, 2),
				c(-2, 0),
				c(0, -4),
				c(2, 2),
				c(6, 0),
				c(-3, 3),
			]
			assertTensorClose(tensorProductComplexRecursive(u, v), expected)
		})

		it('computes Kronecker product of Pauli matrices X ⊗ Y', () => {
			const X = [
				[c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0)],
			]
			const Y = [
				[c(0, 0), c(0, -1)],
				[c(0, 1), c(0, 0)],
			]
			const expected = [
				[c(0, 0), c(0, 0), c(0, 0), c(0, -1)],
				[c(0, 0), c(0, 0), c(0, 1), c(0, 0)],
				[c(0, 0), c(0, -1), c(0, 0), c(0, 0)],
				[c(0, 1), c(0, 0), c(0, 0), c(0, 0)],
			]
			assertTensorClose(tensorProductComplexRecursive(X, Y), expected)
		})

		it('computes Kronecker product of non-square rectangular complex matrices', () => {
			const A = [
				[c(1, 2), c(0, -1), c(3, 0)],
				[c(-2, 1), c(4, 0), c(0, 2)],
			] // 2×3
			const B = [
				[c(0, 1), c(2, -1)],
				[c(-1, 0), c(1, 1)],
				[c(3, -2), c(0, 0)],
			] // 3×2

			const result = tensorProductComplexRecursive(A, B)
			assert.equal(result.length, 6)
			for (const row of result) {
				assert.equal(row.length, 6)
			}
			assertTensorClose(result, refIterativeKron2D(A, B))
		})

		it('computes Kronecker product of 3D complex tensors', () => {
			const A = [
				[
					[c(1, 0), c(0, 1), c(2, -1)],
					[c(-1, 2), c(3, 0), c(0, -2)],
				],
				[
					[c(0, 0), c(1, 1), c(-2, -1)],
					[c(4, -1), c(0, 3), c(1, -1)],
				],
			] // 2×2×3
			const B = [
				[[c(2, 1), c(-1, 0)]],
				[[c(0, -1), c(1, 2)]],
				[[c(3, 0), c(0, 3)]],
			] // 3×1×2

			const result = tensorProductComplexRecursive(A, B)
			assert.equal(result.length, 6)
			assert.equal(result[0].length, 2)
			assert.equal(result[0][0].length, 6)
			assertTensorClose(result, refIterativeKron3D(A, B))
		})

		it('handles mixed-rank tensors by prepending singleton outer dimensions', () => {
			const v = [c(1, 0), c(0, 1)] // shape [2] -> promoted to [1, 2]
			const M = [
				[c(2, 0), c(3, 0)],
				[c(4, 0), c(5, 0)],
			] // shape [2, 2]

			const expectedVM = [
				[c(2, 0), c(3, 0), c(0, 2), c(0, 3)],
				[c(4, 0), c(5, 0), c(0, 4), c(0, 5)],
			]
			assertTensorClose(tensorProductComplexRecursive(v, M), expectedVM)

			const expectedMV = [
				[c(2, 0), c(0, 2), c(3, 0), c(0, 3)],
				[c(4, 0), c(0, 4), c(5, 0), c(0, 5)],
			]
			assertTensorClose(tensorProductComplexRecursive(M, v), expectedMV)
		})
	})

	describe('edge cases', () => {
		it('handles empty vectors and empty inner dimensions', () => {
			const v = [c(1, 2), c(3, 4)]
			const M = [
				[c(1, 0), c(2, 0)],
				[c(3, 0), c(4, 0)],
			]

			assert.deepEqual(tensorProductComplexRecursive([], v), [])
			assert.deepEqual(tensorProductComplexRecursive(v, []), [])
			assert.deepEqual(tensorProductComplexRecursive([], []), [])
			assert.deepEqual(tensorProductComplexRecursive(c(2, 3), []), [])
			assert.deepEqual(tensorProductComplexRecursive([], c(2, 3)), [])

			// Shape [2, 0] ⊗ [2, 2] => shape [4, 0]
			assert.deepEqual(tensorProductComplexRecursive([[], []], M), [[], [], [], []])
			// Shape [0] promoted to [1, 0] ⊗ [2, 2] => shape [2, 0]
			assert.deepEqual(tensorProductComplexRecursive([], M), [[], []])
			assert.deepEqual(tensorProductComplexRecursive(M, []), [[], []])
		})

		it('handles single-element vectors and 1×1 matrices', () => {
			assertTensorClose(tensorProductComplexRecursive([c(2, 3)], [c(4, -5)]), [c(23, 2)])
			assertTensorClose(tensorProductComplexRecursive([[c(2, 3)]], [[c(4, -5)]]), [[c(23, 2)]])
		})

		it('normalizes -0 to +0 in both real and imaginary parts', () => {
			const r1 = tensorProductComplexRecursive(c(-0, 0), c(1, 0))
			assert.ok(Object.is(r1.re, 0))
			assert.ok(Object.is(r1.im, 0))

			const r2 = tensorProductComplexRecursive(c(0, -1), c(0, 0))
			assert.ok(Object.is(r2.re, 0))
			assert.ok(Object.is(r2.im, 0))

			const r3 = tensorProductComplexRecursive([c(-1, 0)], [c(0, -0)])
			assert.ok(Object.is(r3[0].re, 0))
			assert.ok(Object.is(r3[0].im, 0))
		})

		it('does not mutate or alias inputs, and allows shared sub-array references (DAG)', () => {
			const z = c(1, 0)
			const row = [z, c(0, 1)]
			const M = [row, row] // shared row reference (valid 2×2 matrix)

			const res = tensorProductComplexRecursive(c(1, 0), M)
			assertTensorClose(res, M)

			// Verify deep immutability / no aliasing
			assert.notEqual(res, M)
			assert.notEqual(res[0], row)
			assert.notEqual(res[0], res[1])
			assert.notEqual(res[0][0], z)

			res[0][0].re = 999
			assert.equal(z.re, 1)
			assert.equal(res[1][0].re, 1)
		})

		it('scales cleanly to larger odd-sized matrices via divide-and-conquer', () => {
			const makeMatrix = (rows, cols, seed) =>
				Array.from({ length: rows }, (_, i) =>
					Array.from({ length: cols }, (_, j) => c(((i * 7 + j * 3 + seed) % 11) - 5, ((i * 5 - j * 2 + seed) % 9) - 4))
				)

			const A = makeMatrix(9, 7, 1)
			const B = makeMatrix(7, 11, 4)
			const actual = tensorProductComplexRecursive(A, B)
			const expected = refIterativeKron2D(A, B)

			assert.equal(actual.length, 63)
			assert.equal(actual[0].length, 77)
			assertTensorClose(actual, expected)
		})

		it('throws TypeError on invalid types, missing properties, sparse arrays, mixed ranks, and cycles', () => {
			assert.throws(() => tensorProductComplexRecursive(), TypeError)
			assert.throws(() => tensorProductComplexRecursive(c(1, 0)), TypeError)
			assert.throws(() => tensorProductComplexRecursive(null, c(1, 0)), TypeError)
			assert.throws(() => tensorProductComplexRecursive(c(1, 0), undefined), TypeError)
			assert.throws(() => tensorProductComplexRecursive(42, c(1, 0)), TypeError)
			assert.throws(() => tensorProductComplexRecursive('1+2i', c(1, 0)), TypeError)
			assert.throws(() => tensorProductComplexRecursive({ re: 1 }, c(1, 0)), TypeError)
			assert.throws(() => tensorProductComplexRecursive({ im: 2 }, c(1, 0)), TypeError)
			assert.throws(() => tensorProductComplexRecursive({ re: '1', im: 0 }, c(1, 0)), TypeError)

			// Sparse arrays
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => tensorProductComplexRecursive([c(1, 0), , c(2, 0)], [c(1, 0)]), TypeError)
			assert.throws(() => tensorProductComplexRecursive(new Array(2), [c(1, 0)]), TypeError)

			// Mixed scalar and array at same depth
			assert.throws(() => tensorProductComplexRecursive([c(1, 0), [c(2, 0)]], [c(1, 0)]), TypeError)
			// Inconsistent nesting depth
			assert.throws(() => tensorProductComplexRecursive([[], [[]]], [c(1, 0)]), TypeError)

			// Circular array reference
			const cyclic = []
			cyclic.push(cyclic)
			assert.throws(() => tensorProductComplexRecursive(cyclic, [c(1, 0)]), TypeError)
		})

		it('throws RangeError on non-finite components, jagged tensors, and overflow', () => {
			assert.throws(() => tensorProductComplexRecursive(c(NaN, 0), c(1, 0)), RangeError)
			assert.throws(() => tensorProductComplexRecursive(c(Infinity, 0), c(1, 0)), RangeError)
			assert.throws(() => tensorProductComplexRecursive(c(0, -Infinity), c(1, 0)), RangeError)
			assert.throws(() => tensorProductComplexRecursive([c(1, 0)], [c(0, NaN)]), RangeError)

			// Jagged matrices
			assert.throws(
				() =>
					tensorProductComplexRecursive(
						[[c(1, 0)], [c(2, 0), c(3, 0)]],
						[[c(1, 0)]]
					),
				RangeError
			)
			assert.throws(
				() => tensorProductComplexRecursive([[c(1, 0)], []], [[c(1, 0)]]),
				RangeError
			)

			// Overflow in complex multiplication
			assert.throws(() => tensorProductComplexRecursive(c(1e308, 0), c(1e308, 0)), RangeError)
		})
	})

	describe('mathematical identities and independent cross-checks', () => {
		it('satisfies the mixed-product property (A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)', () => {
			const A = [
				[c(1, 1), c(2, -1), c(0, 3)],
				[c(-1, 0), c(0, 2), c(1, -2)],
			] // 2×3
			const C = [
				[c(2, 0), c(-1, 1)],
				[c(0, -2), c(3, 1)],
				[c(1, 2), c(0, -1)],
			] // 3×2
			const B = [
				[c(0, 1), c(1, 2)],
				[c(2, -1), c(-1, 0)],
				[c(1, 1), c(0, -3)],
			] // 3×2
			const D = [
				[c(1, -1), c(2, 1), c(0, 2)],
				[c(-2, 0), c(1, 3), c(1, -1)],
			] // 2×3

			const lhs = refMatMul(
				tensorProductComplexRecursive(A, B),
				tensorProductComplexRecursive(C, D)
			)
			const rhs = tensorProductComplexRecursive(refMatMul(A, C), refMatMul(B, D))

			assertTensorClose(lhs, rhs)
		})

		it('satisfies associativity (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C) across same and mixed ranks', () => {
			const A = [
				[c(1, 2), c(0, -1)],
				[c(3, 0), c(-1, 1)],
			]
			const B = [
				[c(0, 1), c(2, -2)],
				[c(-1, 3), c(1, 0)],
			]
			const C = [
				[c(2, 1), c(-1, -1)],
				[c(0, 2), c(3, -1)],
			]

			const lhsMat = tensorProductComplexRecursive(tensorProductComplexRecursive(A, B), C)
			const rhsMat = tensorProductComplexRecursive(A, tensorProductComplexRecursive(B, C))
			assertTensorClose(lhsMat, rhsMat)

			// Mixed-rank associativity: (u ⊗ v) ⊗ A === u ⊗ (v ⊗ A)
			const u = [c(1, -1), c(2, 1)]
			const v = [c(0, 2), c(-1, 0), c(3, -2)]
			const lhsMixed = tensorProductComplexRecursive(tensorProductComplexRecursive(u, v), A)
			const rhsMixed = tensorProductComplexRecursive(u, tensorProductComplexRecursive(v, A))
			assertTensorClose(lhsMixed, rhsMixed)
		})

		it('satisfies bilinearity in both arguments and scalar homogeneity', () => {
			const A = [
				[c(1, 2), c(-1, 0)],
				[c(0, 3), c(2, -1)],
			]
			const B = [
				[c(-2, 1), c(3, -2)],
				[c(1, 1), c(0, 4)],
			]
			const C = [
				[c(0, -1), c(2, 2)],
				[c(1, -3), c(-1, 1)],
			]
			const z = c(2, -3)

			// (A + B) ⊗ C = A ⊗ C + B ⊗ C
			assertTensorClose(
				tensorProductComplexRecursive(refMatAdd(A, B), C),
				refMatAdd(tensorProductComplexRecursive(A, C), tensorProductComplexRecursive(B, C))
			)

			// C ⊗ (A + B) = C ⊗ A + C ⊗ B
			assertTensorClose(
				tensorProductComplexRecursive(C, refMatAdd(A, B)),
				refMatAdd(tensorProductComplexRecursive(C, A), tensorProductComplexRecursive(C, B))
			)

			// (zA) ⊗ B = z(A ⊗ B) = A ⊗ (zB)
			const t1 = tensorProductComplexRecursive(tensorProductComplexRecursive(z, A), B)
			const t2 = tensorProductComplexRecursive(z, tensorProductComplexRecursive(A, B))
			const t3 = tensorProductComplexRecursive(A, tensorProductComplexRecursive(z, B))
			assertTensorClose(t1, t2)
			assertTensorClose(t2, t3)
		})

		it('satisfies Hermitian adjoint (A ⊗ B)† = A† ⊗ B† and trace tr(A ⊗ B) = tr(A)tr(B)', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(0, 4), c(-2, 1)],
			]
			const B = [
				[c(-1, 1), c(2, 0), c(0, -2)],
				[c(3, 2), c(1, -1), c(4, 1)],
				[c(0, 1), c(-2, 3), c(2, -2)],
			]

			const kronAB = tensorProductComplexRecursive(A, B)
			assertTensorClose(
				refMatDagger(kronAB),
				tensorProductComplexRecursive(refMatDagger(A), refMatDagger(B))
			)
			assertComplexClose(refMatTrace(kronAB), refMul(refMatTrace(A), refMatTrace(B)))
		})

		it('preserves unitarity for quantum gate tensor products (H ⊗ S)', () => {
			const invSqrt2 = 1 / Math.SQRT2
			const H = [
				[c(invSqrt2, 0), c(invSqrt2, 0)],
				[c(invSqrt2, 0), c(-invSqrt2, 0)],
			]
			const S = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 1)],
			]
			const I4 = [
				[c(1, 0), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(1, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(1, 0)],
			]

			const U = tensorProductComplexRecursive(H, S)
			const prod = refMatMul(refMatDagger(U), U)
			assertTensorClose(prod, I4, 1e-12)
		})
	})
})
