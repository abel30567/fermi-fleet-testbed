import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceFloatRecursive } from './traceFloatRecursive.js'

function assertClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

function matAdd(A, B) {
	return A.map((row, i) => row.map((v, j) => v + B[i][j]))
}

function matScale(A, scalar) {
	return A.map((row) => row.map((v) => v * scalar))
}

function matMul(A, B) {
	const m = A.length
	const k = B.length
	const n = B[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += A[i][p] * B[p][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

function matTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	)
}

function seededMatrix(rows, cols, seed) {
	let state = seed >>> 0
	const next = () => {
		state = (1664525 * state + 1013904223) >>> 0
		return (state / 0x100000000) * 20 - 10
	}
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => next())
	)
}

describe('traceFloatRecursive', () => {
	test('computes trace for 1x1, 2x2, 3x3, and 4x4 matrices', () => {
		assert.equal(traceFloatRecursive([[42.5]]), 42.5)
		assert.equal(
			traceFloatRecursive([
				[1.5, 99],
				[-77, 2.25]
			]),
			3.75
		)
		assert.equal(
			traceFloatRecursive([
				[1, 2, 3],
				[4, -5, 6],
				[7, 8, 9.5]
			]),
			5.5
		)
		assert.equal(
			traceFloatRecursive([
				[0.5, 1, 2, 3],
				[4, 1.5, 5, 6],
				[7, 8, -2.5, 9],
				[10, 11, 12, 3.5]
			]),
			3
		)
	})

	test('ignores off-diagonal entries and handles identity / zero matrices', () => {
		const n = 7
		const identity = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
		)
		const zero = Array.from({ length: n }, () => new Array(n).fill(0))
		const offDiagNoise = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? 1 : (i + 1) * (j + 1) * 1e6))
		)

		assert.equal(traceFloatRecursive(identity), n)
		assert.equal(traceFloatRecursive(zero), 0)
		assert.equal(traceFloatRecursive(offDiagNoise), n)
	})

	test('handles empty 0x0 matrix', () => {
		assert.equal(traceFloatRecursive([]), 0)
	})

	test('handles IEEE-754 special values (-0, subnormals, Infinity, -Infinity, NaN)', () => {
		assert.ok(Object.is(traceFloatRecursive([[-0]]), -0))
		assert.equal(
			traceFloatRecursive([
				[Number.MIN_VALUE, 0],
				[0, Number.MIN_VALUE]
			]),
			2 * Number.MIN_VALUE
		)
		assert.equal(
			traceFloatRecursive([
				[Infinity, 1],
				[2, 5]
			]),
			Infinity
		)
		assert.equal(
			traceFloatRecursive([
				[-Infinity, 0],
				[0, 3]
			]),
			-Infinity
		)
		assert.ok(
			Number.isNaN(
				traceFloatRecursive([
					[Infinity, 0],
					[0, -Infinity]
				])
			)
		)
		assert.ok(
			Number.isNaN(
				traceFloatRecursive([
					[1, 0],
					[0, NaN]
				])
			)
		)
	})

	test('handles larger odd and power-of-two matrices with pairwise accuracy', () => {
		const n = 257
		const M = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? 0.1 : 0))
		)
		const tr = traceFloatRecursive(M)
		const expected = n * 0.1
		assertClose(tr, expected, 1e-13)

		// Compare against sequential summation on a cancellation-prone diagonal:
		// 1 followed by 256 copies of 1e-16 (sequential loses every 1e-16; pairwise accumulates them first).
		const k = 257
		const C = Array.from({ length: k }, (_, i) =>
			Array.from({ length: k }, (_, j) => {
				if (i !== j) return 0
				return i === 0 ? 1 : 1e-16
			})
		)
		const pairwiseTrace = traceFloatRecursive(C)
		assertClose(pairwiseTrace, 1 + 256e-16, 1e-15)
		assert.ok(pairwiseTrace > 1, 'pairwise summation should preserve accumulated small terms')
	})

	test('validates input types and square dimensions', () => {
		assert.throws(() => traceFloatRecursive(null), TypeError)
		assert.throws(() => traceFloatRecursive(undefined), TypeError)
		assert.throws(() => traceFloatRecursive(123), TypeError)
		assert.throws(() => traceFloatRecursive('[[1]]'), TypeError)
		assert.throws(() => traceFloatRecursive({}), TypeError)

		assert.throws(() => traceFloatRecursive([1, 2]), TypeError)
		assert.throws(() => traceFloatRecursive([[1, 2], null]), TypeError)

		assert.throws(
			() =>
				traceFloatRecursive([
					[1, 2, 3],
					[4, 5, 6]
				]),
			RangeError
		)
		assert.throws(() => traceFloatRecursive([[1, 2], [3]]), RangeError)

		assert.throws(
			() =>
				traceFloatRecursive([
					['1', 0],
					[0, 1]
				]),
			TypeError
		)
		assert.throws(
			() =>
				traceFloatRecursive([
					[1, 'off-diagonal'],
					[0, 1]
				]),
			TypeError
		)
		assert.throws(
			() =>
				traceFloatRecursive([
					[1n, 0],
					[0, 1]
				]),
			TypeError
		)

		const sparseRow = new Array(2)
		sparseRow[0] = 1
		assert.throws(() => traceFloatRecursive([sparseRow, [0, 1]]), TypeError)
	})

	test('cross-check: linearity tr(a*A + b*B) = a*tr(A) + b*tr(B)', () => {
		const A = seededMatrix(9, 9, 101)
		const B = seededMatrix(9, 9, 202)
		const alpha = 2.75
		const beta = -1.35

		const lhsSum = traceFloatRecursive(matAdd(A, B))
		const rhsSum = traceFloatRecursive(A) + traceFloatRecursive(B)
		assertClose(lhsSum, rhsSum, 1e-12)

		const lhsLin = traceFloatRecursive(matAdd(matScale(A, alpha), matScale(B, beta)))
		const rhsLin = alpha * traceFloatRecursive(A) + beta * traceFloatRecursive(B)
		assertClose(lhsLin, rhsLin, 1e-11)
	})

	test('cross-check: cyclic property tr(A*B) = tr(B*A) for square and rectangular factors', () => {
		const A = seededMatrix(8, 8, 303)
		const B = seededMatrix(8, 8, 404)
		assertClose(
			traceFloatRecursive(matMul(A, B)),
			traceFloatRecursive(matMul(B, A)),
			1e-10
		)

		// Rectangular A (5x11) and B (11x5): AB is 5x5 and BA is 11x11, yet tr(AB) = tr(BA)
		const R = seededMatrix(5, 11, 505)
		const S = seededMatrix(11, 5, 606)
		assertClose(
			traceFloatRecursive(matMul(R, S)),
			traceFloatRecursive(matMul(S, R)),
			1e-10
		)
	})

	test('cross-check: transpose invariance tr(A^T) = tr(A) and orthogonal similarity tr(Q A Q^T) = tr(A)', () => {
		const A = seededMatrix(4, 4, 707)
		assert.equal(traceFloatRecursive(matTranspose(A)), traceFloatRecursive(A))

		// Build a 4x4 Householder orthogonal matrix Q = I - 2 * u * u^T / (u^T u)
		const u = [1.2, -0.7, 2.3, 0.5]
		const normSq = u.reduce((acc, x) => acc + x * x, 0)
		const Q = Array.from({ length: 4 }, (_, i) =>
			Array.from({ length: 4 }, (_, j) => (i === j ? 1 : 0) - (2 * u[i] * u[j]) / normSq)
		)
		const similar = matMul(matMul(Q, A), matTranspose(Q))
		assertClose(traceFloatRecursive(similar), traceFloatRecursive(A), 1e-11)
	})
})
