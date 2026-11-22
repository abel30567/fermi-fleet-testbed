import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductFloatSeries } from './tensorProductFloatSeries.js'

/**
 * Helper: asserts two numbers or nested float64 tensors have identical shape and
 * matching entries within `tol`.
 */
function assertTensorClose(actual, expected, tol = 1e-12) {
	if (typeof expected === 'number') {
		assert.equal(typeof actual, 'number')
		assert.ok(
			Math.abs(actual - expected) <= tol,
			`Expected ${actual} to be within ${tol} of ${expected}`
		)
		return
	}
	assert.ok(Array.isArray(actual), 'Expected array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertTensorClose(actual[i], expected[i], tol)
	}
}

/** Helper: independent matrix multiplication A (m×n) * B (n×p). */
function matMul(a, b) {
	const m = a.length
	const n = a[0].length
	const p = b[0].length
	const out = Array.from({ length: m }, () => new Array(p).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[i][k] * b[k][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

/** Helper: trace of a square 2D matrix. */
function trace(m) {
	let sum = 0
	for (let i = 0; i < m.length; i++) {
		sum += m[i][i]
	}
	return sum
}

/** Helper: transpose of a 2D matrix. */
function transpose(m) {
	const rows = m.length
	const cols = m[0].length
	return Array.from({ length: cols }, (_, c) =>
		Array.from({ length: rows }, (_, r) => m[r][c])
	)
}

/** Helper: element-wise addition of two identically shaped tensors. */
function addTensor(a, b) {
	if (typeof a === 'number') return a + b
	return a.map((v, i) => addTensor(v, b[i]))
}

/** Helper: scalar multiplication of a tensor. */
function mulScalar(s, a) {
	if (typeof a === 'number') return s * a
	return a.map((v) => mulScalar(s, v))
}

/** Helper: sum of all entries in an arbitrarily nested tensor. */
function sumEntries(t) {
	if (typeof t === 'number') return t
	let total = 0
	for (const v of t) {
		total += sumEntries(v)
	}
	return total
}

describe('tensorProductFloatSeries', () => {
	describe('normal cases', () => {
		test('1D × 1D vectors produce the outer product matrix', () => {
			const u = [1, 2, 3]
			const v = [4, -5]
			const result = tensorProductFloatSeries(u, v)
			assert.deepStrictEqual(result, [
				[4, -5],
				[8, -10],
				[12, -15],
			])
		})

		test('2D × 2D matrices produce the Kronecker product block matrix', () => {
			const a = [
				[1, 2],
				[3, 4],
			]
			const b = [
				[0, 5],
				[6, 7],
			]
			const result = tensorProductFloatSeries(a, b)
			assert.deepStrictEqual(result, [
				[0, 5, 0, 10],
				[6, 7, 12, 14],
				[0, 15, 0, 20],
				[18, 21, 24, 28],
			])
		})

		test('rectangular 2D × 2D matrices produce (m*p) × (n*q) block matrix', () => {
			const a = [
				[1.5, -2, 0.5],
				[4, 0, -1],
			] // 2×3
			const b = [
				[2, 3],
				[-1, 0.25],
				[0, 5],
			] // 3×2
			const result = tensorProductFloatSeries(a, b)
			assert.equal(result.length, 6)
			assert.equal(result[0].length, 6)

			// Independent closed-form division/modulo index cross-check:
			// (A ⊗ B)[r][c] = A[floor(r / p)][floor(c / q)] * B[r % p][c % q]
			const p = b.length
			const q = b[0].length
			for (let r = 0; r < 6; r++) {
				for (let c = 0; c < 6; c++) {
					const expected = a[Math.floor(r / p)][Math.floor(c / q)] * b[r % p][c % q]
					assertTensorClose(result[r][c], expected, 0)
				}
			}
		})

		test('scalars (0D) and scalar-tensor scaling', () => {
			assert.strictEqual(tensorProductFloatSeries(3.5, -2), -7)
			assert.deepStrictEqual(tensorProductFloatSeries(2.5, [2, -4, 0]), [5, -10, 0])
			assert.deepStrictEqual(tensorProductFloatSeries([2, -4, 0], 2.5), [5, -10, 0])
			assert.deepStrictEqual(
				tensorProductFloatSeries(-2, [
					[1, 3],
					[5, 7],
				]),
				[
					[-2, -6],
					[-10, -14],
				]
			)
		})

		test('mixed-rank and higher-rank (3D) nested float64 arrays via recursive multilinearity', () => {
			const v = [2, 3] // shape [2]
			const m = [
				[1, 4],
				[5, 6],
			] // shape [2, 2]
			const r12 = tensorProductFloatSeries(v, m)
			assert.deepStrictEqual(r12, [
				[
					[2, 8],
					[10, 12],
				],
				[
					[3, 12],
					[15, 18],
				],
			])

			// 3D × 1D → 4D of shape [2, 1, 2, 2]
			const t3 = [[[1, -1]], [[2, 0.5]]]
			const r31 = tensorProductFloatSeries(t3, [10, 20])
			assert.deepStrictEqual(r31, [
				[[[10, 20], [-10, -20]]],
				[[[20, 40], [5, 10]]],
			])
		})
	})

	describe('edge cases', () => {
		test('normalizes -0 products to +0', () => {
			const res = tensorProductFloatSeries([0, -1], [-2, 0])
			assert.deepStrictEqual(res, [
				[0, 0],
				[2, 0],
			])
			assert.ok(Object.is(res[0][0], 0))
			assert.ok(Object.is(res[0][1], 0))
			assert.ok(Object.is(res[1][1], 0))
		})

		test('handles 1×1 matrices and single-element vectors', () => {
			assert.deepStrictEqual(tensorProductFloatSeries([[3]], [[7]]), [[21]])
			assert.deepStrictEqual(tensorProductFloatSeries([3], [7]), [[21]])
		})

		test('handles empty arrays and zero-column matrices consistently', () => {
			assert.deepStrictEqual(tensorProductFloatSeries([], [1, 2]), [])
			assert.deepStrictEqual(tensorProductFloatSeries([1, 2], []), [[], []])
			assert.deepStrictEqual(tensorProductFloatSeries([], []), [])
			assert.deepStrictEqual(tensorProductFloatSeries([[], []], [[1, 2]]), [[], []])
			assert.deepStrictEqual(tensorProductFloatSeries([[1, 2]], [[], []]), [[], []])
		})

		test('does not mutate or alias input arrays (including shared sibling rows)', () => {
			const sharedRow = [1, 2]
			const a = [sharedRow, sharedRow]
			const b = [
				[3, 4],
				[5, 6],
			]
			const out = tensorProductFloatSeries(a, b)
			out[0][0] = 999
			assert.deepStrictEqual(a, [
				[1, 2],
				[1, 2],
			])
			assert.deepStrictEqual(b, [
				[3, 4],
				[5, 6],
			])

			const scaled = tensorProductFloatSeries(1, sharedRow)
			scaled[0] = -42
			assert.deepStrictEqual(sharedRow, [1, 2])
		})

		test('handles subnormal float64 numbers cleanly', () => {
			const res = tensorProductFloatSeries([Number.MIN_VALUE], [2, 0.5])
			assert.strictEqual(res[0][0], Number.MIN_VALUE * 2)
			assert.strictEqual(res[0][1], 0)
			assert.ok(Object.is(res[0][1], 0))
		})
	})

	describe('input validation', () => {
		test('throws TypeError on non-number / non-array inputs', () => {
			assert.throws(() => tensorProductFloatSeries(null, [1]), TypeError)
			assert.throws(() => tensorProductFloatSeries([1], undefined), TypeError)
			assert.throws(() => tensorProductFloatSeries('1', [2]), TypeError)
			assert.throws(() => tensorProductFloatSeries([1, '2'], [3]), TypeError)
			assert.throws(() => tensorProductFloatSeries([true], [1]), TypeError)
			assert.throws(() => tensorProductFloatSeries([1n], [1]), TypeError)
			assert.throws(() => tensorProductFloatSeries({}, [1]), TypeError)
			assert.throws(() => tensorProductFloatSeries(new Float64Array([1, 2]), [1]), TypeError)
		})

		test('throws TypeError on sparse arrays with holes', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => tensorProductFloatSeries(sparse, [1, 2]), TypeError)
			assert.throws(() => tensorProductFloatSeries([1, 2], sparse), TypeError)
		})

		test('throws RangeError on NaN and ±Infinity', () => {
			assert.throws(() => tensorProductFloatSeries(NaN, 1), RangeError)
			assert.throws(() => tensorProductFloatSeries(1, Infinity), RangeError)
			assert.throws(() => tensorProductFloatSeries([1, -Infinity], [2]), RangeError)
			assert.throws(
				() =>
					tensorProductFloatSeries(
						[
							[1, 2],
							[3, NaN],
						],
						[[1]]
					),
				RangeError
			)
		})

		test('throws RangeError on ragged / inconsistent-depth arrays', () => {
			assert.throws(() => tensorProductFloatSeries([[1, 2], [3]], [[1]]), RangeError)
			assert.throws(() => tensorProductFloatSeries([1, [2]], [3]), RangeError)
			assert.throws(() => tensorProductFloatSeries([[[1, 2]], [[3]]], [1]), RangeError)
		})

		test('throws RangeError on circular array references', () => {
			const cyc = [1]
			cyc.push(cyc)
			assert.throws(() => tensorProductFloatSeries(cyc, [1]), RangeError)
		})
	})

	describe('algebraic identity cross-checks', () => {
		test('trace identity: tr(A ⊗ B) = tr(A) · tr(B)', () => {
			const a = [
				[2.5, -1.2, 0.7],
				[4.1, 3.3, -2.0],
				[-0.5, 1.8, -1.1],
			]
			const b = [
				[-1.5, 6.2],
				[0.4, 2.8],
			]
			const kron = tensorProductFloatSeries(a, b)
			assertTensorClose(trace(kron), trace(a) * trace(b), 1e-12)
		})

		test('mixed-product identity: (A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)', () => {
			const a = [
				[1.2, -0.5, 2.1],
				[3.4, 1.1, -0.8],
			] // 2×3
			const c = [
				[0.6, -1.4],
				[2.2, 0.9],
				[-0.3, 1.7],
			] // 3×2
			const b = [
				[2.0, -1.5],
				[0.5, 3.2],
				[-1.1, 0.4],
			] // 3×2
			const d = [
				[1.3, 0.2, -0.7],
				[-0.9, 2.4, 1.5],
			] // 2×3

			const lhs = matMul(
				tensorProductFloatSeries(a, b),
				tensorProductFloatSeries(c, d)
			)
			const rhs = tensorProductFloatSeries(matMul(a, c), matMul(b, d))
			assertTensorClose(lhs, rhs, 1e-12)
		})

		test('bilinearity: additivity in both arguments and scalar homogeneity', () => {
			const a = [
				[1.5, -2.25],
				[0.75, 3.0],
			]
			const b = [
				[-0.5, 1.75],
				[2.25, -1.0],
			]
			const c = [
				[0.25, 4.0, -1.5],
				[-2.0, 0.5, 3.5],
			]
			const alpha = -3.75

			// Left additivity: (A + B) ⊗ C = (A ⊗ C) + (B ⊗ C)
			assertTensorClose(
				tensorProductFloatSeries(addTensor(a, b), c),
				addTensor(tensorProductFloatSeries(a, c), tensorProductFloatSeries(b, c)),
				1e-12
			)

			// Right additivity: C ⊗ (A + B) = (C ⊗ A) + (C ⊗ B)
			assertTensorClose(
				tensorProductFloatSeries(c, addTensor(a, b)),
				addTensor(tensorProductFloatSeries(c, a), tensorProductFloatSeries(c, b)),
				1e-12
			)

			// Scalar homogeneity: (αA) ⊗ C = A ⊗ (αC) = α(A ⊗ C)
			const s1 = tensorProductFloatSeries(mulScalar(alpha, a), c)
			const s2 = tensorProductFloatSeries(a, mulScalar(alpha, c))
			const s3 = mulScalar(alpha, tensorProductFloatSeries(a, c))
			assertTensorClose(s1, s2, 1e-12)
			assertTensorClose(s1, s3, 1e-12)

			// Bilinearity for 1D vectors as well
			const u = [1.2, -3.4, 5.6]
			const v = [-0.8, 2.1, -1.3]
			const w = [4.5, -2.5]
			assertTensorClose(
				tensorProductFloatSeries(addTensor(u, v), w),
				addTensor(tensorProductFloatSeries(u, w), tensorProductFloatSeries(v, w)),
				1e-12
			)
		})

		test('sum of entries identity: (Σ A) · (Σ B) = Σ(A ⊗ B) across ranks', () => {
			// 1D × 1D
			const u = [1.25, -3.5, 4.75, 0.5]
			const v = [-2.0, 1.5, 3.25]
			assertTensorClose(
				sumEntries(tensorProductFloatSeries(u, v)),
				sumEntries(u) * sumEntries(v),
				1e-12
			)

			// 2D × 2D
			const m1 = [
				[1.1, -2.3, 0.7],
				[4.2, 1.5, -3.8],
			]
			const m2 = [
				[-0.9, 2.4],
				[3.1, -1.6],
				[0.8, 2.2],
			]
			assertTensorClose(
				sumEntries(tensorProductFloatSeries(m1, m2)),
				sumEntries(m1) * sumEntries(m2),
				1e-12
			)

			// 3D × 2D
			const t3 = [
				[
					[1.5, -0.5],
					[2.0, 0.25],
				],
				[
					[-1.0, 3.0],
					[0.5, -2.25],
				],
			]
			assertTensorClose(
				sumEntries(tensorProductFloatSeries(t3, m2)),
				sumEntries(t3) * sumEntries(m2),
				1e-12
			)
		})

		test('transpose and associativity identities for 2D Kronecker products', () => {
			const a = [
				[1.5, -2.0],
				[0.5, 3.0],
			]
			const b = [
				[2.0, -1.0, 0.5],
				[4.0, 1.5, -3.0],
			]
			const c = [
				[-1.0, 2.5],
				[0.25, -0.75],
			]

			// (A ⊗ B)^T = A^T ⊗ B^T
			assertTensorClose(
				transpose(tensorProductFloatSeries(a, b)),
				tensorProductFloatSeries(transpose(a), transpose(b)),
				1e-12
			)

			// (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)
			assertTensorClose(
				tensorProductFloatSeries(tensorProductFloatSeries(a, b), c),
				tensorProductFloatSeries(a, tensorProductFloatSeries(b, c)),
				1e-12
			)
		})
	})
})
