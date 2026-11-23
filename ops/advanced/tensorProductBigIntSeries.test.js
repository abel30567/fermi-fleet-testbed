import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductBigIntSeries } from './tensorProductBigIntSeries.js'

/** Independent BigInt matrix multiplication helper for algebraic cross-checks. */
function matMul(a, b) {
	const m = a.length
	const k = a[0].length
	const n = b[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0n
			for (let t = 0; t < k; t++) {
				sum += a[i][t] * b[t][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

/** Independent BigInt matrix addition helper. */
function matAdd(a, b) {
	return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

/** Independent BigInt matrix transpose helper. */
function matTranspose(a) {
	const m = a.length
	const n = a[0].length
	return Array.from({ length: n }, (_, j) =>
		Array.from({ length: m }, (_, i) => a[i][j]),
	)
}

/** Independent BigInt matrix trace helper. */
function matTrace(a) {
	let tr = 0n
	for (let i = 0; i < a.length; i++) {
		tr += a[i][i]
	}
	return tr
}

/** Independent sum of all entries in a 2D matrix. */
function matSum(a) {
	let sum = 0n
	for (const row of a) {
		for (const v of row) sum += v
	}
	return sum
}

/** Exact BigInt determinant via cofactor expansion (for small test matrices). */
function matDet(a) {
	const n = a.length
	if (n === 1) return a[0][0]
	if (n === 2) return a[0][0] * a[1][1] - a[0][1] * a[1][0]
	let det = 0n
	for (let col = 0; col < n; col++) {
		const minor = a.slice(1).map((row) => row.filter((_, j) => j !== col))
		const sign = col % 2 === 0 ? 1n : -1n
		det += sign * a[0][col] * matDet(minor)
	}
	return det
}

describe('tensorProductBigIntSeries', () => {
	test('computes classic 2x2 Kronecker product', () => {
		const A = [
			[1n, 2n],
			[3n, 4n],
		]
		const B = [
			[0n, 5n],
			[6n, 7n],
		]
		assert.deepEqual(tensorProductBigIntSeries(A, B), [
			[0n, 5n, 0n, 10n],
			[6n, 7n, 12n, 14n],
			[0n, 15n, 0n, 20n],
			[18n, 21n, 24n, 28n],
		])
	})

	test('computes rectangular matrix Kronecker product with negative values', () => {
		const A = [
			[1n, -2n, 3n],
			[0n, 4n, -5n],
		]
		const B = [
			[2n, -1n],
			[3n, 0n],
			[-4n, 5n],
		]
		const res = tensorProductBigIntSeries(A, B)
		assert.equal(res.length, 6)
		assert.equal(res[0].length, 6)
		assert.deepEqual(res, [
			[2n, -1n, -4n, 2n, 6n, -3n],
			[3n, 0n, -6n, 0n, 9n, 0n],
			[-4n, 5n, 8n, -10n, -12n, 15n],
			[0n, 0n, 8n, -4n, -10n, 5n],
			[0n, 0n, 12n, 0n, -15n, 0n],
			[0n, 0n, -16n, 20n, 20n, -25n],
		])
	})

	test('computes 1D vector Kronecker product', () => {
		assert.deepEqual(
			tensorProductBigIntSeries([1n, -2n, 3n], [4n, 0n, -5n]),
			[4n, 0n, -5n, -8n, 0n, 10n, 12n, 0n, -15n],
		)
	})

	test('preserves exact precision for huge BigInts beyond MAX_SAFE_INTEGER', () => {
		const p = 10n ** 40n + 7n
		const q = 10n ** 40n - 13n
		const r = (1n << 200n) + 1234567890123456789n
		const s = -((1n << 180n) - 9876543210987654321n)
		const res = tensorProductBigIntSeries(
			[
				[p, q],
				[-q, p],
			],
			[[r, s]],
		)
		assert.deepEqual(res, [
			[p * r, p * s, q * r, q * s],
			[-q * r, -q * s, p * r, p * s],
		])
	})

	test('edge cases: 1x1 matrices, row x column, identity blocks, and zero matrix', () => {
		assert.deepEqual(tensorProductBigIntSeries([[7n]], [[-9n]]), [[-63n]])

		// Scalar 1x1 matrix scales B
		const B = [
			[2n, 3n],
			[5n, 7n],
		]
		assert.deepEqual(tensorProductBigIntSeries([[11n]], B), [
			[22n, 33n],
			[55n, 77n],
		])

		// Row vector (1x3) ⊗ column vector (2x1) -> 2x3 outer product
		assert.deepEqual(tensorProductBigIntSeries([[2n, 3n, 5n]], [[7n], [11n]]), [
			[14n, 21n, 35n],
			[22n, 33n, 55n],
		])

		// Identity block diagonal: I_2 ⊗ B = diag(B, B)
		const I2 = [
			[1n, 0n],
			[0n, 1n],
		]
		assert.deepEqual(tensorProductBigIntSeries(I2, B), [
			[2n, 3n, 0n, 0n],
			[5n, 7n, 0n, 0n],
			[0n, 0n, 2n, 3n],
			[0n, 0n, 5n, 7n],
		])

		// Zero matrix annihilates product
		const Z = [
			[0n, 0n],
			[0n, 0n],
		]
		assert.deepEqual(tensorProductBigIntSeries(Z, B), [
			[0n, 0n, 0n, 0n],
			[0n, 0n, 0n, 0n],
			[0n, 0n, 0n, 0n],
			[0n, 0n, 0n, 0n],
		])
	})

	test('does not mutate input operands', () => {
		const A = [
			[1n, 2n],
			[3n, 4n],
		]
		const B = [[5n, 6n]]
		const aSnap = structuredClone(A)
		const bSnap = structuredClone(B)
		const out = tensorProductBigIntSeries(A, B)
		out[0][0] = 999n
		assert.deepEqual(A, aSnap)
		assert.deepEqual(B, bSnap)
	})

	test('cross-check: mixed-product identity (A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)', () => {
		const A = [
			[1n, -2n, 3n],
			[4n, 5n, -6n],
		]
		const C = [
			[7n, -1n],
			[0n, 2n],
			[-3n, 4n],
		]
		const B = [
			[10n ** 25n + 1n, -3n],
			[2n, 5n],
			[-4n, 10n ** 25n - 7n],
		]
		const D = [
			[3n, -2n, 1n, 0n],
			[-1n, 4n, 2n, 5n],
		]

		const lhs = matMul(
			tensorProductBigIntSeries(A, B),
			tensorProductBigIntSeries(C, D),
		)
		const rhs = tensorProductBigIntSeries(matMul(A, C), matMul(B, D))
		assert.deepEqual(lhs, rhs)
	})

	test('cross-check: trace, determinant, transpose, and sum identities', () => {
		const A = [
			[3n, -5n],
			[7n, 11n],
		]
		const B = [
			[2n, 13n],
			[-17n, 19n],
		]
		const K = tensorProductBigIntSeries(A, B)

		// Trace identity: tr(A ⊗ B) = tr(A) * tr(B)
		assert.equal(matTrace(K), matTrace(A) * matTrace(B))

		// Determinant identity: det(A ⊗ B) = det(A)^p * det(B)^m (here m=2, p=2)
		assert.equal(matDet(K), matDet(A) ** 2n * matDet(B) ** 2n)

		// Transpose identity: (A ⊗ B)^T = A^T ⊗ B^T
		assert.deepEqual(
			matTranspose(K),
			tensorProductBigIntSeries(matTranspose(A), matTranspose(B)),
		)

		// Sum identity: Σ(A ⊗ B) = (ΣA)(ΣB)
		assert.equal(matSum(K), matSum(A) * matSum(B))

		// 1D sum identity
		const u = [10n ** 30n, -5n, 17n]
		const v = [-3n, 2n ** 100n, 9n, -11n]
		const uv = tensorProductBigIntSeries(u, v)
		const sumU = u.reduce((acc, x) => acc + x, 0n)
		const sumV = v.reduce((acc, x) => acc + x, 0n)
		const sumUV = uv.reduce((acc, x) => acc + x, 0n)
		assert.equal(sumUV, sumU * sumV)
	})

	test('cross-check: associativity, bilinearity, and closed-form index identity', () => {
		const A = [
			[1n, -3n],
			[2n, 4n],
		]
		const B = [
			[5n, 0n, -1n],
			[2n, 3n, 7n],
		]
		const C = [
			[-2n, 6n],
			[1n, -5n],
		]

		// Associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)
		assert.deepEqual(
			tensorProductBigIntSeries(tensorProductBigIntSeries(A, B), C),
			tensorProductBigIntSeries(A, tensorProductBigIntSeries(B, C)),
		)

		// Bilinearity: (A + C) ⊗ B = (A ⊗ B) + (C ⊗ B)
		assert.deepEqual(
			tensorProductBigIntSeries(matAdd(A, C), B),
			matAdd(tensorProductBigIntSeries(A, B), tensorProductBigIntSeries(C, B)),
		)

		// Direct quotient-remainder coordinate identity cross-check
		const K = tensorProductBigIntSeries(A, B)
		const p = B.length
		const q = B[0].length
		for (let I = 0; I < K.length; I++) {
			for (let J = 0; J < K[0].length; J++) {
				const expected =
					A[Math.floor(I / p)][Math.floor(J / q)] * B[I % p][J % q]
				assert.equal(K[I][J], expected)
			}
		}
	})

	test('throws TypeError or RangeError on invalid inputs', () => {
		// Non-array inputs
		assert.throws(() => tensorProductBigIntSeries(null, [[1n]]), TypeError)
		assert.throws(() => tensorProductBigIntSeries([[1n]], undefined), TypeError)
		assert.throws(() => tensorProductBigIntSeries(5n, [1n]), TypeError)
		assert.throws(() => tensorProductBigIntSeries('1', [1n]), TypeError)
		assert.throws(() => tensorProductBigIntSeries({}, [[1n]]), TypeError)

		// Empty operands or empty rows
		assert.throws(() => tensorProductBigIntSeries([], [1n]), RangeError)
		assert.throws(() => tensorProductBigIntSeries([1n], []), RangeError)
		assert.throws(() => tensorProductBigIntSeries([[]], [[1n]]), RangeError)
		assert.throws(() => tensorProductBigIntSeries([[1n]], [[]]), RangeError)

		// Ragged 2D matrices
		assert.throws(
			() => tensorProductBigIntSeries([[1n, 2n], [3n]], [[1n]]),
			RangeError,
		)
		assert.throws(
			() => tensorProductBigIntSeries([[1n]], [[1n], [2n, 3n]]),
			RangeError,
		)

		// Non-BigInt elements (including regular numbers, strings, NaN, sparse holes)
		assert.throws(() => tensorProductBigIntSeries([1, 2], [3n, 4n]), TypeError)
		assert.throws(() => tensorProductBigIntSeries([[1n, 2]], [[3n]]), TypeError)
		assert.throws(
			() => tensorProductBigIntSeries([[1n]], [['3']]),
			TypeError,
		)
		assert.throws(
			() => tensorProductBigIntSeries([[NaN]], [[1n]]),
			TypeError,
		)
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => tensorProductBigIntSeries([1n, , 3n], [1n]), TypeError)

		// Rank mismatch and unsupported 3D arrays
		assert.throws(() => tensorProductBigIntSeries([1n, 2n], [[3n]]), TypeError)
		assert.throws(() => tensorProductBigIntSeries([[1n]], [2n, 3n]), TypeError)
		assert.throws(
			() => tensorProductBigIntSeries([[[1n]]], [[[2n]]]),
			TypeError,
		)
		assert.throws(
			() => tensorProductBigIntSeries([[1n], 2n], [[3n]]),
			TypeError,
		)
	})
})
