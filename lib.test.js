import { test } from 'node:test'
import assert from 'node:assert'
import { add, matInv2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function matMul2(A, B) {
	return [
		[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
		[A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
	]
}

function assertMatClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 2)
	for (let i = 0; i < 2; i++) {
		assert.equal(actual[i].length, 2)
		for (let j = 0; j < 2; j++) {
			assert.ok(
				Math.abs(actual[i][j] - expected[i][j]) <= eps,
				`Expected [${i}][${j}] = ${actual[i][j]} to be within ${eps} of ${expected[i][j]}`
			)
		}
	}
}

test('matInv2: standard invertible matrices', () => {
	assert.deepStrictEqual(
		matInv2([
			[4, 7],
			[2, 6],
		]),
		[
			[0.6, -0.7],
			[-0.2, 0.4],
		]
	)
	assert.deepStrictEqual(
		matInv2([
			[1, 2],
			[3, 5],
		]),
		[
			[-5, 2],
			[3, -1],
		]
	)
})

test('matInv2: identity and diagonal matrices', () => {
	const I = [
		[1, 0],
		[0, 1],
	]
	assert.deepStrictEqual(matInv2(I), I)
	assert.deepStrictEqual(
		matInv2([
			[2, 0],
			[0, -4],
		]),
		[
			[0.5, 0],
			[0, -0.25],
		]
	)
})

test('matInv2: mathematical identities A * A^-1 = I and (A^-1)^-1 = A', () => {
	const A = [
		[3.5, -1.2],
		[2.7, 4.1],
	]
	const I = [
		[1, 0],
		[0, 1],
	]
	const invA = matInv2(A)
	assertMatClose(matMul2(A, invA), I)
	assertMatClose(matMul2(invA, A), I)
	assertMatClose(matInv2(invA), A)
})

test('matInv2: product identity (A * B)^-1 = B^-1 * A^-1 and orthogonal rotation', () => {
	const A = [
		[2, 1],
		[5, 3],
	]
	const B = [
		[1, -2],
		[3, 4],
	]
	assertMatClose(matInv2(matMul2(A, B)), matMul2(matInv2(B), matInv2(A)))

	const theta = Math.PI / 6
	const R = [
		[Math.cos(theta), -Math.sin(theta)],
		[Math.sin(theta), Math.cos(theta)],
	]
	const RT = [
		[Math.cos(theta), Math.sin(theta)],
		[-Math.sin(theta), Math.cos(theta)],
	]
	assertMatClose(matInv2(R), RT)
})

test('matInv2: throws on singular matrices', () => {
	assert.throws(
		() =>
			matInv2([
				[1, 2],
				[2, 4],
			]),
		/singular/i
	)
	assert.throws(
		() =>
			matInv2([
				[0, 0],
				[0, 0],
			]),
		/singular/i
	)
	assert.throws(
		() =>
			matInv2([
				[5, 0],
				[3, 0],
			]),
		/singular/i
	)
})

test('matInv2: small-scale invertible matrix and input validation', () => {
	assertMatClose(
		matInv2([
			[1e-10, 0],
			[0, 1e-10],
		]),
		[
			[1e10, 0],
			[0, 1e10],
		],
		1e-2
	)
	assert.throws(() => matInv2(null), TypeError)
	assert.throws(() => matInv2([[1, 2]]), TypeError)
	assert.throws(
		() =>
			matInv2([
				[1, NaN],
				[0, 1],
			]),
		TypeError
	)
	assert.throws(
		() =>
			matInv2([
				[1, Infinity],
				[0, 1],
			]),
		TypeError
	)
})
