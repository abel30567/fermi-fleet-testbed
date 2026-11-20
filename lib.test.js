import { test } from 'node:test'
import assert from 'node:assert'
import { add, matDet3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matDet3: identity, zero, diagonal, and triangular matrices', () => {
	const I = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]
	const Z = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]
	const D = [
		[2, 0, 0],
		[0, -3, 0],
		[0, 0, 5],
	]
	const U = [
		[2, 7, -4],
		[0, 3, 9],
		[0, 0, -5],
	]
	assert.equal(matDet3(I), 1)
	assert.equal(Object.is(matDet3(Z), 0), true)
	assert.equal(matDet3(D), -30)
	assert.equal(matDet3(U), -30)
})

test('matDet3: general and singular 3x3 matrices', () => {
	const A = [
		[6, 1, 1],
		[4, -2, 5],
		[2, 8, 7],
	]
	assert.equal(matDet3(A), -306)

	const B = [
		[1, 2, 3],
		[0, 1, 4],
		[5, 6, 0],
	]
	assert.equal(matDet3(B), 1)

	const S = [
		[1, 2, 3],
		[4, 5, 6],
		[5, 7, 9],
	]
	assert.equal(Object.is(matDet3(S), 0), true)

	const negZeroCase = [
		[-1, 0, 0],
		[0, 0, 0],
		[0, 0, 1],
	]
	assert.equal(Object.is(matDet3(negZeroCase), 0), true)
})

test('matDet3: algebraic identities (transpose, multiplicativity, scaling)', () => {
	const A = [
		[2, -1, 3],
		[0, 4, -2],
		[5, 1, 1],
	]
	const B = [
		[1, 3, -2],
		[4, 0, 5],
		[-1, 2, 3],
	]
	const transpose = (M) => [
		[M[0][0], M[1][0], M[2][0]],
		[M[0][1], M[1][1], M[2][1]],
		[M[0][2], M[1][2], M[2][2]],
	]
	const matMul = (X, Y) =>
		X.map((row) =>
			[0, 1, 2].map((j) => row[0] * Y[0][j] + row[1] * Y[1][j] + row[2] * Y[2][j]),
		)

	assert.equal(matDet3(transpose(A)), matDet3(A))
	assert.equal(matDet3(matMul(A, B)), matDet3(A) * matDet3(B))

	const k = -3
	const kA = A.map((row) => row.map((v) => k * v))
	assert.equal(matDet3(kA), k ** 3 * matDet3(A))
})

test('matDet3: elementary row operations and permutation matrices', () => {
	const A = [
		[3, 1, 2],
		[-1, 4, 5],
		[2, -3, 1],
	]
	const detA = matDet3(A)

	const swapped = [A[1], A[0], A[2]]
	assert.equal(matDet3(swapped), -detA)

	const rowAdded = [A[0], A[1], A[2].map((v, idx) => v + 4 * A[0][idx])]
	assert.equal(matDet3(rowAdded), detA)

	const oddPerm = [
		[0, 1, 0],
		[1, 0, 0],
		[0, 0, 1],
	]
	const evenPerm = [
		[0, 1, 0],
		[0, 0, 1],
		[1, 0, 0],
	]
	assert.equal(matDet3(oddPerm), -1)
	assert.equal(matDet3(evenPerm), 1)
})

test('matDet3: rotation matrix and invalid input handling', () => {
	const theta = Math.PI / 5
	const c = Math.cos(theta)
	const s = Math.sin(theta)
	const Rz = [
		[c, -s, 0],
		[s, c, 0],
		[0, 0, 1],
	]
	assert.ok(Math.abs(matDet3(Rz) - 1) < 1e-12)

	assert.throws(() => matDet3(null), TypeError)
	assert.throws(() => matDet3([[1, 2], [3, 4]]), TypeError)
	assert.throws(() => matDet3([[1, 2, 3], [4, 5], [7, 8, 9]]), TypeError)
})
