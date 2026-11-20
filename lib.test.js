import { test } from 'node:test'
import assert from 'node:assert'
import { add, qrDecompose } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function matMul(A, B) {
	const m = A.length
	const kLen = A[0].length
	const n = B[0].length
	const C = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let k = 0; k < kLen; k++) {
				sum += A[i][k] * B[k][j]
			}
			C[i][j] = sum
		}
	}
	return C
}

function transpose(A) {
	const m = A.length
	const n = A[0].length
	return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => A[i][j]))
}

function assertMatrixClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < actual[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= tol,
				`Mismatch at [${i}][${j}]: got ${actual[i][j]}, expected ${expected[i][j]}`
			)
		}
	}
}

function assertValidThinQR(A, Q, R, tol = 1e-10) {
	const m = A.length
	const n = A[0].length
	assert.equal(Q.length, m)
	assert.equal(Q[0].length, n)
	assert.equal(R.length, n)
	assert.equal(R[0].length, n)

	// Q * R == A
	assertMatrixClose(matMul(Q, R), A, tol)

	// Q^T * Q == I_n
	const I = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
	assertMatrixClose(matMul(transpose(Q), Q), I, tol)

	// R is upper triangular with positive diagonal
	for (let i = 0; i < n; i++) {
		assert.ok(R[i][i] > 0, `Expected positive diagonal R[${i}][${i}], got ${R[i][i]}`)
		for (let j = 0; j < i; j++) {
			assert.equal(R[i][j], 0, `Expected zero below diagonal R[${i}][${j}], got ${R[i][j]}`)
		}
	}
}

test('qrDecompose: classic 3x3 matrix with exact known Q and R', () => {
	const A = [
		[12, -51, 4],
		[6, 167, -68],
		[-4, 24, -41]
	]
	const { Q, R } = qrDecompose(A)
	assertValidThinQR(A, Q, R)

	const expectedQ = [
		[6 / 7, -69 / 175, -58 / 175],
		[3 / 7, 158 / 175, 6 / 175],
		[-2 / 7, 6 / 35, -33 / 35]
	]
	const expectedR = [
		[14, 21, -14],
		[0, 175, -70],
		[0, 0, 35]
	]
	assertMatrixClose(Q, expectedQ)
	assertMatrixClose(R, expectedR)
})

test('qrDecompose: tall rectangular matrix (m > n) and immutability', () => {
	const A = [
		[1, -1, 4],
		[1, 4, -2],
		[1, 4, 2],
		[1, -1, 0]
	]
	const snapshot = A.map((row) => [...row])
	const { Q, R } = qrDecompose(A)

	assertValidThinQR(A, Q, R)
	assert.deepEqual(A, snapshot)
})

test('qrDecompose: diagonal matrix with negative entries enforces positive R diagonal', () => {
	const A = [
		[-3, 0, 0],
		[0, 4, 0],
		[0, 0, -5]
	]
	const { Q, R } = qrDecompose(A)
	assertValidThinQR(A, Q, R)
	assertMatrixClose(Q, [
		[-1, 0, 0],
		[0, 1, 0],
		[0, 0, -1]
	])
	assertMatrixClose(R, [
		[3, 0, 0],
		[0, 4, 0],
		[0, 0, 5]
	])
})

test('qrDecompose: orthogonal rotation matrix yields Q = A and R = I', () => {
	const theta = Math.PI / 5
	const c = Math.cos(theta)
	const s = Math.sin(theta)
	const A = [
		[c, -s],
		[s, c]
	]
	const { Q, R } = qrDecompose(A)
	assertValidThinQR(A, Q, R)
	assertMatrixClose(Q, A)
	assertMatrixClose(R, [
		[1, 0],
		[0, 1]
	])
})

test('qrDecompose: 1x1, single-column, and small-scale full-rank matrices', () => {
	const res1 = qrDecompose([[-5]])
	assertValidThinQR([[-5]], res1.Q, res1.R)
	assertMatrixClose(res1.Q, [[-1]])
	assertMatrixClose(res1.R, [[5]])

	const col = [[3], [4], [0]]
	const resCol = qrDecompose(col)
	assertValidThinQR(col, resCol.Q, resCol.R)
	assertMatrixClose(resCol.Q, [[0.6], [0.8], [0]])
	assertMatrixClose(resCol.R, [[5]])

	const tiny = [[1e-8]]
	const resTiny = qrDecompose(tiny)
	assertValidThinQR(tiny, resTiny.Q, resTiny.R, 1e-15)
})

test('qrDecompose: ill-conditioned 4x4 Hilbert matrix maintains accuracy under MGS', () => {
	const H = Array.from({ length: 4 }, (_, i) =>
		Array.from({ length: 4 }, (_, j) => 1 / (i + j + 1))
	)
	const { Q, R } = qrDecompose(H)
	assertValidThinQR(H, Q, R, 1e-9)
})

test('qrDecompose: rejects invalid dimensions, non-finite inputs, and rank-deficient matrices', () => {
	assert.throws(() => qrDecompose([]))
	assert.throws(() => qrDecompose([[]]))
	assert.throws(() => qrDecompose([[1, 2, 3], [4, 5, 6]])) // m < n
	assert.throws(() => qrDecompose([[1, 2], [3]])) // ragged
	assert.throws(() => qrDecompose([[1, NaN], [0, 1]]))
	assert.throws(() => qrDecompose([[1, Infinity], [0, 1]]))
	assert.throws(() => qrDecompose([[0, 0], [0, 0]])) // zero matrix
	assert.throws(() => qrDecompose([[1, 2], [2, 4]])) // linearly dependent columns
})
