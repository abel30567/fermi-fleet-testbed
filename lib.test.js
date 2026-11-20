import { test } from 'node:test'
import assert from 'node:assert'
import { add, luDecompose } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function matMul(A, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = 0
			for (let k = 0; k < n; k++) sum += A[i][k] * B[k][j]
			return sum
		})
	)
}

function assertMatrixClose(actual, expected, eps = 1e-9) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= eps,
				`Mismatch at [${i}][${j}]: expected ${expected[i][j]}, got ${actual[i][j]}`
			)
		}
	}
}

test('luDecompose - 2x2 matrix exact factors and reconstruction', () => {
	const A = [
		[4, 3],
		[6, 3],
	]
	const { L, U } = luDecompose(A)
	assertMatrixClose(L, [
		[1, 0],
		[1.5, 1],
	])
	assertMatrixClose(U, [
		[4, 3],
		[0, -1.5],
	])
	assertMatrixClose(matMul(L, U), A)
})

test('luDecompose - 3x3 matrix Doolittle decomposition and triangularity', () => {
	const A = [
		[2, -1, -2],
		[-4, 6, 3],
		[-4, -2, 8],
	]
	const { L, U } = luDecompose(A)
	assertMatrixClose(L, [
		[1, 0, 0],
		[-2, 1, 0],
		[-2, -1, 1],
	])
	assertMatrixClose(U, [
		[2, -1, -2],
		[0, 4, -1],
		[0, 0, 3],
	])
	assertMatrixClose(matMul(L, U), A)
})

test('luDecompose - 4x4 matrix identities (L*U = A, unit diagonal, determinant)', () => {
	const A = [
		[5, 2, 0, -1],
		[2, 6, 1, 0],
		[0, 1, 4, 2],
		[-1, 0, 2, 7],
	]
	const { L, U } = luDecompose(A)
	const n = A.length
	for (let i = 0; i < n; i++) {
		assert.equal(L[i][i], 1)
		for (let j = i + 1; j < n; j++) {
			assert.equal(L[i][j], 0)
			assert.equal(U[j][i], 0)
		}
	}
	assertMatrixClose(matMul(L, U), A)
	const detU = U.reduce((acc, row, i) => acc * row[i], 1)
	assert.ok(Math.abs(detU - 574) < 1e-9, `Expected det 574, got ${detU}`)
})

test('luDecompose - identity, upper triangular, 1x1, and empty 0x0 matrices', () => {
	const I = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]
	const resI = luDecompose(I)
	assert.deepStrictEqual(resI.L, I)
	assert.deepStrictEqual(resI.U, I)

	const upper = [
		[3, 5, -2],
		[0, 4, 7],
		[0, 0, 9],
	]
	const resUpper = luDecompose(upper)
	assert.deepStrictEqual(resUpper.L, I)
	assert.deepStrictEqual(resUpper.U, upper)

	assert.deepStrictEqual(luDecompose([[7]]), { L: [[1]], U: [[7]] })
	assert.deepStrictEqual(luDecompose([]), { L: [], U: [] })
})

test('luDecompose - does not mutate input matrix', () => {
	const A = [
		[2, 3],
		[4, 9],
	]
	const snapshot = structuredClone(A)
	luDecompose(A)
	assert.deepStrictEqual(A, snapshot)
})

test('luDecompose - throws on zero pivots and invalid inputs', () => {
	assert.throws(() => luDecompose([[0, 1], [1, 0]]), /Zero pivot/)
	assert.throws(() => luDecompose([[1, 2], [2, 4]]), /Zero pivot/)
	assert.throws(
		() =>
			luDecompose([
				[1, 1, 1],
				[2, 2, 5],
				[4, 6, 8],
			]),
		/Zero pivot/
	)
	assert.throws(() => luDecompose([[0]]), /Zero pivot/)
	assert.throws(() => luDecompose([[1, 2, 3], [4, 5, 6]]), /square/i)
	assert.throws(() => luDecompose(null), TypeError)
})
