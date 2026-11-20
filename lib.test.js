import { test } from 'node:test'
import assert from 'node:assert'
import { add, matTranspose } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matTranspose transposes rectangular m x n matrices', () => {
	const A = [
		[1, 2, 3],
		[4, 5, 6],
	]
	assert.deepStrictEqual(matTranspose(A), [
		[1, 4],
		[2, 5],
		[3, 6],
	])

	const B = [
		[1, -2],
		[0.5, 4],
		[7, 0],
	]
	assert.deepStrictEqual(matTranspose(B), [
		[1, 0.5, 7],
		[-2, 4, 0],
	])
})

test('matTranspose handles 1x1, row vector, and column vector', () => {
	assert.deepStrictEqual(matTranspose([[42]]), [[42]])
	assert.deepStrictEqual(matTranspose([[1, 2, 3, 4]]), [[1], [2], [3], [4]])
	assert.deepStrictEqual(matTranspose([[1], [2], [3], [4]]), [[1, 2, 3, 4]])
})

test('matTranspose handles empty matrices gracefully', () => {
	assert.deepStrictEqual(matTranspose([]), [])
	assert.deepStrictEqual(matTranspose([[]]), [])
	assert.deepStrictEqual(matTranspose([[], [], []]), [])
})

test('matTranspose satisfies involution identity (A^T)^T = A and preserves symmetric matrices', () => {
	const A = [
		[1, 2, 3, 4],
		[5, 6, 7, 8],
		[9, 10, 11, 12],
	]
	assert.deepStrictEqual(matTranspose(matTranspose(A)), A)

	const S = [
		[2, -1, 0],
		[-1, 5, 3],
		[0, 3, 8],
	]
	assert.deepStrictEqual(matTranspose(S), S)
})

test('matTranspose satisfies linearity (A + B)^T = A^T + B^T and scalar multiplication (cA)^T = c(A^T)', () => {
	const A = [
		[1, 2, 3],
		[4, 5, 6],
	]
	const B = [
		[7, -1, 2],
		[0, 3, -4],
	]
	const sum = A.map((row, i) => row.map((v, j) => v + B[i][j]))
	const At = matTranspose(A)
	const Bt = matTranspose(B)
	const sumT = At.map((row, i) => row.map((v, j) => v + Bt[i][j]))
	assert.deepStrictEqual(matTranspose(sum), sumT)

	const c = -3
	const cA = A.map((row) => row.map((v) => c * v))
	const cAt = At.map((row) => row.map((v) => c * v))
	assert.deepStrictEqual(matTranspose(cA), cAt)
})

test('matTranspose does not mutate input and validates malformed matrices', () => {
	const original = [
		[1, 2],
		[3, 4],
	]
	const snapshot = structuredClone(original)
	const transposed = matTranspose(original)
	transposed[0][1] = 999
	assert.deepStrictEqual(original, snapshot)

	assert.throws(() => matTranspose([[1, 2], [3]]), /equal length/)
	assert.throws(() => matTranspose(null), TypeError)
})
