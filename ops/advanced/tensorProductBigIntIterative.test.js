import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductBigIntIterative } from './tensorProductBigIntIterative.js'

/**
 * Independent helper: recursively sums all BigInt leaves of a tensor.
 */
function sumTensor(t) {
	if (typeof t === 'bigint') return t
	let total = 0n
	for (const item of t) {
		total += sumTensor(item)
	}
	return total
}

/**
 * Independent helper: recursively sums squares of all BigInt leaves (Frobenius norm squared).
 */
function sumSquaresTensor(t) {
	if (typeof t === 'bigint') return t * t
	let total = 0n
	for (const item of t) {
		total += sumSquaresTensor(item)
	}
	return total
}

/**
 * Independent helper: computes the 2D Kronecker product of matrices A (m×n) and B (p×q).
 */
function kroneckerProduct2D(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B.length
	const q = B[0].length
	const K = Array.from({ length: m * p }, () => new Array(n * q))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < p; k++) {
				for (let l = 0; l < q; l++) {
					K[i * p + k][j * q + l] = A[i][j] * B[k][l]
				}
			}
		}
	}
	return K
}

/**
 * Independent helper: element-wise addition of two same-shape tensors.
 */
function addTensors(x, y) {
	if (typeof x === 'bigint') return x + y
	return x.map((el, idx) => addTensors(el, y[idx]))
}

describe('tensorProductBigIntIterative', () => {
	describe('scalars, vectors, matrices, and general tensors', () => {
		test('rank-0 scalars', () => {
			assert.equal(tensorProductBigIntIterative(3n, 4n), 12n)
			assert.equal(tensorProductBigIntIterative(-7n, 9n), -63n)
			assert.equal(tensorProductBigIntIterative(-5n, -6n), 30n)
			assert.equal(tensorProductBigIntIterative(0n, 123456789012345678901234567890n), 0n)
		})

		test('scalar with vector and matrix (both operand orders)', () => {
			assert.deepEqual(tensorProductBigIntIterative(3n, [1n, -2n, 4n]), [3n, -6n, 12n])
			assert.deepEqual(tensorProductBigIntIterative([1n, -2n, 4n], 3n), [3n, -6n, 12n])
			assert.deepEqual(
				tensorProductBigIntIterative(-2n, [
					[1n, 2n],
					[3n, 4n],
				]),
				[
					[-2n, -4n],
					[-6n, -8n],
				],
			)
			assert.deepEqual(
				tensorProductBigIntIterative(
					[
						[1n, 2n],
						[3n, 4n],
					],
					-2n,
				),
				[
					[-2n, -4n],
					[-6n, -8n],
				],
			)
		})

		test('rank-1 vectors (outer product)', () => {
			const u = [1n, 2n, 3n]
			const v = [4n, 5n]
			assert.deepEqual(tensorProductBigIntIterative(u, v), [
				[4n, 5n],
				[8n, 10n],
				[12n, 15n],
			])
		})

		test('rank-2 matrices produce rank-4 tensor', () => {
			const A = [
				[1n, 2n],
				[3n, 4n],
			]
			const B = [
				[5n, 6n, 7n],
				[8n, 9n, 10n],
			]
			const R = tensorProductBigIntIterative(A, B)
			assert.equal(R.length, 2)
			assert.equal(R[0].length, 2)
			assert.equal(R[0][0].length, 2)
			assert.equal(R[0][0][0].length, 3)

			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						for (let l = 0; l < 3; l++) {
							assert.equal(R[i][j][k][l], A[i][j] * B[k][l])
						}
					}
				}
			}
		})

		test('mixed-rank and higher-rank general tensors (rank 1 ⊗ rank 2, rank 3 ⊗ rank 2)', () => {
			const v = [2n, -3n]
			const M = [
				[1n, 4n],
				[5n, 6n],
			]
			assert.deepEqual(tensorProductBigIntIterative(v, M), [
				[
					[2n, 8n],
					[10n, 12n],
				],
				[
					[-3n, -12n],
					[-15n, -18n],
				],
			])

			const T3 = [
				[
					[1n, 2n],
					[3n, 4n],
				],
				[
					[5n, 6n],
					[7n, 8n],
				],
			]
			const T2 = [[10n], [20n]]
			const T5 = tensorProductBigIntIterative(T3, T2)
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						for (let l = 0; l < 2; l++) {
							for (let m = 0; m < 1; m++) {
								assert.equal(T5[i][j][k][l][m], T3[i][j][k] * T2[l][m])
							}
						}
					}
				}
			}
		})
	})

	describe('edge cases', () => {
		test('arbitrary-precision BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const big1 = 10n ** 40n + 12345678901234567890n
			const big2 = -(10n ** 35n) - 9876543210987654321n
			const res = tensorProductBigIntIterative([big1, -big1], [big2, 1n])
			assert.deepEqual(res, [
				[big1 * big2, big1],
				[-big1 * big2, -big1],
			])
		})

		test('singleton and deeply nested tensors', () => {
			assert.deepEqual(tensorProductBigIntIterative([7n], [-3n]), [[-21n]])
			assert.deepEqual(tensorProductBigIntIterative([[[[2n]]]], [[[3n]]]), [[[[[[[6n]]]]]]])
		})

		test('empty tensors preserve prefix structure without aliasing', () => {
			assert.deepEqual(tensorProductBigIntIterative([], [1n, 2n]), [])
			assert.deepEqual(tensorProductBigIntIterative([], []), [])
			assert.deepEqual(tensorProductBigIntIterative(5n, []), [])
			assert.deepEqual(tensorProductBigIntIterative([], 5n), [])

			const res1 = tensorProductBigIntIterative([1n, 2n], [])
			assert.deepEqual(res1, [[], []])
			assert.notEqual(res1[0], res1[1])

			const res2 = tensorProductBigIntIterative([[1n, 2n]], [[], []])
			assert.deepEqual(res2, [
				[
					[[], []],
					[[], []],
				],
			])
			assert.notEqual(res2[0][0], res2[0][1])
			assert.notEqual(res2[0][0][0], res2[0][0][1])

			const res3 = tensorProductBigIntIterative([[], []], [1n, 2n])
			assert.deepEqual(res3, [[], []])
			assert.notEqual(res3[0], res3[1])
		})

		test('shared subarray references in valid rectangular inputs do not cause errors or aliasing', () => {
			const row = [2n, 3n]
			const A = [row, row]
			const B = [5n, 7n]
			const result = tensorProductBigIntIterative(A, B)
			assert.deepEqual(result, [
				[
					[10n, 14n],
					[15n, 21n],
				],
				[
					[10n, 14n],
					[15n, 21n],
				],
			])
			assert.notEqual(result[0], result[1])
			// Verify original inputs are unmutated
			assert.deepEqual(row, [2n, 3n])
			assert.deepEqual(B, [5n, 7n])
		})
	})

	describe('input validation', () => {
		test('rejects non-BigInt top-level inputs', () => {
			for (const bad of [null, undefined, 42, NaN, Infinity, '123', true, {}, Symbol('x'), new BigInt64Array([1n])]) {
				assert.throws(() => tensorProductBigIntIterative(bad, [1n]), TypeError)
				assert.throws(() => tensorProductBigIntIterative([1n], bad), TypeError)
			}
			assert.throws(() => tensorProductBigIntIterative([1n]), TypeError)
		})

		test('rejects non-BigInt nested elements and sparse arrays', () => {
			assert.throws(() => tensorProductBigIntIterative([1n, 2], [3n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n], [[2n, '3']]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([null], [1n]), TypeError)

			const sparse = new Array(2)
			sparse[0] = 1n
			assert.throws(() => tensorProductBigIntIterative(sparse, [1n]), TypeError)
		})

		test('rejects mixed nesting depths', () => {
			assert.throws(() => tensorProductBigIntIterative([1n, [2n]], [1n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([[1n], 2n], [1n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n], [[[1n]], [2n]]), TypeError)
		})

		test('rejects ragged (non-rectangular) arrays', () => {
			assert.throws(() => tensorProductBigIntIterative([[1n, 2n], [3n]], [1n]), RangeError)
			assert.throws(() => tensorProductBigIntIterative([[1n], []], [1n]), RangeError)
			assert.throws(() => tensorProductBigIntIterative([[], [1n]], [1n]), RangeError)
			assert.throws(
				() =>
					tensorProductBigIntIterative(
						[1n],
						[
							[
								[1n, 2n],
								[3n, 4n],
							],
							[[5n, 6n]],
						],
					),
				RangeError,
			)
		})

		test('rejects circular array references', () => {
			const circular = []
			circular.push(circular)
			assert.throws(() => tensorProductBigIntIterative(circular, [1n]), TypeError)
			assert.throws(() => tensorProductBigIntIterative([1n], circular), TypeError)
		})
	})

	describe('algebraic cross-checks against independent computations', () => {
		test('Kronecker product equivalence and trace identity: tr(A ⊗ B) = tr(A) * tr(B)', () => {
			const A = [
				[2n, -3n, 5n],
				[7n, 11n, -13n],
				[17n, -19n, 23n],
			]
			const B = [
				[4n, -6n],
				[8n, 10n],
			]

			const T = tensorProductBigIntIterative(A, B)
			const K = kroneckerProduct2D(A, B)

			// Verify entry-by-entry correspondence between 4D tensor product and 2D Kronecker product
			for (let i = 0; i < A.length; i++) {
				for (let j = 0; j < A[0].length; j++) {
					for (let k = 0; k < B.length; k++) {
						for (let l = 0; l < B[0].length; l++) {
							assert.equal(T[i][j][k][l], K[i * B.length + k][j * B[0].length + l])
						}
					}
				}
			}

			// Trace identity: sum_{i,k} T[i][i][k][k] === tr(K) === tr(A) * tr(B)
			let trA = 0n
			for (let i = 0; i < A.length; i++) trA += A[i][i]
			let trB = 0n
			for (let k = 0; k < B.length; k++) trB += B[k][k]
			let trK = 0n
			for (let idx = 0; idx < K.length; idx++) trK += K[idx][idx]
			let trT = 0n
			for (let i = 0; i < A.length; i++) {
				for (let k = 0; k < B.length; k++) {
					trT += T[i][i][k][k]
				}
			}

			assert.equal(trT, trA * trB)
			assert.equal(trT, trK)
		})

		test('sum factorization and Frobenius norm squared factorization', () => {
			const A = [
				[
					[3n, -5n, 7n],
					[11n, -13n, 17n],
				],
				[
					[-19n, 23n, -29n],
					[31n, -37n, 41n],
				],
			]
			const B = [
				[1000000000000000000n, -2000000000000000000n],
				[3500000000000000000n, 4250000000000000000n],
			]

			const T = tensorProductBigIntIterative(A, B)

			// Sum(A ⊗ B) = Sum(A) * Sum(B)
			assert.equal(sumTensor(T), sumTensor(A) * sumTensor(B))

			// ||A ⊗ B||_F^2 = ||A||_F^2 * ||B||_F^2
			assert.equal(sumSquaresTensor(T), sumSquaresTensor(A) * sumSquaresTensor(B))
		})

		test('associativity and bilinearity', () => {
			const A1 = [2n, -3n]
			const A2 = [5n, 7n]
			const B = [
				[1n, 4n],
				[-2n, 6n],
			]
			const C = [9n, -8n, 11n]

			// Associativity: (A1 ⊗ B) ⊗ C === A1 ⊗ (B ⊗ C)
			const leftAssoc = tensorProductBigIntIterative(tensorProductBigIntIterative(A1, B), C)
			const rightAssoc = tensorProductBigIntIterative(A1, tensorProductBigIntIterative(B, C))
			assert.deepEqual(leftAssoc, rightAssoc)

			// Left distributivity: (A1 + A2) ⊗ B === (A1 ⊗ B) + (A2 ⊗ B)
			const lhs = tensorProductBigIntIterative(addTensors(A1, A2), B)
			const rhs = addTensors(
				tensorProductBigIntIterative(A1, B),
				tensorProductBigIntIterative(A2, B),
			)
			assert.deepEqual(lhs, rhs)

			// Vector outer product action: (u ⊗ v) w = u * (v · w)
			const u = [3n, -5n, 7n]
			const v = [2n, 4n, -6n]
			const w = [10n, -1n, 5n]
			const outer = tensorProductBigIntIterative(u, v)
			const vDotW = v[0] * w[0] + v[1] * w[1] + v[2] * w[2]
			const matVec = outer.map((row) => row[0] * w[0] + row[1] * w[1] + row[2] * w[2])
			const expected = u.map((ui) => ui * vDotW)
			assert.deepEqual(matVec, expected)
		})
	})
})
