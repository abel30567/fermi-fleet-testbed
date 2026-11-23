import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseFloatRecursive } from './inverseFloatRecursive.js'

function matMul(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => new Array(n).fill(0))
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const a = A[i][k]
			for (let j = 0; j < n; j++) {
				C[i][j] += a * B[k][j]
			}
		}
	}
	return C
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
	)
}

function assertMatricesClose(actual, expected, tol = 1e-10, label = '') {
	assert.equal(actual.length, expected.length, `${label} row count mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(
			actual[i].length,
			expected[i].length,
			`${label} col count mismatch at row ${i}`
		)
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j])
			assert.ok(
				diff <= tol,
				`${label} mismatch at [${i}][${j}]: got ${actual[i][j]}, expected ${expected[i][j]} (diff=${diff}, tol=${tol})`
			)
		}
	}
}

function assertValidInverse(A, inv, tol = 1e-10) {
	const I = identity(A.length)
	assertMatricesClose(matMul(A, inv), I, tol, 'A * inv(A)')
	assertMatricesClose(matMul(inv, A), I, tol, 'inv(A) * A')
}

function inverse2x2ClosedForm(A) {
	const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
	return [
		[A[1][1] / det, -A[0][1] / det],
		[-A[1][0] / det, A[0][0] / det],
	]
}

function inverse3x3ClosedForm(A) {
	const [a, b, c] = A[0]
	const [d, e, f] = A[1]
	const [g, h, i] = A[2]
	const c00 = e * i - f * h
	const c01 = -(d * i - f * g)
	const c02 = d * h - e * g
	const c10 = -(b * i - c * h)
	const c11 = a * i - c * g
	const c12 = -(a * h - b * g)
	const c20 = b * f - c * e
	const c21 = -(a * f - c * d)
	const c22 = a * e - b * d
	const det = a * c00 + b * c01 + c * c02
	return [
		[c00 / det, c10 / det, c20 / det],
		[c01 / det, c11 / det, c21 / det],
		[c02 / det, c12 / det, c22 / det],
	]
}

describe('inverseFloatRecursive', () => {
	it('inverts 1x1 matrices', () => {
		assert.deepEqual(inverseFloatRecursive([[1]]), [[1]])
		assertMatricesClose(inverseFloatRecursive([[4]]), [[0.25]], 1e-15)
		assertMatricesClose(inverseFloatRecursive([[-2.5]]), [[-0.4]], 1e-15)
		assertMatricesClose(inverseFloatRecursive([[1e-50]]), [[1e50]], 1e36)
	})

	it('inverts 2x2 matrices and matches closed-form formula', () => {
		const A = [
			[4, 7],
			[2, 6],
		]
		const inv = inverseFloatRecursive(A)
		assertMatricesClose(inv, inverse2x2ClosedForm(A), 1e-14)
		assertValidInverse(A, inv, 1e-14)

		const B = [
			[-3.5, 1.25],
			[4.75, -2.125],
		]
		const invB = inverseFloatRecursive(B)
		assertMatricesClose(invB, inverse2x2ClosedForm(B), 1e-14)
		assertValidInverse(B, invB, 1e-14)
	})

	it('inverts 3x3 matrices and matches closed-form adjugate formula', () => {
		const A = [
			[3, 0, 2],
			[2, 0, -2],
			[0, 1, 1],
		]
		const inv = inverseFloatRecursive(A)
		assertMatricesClose(inv, inverse3x3ClosedForm(A), 1e-13)
		assertValidInverse(A, inv, 1e-13)
	})

	it('handles zero-pivot permutation matrices of various sizes', () => {
		// 2x2 swap
		const P2 = [
			[0, 1],
			[1, 0],
		]
		const invP2 = inverseFloatRecursive(P2)
		assert.deepEqual(invP2, P2)
		assertValidInverse(P2, invP2, 1e-15)

		// 3x3 cyclic permutation (non-symmetric: P^-1 = P^T != P)
		const P3 = [
			[0, 1, 0],
			[0, 0, 1],
			[1, 0, 0],
		]
		const expectedInvP3 = [
			[0, 0, 1],
			[1, 0, 0],
			[0, 1, 0],
		]
		const invP3 = inverseFloatRecursive(P3)
		assert.deepEqual(invP3, expectedInvP3)
		assertValidInverse(P3, invP3, 1e-15)

		// 5x5 anti-diagonal permutation (zero diagonal, odd dimension)
		const P5 = Array.from({ length: 5 }, (_, i) =>
			Array.from({ length: 5 }, (_, j) => (i + j === 4 ? 1 : 0))
		)
		const invP5 = inverseFloatRecursive(P5)
		assert.deepEqual(invP5, P5)
		assertValidInverse(P5, invP5, 1e-15)
	})

	it('handles matrices with singular leading principal submatrices', () => {
		// Top-left 2x2 is [[1, 1], [1, 1]] (singular), yet full 3x3 is invertible
		const A = [
			[1, 1, 1],
			[1, 1, 2],
			[1, 2, 3],
		]
		const invA = inverseFloatRecursive(A)
		assertMatricesClose(invA, inverse3x3ClosedForm(A), 1e-13)
		assertValidInverse(A, invA, 1e-13)

		// Top-left 2x2 is all zeros, yet full 4x4 is invertible
		const B = [
			[0, 0, 2, 1],
			[0, 0, 1, 3],
			[4, 1, 0, 0],
			[2, 5, 0, 0],
		]
		const invB = inverseFloatRecursive(B)
		assertValidInverse(B, invB, 1e-13)
	})

	it('inverts 4x4, 5x5, 7x7, 8x8, and 16x16 matrices and satisfies A*inv(A)=I and inv(A)*A=I', () => {
		// Deterministic LCG for reproducible well-conditioned test matrices
		let seed = 123456789
		const nextRand = () => {
			seed = (1664525 * seed + 1013904223) >>> 0
			return seed / 0x100000000 - 0.5
		}

		for (const n of [4, 5, 7, 8, 16]) {
			const A = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					const val = nextRand() * 4
					// Slight diagonal boost ensures good conditioning
					return i === j ? val + (i % 2 === 0 ? n : -n) : val
				})
			)
			const invA = inverseFloatRecursive(A)
			assertValidInverse(A, invA, 1e-11)
			// Double-inversion cross-check: inv(inv(A)) ≈ A
			const invInvA = inverseFloatRecursive(invA)
			assertMatricesClose(invInvA, A, 1e-10, `inv(inv(A)) for ${n}x${n}`)
		}
	})

	it('inverts ill-conditioned Hilbert 5x5 matrix accurately', () => {
		const n = 5
		const H = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => 1 / (i + j + 1))
		)
		const invH = inverseFloatRecursive(H)
		assertValidInverse(H, invH, 1e-8)
	})

	it('does not mutate the input matrix', () => {
		const A = [
			[0, 2, 1],
			[1, -2, -3],
			[-1, 1, 2],
		]
		const snapshot = A.map((row) => [...row])
		const inv = inverseFloatRecursive(A)
		assert.deepEqual(A, snapshot)
		assertValidInverse(A, inv, 1e-13)
	})

	it('throws on singular matrices', () => {
		const singularCases = [
			[[0]],
			[
				[0, 0],
				[0, 0],
			],
			[
				[1, 2],
				[2, 4],
			],
			[
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			],
			[
				[1, 0, 2, 3],
				[0, 0, 0, 0],
				[4, 5, 6, 7],
				[8, 9, 10, 11],
			],
			[
				[1, 2, 3, 4],
				[2, 4, 6, 8],
				[0, 1, 0, 1],
				[1, 0, 1, 0],
			],
		]

		for (const M of singularCases) {
			assert.throws(() => inverseFloatRecursive(M), /singular/i)
		}
	})

	it('validates input shape and element types', () => {
		assert.throws(() => inverseFloatRecursive(null), TypeError)
		assert.throws(() => inverseFloatRecursive(42), TypeError)
		assert.throws(() => inverseFloatRecursive([]), RangeError)
		assert.throws(() => inverseFloatRecursive([1, 2]), TypeError)
		assert.throws(
			() =>
				inverseFloatRecursive([
					[1, 2, 3],
					[4, 5, 6],
				]),
			RangeError
		)
		assert.throws(
			() =>
				inverseFloatRecursive([
					[1, 2],
					[3],
				]),
			RangeError
		)
		assert.throws(
			() =>
				inverseFloatRecursive([
					[1, NaN],
					[0, 1],
				]),
			TypeError
		)
		assert.throws(
			() =>
				inverseFloatRecursive([
					[1, Infinity],
					[0, 1],
				]),
			TypeError
		)
		assert.throws(
			() =>
				inverseFloatRecursive([
					[1, '2'],
					[0, 1],
				]),
			TypeError
		)
	})
})
