import { test } from 'node:test'
import assert from 'node:assert'
import { add, matRank } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matRank: identity, zero, and full-rank square matrices', () => {
	assert.equal(matRank([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), 3)
	assert.equal(matRank([[0, 0, 0], [0, 0, 0], [0, 0, 0]]), 0)
	assert.equal(matRank([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]]), 3)
})

test('matRank: rank-deficient and outer-product matrices', () => {
	// Classic singular 3x3 matrix of rank 2
	assert.equal(matRank([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), 2)
	// Rank-1 outer product u * v^T
	const u = [2, -3, 5, 1]
	const v = [4, 0, -1, 2]
	const outer = u.map(ui => v.map(vj => ui * vj))
	assert.equal(matRank(outer), 1)
})

test('matRank: rectangular matrices (tall, wide, zero columns, pivoting)', () => {
	// Tall 4x2 full column rank
	assert.equal(matRank([[0, 1], [2, 3], [4, 7], [2, 5]]), 2)
	// Wide 2x4 with zero columns
	assert.equal(matRank([[0, 1, 0, 2], [0, 0, 0, 3]]), 2)
	// Wide 2x3 rank 1
	assert.equal(matRank([[1, 2, 3], [2, 4, 6]]), 1)
	// Tall 3x2 rank 1 requiring row swap
	assert.equal(matRank([[0, 0], [1, 2], [3, 6]]), 1)
})

test('matRank: mathematical identities (transpose, Gram matrix, scaling, product bound)', () => {
	const A = [
		[1, 2, 3, 4],
		[2, 4, 6, 8],
		[0, 1, -1, 2],
	]
	const transpose = M => M[0].map((_, j) => M.map(row => row[j]))
	const matMul = (X, Y) =>
		X.map(row =>
			Y[0].map((_, j) => row.reduce((sum, val, k) => sum + val * Y[k][j], 0)),
		)

	const AT = transpose(A)
	const ATA = matMul(AT, A)
	const scaled = A.map(row => row.map(x => -7.5 * x))

	// rank(A) === rank(A^T) === rank(A^T A) === rank(cA)
	assert.equal(matRank(A), 2)
	assert.equal(matRank(AT), matRank(A))
	assert.equal(matRank(ATA), matRank(A))
	assert.equal(matRank(scaled), matRank(A))

	// rank(AB) <= min(rank(A), rank(B))
	const B = [
		[1, 0],
		[0, 1],
		[1, 1],
		[0, 0],
	]
	const AB = matMul(A, B)
	assert.ok(matRank(AB) <= Math.min(matRank(A), matRank(B)))
})

test('matRank: tolerance handling and input immutability', () => {
	const nearSingular = [
		[1, 2],
		[2, 4 + 1e-12],
	]
	const snapshot = structuredClone(nearSingular)
	assert.equal(matRank(nearSingular), 1)
	assert.deepEqual(nearSingular, snapshot)
	assert.equal(matRank(nearSingular, 1e-15), 2)
	assert.equal(matRank([[1e-10, 0], [0, 1e-10]], 1e-9), 0)
	assert.equal(matRank([[1e-10, 0], [0, 1e-10]], 1e-12), 2)
})

test('matRank: boundary cases and invalid input validation', () => {
	assert.equal(matRank([]), 0)
	assert.equal(matRank([[]]), 0)
	assert.equal(matRank([[], []]), 0)
	assert.equal(matRank([[0]]), 0)
	assert.equal(matRank([[42]]), 1)

	assert.throws(() => matRank('not-a-matrix'), TypeError)
	assert.throws(() => matRank([[1, 2], [3]]), RangeError)
	assert.throws(() => matRank([[1, NaN]]), TypeError)
	assert.throws(() => matRank([[1]], -1e-5), RangeError)
})
