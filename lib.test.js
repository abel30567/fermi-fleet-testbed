import { test } from 'node:test'
import assert from 'node:assert'
import { add, matTrace } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matTrace: normal 2x2 and 3x3 matrices', () => {
	assert.equal(
		matTrace([
			[1, 2],
			[3, 4],
		]),
		5,
	)
	assert.equal(
		matTrace([
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		]),
		15,
	)
})

test('matTrace: 1x1, 0x0, negative and floating-point values', () => {
	assert.equal(matTrace([[42]]), 42)
	assert.equal(matTrace([]), 0)
	assert.equal(
		matTrace([
			[-3, 10],
			[7, 3],
		]),
		0,
	)
	assert.ok(
		Math.abs(
			matTrace([
				[0.1, 1],
				[2, 0.2],
			]) - 0.3,
		) < 1e-12,
	)
})

test('matTrace: identity matrix trace equals dimension n', () => {
	for (const n of [1, 2, 4, 5]) {
		const I = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
		)
		assert.equal(matTrace(I), n)
	}
})

test('matTrace: linearity tr(aA + bB) = a*tr(A) + b*tr(B)', () => {
	const A = [
		[2, -1, 4],
		[0, 5, 3],
		[7, 1, -2],
	]
	const B = [
		[3, 2, 1],
		[-4, 6, 0],
		[2, -3, 8],
	]
	const a = 3
	const b = -2
	const combined = A.map((row, i) => row.map((v, j) => a * v + b * B[i][j]))
	assert.equal(matTrace(combined), a * matTrace(A) + b * matTrace(B))
})

test('matTrace: transpose invariance tr(A^T) = tr(A) and cyclic product tr(AB) = tr(BA)', () => {
	const A = [
		[1, 3, -2],
		[4, 0, 5],
		[-1, 2, 6],
	]
	const B = [
		[2, -1, 0],
		[3, 4, -2],
		[1, 5, 3],
	]
	const AT = A[0].map((_, j) => A.map((row) => row[j]))
	assert.equal(matTrace(AT), matTrace(A))

	const mul = (X, Y) =>
		X.map((row) =>
			Y[0].map((_, j) => row.reduce((acc, v, k) => acc + v * Y[k][j], 0)),
		)
	assert.equal(matTrace(mul(A, B)), matTrace(mul(B, A)))
})

test('matTrace: throws on non-square, ragged, or invalid inputs', () => {
	assert.throws(() =>
		matTrace([
			[1, 2, 3],
			[4, 5, 6],
		]),
	)
	assert.throws(() => matTrace([[1], [2]]))
	assert.throws(() => matTrace([[]]))
	assert.throws(() => matTrace([[1, 2], [3]]))
	assert.throws(() => matTrace([1, 2]))
	assert.throws(() => matTrace(null))
})
