import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductFloatIterative } from './tensorProductFloatIterative.js'

/**
 * Independent helper to compute the shape of a nested array (or [] for scalar).
 */
function getShape(t) {
	const shape = []
	let cur = t
	while (Array.isArray(cur)) {
		shape.push(cur.length)
		cur = cur[0]
	}
	return shape
}

/**
 * Independent helper to compute the Frobenius norm ||T||_F = sqrt(sum(t_i^2)).
 */
function frobeniusNorm(t) {
	let sumSq = 0
	const stack = [t]
	while (stack.length > 0) {
		const cur = stack.pop()
		if (Array.isArray(cur)) {
			for (let i = 0; i < cur.length; i++) {
				stack.push(cur[i])
			}
		} else {
			sumSq += cur * cur
		}
	}
	return Math.sqrt(sumSq)
}

/**
 * Independent helper to compute the Kronecker product of two 2D matrices.
 */
function independentKronecker2D(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B.length
	const q = B[0].length
	const out = Array.from({ length: m * p }, () => new Array(n * q))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			for (let k = 0; k < p; k++) {
				for (let l = 0; l < q; l++) {
					out[i * p + k][j * q + l] = A[i][j] * B[k][l]
				}
			}
		}
	}
	return out
}

/**
 * Independent helper to compute the trace of a square 2D matrix.
 */
function trace2D(M) {
	let sum = 0
	for (let i = 0; i < M.length; i++) {
		sum += M[i][i]
	}
	return sum
}

/**
 * Helper to compare nested arrays element-wise within floating-point tolerance.
 */
function assertCloseNested(actual, expected, tol = 1e-12) {
	if (typeof expected === 'number') {
		assert.equal(typeof actual, 'number')
		assert.ok(
			Math.abs(actual - expected) <= tol,
			`Expected ${actual} to be within ${tol} of ${expected}`
		)
		return
	}
	assert.ok(Array.isArray(actual), 'Expected an Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertCloseNested(actual[i], expected[i], tol)
	}
}

describe('tensorProductFloatIterative', () => {
	describe('normal cases across ranks', () => {
		test('0D x 0D (scalar product)', () => {
			assert.equal(tensorProductFloatIterative(3, 4), 12)
			assert.equal(tensorProductFloatIterative(-2.5, 4), -10)
			assert.equal(tensorProductFloatIterative(0, 7.5), 0)
		})

		test('0D x ND and ND x 0D (scalar scaling)', () => {
			assert.deepEqual(tensorProductFloatIterative(2, [1, -3, 4.5]), [2, -6, 9])
			assert.deepEqual(tensorProductFloatIterative([1, -3, 4.5], 2), [2, -6, 9])
			assert.deepEqual(
				tensorProductFloatIterative(0.5, [
					[2, 4],
					[6, 8],
				]),
				[
					[1, 2],
					[3, 4],
				]
			)
			assert.deepEqual(
				tensorProductFloatIterative(
					[
						[2, 4],
						[6, 8],
					],
					-1
				),
				[
					[-2, -4],
					[-6, -8],
				]
			)
		})

		test('1D x 1D (vector outer product)', () => {
			const u = [1, 2, 3]
			const v = [4, 5]
			const result = tensorProductFloatIterative(u, v)
			assert.deepEqual(getShape(result), [3, 2])
			assert.deepEqual(result, [
				[4, 5],
				[8, 10],
				[12, 15],
			])
		})

		test('1D x 2D and 2D x 1D (rank-3 tensors)', () => {
			const v = [2, -1]
			const M = [
				[1, 3],
				[4, 5],
			]
			const vm = tensorProductFloatIterative(v, M)
			assert.deepEqual(getShape(vm), [2, 2, 2])
			assert.deepEqual(vm, [
				[
					[2, 6],
					[8, 10],
				],
				[
					[-1, -3],
					[-4, -5],
				],
			])

			const mv = tensorProductFloatIterative(M, v)
			assert.deepEqual(getShape(mv), [2, 2, 2])
			assert.deepEqual(mv, [
				[
					[2, -1],
					[6, -3],
				],
				[
					[8, -4],
					[10, -5],
				],
			])
		})

		test('2D x 2D (rank-4 tensor product)', () => {
			const A = [
				[1, 2],
				[3, 4],
			]
			const B = [
				[0, 5, -1],
				[6, 7, 2],
			]
			const C = tensorProductFloatIterative(A, B)
			assert.deepEqual(getShape(C), [2, 2, 2, 3])
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					for (let k = 0; k < 2; k++) {
						for (let l = 0; l < 3; l++) {
							assert.equal(C[i][j][k][l], A[i][j] * B[k][l])
						}
					}
				}
			}
		})

		test('higher-rank tensors (2D x 3D -> rank-5)', () => {
			const A = [
				[1.5, -2],
				[0.5, 4],
			]
			const B = [
				[
					[1, 2],
					[3, 4],
				],
				[
					[-1, 0],
					[2.5, -0.5],
				],
			]
			const C = tensorProductFloatIterative(A, B)
			assert.deepEqual(getShape(C), [2, 2, 2, 2, 2])
			for (let i0 = 0; i0 < 2; i0++) {
				for (let i1 = 0; i1 < 2; i1++) {
					for (let j0 = 0; j0 < 2; j0++) {
						for (let j1 = 0; j1 < 2; j1++) {
							for (let j2 = 0; j2 < 2; j2++) {
								assert.equal(
									C[i0][i1][j0][j1][j2],
									A[i0][i1] * B[j0][j1][j2]
								)
							}
						}
					}
				}
			}
		})
	})

	describe('edge cases: zeros, negatives, floats, singletons, immutability', () => {
		test('zero and negative values including signed zero', () => {
			const res = tensorProductFloatIterative([0, -0, -2.5], [3, -4, 0])
			assert.deepEqual(res, [
				[0, -0, 0],
				[-0, 0, -0],
				[-7.5, 10, -0],
			])
			assert.ok(Object.is(res[0][1], -0))
			assert.ok(Object.is(res[1][0], -0))
			assert.ok(Object.is(res[1][1], 0))
		})

		test('singleton dimensions and subnormal/large finite float64 values', () => {
			const res = tensorProductFloatIterative([[Number.MIN_VALUE]], [[2]])
			assert.deepEqual(getShape(res), [1, 1, 1, 1])
			assert.equal(res[0][0][0][0], Number.MIN_VALUE * 2)

			const scaled = tensorProductFloatIterative([1e-150], [1e150])
			assertCloseNested(scaled, [[1]], 1e-12)
		})

		test('does not mutate inputs and returns fresh arrays', () => {
			const a = [
				[1, 2],
				[3, 4],
			]
			const b = [5, 6]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)

			const out = tensorProductFloatIterative(a, b)
			out[0][0][0] = 9999

			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
		})
	})

	describe('mathematical identities and independent cross-checks', () => {
		test('Frobenius norm identity ||A ⊗ B||_F = ||A||_F * ||B||_F across ranks', () => {
			const cases = [
				{
					a: [1.5, -2.25, 3.75],
					b: [-4.1, 0.5, 2.3, -1.7],
				},
				{
					a: [
						[1.2, -3.4, 5.6],
						[-0.8, 2.1, 4.3],
					],
					b: [
						[0.7, -1.9],
						[3.3, 2.8],
						[-4.5, 1.1],
					],
				},
				{
					a: [
						[
							[1, -2],
							[3, 0.5],
						],
						[
							[-1.5, 2.5],
							[0.25, -4],
						],
					],
					b: [
						[2, -1, 0.5],
						[-3, 4, -2],
					],
				},
			]

			for (const { a, b } of cases) {
				const prod = tensorProductFloatIterative(a, b)
				const lhs = frobeniusNorm(prod)
				const rhs = frobeniusNorm(a) * frobeniusNorm(b)
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-11 * Math.max(1, rhs),
					`Frobenius identity mismatch: lhs=${lhs}, rhs=${rhs}`
				)
			}
		})

		test('Kronecker matricization and trace identity tr(A ⊗ B) = tr(A) * tr(B)', () => {
			const A = [
				[2.5, -1.0, 0.5],
				[3.0, 4.2, -2.1],
				[-0.7, 1.8, 3.3],
			]
			const B = [
				[1.5, -0.4],
				[2.2, -3.1],
			]

			const tensorProd = tensorProductFloatIterative(A, B)
			const kron = independentKronecker2D(A, B)

			// Verify entry-wise equivalence between 4D tensor product and 2D Kronecker product
			for (let i = 0; i < A.length; i++) {
				for (let j = 0; j < A[0].length; j++) {
					for (let k = 0; k < B.length; k++) {
						for (let l = 0; l < B[0].length; l++) {
							assert.equal(
								tensorProd[i][j][k][l],
								kron[i * B.length + k][j * B[0].length + l]
							)
						}
					}
				}
			}

			// Verify trace identity independently from both representations
			let tensorTrace = 0
			for (let i = 0; i < A.length; i++) {
				for (let k = 0; k < B.length; k++) {
					tensorTrace += tensorProd[i][i][k][k]
				}
			}
			const expectedTrace = trace2D(A) * trace2D(B)
			const kronTrace = trace2D(kron)

			assert.ok(Math.abs(tensorTrace - expectedTrace) <= 1e-12)
			assert.ok(Math.abs(kronTrace - expectedTrace) <= 1e-12)
		})

		test('associativity (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C) and bilinearity', () => {
			const A = [1.5, -2.0]
			const B = [
				[0.5, 3.0],
				[-1.0, 2.0],
			]
			const C = [4.0, -0.5, 1.25]

			const leftAssoc = tensorProductFloatIterative(
				tensorProductFloatIterative(A, B),
				C
			)
			const rightAssoc = tensorProductFloatIterative(
				A,
				tensorProductFloatIterative(B, C)
			)
			assert.deepEqual(getShape(leftAssoc), [2, 2, 2, 3])
			assert.deepEqual(getShape(rightAssoc), [2, 2, 2, 3])
			assertCloseNested(leftAssoc, rightAssoc, 1e-12)

			// Scalar bilinearity: (alpha * A) ⊗ B = A ⊗ (alpha * B) = alpha * (A ⊗ B)
			const alpha = -3.25
			const lhs = tensorProductFloatIterative(
				tensorProductFloatIterative(alpha, A),
				B
			)
			const mid = tensorProductFloatIterative(
				A,
				tensorProductFloatIterative(alpha, B)
			)
			const rhs = tensorProductFloatIterative(
				alpha,
				tensorProductFloatIterative(A, B)
			)
			assertCloseNested(lhs, mid, 1e-12)
			assertCloseNested(lhs, rhs, 1e-12)
		})
	})

	describe('input validation errors', () => {
		test('rejects non-number / non-array inputs', () => {
			const invalidInputs = [null, undefined, '123', {}, true, 1n, Symbol('s')]
			for (const bad of invalidInputs) {
				assert.throws(() => tensorProductFloatIterative(bad, [1, 2]), TypeError)
				assert.throws(() => tensorProductFloatIterative([1, 2], bad), TypeError)
				assert.throws(
					() => tensorProductFloatIterative([1, bad], [1, 2]),
					TypeError
				)
			}
		})

		test('rejects non-finite float64 values (NaN, Infinity, -Infinity)', () => {
			const nonFinite = [NaN, Infinity, -Infinity]
			for (const bad of nonFinite) {
				assert.throws(() => tensorProductFloatIterative(bad, 1), RangeError)
				assert.throws(() => tensorProductFloatIterative(1, bad), RangeError)
				assert.throws(
					() => tensorProductFloatIterative([1, bad], [2, 3]),
					RangeError
				)
				assert.throws(
					() =>
						tensorProductFloatIterative(
							[
								[1, 2],
								[3, bad],
							],
							[1]
						),
					RangeError
				)
			}
		})

		test('rejects empty arrays at any dimension', () => {
			assert.throws(() => tensorProductFloatIterative([], [1]), RangeError)
			assert.throws(() => tensorProductFloatIterative([1], []), RangeError)
			assert.throws(() => tensorProductFloatIterative([[]], [1]), RangeError)
			assert.throws(
				() => tensorProductFloatIterative([[1, 2], []], [1]),
				RangeError
			)
			assert.throws(
				() => tensorProductFloatIterative([[], [1, 2]], [1]),
				RangeError
			)
		})

		test('rejects ragged / non-rectangular arrays and inconsistent nesting depth', () => {
			assert.throws(
				() => tensorProductFloatIterative([[1, 2], [3]], [1]),
				TypeError
			)
			assert.throws(
				() => tensorProductFloatIterative([1, [2]], [1]),
				TypeError
			)
			assert.throws(
				() => tensorProductFloatIterative([[1], 2], [1]),
				TypeError
			)
			assert.throws(
				() =>
					tensorProductFloatIterative(
						[
							[
								[1, 2],
								[3, 4],
							],
							[[5, 6]],
						],
						[1]
					),
				TypeError
			)
			assert.throws(
				() =>
					tensorProductFloatIterative(
						[
							[1, 2],
							[3, [4]],
						],
						[1]
					),
				TypeError
			)
		})

		test('rejects sparse arrays and circular references', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => tensorProductFloatIterative(sparse, [1]), TypeError)
			assert.throws(
				() => tensorProductFloatIterative(new Array(2), [1]),
				TypeError
			)

			const circular = []
			circular.push(circular)
			assert.throws(() => tensorProductFloatIterative(circular, [1]), TypeError)
		})
	})
})
