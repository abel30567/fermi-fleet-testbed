import { test } from 'node:test'
import assert from 'node:assert'
import { add, cholesky } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function matMulTranspose(L) {
	const n = L.length
	const res = Array.from({ length: n }, () => new Array(n).fill(0))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let s = 0
			for (let k = 0; k < n; k++) {
				s += L[i][k] * L[j][k]
			}
			res[i][j] = s
		}
	}
	return res
}

function assertMatrixClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= tol,
				`Mismatch at [${i}][${j}]: expected ${expected[i][j]}, got ${actual[i][j]}`
			)
		}
	}
}

test('cholesky: classic 3x3 SPD matrix', () => {
	const A = [
		[4, 12, -16],
		[12, 37, -43],
		[-16, -43, 98],
	]
	const L = cholesky(A)
	const expected = [
		[2, 0, 0],
		[6, 1, 0],
		[-8, 5, 3],
	]
	assertMatrixClose(L, expected)
	assertMatrixClose(matMulTranspose(L), A)
})

test('cholesky: 1x1, identity, and diagonal matrices', () => {
	assertMatrixClose(cholesky([[9]]), [[3]])
	assertMatrixClose(
		cholesky([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]),
		[
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]
	)
	assertMatrixClose(
		cholesky([
			[4, 0, 0],
			[0, 25, 0],
			[0, 0, 0.25],
		]),
		[
			[2, 0, 0],
			[0, 5, 0],
			[0, 0, 0.5],
		]
	)
})

test('cholesky: mathematical identities (A = L*L^T, lower-triangular, scaling, determinant)', () => {
	const B = [
		[2, -1, 0.5, 1],
		[0.5, 3, -1, 0.25],
		[-1, 0.5, 2.5, -0.5],
		[1, -0.5, 1, 4],
	]
	const A = matMulTranspose(B)
	const L = cholesky(A)

	for (let i = 0; i < L.length; i++) {
		assert.ok(L[i][i] > 0)
		for (let j = i + 1; j < L.length; j++) {
			assert.equal(L[i][j], 0)
		}
	}

	assertMatrixClose(matMulTranspose(L), A, 1e-10)

	const c = 7
	const scaledA = A.map((row) => row.map((x) => x * c))
	const scaledL = cholesky(scaledA)
	const expectedScaledL = L.map((row) => row.map((x) => x * Math.sqrt(c)))
	assertMatrixClose(scaledL, expectedScaledL, 1e-10)

	const M = [
		[5, 2],
		[2, 3],
	]
	const LM = cholesky(M)
	const detM = M[0][0] * M[1][1] - M[0][1] * M[1][0]
	const detFromL = (LM[0][0] * LM[1][1]) ** 2
	assert.ok(Math.abs(detFromL - detM) < 1e-12)
})

test('cholesky: does not mutate input matrix', () => {
	const A = [
		[4, 2],
		[2, 5],
	]
	const copy = A.map((r) => [...r])
	cholesky(A)
	assert.deepEqual(A, copy)
})

test('cholesky: throws on non-SPD matrices (non-symmetric, indefinite, semi-definite)', () => {
	assert.throws(() =>
		cholesky([
			[4, 2],
			[1, 4],
		])
	)
	assert.throws(() =>
		cholesky([
			[1, 2],
			[2, 1],
		])
	)
	assert.throws(() =>
		cholesky([
			[1, 1],
			[1, 1],
		])
	)
	assert.throws(() => cholesky([[0]]))
	assert.throws(() => cholesky([[-4]]))
})

test('cholesky: throws on invalid inputs (empty, non-square, non-finite)', () => {
	assert.throws(() => cholesky([]))
	assert.throws(() => cholesky(null))
	assert.throws(() => cholesky([[1, 2]]))
	assert.throws(() =>
		cholesky([
			[1, 2],
			[2, NaN],
		])
	)
	assert.throws(() =>
		cholesky([
			[Infinity, 0],
			[0, 1],
		])
	)
})
